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
    activeLevel: 4,
    activeTab: "top1",
    progress: parseInt(localStorage.getItem("gacha_progress")) || 0,
    soundOn: true,
    countdownSeconds: 13 * 3600 + 20 * 60 + 12, // 13:20:12 matching screenshot
    records: JSON.parse(localStorage.getItem("gacha_records")) || [],
    isSpinning: false
  };

  // Level Configuration (4 Tiers matching client's screenshot)
  const levelConfig = {
    1: {
      color: "#00e676", // Green
      glow: "rgba(0, 230, 118, 0.45)",
      shipImg: "assets/ship_lv1.png",
      cost: 10000,
      chance: 15,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4",
      flameOffset: 90,
      orientation: "90deg 0deg 270deg",
      cameraOrbit: "0deg 90deg auto",
      cameraTarget: "0m 0m 0m",
      metalness: 0.8,
      roughness: 0.25
    },
    2: {
      color: "#d500f9", // Purple
      glow: "rgba(213, 0, 249, 0.45)",
      shipImg: "assets/ship_lv4.png",
      cost: 10000,
      chance: 25,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4",
      flameOffset: 95,
      orientation: "270deg 0deg 90deg",
      cameraOrbit: "0deg 90deg auto",
      cameraTarget: "0m 0m 0m",
      metalness: 0.95,
      roughness: 0.18
    },
    3: {
      color: "#ff1744", // Red
      glow: "rgba(255, 23, 68, 0.45)",
      shipImg: "assets/ship_lv3.png",
      cost: 10000,
      chance: 35,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4",
      flameOffset: 95,
      orientation: "270deg 0deg 270deg",
      cameraOrbit: "0deg 90deg auto",
      cameraTarget: "0m 0m 0m",
      metalness: 0.9,
      roughness: 0.22
    },
    4: {
      color: "#00e5ff", // Blue/Gold
      glow: "rgba(0, 229, 255, 0.45)",
      shipImg: "assets/ship_lv2.png",
      cost: 10000,
      chance: 45,
      silverVal: "1000000",
      skinVal: "6000000",
      frameVal: "X 4",
      flameOffset: 110,
      orientation: "270deg 0deg 90deg",
      cameraOrbit: "0deg 90deg auto",
      cameraTarget: "0m -0.05m 0m",
      metalness: 0.85,
      roughness: 0.2
    }
  };

  // Nozzle coordinates for multi-stream flames per level (horizontal percentage offsets & size specs)
  const nozzlesConfig = {
    1: [
      { left: 50, width: 34, height: 110 }
    ],
    2: [
      { left: 14, width: 16, height: 75 },
      { left: 38, width: 26, height: 100 },
      { left: 62, width: 26, height: 100 },
      { left: 86, width: 16, height: 75 }
    ],
    3: [
      { left: 22, width: 16, height: 75 },
      { left: 50, width: 34, height: 120 },
      { left: 78, width: 16, height: 75 }
    ],
    4: [
      { left: 34, width: 22, height: 95 },
      { left: 66, width: 22, height: 95 }
    ]
  };

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
    
    // Stage elements
    spaceshipSprite: document.getElementById("spaceship-3d-model"),
    spaceshipContainer: document.getElementById("spaceship-container"),
    pedestalGlow: document.querySelector(".pedestal-glow"),
    flameEffect: document.getElementById("flame-effect"),
    shockwave: document.getElementById("shockwave"),
    
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

  // Dynamic Nozzles rebuild (Multi-nozzle flames matching selected level)
  function rebuildFlames() {
    const flames = el.flameEffect.querySelectorAll(".core-flame");
    flames.forEach(f => f.remove());

    const config = levelConfig[state.activeLevel];
    // Position the flames container relative to the ship's active engines
    el.flameEffect.style.bottom = `${config.flameOffset}px`;

    const nozzles = nozzlesConfig[state.activeLevel];
    nozzles.forEach(nozzle => {
      const flame = document.createElement("div");
      flame.className = "core-flame";
      flame.style.left = `${nozzle.left}%`;
      flame.style.width = `${nozzle.width}px`;
      flame.style.height = `${nozzle.height}px`;
      flame.style.transform = `translateX(-50%)`;

      // 1. Base glow bulb (adds lens flare glow at nozzle mouth)
      const baseGlow = document.createElement("div");
      baseGlow.className = "flame-glow-base";
      flame.appendChild(baseGlow);

      // 2. Outer burning plume
      const outerPlume = document.createElement("div");
      outerPlume.className = "flame-plume-outer";
      flame.appendChild(outerPlume);

      // 3. Inner white-hot core
      const innerPlume = document.createElement("div");
      innerPlume.className = "flame-plume-inner";
      flame.appendChild(innerPlume);

      // 4. Moving combustion flow streaks
      const streakContainer = document.createElement("div");
      streakContainer.className = "flame-streaks";
      for (let i = 1; i <= 3; i++) {
        const streak = document.createElement("div");
        streak.className = "flame-streak";
        streakContainer.appendChild(streak);
      }
      flame.appendChild(streakContainer);

      el.flameEffect.appendChild(flame);
    });
    scaleFlames(0.22, 0);
  }

  // Set flame height scaling dynamically (factors in landing/takeoff sizes)
  function scaleFlames(factor, duration = 0.25) {
    const flames = el.flameEffect.querySelectorAll(".core-flame");
    const nozzles = nozzlesConfig[state.activeLevel];
    flames.forEach((flame, index) => {
      const origHeight = nozzles[index].height;
      gsap.to(flame, {
        height: origHeight * factor,
        duration: duration,
        ease: "power2.out"
      });
    });
  }

  // Config writer helper
  function applyPBRSettings() {
    const pitch = document.getElementById("tune-pitch").value;
    const roll = document.getElementById("tune-roll").value;
    const yaw = document.getElementById("tune-yaw").value;
    const flame = document.getElementById("tune-flame").value;
    const metalness = document.getElementById("tune-metal").value;
    const roughness = document.getElementById("tune-rough").value;

    const output = `{\n  flameOffset: ${flame},\n  orientation: "${roll}deg ${pitch}deg ${yaw}deg",\n  metalness: ${metalness},\n  roughness: ${roughness}\n}`;
    document.getElementById("tune-config-output").innerText = output;
  }

  // Check if a 2D model image exists, and load it dynamically
  function checkAndLoad3DModel() {
    const level = state.activeLevel;
    const shipImg = document.getElementById("spaceship-view-img");
    if (!shipImg) return;

    const config = levelConfig[level];

    // Update image src using the mapped config value
    const newSrc = `${config.shipImg}?v=6`;
    if (shipImg.getAttribute("src") !== newSrc) {
      shipImg.setAttribute("src", newSrc);
    }

    // Update tuner sliders to match current config values (format is 'roll pitch yaw')
    const [roll, pitch, yaw] = config.orientation.replace(/deg/g, '').split(' ').map(Number);
    document.getElementById("tune-pitch").value = pitch || 0;
    document.getElementById("tune-roll").value = roll || 0;
    document.getElementById("tune-yaw").value = yaw || 0;
    document.getElementById("tune-flame").value = config.flameOffset || 90;
    document.getElementById("tune-metal").value = config.metalness !== undefined ? config.metalness : 0.9;
    document.getElementById("tune-rough").value = config.roughness !== undefined ? config.roughness : 0.25;

    // Update slider label texts
    document.getElementById("val-pitch").innerText = `${pitch || 0}°`;
    document.getElementById("val-roll").innerText = `${roll || 0}°`;
    document.getElementById("val-yaw").innerText = `${yaw || 0}°`;
    document.getElementById("val-flame").innerText = `${config.flameOffset || 90}px`;
    document.getElementById("val-metal").innerText = (config.metalness !== undefined ? config.metalness : 0.9).toFixed(2);
    document.getElementById("val-rough").innerText = (config.roughness !== undefined ? config.roughness : 0.25).toFixed(2);

    // Show dynamic flames immediately
    if (el.flameEffect) el.flameEffect.style.opacity = "1";

    applyPBRSettings();

    // Apply entrance animation
    gsap.fromTo(shipImg,
      { scale: 0.8, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.5)" }
    );
  }

  // Level Selector
  function switchLevel(levelNum) {
    if (state.isSpinning) return;
    
    playSynthSound("level");
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
    document.documentElement.style.setProperty("--flame-color", config.flameColor || config.color);
    document.documentElement.style.setProperty("--flame-glow", config.flameGlow || config.glow);
    document.documentElement.style.setProperty(
      "--level-bg-grad",
      `radial-gradient(circle at 50% 80%, ${config.glow} 0%, rgba(0, 0, 0, 0) 70%)`
    );

    const shipImg = document.getElementById("spaceship-view-img");
    
    // Snappy, instant updates for 0ms response latency
    if (el.cardImgShip) el.cardImgShip.src = config.shipImg;
    if (el.cardAvatarFrame) {
      el.cardAvatarFrame.style.borderColor = config.color;
      el.cardAvatarFrame.style.boxShadow = `0 0 8px ${config.glow}`;
    }
    
    rebuildFlames();
    checkAndLoad3DModel(); // Instant source switch

    // Trigger instant crisp scale pop animation
    gsap.killTweensOf(shipImg);
    gsap.fromTo(shipImg, 
      { scale: 0.76, opacity: 0.75 },
      { 
        scale: 1.0, 
        opacity: 1, 
        duration: 0.22, 
        ease: "back.out(1.8)" 
      }
    );

    // Cards data updates
    el.chanceBadge.innerText = `${config.chance}% Possibility`;
    el.cardVal2.innerText = config.silverVal;
    el.cardVal3.innerText = config.skinVal;
    el.cardVal4.innerText = config.frameVal;

    el.actionBtnLabel.innerText = `LAUNCH (${config.cost.toLocaleString()} Coins)`;
  }

  // 60FPS Parallax Stars and engine particles
  const canvas = document.getElementById("starfield-canvas");
  const ctx = canvas.getContext("2d");
  let stars = [];
  let sparks = [];
  let starSpeed = 0.55;
  let animationFrameId;

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: Math.random() * 3 + 1,
        speed: Math.random() * 0.9 + 0.3,
        opacity: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.05 + 0.01,
        color: Math.random() > 0.7 ? '#00e5ff' : (Math.random() > 0.5 ? '#ffe082' : '#ffffff')
      });
    }
  }

  // Spawn thruster sparks on canvas
  function spawnThrustParticles() {
    if (state.isSpinning === false && Math.random() > 0.4) return;
    const config = levelConfig[state.activeLevel];
    const nozzles = nozzlesConfig[state.activeLevel];

    // Find spaceship container bounds to align coordinates
    const rect = el.spaceshipContainer.getBoundingClientRect();
    const viewportRect = el.phoneScreenViewport.getBoundingClientRect();
    
    // Spaceship local coordinates mapped to canvas space
    const shipLeft = rect.left - viewportRect.left;
    const shipTop = rect.top - viewportRect.top;
    const shipWidth = rect.width;
    const shipHeight = rect.height;

    // Core exhaust base position relative to level specific engines
    const exhaustY = shipTop + shipHeight - config.flameOffset;

    nozzles.forEach(nozzle => {
      // nozzle.left is percentage width
      const exhaustX = shipLeft + (shipWidth * (nozzle.left / 100));

      const particleCount = state.isSpinning ? 4 : 1;
      for (let k = 0; k < particleCount; k++) {
        sparks.push({
          x: exhaustX + (Math.random() - 0.5) * (nozzle.width * 0.6),
          y: exhaustY,
          vx: (Math.random() - 0.5) * 1.5,
          vy: Math.random() * (state.isSpinning ? 18 : 6) + 4,
          size: Math.random() * (state.isSpinning ? 4.5 : 2.5) + 1,
          life: 0,
          maxLife: Math.random() * 25 + 15,
          color: config.color
        });
      }
    });
  }

  function animateStarsAndSparks() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Starfield
    stars.forEach(star => {
      star.y += star.speed * (starSpeed * 4);
      if (star.y > canvas.height) {
        star.y = 0;
        star.x = Math.random() * canvas.width;
      }
      
      const isWarp = starSpeed > 2;
      const streakLength = isWarp ? starSpeed * 10 : star.len;
      
      if (isWarp) {
        // Draw purple outer glow streak (esports neon aura)
        ctx.strokeStyle = `rgba(213, 0, 249, ${0.45 * star.opacity})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(star.x, star.y + streakLength);
        ctx.stroke();
      }
      
      // Draw white core streak
      ctx.strokeStyle = isWarp ? `rgba(255, 255, 255, ${0.95 * star.opacity})` : `rgba(255, 255, 255, ${star.opacity})`;
      ctx.lineWidth = isWarp ? 2 : (star.len > 5 ? 1.5 : 1);
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x, star.y + streakLength);
      ctx.stroke();
    });

    // 2. Spawn and update engine sparks
    spawnThrustParticles();
    
    sparks.forEach((spark, index) => {
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.life++;

      const lifeRatio = spark.life / spark.maxLife;
      const alpha = 1 - lifeRatio;

      ctx.strokeStyle = spark.color;
      ctx.lineWidth = spark.size * (1 - lifeRatio * 0.5);
      ctx.shadowBlur = spark.size * 2;
      ctx.shadowColor = spark.color;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      // High-speed motion blur tail vector calculation
      ctx.lineTo(spark.x - spark.vx * 1.5, spark.y - spark.vy * 1.5);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset blur

      if (spark.life >= spark.maxLife) {
        sparks.splice(index, 1);
      }
    });

    // 3. Draw Dynamic Original AAA 8-Point Optic Lens Flare Star & Mach Engine Exhaust
    const config = levelConfig[state.activeLevel];
    const nozzles = nozzlesConfig[state.activeLevel];
    if (config && nozzles && el.spaceshipContainer && el.phoneScreenViewport) {
      const rect = el.spaceshipContainer.getBoundingClientRect();
      const viewportRect = el.phoneScreenViewport.getBoundingClientRect();
      
      if (rect && viewportRect) {
        const shipLeft = rect.left - viewportRect.left;
        const shipTop = rect.top - viewportRect.top;
        const shipWidth = rect.width;
        const shipHeight = rect.height;
        const exhaustY = shipTop + shipHeight - config.flameOffset;
        
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        
        nozzles.forEach(nozzle => {
          const exhaustX = shipLeft + (shipWidth * (nozzle.left / 100));
          const scale = state.isSpinning ? 1.85 : 1.0;
          
          // A. Radial Light Halo
          const haloGrad = ctx.createRadialGradient(exhaustX, exhaustY, 0, exhaustX, exhaustY, 36 * scale);
          haloGrad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
          haloGrad.addColorStop(0.35, config.color || "#00e5ff");
          haloGrad.addColorStop(0.75, "rgba(0, 229, 255, 0.35)");
          haloGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          
          ctx.fillStyle = haloGrad;
          ctx.beginPath();
          ctx.arc(exhaustX, exhaustY, 36 * scale, 0, Math.PI * 2);
          ctx.fill();
          
          // B. Anamorphic Horizontal Lens Flare Bar (Long Sci-Fi Light Streak)
          const streakW = (state.isSpinning ? 280 : 160);
          const streakH = (state.isSpinning ? 6 : 3.5);
          const streakGrad = ctx.createLinearGradient(exhaustX - streakW/2, exhaustY, exhaustX + streakW/2, exhaustY);
          streakGrad.addColorStop(0, "rgba(0, 229, 255, 0)");
          streakGrad.addColorStop(0.2, "rgba(0, 229, 255, 0.65)");
          streakGrad.addColorStop(0.5, "#ffffff");
          streakGrad.addColorStop(0.8, "rgba(0, 229, 255, 0.65)");
          streakGrad.addColorStop(1, "rgba(0, 229, 255, 0)");
          
          ctx.fillStyle = streakGrad;
          ctx.fillRect(exhaustX - streakW/2, exhaustY - streakH/2, streakW, streakH);
          
          // C. 8-Point Optic Flare Star Rays
          const rayLen = 24 * scale;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
          ctx.lineWidth = 1.6;
          
          // Vertical Ray
          ctx.beginPath();
          ctx.moveTo(exhaustX, exhaustY - rayLen);
          ctx.lineTo(exhaustX, exhaustY + rayLen);
          ctx.stroke();
          
          // Diagonal Rays (45 deg)
          const diag = rayLen * 0.65;
          ctx.beginPath();
          ctx.moveTo(exhaustX - diag, exhaustY - diag);
          ctx.lineTo(exhaustX + diag, exhaustY + diag);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(exhaustX + diag, exhaustY - diag);
          ctx.lineTo(exhaustX - diag, exhaustY + diag);
          ctx.stroke();
          
          // D. Mach Shock Rings (Pulsating Internal Combustion Diamonds)
          const ringPulse = Math.sin(Date.now() * 0.01) * 2;
          for (let m = 1; m <= 3; m++) {
            const ringY = exhaustY + (m * 18 * scale);
            const ringRadius = (15 - m * 3 + ringPulse) * scale;
            if (ringRadius > 0) {
              ctx.strokeStyle = config.color || "#00e5ff";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.ellipse(exhaustX, ringY, ringRadius, ringRadius * 0.35, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          
          // E. Core White Hot Point
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(exhaustX, exhaustY, 4.5 * scale, 0, Math.PI * 2);
          ctx.fill();
        });
        
        // F. Moving Metallic Armor Light Glint Traversing Ship Body
        const time = Date.now() * 0.002;
        const glintY = shipTop + (shipHeight * 0.35) + Math.sin(time) * 30;
        const glintX = shipLeft + (shipWidth * 0.5) + Math.cos(time * 0.7) * 35;
        
        const glintGrad = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, 22);
        glintGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        glintGrad.addColorStop(0.4, "rgba(0, 229, 255, 0.45)");
        glintGrad.addColorStop(1, "rgba(0, 229, 255, 0)");
        
        ctx.fillStyle = glintGrad;
        ctx.beginPath();
        ctx.arc(glintX, glintY, 22, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }

    animationFrameId = requestAnimationFrame(animateStarsAndSparks);
  }

  // Timer loop
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

    state.isSpinning = true;
    playSynthSound("launch");

    // Deduct coins
    state.gold -= config.cost;
    updateWalletUI();

    // 1. Throttle up flames (scale height to 3.2x for massive AAA blastoff!)
    scaleFlames(3.2, 0.45);

    // 2. Camera screen shake
    el.phoneScreenViewport.classList.add("screen-shake");

    // 3. Shockwave blast ring
    gsap.fromTo(el.shockwave,
      { scale: 0.4, opacity: 0.9 },
      { scale: 3.2, opacity: 0, duration: 0.8, ease: "power2.out" }
    );

    // 4. Warp-drive lens flare screen flash overlay (at warp release)
    const flashEl = document.getElementById("launch-flash");
    if (flashEl) {
      gsap.fromTo(flashEl,
        { opacity: 0, scale: 0.6 },
        { 
          opacity: 0.95, 
          scale: 1.8, 
          duration: 0.12, 
          delay: 0.35, 
          ease: "power2.out", 
          onComplete: () => {
            gsap.to(flashEl, { opacity: 0, scale: 2.5, duration: 0.9, ease: "power3.out" });
          }
        }
      );
    }

    // 5. Parallax star speed throttle (boost warp speed to 22.0!)
    gsap.to({ speed: 0.55 }, {
      speed: 22.0,
      duration: 1.1,
      ease: "power2.in",
      onUpdate: function () {
        starSpeed = this.targets()[0].speed;
      }
    });

    // 6. Space Ship blastoff flight with violent engine vibration & energy beam flare
    gsap.fromTo(".blast-beam", 
      { scaleX: 0, opacity: 0 },
      { scaleX: 1.45, opacity: 0.95, duration: 0.35, yoyo: true, repeat: 1, ease: "power2.out" }
    );

    const tl = gsap.timeline();
    const activeLv = state.activeLevel || 5;

    if (activeLv === 1) { // Level 1: Light Speed Zip (Instant warp straight UP, clean, fast)
      tl.to(el.spaceshipContainer, {
        x: () => (Math.random() - 0.5) * 3,
        y: () => 4 + (Math.random() - 0.5) * 3,
        scaleX: 1.02,
        scaleY: 0.98,
        duration: 0.05,
        repeat: 4,
        yoyo: true,
        ease: "none"
      })
      .to(el.spaceshipContainer, {
        y: 10,
        scaleY: 0.88,
        scaleX: 1.08,
        duration: 0.12,
        ease: "power2.out"
      })
      .to(el.spaceshipContainer, {
        x: 0,
        y: -1050,
        scaleY: 2.4, // Intense thin stretch
        scaleX: 0.4,
        opacity: 0,
        duration: 0.38,
        ease: "power4.in",
        onComplete: () => {
          el.phoneScreenViewport.classList.remove("screen-shake");
          rollGachaPrize();
        }
      });
    } else if (activeLv === 2) { // Level 2: Interceptor Flight (Medium speed straight UP)
      tl.to(el.spaceshipContainer, {
        x: () => (Math.random() - 0.5) * 5,
        y: () => 6 + (Math.random() - 0.5) * 5,
        scaleX: 1.05,
        scaleY: 0.95,
        duration: 0.05,
        repeat: 6,
        yoyo: true,
        ease: "none"
      })
      .to(el.spaceshipContainer, {
        y: 15,
        scaleY: 0.85,
        scaleX: 1.12,
        duration: 0.15,
        ease: "power2.out"
      })
      .to(el.spaceshipContainer, {
        x: 0,
        y: -1050, // Straight UP
        scaleY: 1.85,
        scaleX: 0.55,
        opacity: 0,
        duration: 0.62,
        ease: "power3.in",
        onComplete: () => {
          el.phoneScreenViewport.classList.remove("screen-shake");
          rollGachaPrize();
        }
      });
    } else if (activeLv === 3) { // Level 3: Heavy Rocket (Slow launch straight UP, heavy shaking)
      tl.to(el.spaceshipContainer, {
        x: () => (Math.random() - 0.5) * 16, // Violent engine vibration!
        y: () => 20 + (Math.random() - 0.5) * 16,
        scaleX: 1.15,
        scaleY: 0.85,
        duration: 0.04,
        repeat: 18,
        yoyo: true,
        ease: "none"
      })
      .to(el.spaceshipContainer, {
        y: 22,
        scaleY: 0.78,
        scaleX: 1.2,
        duration: 0.22,
        ease: "power2.out"
      })
      .to(el.spaceshipContainer, {
        x: 0,
        y: -1050, // Straight UP
        scaleY: 1.5,
        scaleX: 0.75,
        opacity: 0,
        duration: 1.15, // Slow lift-off
        ease: "power2.in",
        onComplete: () => {
          el.phoneScreenViewport.classList.remove("screen-shake");
          rollGachaPrize();
        }
      });
    } else { // Level 4: Quantum Cruising (Sleek swift launch straight UP)
      tl.to(el.spaceshipContainer, {
        x: () => (Math.random() - 0.5) * 6,
        y: () => 8 + (Math.random() - 0.5) * 6,
        scaleX: 0.92,
        scaleY: 1.08,
        duration: 0.05,
        repeat: 10,
        yoyo: true,
        ease: "power1.inOut"
      })
      .to(el.spaceshipContainer, {
        y: 18,
        scaleY: 0.82,
        scaleX: 1.15,
        duration: 0.18,
        ease: "power2.out"
      })
      .to(el.spaceshipContainer, {
        x: 0,
        y: -1050, // Straight UP
        scaleY: 2.1,
        scaleX: 0.5,
        opacity: 0,
        duration: 0.68,
        ease: "power3.in",
        onComplete: () => {
          el.phoneScreenViewport.classList.remove("screen-shake");
          rollGachaPrize();
        }
      });
    }
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

    // Reset star speed
    starSpeed = 0.55;
    
    // Scale flames back to default landing size
    scaleFlames(0.22, 0.5);

    // Spaceship landing bounce down animation
    gsap.set(el.spaceshipContainer, { y: -800, opacity: 0, scaleY: 1, scaleX: 1 });
    
    gsap.to(el.spaceshipContainer, {
      y: 0,
      opacity: 1,
      duration: 0.95,
      ease: "bounce.out",
      onComplete: () => {
        state.isSpinning = false;
        updateWalletUI();
        // Restore tech ring animation speed
        const techRing = document.querySelector('.pedestal-tech-ring');
        if (techRing) techRing.style.animationDuration = '15s';
      }
    });
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

  // 3D Model hover tilt parallax (now applied directly to 2D image + background drift across the viewport)
  el.phoneScreenViewport.addEventListener("mousemove", (e) => {
    if (state.isSpinning) return;
    const shipImg = document.getElementById("spaceship-view-img");
    if (!shipImg) return;

    const rect = el.phoneScreenViewport.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5

    const rotateY = x * 22; // Yaw rotation range ±22 deg
    const rotateX = y * -15;  // Pitch rotation range ±15 deg
    const transX = x * 15;
    const transY = y * 15;
    
    // Tilt the ship
    shipImg.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg) translate3d(${transX}px, ${transY}px, 0) scale(1.05)`;
    
    // Slide the starfield canvas in the opposite direction
    const canvas = document.getElementById("starfield-canvas");
    if (canvas) {
      canvas.style.transform = `translate3d(${x * -20}px, ${y * -20}px, 0)`;
      canvas.style.transition = "transform 0.15s ease-out";
    }
    
    // Shift background planet space position
    if (el.phoneScreenViewport) {
      el.phoneScreenViewport.style.backgroundPosition = `${50 + x * -12}% ${50 + y * -12}%`;
    }
  });

  el.phoneScreenViewport.addEventListener("mouseleave", () => {
    const shipImg = document.getElementById("spaceship-view-img");
    if (shipImg) {
      shipImg.style.transform = 'rotateY(0deg) rotateX(0deg) translate3d(0, 0, 0) scale(1)';
    }
    const canvas = document.getElementById("starfield-canvas");
    if (canvas) {
      canvas.style.transform = 'translate3d(0, 0, 0)';
    }
    if (el.phoneScreenViewport) {
      el.phoneScreenViewport.style.backgroundPosition = '50% 50%';
    }
  });

  // Touch move parallax support for mobile devices
  el.spaceshipContainer.addEventListener("touchmove", (e) => {
    if (state.isSpinning) return;
    const touch = e.touches[0];
    const rect = el.spaceshipContainer.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width - 0.5;
    const y = (touch.clientY - rect.top) / rect.height - 0.5;
    if (x >= -0.5 && x <= 0.5 && y >= -0.5 && y <= 0.5) {
      const shipImg = document.getElementById("spaceship-view-img");
      if (shipImg) {
        const rotateY = x * 22;
        const rotateX = y * -15;
        const transX = x * 15;
        const transY = y * 15;
        shipImg.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg) translate3d(${transX}px, ${transY}px, 0) scale(1.05)`;
        
        const canvas = document.getElementById("starfield-canvas");
        if (canvas) {
          canvas.style.transform = `translate3d(${x * -20}px, ${y * -20}px, 0)`;
        }
        if (el.phoneScreenViewport) {
          el.phoneScreenViewport.style.backgroundPosition = `${50 + x * -12}% ${50 + y * -12}%`;
        }
      }
    }
  });

  el.spaceshipContainer.addEventListener("touchend", () => {
    const shipImg = document.getElementById("spaceship-view-img");
    if (shipImg) {
      shipImg.style.transform = 'rotateY(0deg) rotateX(0deg) translate3d(0, 0, 0) scale(1)';
    }
    const canvas = document.getElementById("starfield-canvas");
    if (canvas) {
      canvas.style.transform = 'translate3d(0, 0, 0)';
    }
    if (el.phoneScreenViewport) {
      el.phoneScreenViewport.style.backgroundPosition = '50% 50%';
    }
  });

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

  // Tuner Slider Listeners
  const sliders = ["pitch", "roll", "yaw", "flame", "metal", "rough"];
  sliders.forEach(id => {
    const elSlider = document.getElementById(`tune-${id}`);
    if (elSlider) {
      elSlider.addEventListener("input", () => {
        const val = elSlider.value;
        const labelSuffix = (id === "flame") ? "px" : (id === "metal" || id === "rough") ? "" : "°";
        const valText = (id === "metal" || id === "rough") ? parseFloat(val).toFixed(2) : val;
        
        document.getElementById(`val-${id}`).innerText = `${valText}${labelSuffix}`;

        const shipImg = document.getElementById("spaceship-view-img");
        if (shipImg) {
          const pitch = document.getElementById("tune-pitch").value;
          const roll = document.getElementById("tune-roll").value;
          const yaw = document.getElementById("tune-yaw").value;
          
          const flameOffsetVal = parseInt(document.getElementById("tune-flame").value);
          el.flameEffect.style.bottom = `${flameOffsetVal}px`;
          levelConfig[state.activeLevel].flameOffset = flameOffsetVal;
          levelConfig[state.activeLevel].orientation = `${roll}deg ${pitch}deg ${yaw}deg`;
          levelConfig[state.activeLevel].metalness = parseFloat(document.getElementById("tune-metal").value);
          levelConfig[state.activeLevel].roughness = parseFloat(document.getElementById("tune-rough").value);
          
          applyPBRSettings();
        }
      });
    }
  });

  // Model-viewer load listener removed (not needed for 2D mode)

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

  // Three.js 3D WebGL Engine Integration
  let threeScene, threeCamera, threeRenderer, thrusterPointLight, ambientLight;
  let threeParticles, particlePositions, particleVelocities;
  
  function initThreeEngine() {
    if (typeof THREE === 'undefined') return;
    
    const viewport = el.phoneScreenViewport;
    if (!viewport) return;
    
    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
    threeCamera.position.z = 100;
    
    // WebGL Renderer
    threeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    threeRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    threeRenderer.domElement.style.position = 'absolute';
    threeRenderer.domElement.style.top = '0';
    threeRenderer.domElement.style.left = '0';
    threeRenderer.domElement.style.width = '100%';
    threeRenderer.domElement.style.height = '100%';
    threeRenderer.domElement.style.pointerEvents = 'none';
    threeRenderer.domElement.style.zIndex = '2';
    
    viewport.appendChild(threeRenderer.domElement);
    
    // 3D Lighting Setup
    ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    threeScene.add(ambientLight);
    
    thrusterPointLight = new THREE.PointLight(0x00e5ff, 3, 150);
    thrusterPointLight.position.set(0, -30, 20);
    threeScene.add(thrusterPointLight);
    
    // 3D Engine Particle Buffer Geometry
    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    particlePositions = new Float32Array(particleCount * 3);
    particleVelocities = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 15;
      particlePositions[i * 3 + 1] = -25 - Math.random() * 40;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 15;
      
      particleVelocities[i * 3] = (Math.random() - 0.5) * 0.4;
      particleVelocities[i * 3 + 1] = -(Math.random() * 1.5 + 0.8);
      particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0x00e5ff,
      size: 2.2,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    
    threeParticles = new THREE.Points(geometry, material);
    threeScene.add(threeParticles);
    
    // Animation Loop
    function renderThree() {
      requestAnimationFrame(renderThree);
      
      // Update 3D particle positions
      const positions = threeParticles.geometry.attributes.position.array;
      const speedMult = state.isSpinning ? 3.5 : 1.0;
      
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += particleVelocities[i * 3 + 1] * speedMult;
        positions[i * 3] += particleVelocities[i * 3] * speedMult;
        
        if (positions[i * 3 + 1] < -80) {
          positions[i * 3 + 1] = -20;
          positions[i * 3] = (Math.random() - 0.5) * 15;
        }
      }
      threeParticles.geometry.attributes.position.needsUpdate = true;
      
      // Light color update matching current active level
      const config = levelConfig[state.activeLevel];
      if (config && thrusterPointLight) {
        thrusterPointLight.color.set(config.color || "#00e5ff");
        thrusterPointLight.intensity = state.isSpinning ? 6.0 : 2.5;
      }
      
      threeRenderer.render(threeScene, threeCamera);
    }
    
    renderThree();
  }

  // Init Operations
  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
    initStars();
  });
  
  initStars();
  animateStarsAndSparks();
  initThreeEngine();
  
  // Timer interval
  setInterval(updateTimer, 1000);
  
  // Initial syncs
  updateWalletUI();
  updateProgressUI();
  switchLevel(4);

})();
