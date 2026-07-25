/* ==========================================
   SPACE GACHA GAME SIMULATOR LOGIC
   Author: VECTOR
   ========================================== */

(function () {
  "use strict";

  // Game States
  let state = {
    gold: parseInt(localStorage.getItem("gacha_gold")) || 5000000,
    silver: parseInt(localStorage.getItem("gacha_silver")) || 800000,
    activeLevel: 5,
    activeTab: "top1",
    progress: parseInt(localStorage.getItem("gacha_progress")) || 0,
    soundOn: true,
    countdownSeconds: 13 * 3600 + 20 * 60 + 12, // 13:20:12 matching screenshot
    records: JSON.parse(localStorage.getItem("gacha_records")) || [],
    isSpinning: false
  };

  // Level Configuration — gameplay + UI only.
  // Ship geometry, materials, nozzles and flame colours live in engine3d.js (SHIPS).
  const levelConfig = {
    1: {
      color: "#00e676", // Green
      glow: "rgba(0, 230, 118, 0.45)",
      shipImg: "assets/ship_lv1.png",  // 2D thumbnail for reward cards only
      shipName: "SCOUT",
      cost: 10000,
      chance: 15,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4"
    },
    2: {
      color: "#d500f9", // Purple
      glow: "rgba(213, 0, 249, 0.45)",
      shipImg: "assets/ship_lv4.png",
      shipName: "INTERCEPTOR",
      cost: 10000,
      chance: 25,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4"
    },
    3: {
      color: "#ff1744", // Red
      glow: "rgba(255, 23, 68, 0.45)",
      shipImg: "assets/ship_lv3.png",
      shipName: "HEAVY LIFTER",
      cost: 10000,
      chance: 35,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4"
    },
    4: {
      color: "#00d5ff", // Blue/Gold
      glow: "rgba(0, 213, 255, 0.45)",
      shipImg: "assets/ship_lv2.png",
      shipName: "FLAGSHIP",
      cost: 10000,
      chance: 45,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4"
    },
    5: {
      color: "#ffd24a", // Gold/Cyan ultimate
      glow: "rgba(255, 210, 74, 0.45)",
      shipImg: "assets/ship_lv5.png",
      shipName: "OVERLORD",
      cost: 10000,
      chance: 55,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4"
    }
  };

  // Handle to the WebGL engine (engine3d.js). Null until the module boots.
  const engine = () => window.GachaEngine || null;

  // DOM Elements
  const el = {
    gold: document.getElementById("user-gold"),
    silver: document.getElementById("user-silver"),
    btnAddCoins: document.getElementById("btn-add-coins"),
    btnToggleAudio: document.getElementById("btn-toggle-audio"),
    
    // Header
    onlineCount: document.getElementById("header-online-count"),
    btnShare: document.getElementById("btn-share"),
    btnQuit: document.getElementById("btn-quit"),
    
    // Stage (the ship/pedestal/flames are WebGL now — see engine3d.js)
    launchFlash: document.getElementById("launch-flash"),
    engRenderer: document.getElementById("eng-renderer"),
    engShip: document.getElementById("eng-ship"),
    engThrottle: document.getElementById("eng-throttle"),
    engFps: document.getElementById("eng-fps"),

    // Badges / Selector
    levelBadges: document.querySelectorAll(".lv-badge"),
    
    // Progress Tube
    barFill: document.getElementById("bar-fill"),
    barPercentage: document.getElementById("bar-percentage"),
    
    // Timer
    timeHours: document.getElementById("time-hours"),
    timeMins: document.getElementById("time-mins"),
    timeSecs: document.getElementById("time-secs"),
    
    // Buttons
    btnHelp: document.getElementById("btn-help"),
    btnRecordsModal: document.getElementById("btn-records-modal"),
    btnRankingTrigger: document.getElementById("btn-ranking-trigger"),
    btnSpin: document.getElementById("btn-spin"),
    actionBtnLabel: document.getElementById("action-btn-label"),
    
    // Modals
    modalHelp: document.getElementById("modal-help"),
    modalRecords: document.getElementById("modal-records"),
    modalRanking: document.getElementById("modal-ranking"),
    btnCloseHelp: document.getElementById("btn-close-help"),
    btnCloseRecords: document.getElementById("btn-close-records"),
    btnCloseRanking: document.getElementById("btn-close-ranking"),
    
    recordsEmptyState: document.getElementById("records-empty-state"),
    recordsList: document.getElementById("records-list-element"),
    
    // Gacha Reveal Overlay
    gachaReveal: document.getElementById("gacha-reveal"),
    revealCardVisual: document.getElementById("reveal-card-visual"),
    btnRevealClaim: document.getElementById("btn-reveal-claim"),
    
    // Cards details
    chanceBadge: document.getElementById("chance-badge"),
    cardVal2: document.getElementById("card-val-2"),
    cardVal3: document.getElementById("card-val-3"),
    cardVal4: document.getElementById("card-val-4"),
    cardImgShip: document.getElementById("card-img-ship"),
    cardAvatarFrame: document.getElementById("card-avatar-frame"),
    
    // Tabs
    tabItems: document.querySelectorAll(".tab-item"),
    phoneScreenViewport: document.getElementById("phone-screen-viewport")
  };

  // Audio Context (Synthesized sound effects)
  let audioCtx = null;
  let ambientHumOsc = null;
  let ambientHumOsc2 = null;
  let ambientHumLfo = null;
  let ambientHumGain = null;
  let launchAudioBuffer = null;

  function loadSoundAssets() {
    if (launchAudioBuffer || !audioCtx) return;
    fetch('assets/launch.mp3?v=4')
      .then(res => res.arrayBuffer())
      .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
      .then(buffer => {
        launchAudioBuffer = buffer;
        console.log("AAA Launch sound preloaded and cached successfully!");
      })
      .catch(err => console.error("Error pre-loading launch sound:", err));
  }

  // Pre-load audio on first user gesture to bypass iOS/Android Web Audio API restrictions
  document.addEventListener("click", () => {
    initAudio();
    loadSoundAssets();
  }, { once: true });
  document.addEventListener("touchstart", () => {
    initAudio();
    loadSoundAssets();
  }, { once: true });

  function startAmbientHum() {
    if (!state.soundOn || ambientHumOsc || !audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    try {
      ambientHumOsc = audioCtx.createOscillator();
      ambientHumOsc2 = audioCtx.createOscillator();
      ambientHumLfo = audioCtx.createOscillator();
      
      const lfoGain = audioCtx.createGain();
      ambientHumGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      // Osc 1: Deep primary engine hum (Low A1 sine)
      ambientHumOsc.type = "sine";
      ambientHumOsc.frequency.setValueAtTime(55, audioCtx.currentTime);

      // Osc 2: Detuned harmonic (Low triangle wave to create warm physical beats)
      ambientHumOsc2.type = "triangle";
      ambientHumOsc2.frequency.setValueAtTime(55.4, audioCtx.currentTime);

      // Filter modulation LFO: slowly opens and closes the lowpass filter for a breathing ship cabin sound
      ambientHumLfo.type = "sine";
      ambientHumLfo.frequency.setValueAtTime(0.08, audioCtx.currentTime); // 0.08Hz slow breathing cycle
      lfoGain.gain.setValueAtTime(32, audioCtx.currentTime); // sweep range +/- 32Hz

      // Base low-pass filter to restrict hum to deep sub-frequencies
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(80, audioCtx.currentTime);

      // Connect LFO sweep modulation to filter cutoff frequency
      ambientHumLfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // Connect oscillators to filter
      ambientHumOsc.connect(filter);
      ambientHumOsc2.connect(filter);
      
      // Connect filter to main gain and output
      filter.connect(ambientHumGain);
      ambientHumGain.connect(audioCtx.destination);

      // Warm background volume setting
      ambientHumGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

      // Start all nodes
      ambientHumOsc.start(0);
      ambientHumOsc2.start(0);
      ambientHumLfo.start(0);
    } catch (e) {
      console.warn("Failed to start ambient hum:", e);
    }
  }

  function stopAmbientHum() {
    try {
      if (ambientHumOsc) {
        ambientHumOsc.stop();
        ambientHumOsc = null;
      }
      if (ambientHumOsc2) {
        ambientHumOsc2.stop();
        ambientHumOsc2 = null;
      }
      if (ambientHumLfo) {
        ambientHumLfo.stop();
        ambientHumLfo = null;
      }
      ambientHumGain = null;
    } catch (e) {
      console.warn("Error stopping ambient hum nodes:", e);
    }
  }

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    startAmbientHum();
  }

  function playSynthSound(type) {
    if (!state.soundOn) return;
    initAudio();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
    else if (type === "entry") {
      // AAA arrival: a descending warp whoosh (~0.5s) that lands on a deep
      // impact boom — the sound of the ship dropping onto the deck.
      osc.disconnect(gain);

      // 1) whoosh: filtered noise sweeping down
      const noiseLen = 0.55;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * noiseLen, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
      const noise = audioCtx.createBufferSource();
      noise.buffer = buf;
      const nf = audioCtx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.setValueAtTime(3200, now);
      nf.frequency.exponentialRampToValueAtTime(320, now + 0.5);
      nf.Q.value = 1.4;
      const ng = audioCtx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.linearRampToValueAtTime(0.5, now + 0.12);
      ng.gain.exponentialRampToValueAtTime(0.18, now + 0.46);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
      noise.connect(nf); nf.connect(ng); ng.connect(audioCtx.destination);
      noise.start(now); noise.stop(now + noiseLen);

      // 2) impact boom at landing (~0.46s in): a fast pitch-down sine thud
      const boom = audioCtx.createOscillator();
      const bg = audioCtx.createGain();
      boom.type = "sine";
      boom.frequency.setValueAtTime(180, now + 0.44);
      boom.frequency.exponentialRampToValueAtTime(42, now + 0.7);
      bg.gain.setValueAtTime(0.0001, now + 0.44);
      bg.gain.linearRampToValueAtTime(0.7, now + 0.48);
      bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
      boom.connect(bg); bg.connect(audioCtx.destination);
      boom.start(now + 0.44); boom.stop(now + 0.98);

      // 3) shimmer ping on settle
      const ping = audioCtx.createOscillator();
      const pg = audioCtx.createGain();
      ping.type = "triangle";
      ping.frequency.setValueAtTime(1400, now + 0.5);
      ping.frequency.exponentialRampToValueAtTime(2600, now + 0.72);
      pg.gain.setValueAtTime(0.0001, now + 0.5);
      pg.gain.linearRampToValueAtTime(0.16, now + 0.55);
      pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      ping.connect(pg); pg.connect(audioCtx.destination);
      ping.start(now + 0.5); ping.stop(now + 0.88);
    }
    else if (type === "level") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(850, now + 0.25);
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(220, now);
      filter.frequency.exponentialRampToValueAtTime(900, now + 0.25);
      filter.Q.value = 2.5;

      osc.disconnect(gain);
      osc.connect(filter);
      filter.connect(gain);
      
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.start(now);
      osc.stop(now + 0.25);
    } 
    else if (type === "launch") {
      // 1. Play preloaded launch sound clip with zero latency (as background overlay)
      try {
        if (launchAudioBuffer) {
          const source = audioCtx.createBufferSource();
          source.buffer = launchAudioBuffer;
          const gainNode = audioCtx.createGain();
          gainNode.gain.setValueAtTime(0.65, now);
          source.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          source.start(now);
        } else {
          const launchAudio = new Audio('assets/launch.mp3?v=4');
          launchAudio.volume = 0.65;
          launchAudio.play();
        }
      } catch (err) {
        console.warn("Audio file playback blocked or failed:", err);
      }

      // Dynamic Level Synth parameter presets for 99% authentic game sound profiles (Supercharged gains!)
      const level = state.activeLevel || 5;
      let chargeFreqStart = 58;
      let chargeFreqEnd = 1450;
      let subFreq = 50;
      let subVolume = 1.45;  // Extreme deep sub rumble
      let roarVolume = 1.55; // Ground-shaking noise exhaust whoosh
      let modSpeed = 19;
      let engineOscType = "sawtooth";
      let filterQ = 8.5;
      
      if (level === 1) { // Level 1: Light scout ship (clean swift resonance)
        chargeFreqStart = 140;
        chargeFreqEnd = 2400;
        subFreq = 62;
        subVolume = 1.15;
        roarVolume = 1.2;
        modSpeed = 26;
        engineOscType = "triangle";
        filterQ = 9.5;
      } else if (level === 2) { // Level 2: Interceptor (buzzing high-resonance plasma humming)
        chargeFreqStart = 95;
        chargeFreqEnd = 1850;
        subFreq = 54;
        subVolume = 1.35;
        roarVolume = 1.35;
        modSpeed = 14;
        engineOscType = "sawtooth"; // Switch to sawtooth for more aggressive buzz!
        filterQ = 7.0;
      } else if (level === 3) { // Level 3: Chemical combustor rocket (ultra low rumble, max exhaust exhaust pressure)
        chargeFreqStart = 42;
        chargeFreqEnd = 950;
        subFreq = 38; // Ground-level rumble
        subVolume = 1.75;
        roarVolume = 1.85; // Massive blastoff roar
        modSpeed = 9;
        engineOscType = "sawtooth";
        filterQ = 5.5;
      } else if (level === 4) { // Level 4: Gravity Warp drive (sci-fi wobbling vibrato warp sweep)
        chargeFreqStart = 75;
        chargeFreqEnd = 2200;
        subFreq = 45;
        subVolume = 1.5;
        roarVolume = 1.45;
        modSpeed = 22;
        engineOscType = "square"; // Aggressive square synth drive
        filterQ = 9.0;
      } else if (level === 5) { // Level 5 OVERLORD: deep cinematic legendary engine
        chargeFreqStart = 34;    // starts sub-bass low for a heavy power-up
        chargeFreqEnd = 2800;    // sweeps highest
        subFreq = 32;            // deepest ground-shaking rumble
        subVolume = 1.9;         // loudest bass
        roarVolume = 1.95;       // biggest exhaust roar
        modSpeed = 16;
        engineOscType = "sawtooth";
        filterQ = 8.0;
      }

      // 2. AAA Sci-Fi Reactor Power buildup whirring (0.0s - 0.45s)
      const chargeOsc = audioCtx.createOscillator();
      const chargeOsc2 = audioCtx.createOscillator();
      const chargeGain = audioCtx.createGain();
      const chargeFilter = audioCtx.createBiquadFilter();
      
      chargeOsc.type = engineOscType;
      chargeOsc.frequency.setValueAtTime(chargeFreqStart, now);
      chargeOsc.frequency.exponentialRampToValueAtTime(chargeFreqEnd, now + 0.45);
      
      chargeOsc2.type = "sawtooth"; // Switch to sawtooth for extra aggressive harmonics!
      chargeOsc2.frequency.setValueAtTime(chargeFreqStart * 1.5, now);
      chargeOsc2.frequency.exponentialRampToValueAtTime(chargeFreqEnd * 1.5, now + 0.45);
      
      // Pitch Modulator (LFO vibrato) for mechanical machine textures
      const mod = audioCtx.createOscillator();
      const modGain = audioCtx.createGain();
      mod.frequency.value = modSpeed; 
      modGain.gain.value = 80; // Higher modulation depth
      
      mod.connect(modGain);
      modGain.connect(chargeOsc.frequency);
      modGain.connect(chargeOsc2.frequency);
      
      chargeFilter.type = "lowpass";
      chargeFilter.frequency.setValueAtTime(220, now);
      chargeFilter.frequency.exponentialRampToValueAtTime(2600, now + 0.45);
      chargeFilter.Q.value = filterQ;
      
      chargeOsc.connect(chargeFilter);
      chargeOsc2.connect(chargeFilter);
      chargeFilter.connect(chargeGain);
      chargeGain.connect(audioCtx.destination);
      
      chargeGain.gain.setValueAtTime(0.001, now);
      chargeGain.gain.linearRampToValueAtTime(0.55, now + 0.38); // Louder whirr
      chargeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      
      mod.start(now);
      chargeOsc.start(now);
      chargeOsc2.start(now);
      mod.stop(now + 0.48);
      chargeOsc.stop(now + 0.48);
      chargeOsc2.stop(now + 0.48);

      // 3. Heavy Engine Exhaust Roar (Pink-noise simulation, 0.45s - 2.8s)
      try {
        const bufferSize = audioCtx.sampleRate * 2.8; 
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + (0.022 * white)) / 1.022; // Pink-ish filter
          lastOut = data[i];
          data[i] *= (8.5 * roarVolume); // Louder multipliers
        }
        
        const roarNode = audioCtx.createBufferSource();
        roarNode.buffer = noiseBuffer;
        
        const roarFilter = audioCtx.createBiquadFilter();
        roarFilter.type = "lowpass";
        roarFilter.frequency.setValueAtTime(450, now + 0.4);
        roarFilter.frequency.exponentialRampToValueAtTime(45, now + 2.7);
        
        const roarGain = audioCtx.createGain();
        roarGain.gain.setValueAtTime(0.001, now + 0.4);
        roarGain.gain.linearRampToValueAtTime(roarVolume * 1.25, now + 0.46); // Sudden acoustic explosion burst
        roarGain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
        
        roarNode.connect(roarFilter);
        roarFilter.connect(roarGain);
        roarGain.connect(audioCtx.destination);
        
        roarNode.start(now + 0.4);
        roarNode.stop(now + 2.8);
      } catch (e) {
        console.warn("Roar buffer creation failed:", e);
      }

      // 4. Ground-Shaking Sub-Bass Slam (Subwoofer feeling, 0.45s - 2.5s)
      const subOsc = audioCtx.createOscillator();
      const subGain = audioCtx.createGain();
      subOsc.type = "triangle"; // Use triangle wave for cleaner, heavier resonance than sine!
      subOsc.frequency.setValueAtTime(subFreq, now + 0.4); 
      subOsc.frequency.exponentialRampToValueAtTime(subFreq / 2.2, now + 2.4); 
      
      subOsc.connect(subGain);
      subGain.connect(audioCtx.destination);
      
      subGain.gain.setValueAtTime(0.001, now + 0.4);
      subGain.gain.linearRampToValueAtTime(subVolume * 1.2, now + 0.48); // Punchy bass slam
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      
      subOsc.start(now + 0.4);
      subOsc.stop(now + 2.5);

      // 5. Warp Portal Energy Sweep (Metallic discharge, 0.45s - 1.2s)
      const warpOsc = audioCtx.createOscillator();
      const warpGain = audioCtx.createGain();
      const warpFilter = audioCtx.createBiquadFilter();
      
      warpOsc.type = "sawtooth";
      warpOsc.frequency.setValueAtTime(160, now + 0.4);
      warpOsc.frequency.exponentialRampToValueAtTime(40, now + 1.2);
      
      warpFilter.type = "bandpass";
      warpFilter.frequency.setValueAtTime(1300, now + 0.4);
      warpFilter.frequency.exponentialRampToValueAtTime(120, now + 1.2);
      warpFilter.Q.value = 5.0;
      
      warpOsc.connect(warpFilter);
      warpFilter.connect(warpGain);
      warpGain.connect(audioCtx.destination);
      
      warpGain.gain.setValueAtTime(0.001, now + 0.4);
      warpGain.gain.linearRampToValueAtTime(0.45, now + 0.42);
      warpGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      
      warpOsc.start(now + 0.4);
      warpOsc.stop(now + 1.2);

      // 6. LIFTOFF THOOM — a deep chest-thump impact timed to the engine's
      // release beat (~1.05s), the ultra-level low-end punch of the blastoff.
      const thoom = audioCtx.createOscillator();
      const thoomGain = audioCtx.createGain();
      thoom.type = "sine";
      thoom.frequency.setValueAtTime(120, now + 1.0);
      thoom.frequency.exponentialRampToValueAtTime(28, now + 1.55);
      thoomGain.gain.setValueAtTime(0.0001, now + 1.0);
      thoomGain.gain.linearRampToValueAtTime(1.7, now + 1.06);
      thoomGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
      thoom.connect(thoomGain);
      thoomGain.connect(audioCtx.destination);
      thoom.start(now + 1.0);
      thoom.stop(now + 1.72);

      // high shimmer sparkle riding the release for brightness up top
      const spk = audioCtx.createOscillator();
      const spkGain = audioCtx.createGain();
      spk.type = "triangle";
      spk.frequency.setValueAtTime(2200, now + 1.02);
      spk.frequency.exponentialRampToValueAtTime(5200, now + 1.4);
      spkGain.gain.setValueAtTime(0.0001, now + 1.02);
      spkGain.gain.linearRampToValueAtTime(0.12, now + 1.08);
      spkGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      spk.connect(spkGain);
      spkGain.connect(audioCtx.destination);
      spk.start(now + 1.02);
      spk.stop(now + 1.52);
    }
    else if (type === "reveal") {
      const notes = [329.63, 392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51];
      notes.forEach((freq, index) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(freq, now + index * 0.06);
        g.gain.setValueAtTime(0.1, now + index * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + index * 0.06 + 0.3);
        o.start(now + index * 0.06);
        o.stop(now + index * 0.06 + 0.3);
      });
    }
  }

  // Sync wallet
  function updateWalletUI() {
    el.gold.innerText = state.gold.toLocaleString();
    el.silver.innerText = state.silver.toLocaleString();
    localStorage.setItem("gacha_gold", state.gold);
    localStorage.setItem("gacha_silver", state.silver);
  }

  // Sync progress
  function updateProgressUI() {
    if (state.progress === 0) {
      el.barFill.style.display = "none";
    } else {
      el.barFill.style.display = "block";
      el.barFill.style.height = `${state.progress}%`;
    }
    el.barPercentage.innerText = `${state.progress}%`;
    localStorage.setItem("gacha_progress", state.progress);
  }

  // Level Selector
  function switchLevel(levelNum) {
    if (state.isSpinning) return;

    // AAA arrival — the engine plays the warp-drop, this is its whoosh + boom
    playSynthSound("entry");
    state.activeLevel = levelNum;

    // Trigger subtle viewport bump shake on level switch
    if (el.phoneScreenViewport) {
      el.phoneScreenViewport.classList.add("level-bump");
      setTimeout(() => {
        el.phoneScreenViewport.classList.remove("level-bump");
      }, 280);
    }

    el.levelBadges.forEach(badge => {
      if (parseInt(badge.getAttribute("data-lv")) === levelNum) {
        badge.classList.add("active");
      } else {
        badge.classList.remove("active");
      }
    });

    const config = levelConfig[levelNum];

    // Set Level Variables
    document.documentElement.style.setProperty("--level-color", config.color);
    document.documentElement.style.setProperty("--level-glow", config.glow);
    document.documentElement.style.setProperty("--flame-color", config.color);
    document.documentElement.style.setProperty("--flame-glow", config.glow);

    // Snappy, instant updates for 0ms response latency
    if (el.cardImgShip) el.cardImgShip.src = config.shipImg;
    if (el.cardAvatarFrame) {
      el.cardAvatarFrame.style.borderColor = config.color;
      el.cardAvatarFrame.style.boxShadow = `0 0 8px ${config.glow}`;
    }

    // Rebuild the real 3D ship for this tier
    const e = engine();
    if (e) e.setLevel(levelNum);
    if (el.engShip) el.engShip.innerText = config.shipName;

    // Cards data updates
    el.chanceBadge.innerText = `${config.chance}% Possibility`;
    el.cardVal2.innerText = config.silverVal;
    el.cardVal3.innerText = config.skinVal;
    el.cardVal4.innerText = config.frameVal;

    el.actionBtnLabel.innerText = `LAUNCH (${config.cost.toLocaleString()} Coins)`;
  }

  /* The 2D starfield canvas, CSS flames and sprite ship that used to live here
     are gone. Stars, exhaust sparks and plumes are now real 3D in engine3d.js. */

  function updateTimer() {
    if (state.countdownSeconds <= 0) {
      state.countdownSeconds = 24 * 3600;
    }
    state.countdownSeconds--;

    const hrs = Math.floor(state.countdownSeconds / 3600);
    const mins = Math.floor((state.countdownSeconds % 3600) / 60);
    const secs = state.countdownSeconds % 60;

    el.timeHours.innerText = hrs.toString().padStart(2, "0");
    el.timeMins.innerText = mins.toString().padStart(2, "0");
    el.timeSecs.innerText = secs.toString().padStart(2, "0");
  }

  // Gacha Draw/Launch sequence
  function executeGachaLaunch() {
    if (state.isSpinning) return;

    const config = levelConfig[state.activeLevel];

    if (state.gold < config.cost) {
      alert("Aapke paas coins kam hain! Simulation ke liye controls panel se Mock +1M Coins add karein.");
      return;
    }

    const e = engine();
    if (!e) return;   // engine still booting

    state.isSpinning = true;
    playSynthSound("launch");

    state.gold -= config.cost;
    updateWalletUI();

    // Warp-drive lens flare over the WebGL frame, timed to engine release
    if (el.launchFlash) {
      // Timed to the engine's release beat (~igniteEnd) so the white flash
      // punches exactly as the ship breaks off the pad.
      gsap.fromTo(el.launchFlash,
        { opacity: 0, scale: 0.6 },
        {
          opacity: 0.92, scale: 1.9, duration: 0.1, delay: 1.0, ease: "power2.out",
          onComplete: () => gsap.to(el.launchFlash,
            { opacity: 0, scale: 2.6, duration: 0.9, ease: "power3.out" })
        }
      );
    }

    // The engine owns the whole flight: hold-down vibration, throttle-up,
    // shockwave, camera shake and warp. It resolves as the ship clears frame.
    e.launch().then(rollGachaPrize);
  }

  function rollGachaPrize() {
    const config = levelConfig[state.activeLevel];
    
    // Probability selector
    const roll = Math.random() * 100;
    let prizeCardIndex = 1;

    if (roll < config.chance) {
      prizeCardIndex = 1; // Booster Pack
    } else if (roll < config.chance + (100 - config.chance) / 3) {
      prizeCardIndex = 2; // Silver Coins
    } else if (roll < config.chance + (2 * (100 - config.chance)) / 3) {
      prizeCardIndex = 3; // Ship Skin
    } else {
      prizeCardIndex = 4; // Profile Frame
    }

    // Dynamic Prize setup
    let prizeName = "";
    let prizeValue = "";
    let iconHTML = "";

    if (prizeCardIndex === 1) {
      prizeName = "Booster Pack";
      prizeValue = "1,000,000 GC";
      state.gold += 1000000;
      iconHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="reward-svg-icon accent-glow"><path d="M4.5 16.5c-1.5 1.26-2 3.42-2 3.42s2.16-.5 3.42-2L15 9l-6-6L4.5 16.5z"/><path d="m12 12 9 9"/><path d="m16 8 4 4"/><circle cx="7.5" cy="16.5" r="1.5"/></svg>`;
    } 
    else if (prizeCardIndex === 2) {
      prizeName = "Silver Coins";
      prizeValue = config.silverVal;
      const valInt = parseInt(config.silverVal.replace(/[^0-9]/g, ""));
      state.silver += valInt;
      iconHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="reward-svg-icon"><circle cx="8" cy="8" r="6"/><circle cx="16" cy="16" r="6"/></svg>`;
    } 
    else if (prizeCardIndex === 3) {
      prizeName = "Spaceship Skin";
      prizeValue = config.skinVal;
      iconHTML = `<img src="${config.shipImg}" class="reward-img-thumbnail" alt="Prize ship">`;
    } 
    else {
      prizeName = "Profile Frame";
      prizeValue = config.frameVal;
      iconHTML = `<div class="avatar-frame-mock" style="border-color: ${config.color}; box-shadow: 0 0 6px ${config.glow};"><img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="Avatar"></div>`;
    }

    // Set Reveal Overlay content
    el.revealCardVisual.innerHTML = `
      <div class="reveal-card-content">
        ${iconHTML}
        <div class="reveal-card-name">${prizeName}</div>
        <div class="reveal-card-value">${prizeValue}</div>
      </div>
    `;
    el.revealCardVisual.style.borderColor = config.color;
    el.revealCardVisual.style.boxShadow = `0 0 35px ${config.glow}`;

    // Highlight won card in bottom grid (Glow-trace highlight)
    const winningCard = document.querySelector(`.reward-card[data-card="${prizeCardIndex}"]`);
    if (winningCard) {
      winningCard.classList.add("winner-glow");
    }

    // Update Progress Tube (10% progress)
    state.progress = (state.progress + 10) % 110;
    if (state.progress > 100) state.progress = 0;
    updateProgressUI();

    // Log Launch
    const newRecord = {
      level: `LV${state.activeLevel}`,
      prize: `${prizeName} (${prizeValue})`,
      timestamp: new Date().toLocaleTimeString()
    };
    state.records.unshift(newRecord);
    if (state.records.length > 20) state.records.pop();
    localStorage.setItem("gacha_records", JSON.stringify(state.records));

    // Wait 0.8s, then open reveal screen
    setTimeout(() => {
      el.gachaReveal.classList.add("active");
      playSynthSound("reveal");
    }, 800);
  }

  function handleClaimReward() {
    playSynthSound("click");
    el.gachaReveal.classList.remove("active");

    // Clear grid winner highlight
    document.querySelectorAll(".reward-card").forEach(c => c.classList.remove("winner-glow"));

    // Hand the stage back to idle: engine drops throttle, kills warp,
    // and re-seats the ship on the pedestal.
    const e = engine();
    if (e) e.reset();

    state.isSpinning = false;
    updateWalletUI();
  }

  // Modals Manager
  function openModal(modal) {
    playSynthSound("click");
    modal.classList.add("open");
  }

  function closeModal(modal) {
    playSynthSound("click");
    modal.classList.remove("open");
  }

  function renderRecordsList() {
    if (state.records.length === 0) {
      el.recordsEmptyState.style.display = "flex";
      el.recordsList.style.display = "none";
    } else {
      el.recordsEmptyState.style.display = "none";
      el.recordsList.style.display = "flex";
      el.recordsList.innerHTML = "";
      
      state.records.forEach(r => {
        const item = document.createElement("li");
        item.className = "record-item";
        item.innerHTML = `
          <div class="record-info">
            <span class="record-ship-lv">${r.level} Launch</span>
            <span class="record-time">${r.timestamp}</span>
          </div>
          <span class="record-prize">${r.prize}</span>
        `;
        el.recordsList.appendChild(item);
      });
    }
  }

  // Tabs Handler
  el.tabItems.forEach(tab => {
    tab.addEventListener("click", () => {
      if (state.isSpinning) return;
      playSynthSound("click");
      
      el.tabItems.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      state.activeTab = tab.getAttribute("data-tab");
      shuffleRewardCards();
    });
  });

  function shuffleRewardCards() {
    const cards = document.querySelectorAll(".reward-card");
    gsap.fromTo(cards, 
      { scale: 0.92, opacity: 0.5 },
      { scale: 1, opacity: 1, duration: 0.35, stagger: 0.05, ease: "power2.out" }
    );
  }

  /* No pointer-parallax. The camera is locked: the stage must read the same
     for every player on every device, exactly like the reference client. */


  el.levelBadges.forEach(badge => {
    badge.addEventListener("click", () => {
      const level = parseInt(badge.getAttribute("data-lv"));
      switchLevel(level);
    });
  });

  el.btnSpin.addEventListener("click", executeGachaLaunch);
  el.btnRevealClaim.addEventListener("click", handleClaimReward);

  // Modal triggers
  el.btnHelp.addEventListener("click", () => openModal(el.modalHelp));
  el.btnCloseHelp.addEventListener("click", () => closeModal(el.modalHelp));
  
  el.btnRecordsModal.addEventListener("click", () => {
    renderRecordsList();
    openModal(el.modalRecords);
  });
  el.btnCloseRecords.addEventListener("click", () => closeModal(el.modalRecords));

  el.btnRankingTrigger.addEventListener("click", () => openModal(el.modalRanking));
  el.btnCloseRanking.addEventListener("click", () => closeModal(el.modalRanking));

  // Controls Panel Handlers
  el.btnAddCoins.addEventListener("click", () => {
    playSynthSound("click");
    state.gold += 1000000;
    updateWalletUI();
  });

  el.btnToggleAudio.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    el.btnToggleAudio.innerText = `Toggle Audio Synth: ${state.soundOn ? "ON" : "OFF"}`;
    if (state.soundOn) {
      initAudio();
      playSynthSound("click");
    } else {
      stopAmbientHum();
    }
  });

  /* ---- Live engine telemetry in the sidebar (real numbers, sampled) ---- */
  let fpsFrames = 0, fpsLast = performance.now();
  function sampleEngineStats() {
    fpsFrames++;
    const now = performance.now();
    if (now - fpsLast >= 500) {
      const fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
      if (el.engFps) el.engFps.innerText = `${fps}`;
      fpsFrames = 0;
      fpsLast = now;

      const e = engine();
      if (e && el.engThrottle) {
        el.engThrottle.innerText = `${Math.round(e.throttle * 100)}%`;
      }
    }
    requestAnimationFrame(sampleEngineStats);
  }
  requestAnimationFrame(sampleEngineStats);

  // Quit and Share Mock Triggers
  el.btnShare.addEventListener("click", () => {
    playSynthSound("click");
    alert("Event link copied to clipboard (Mock Action)!");
  });

  el.btnQuit.addEventListener("click", () => {
    playSynthSound("click");
    if (confirm("Exit game simulation?")) {
      window.close();
    }
  });

  /* ================= ENGINE HANDSHAKE + INIT ================= */

  function onEngineReady() {
    const e = engine();
    if (!e) return;

    // Report the real GPU/renderer string — no placeholder text
    try {
      const gl = e.renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const raw = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "WebGL2";
      if (el.engRenderer) {
        el.engRenderer.innerText = String(raw).replace(/^ANGLE \(|\)$/g, "").slice(0, 34);
      }
    } catch (_) {
      if (el.engRenderer) el.engRenderer.innerText = "WebGL2";
    }

    // Push the current level into the freshly booted engine.
    // ?lv=1..5 deep-links straight to a tier (shareable, and handy for QA).
    const params = new URLSearchParams(location.search);
    const lv = parseInt(params.get("lv"), 10);
    switchLevel(levelConfig[lv] ? lv : state.activeLevel);

    // ?still=1 skips the drop-in entry — for headless screenshots where the
    // animation clock doesn't advance. No effect on normal play.
    if (params.get("still") === "1" && e._entryT !== undefined) {
      e._entryT = 1; e._entryLanded = true; e.warp = 0;
      if (e.shipRoot) e.shipRoot.position.y = 0.7;
    }
  }

  if (window.GachaEngine) onEngineReady();
  else window.addEventListener("gacha-engine-ready", onEngineReady, { once: true });

  // Timer interval
  setInterval(updateTimer, 1000);

  // Initial syncs (UI only — the ship arrives with the engine handshake)
  updateWalletUI();
  updateProgressUI();
  switchLevel(5);


})();
