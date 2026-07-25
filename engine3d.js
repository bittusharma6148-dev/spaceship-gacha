/* ==========================================================================
   SPACE GACHA — REAL 3D ENGINE
   Three.js r180 · PBR · IBL · UnrealBloom · Shader flames · GPU particles
   No sprites. No CSS fakery. Every pixel of the ship is real geometry.
   Author: VECTOR
   ========================================================================== */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------------------------------------------------------------- palette */

// The WebGL canvas spans the whole phone, but the ship must read inside the
// stage band — above the countdown row, below the event banner. _frameCamera()
// auto-fits whatever was just built, so these describe the TARGET: the assembly
// fills this fraction of the view, centred this far down the screen.
const FRAME_FILL = 0.53;
const FRAME_CENTRE = 0.49;

// Where the barrel hands off to the nose cone, as a fraction of hull radius.
// Kept high: the reference nose is a broad stubby cap, not a narrow spire.
const NOSE_NECK = 0.72;

// The launch deck burns amber in the reference regardless of ship tier.
const PAD_GOLD = 0xffb03a;

// Ship hovers this high above the deck, leaving a gap where the vortex glows.
const SHIP_LIFT = 0.7;

// Downward camera pitch (radians) — the reference's 3/4 hero angle, which
// reveals the deck top and the vortex ellipse instead of viewing them edge-on.
const CAM_PITCH = 0.28;

const GOLD = 0xffb121;
const GOLD_DEEP = 0xc9781a;
const HULL_WHITE = 0xdfe9f5;
const DARK_TRIM = 0x0d1524;

/**
 * Per-level ship design. Each entry is a full art-direction spec that
 * buildRocket() turns into real geometry — not a texture swap.
 */
const SHIPS = {
  1: {
    name: 'SCOUT',
    accent: 0x00e676,
    flameCore: 0xd9ffe9,
    flameEdge: 0x00e676,
    hull: 0x17a866,          // vivid painted hull
    nose: 0x9df5c8,          // pale cap — a clearly lighter cone, as in the ref
    body: 3.2,               // barrel height (nose is added on top)
    radius: 0.5,
    noseLen: 1.05,
    wings: 3,
    wingSpan: 1.02,
    wingDrop: 1.15,
    boosters: 0,
    engines: [{ x: 0, z: 0, r: 0.34 }],
    chevrons: 2,
    bands: 2,
    flameScale: 0.75, feat: []
  },
  2: {
    name: 'INTERCEPTOR',
    accent: 0xd500f9,
    flameCore: 0xf6d9ff,
    flameEdge: 0xd500f9,
    hull: 0x8322d6,
    nose: 0xe9a6ff,
    body: 3.5,
    radius: 0.58,
    noseLen: 1.15,
    wings: 4,
    wingSpan: 1.12,
    wingDrop: 1.25,
    boosters: 2,
    boosterScale: 0.54,
    engines: [
      { x: -0.30, z: 0, r: 0.26 },
      { x: 0.30, z: 0, r: 0.26 }
    ],
    chevrons: 3,
    bands: 2,
    flameScale: 0.95, feat: ['strips']
  },
  3: {
    name: 'HEAVY LIFTER',
    accent: 0xff1744,
    flameCore: 0xffe2d2,
    flameEdge: 0xff4500,
    hull: 0xd42438,
    nose: 0xffb0ba,
    body: 3.7,
    radius: 0.72,
    noseLen: 1.15,
    wings: 3,
    wingSpan: 1.34,
    wingDrop: 1.34,
    boosters: 2,
    boosterScale: 0.66,
    engines: [
      { x: 0, z: 0, r: 0.42 },
      { x: -0.55, z: 0, r: 0.28 },
      { x: 0.55, z: 0, r: 0.28 }
    ],
    chevrons: 3,
    bands: 3,
    flameScale: 1.25, feat: ['armor','vents']
  },
  4: {
    name: 'FLAGSHIP',
    accent: 0x00d5ff,
    flameCore: 0xbfeaff,
    flameEdge: 0x1e7bff,
    hull: 0x1a6ad8,          // the reference's bright royal blue
    nose: 0xaef0ff,          // bright cyan nose cap (reference glow)
    body: 3.8,
    radius: 0.78,
    noseLen: 1.25,
    wings: 4,
    wingSpan: 1.4,
    wingDrop: 1.5,
    boosters: 2,
    boosterScale: 0.6,
    engines: [
      { x: 0, z: 0, r: 0.4 },
      { x: -0.66, z: 0, r: 0.26 },
      { x: 0.66, z: 0, r: 0.26 }
    ],
    chevrons: 4,
    bands: 2,
    flameScale: 1.15, feat: ['cores','strips']
  },
  5: {
    name: 'OVERLORD',
    accent: 0xffd24a,        // gold-cyan ultimate tier
    flameCore: 0xffffff,
    flameEdge: 0x00e5ff,
    hull: 0x0f4fa8,          // deep royal blue
    nose: 0xfff0b0,          // gold-white nose
    body: 4.2,
    radius: 1.02,            // clearly the BROADEST hull
    noseLen: 1.4,
    wings: 6,                // six wings — the biggest, most futuristic silhouette
    wingSpan: 1.95,          // widest wingspan by far
    wingDrop: 1.75,
    boosters: 4,             // quad boosters, spread wide
    boosterScale: 0.66,
    engines: [
      { x: 0, z: 0, r: 0.5 },
      { x: -0.9, z: 0, r: 0.3 },
      { x: 0.9, z: 0, r: 0.3 },
      { x: -0.45, z: 0.55, r: 0.22 },
      { x: 0.45, z: 0.55, r: 0.22 }
    ],
    chevrons: 5,
    bands: 3,
    flameScale: 1.5, feat: ['armor','vents','cores','antenna','stabilizers']
  }
};

// Per-tier FLIGHT choreography — each ship launches with its own character.
// climbPow: acceleration curve · rollTurns: barrel rolls · sway: side weave ·
// shake: camera punch · vibrate: hold-down rattle · dur is set in launch().
const FLIGHT = {
  1: { style: 'zip',   climbPow: 4.2, rollTurns: 0,   sway: 0.9,  shake: 0.55, vibrate: 0.9 },  // SCOUT: instant agile zip + weave
  2: { style: 'dart',  climbPow: 3.4, rollTurns: 1,   sway: 0.4,  shake: 0.7,  vibrate: 1.0 },  // INTERCEPTOR: fast dart + single spin
  3: { style: 'heavy', climbPow: 2.0, rollTurns: 0,   sway: 0.05, shake: 1.15, vibrate: 1.7 },  // HEAVY LIFTER: slow, ponderous, big shake
  4: { style: 'cruise',climbPow: 2.7, rollTurns: 1,   sway: 0.1,  shake: 0.85, vibrate: 1.1 },  // FLAGSHIP: smooth powerful barrel roll
  5: { style: 'warp',  climbPow: 3.0, rollTurns: 2,   sway: 0.15, shake: 1.3,  vibrate: 1.3 }   // OVERLORD: dramatic double-spiral warp
};

/* --------------------------------------------------------- flame material */

const FLAME_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// fbm-driven plume. uv.y = 0 at the nozzle, 1 at the tip.
const FLAME_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uThrottle;
  uniform float uGain;     // compensates for N plumes stacking additively
  uniform vec3  uCore;
  uniform vec3  uEdge;
  varying vec2  vUv;

  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                       dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                       dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                       dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                       dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }

  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    float y = vUv.y;

    // turbulence scrolls along the plume, faster at higher throttle
    float t = uTime * (2.2 + uThrottle * 2.4);
    float n = fbm(vec3(vUv.x * 5.0, y * 2.4 - t, uTime * 0.55));

    // plume envelope: hot and solid at the nozzle, ragged at the tip
    float body = smoothstep(1.0, 0.06, y);
    float ragged = body - n * 0.42 * smoothstep(0.05, 1.0, y);

    // radial falloff so the cone edges feather instead of hard-clipping
    float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
    radial = smoothstep(0.0, 0.55, radial);

    float a = clamp(ragged * radial, 0.0, 1.0);
    a *= (0.16 + uThrottle * 0.5) * uGain;
    if (a < 0.01) discard;

    // white-hot at the throat, level colour further out
    float heat = smoothstep(0.5, 0.0, y) * 0.85 + uThrottle * 0.15;
    vec3 col = mix(uEdge, uCore, clamp(heat, 0.0, 1.0));
    // a restrained hot core: enough to catch bloom, not enough to blow the hull out
    col += uCore * pow(1.0 - y, 8.0) * (0.08 + uThrottle * 0.35);

    gl_FragColor = vec4(col, a);
  }
`;

/* ------------------------------------------------------------ star shader */

const STAR_VERT = /* glsl */`
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uWarp;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    // twinkle, de-emphasised during warp so streaks stay clean
    float tw = 0.65 + 0.35 * sin(uTime * 2.0 + aSeed * 6.28);
    vAlpha = mix(tw, 1.0, uWarp);

    gl_PointSize = aSize * (300.0 / -mv.z) * (1.0 + uWarp * 1.6);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uWarp;
  uniform float uAlpha;   // master fade — sparks ride this down at idle
  uniform float uWhite;   // wash toward white: stars high, sparks low
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // stretch the sprite vertically as warp ramps up -> real motion streaks
    c.y /= (1.0 + uWarp * 5.0);
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d) * vAlpha * uAlpha;
    if (a < 0.01) discard;
    vec3 col = mix(uColor, vec3(1.0), uWhite + vSeed * 0.2);
    gl_FragColor = vec4(col, a);
  }
`;

/* ----------------------------------------------------------- vortex shader */

// Swirling energy portal for the launch deck's core — the glowing orange
// whirlpool from the reference. Polar-coordinate spiral, hot centre, animated.
const VORTEX_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3  uHot;
  uniform vec3  uCool;
  varying vec2  vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;             // 0 centre .. 1 rim
    if (r > 1.0) discard;
    float ang = atan(p.y, p.x);

    // logarithmic spiral arms winding inward, rotating over time
    float spiral = sin(ang * 3.0 + r * 14.0 - uTime * 3.0);
    float arms = 0.5 + 0.5 * spiral;

    // bright core, arms fading toward the rim
    float core = smoothstep(0.55, 0.0, r);
    float body = smoothstep(1.0, 0.15, r);
    float glow = core * 1.6 + body * arms * 0.9;

    vec3 col = mix(uCool, uHot, clamp(core + arms * 0.4, 0.0, 1.0));
    col += uHot * core * 1.2;              // over-bright centre drives bloom

    float a = clamp(glow, 0.0, 1.0) * body;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`;

const VORTEX_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* =============================================================== ENGINE == */

class GachaEngine {
  constructor(container) {
    this.container = container;
    this.level = 4;
    this.throttle = 0.32;      // idle burn
    this.targetThrottle = 0.32;
    this.warp = 0;
    this.targetWarp = 0;
    this.isLaunching = false;
    this.shake = 0;
    this._entryT = 1;            // set to 0 by setLevel to play the drop-in entry
    this._entryLanded = true;
    this.clock = new THREE.Clock();
    this.disposables = [];

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initStars();
    this._initCosmos();
    this._initPedestal();
    this._initComposer();

    this.setLevel(4, true);

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    this._animate = this._animate.bind(this);
    this.renderer.setAnimationLoop(this._animate);
  }

  /* ------------------------------------------------------------ renderer */

  _initRenderer() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // ACES crushes saturation hard — it turned the gold trim tan and the hull
    // pastel. Neutral keeps the toy-bright palette the reference lives on.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const el = this.renderer.domElement;
    el.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;';
    this.container.appendChild(el);
  }

  _initScene() {
    this.scene = new THREE.Scene();

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 400);
    // Provisional — _frameCamera() replaces these once a ship exists.
    this.camY = 0;
    this.camZ = 24;
    this.camera.position.set(0, this.camY, this.camZ);
    this.camera.lookAt(0, this.camY, 0);

    // The composer writes an opaque frame, so anything behind the canvas in CSS
    // is invisible. The sky has to live inside the 3D scene to be seen at all.
    // Cyan/gold nebula — same palette as the hull and trim, so the ship reads
    // as part of the scene instead of pasted onto it.
    new THREE.TextureLoader().load('assets/bg_deep_space.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = tex;
      // Held down so the nebula's bright core never competes with the ship.
      this.scene.backgroundIntensity = 0.3;
      this.disposables.push(tex);
    });

    // Image-based lighting — this is what makes the metal read as real metal.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.envRT = envRT;
    pmrem.dispose();
  }

  _initLights() {
    // Key — warm, upper-left, casts the shadow onto the pedestal
    this.key = new THREE.DirectionalLight(0xfff4e2, 4.2);
    this.key.position.set(-5, 7, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 30;
    this.key.shadow.camera.left = -6;
    this.key.shadow.camera.right = 6;
    this.key.shadow.camera.top = 8;
    this.key.shadow.camera.bottom = -6;
    this.key.shadow.bias = -0.0012;
    this.scene.add(this.key);

    // Rim — level-coloured, behind and to the right, separates hull from bg
    this.rim = new THREE.DirectionalLight(0x00d5ff, 2.4);
    this.rim.position.set(5.5, 2.2, -5);
    this.scene.add(this.rim);

    // Fill — cool bounce from below, front-right, lifts the shadow side so the
    // hull reads bright and even like the reference art
    this.fill = new THREE.DirectionalLight(0xbfe0ff, 1.5);
    this.fill.position.set(4, -2, 6);
    this.scene.add(this.fill);

    // Back rim — a second cyan light straight behind, for a bright hero edge
    // that pops the ship off the dark space
    this.rim2 = new THREE.DirectionalLight(0x7fdcff, 1.5);
    this.rim2.position.set(-4, 3, -6);
    this.scene.add(this.rim2);

    this.scene.add(new THREE.AmbientLight(0x5a6a8a, 0.85));

    // Engine light — lives at the nozzles, drives the pedestal hot-spot
    this.engineLight = new THREE.PointLight(0x00d5ff, 14, 16, 2);
    this.engineLight.position.set(0, -2.6, 0.4);
    this.scene.add(this.engineLight);
  }

  /* ------------------------------------------------------- 3D star field */

  _initStars() {
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 2] = -Math.random() * 130 - 6;
      size[i] = Math.random() * 2.1 + 0.5;
      seed[i] = Math.random();
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.starUniforms = {
      uTime: { value: 0 },
      uWarp: { value: 0 },
      uAlpha: { value: 1 },
      uWhite: { value: 0.55 },        // stars stay bright and white-ish
      uColor: { value: new THREE.Color(0x00d5ff) }
    };

    const m = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.stars = new THREE.Points(g, m);
    this.scene.add(this.stars);
    this.disposables.push(g, m);
  }

  /* ------------------------------------------------------- deep-space props */

  /** Banded gas-giant texture, drawn procedurally so no extra asset ships. */
  _planetTexture(bands, seed = 1) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const x = c.getContext('2d');

    const grad = x.createLinearGradient(0, 0, 0, 256);
    bands.forEach((col, i) => grad.addColorStop(i / (bands.length - 1), col));
    x.fillStyle = grad;
    x.fillRect(0, 0, 512, 256);

    // wobbling latitude bands + a few storm ovals
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) {
      const y = rnd() * 256;
      const h = 2 + rnd() * 12;
      x.globalAlpha = 0.05 + rnd() * 0.16;
      x.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
      x.beginPath();
      for (let px = 0; px <= 512; px += 8) {
        const wob = Math.sin(px * 0.02 + i) * 3;
        px === 0 ? x.moveTo(px, y + wob) : x.lineTo(px, y + wob);
      }
      for (let px = 512; px >= 0; px -= 8) {
        const wob = Math.sin(px * 0.02 + i) * 3;
        x.lineTo(px, y + h + wob);
      }
      x.closePath();
      x.fill();
    }
    for (let i = 0; i < 5; i++) {
      x.globalAlpha = 0.12 + rnd() * 0.18;
      x.fillStyle = rnd() > 0.5 ? '#ffe6c0' : '#5a2f1a';
      x.beginPath();
      x.ellipse(rnd() * 512, rnd() * 256, 10 + rnd() * 30, 5 + rnd() * 10, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(tex);
    return tex;
  }

  _addPlanet({ radius, position, bands, seed, ring, tilt = 0.3 }) {
    const grp = new THREE.Group();
    grp.position.set(...position);
    grp.rotation.z = tilt;

    const mat = new THREE.MeshStandardMaterial({
      map: this._planetTexture(bands, seed),
      roughness: 0.92,
      metalness: 0.0
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
    grp.add(globe);
    this.disposables.push(globe.geometry, mat);

    if (ring) {
      const rg = new THREE.RingGeometry(radius * 1.35, radius * 2.15, 96);
      // remap UVs so the gradient runs across the ring's width
      const pos = rg.attributes.position;
      const uv = rg.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const d = (v.length() - radius * 1.35) / (radius * 0.8);
        uv.setXY(i, d, d);
      }
      const rm = new THREE.MeshBasicMaterial({
        color: ring,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const rmesh = new THREE.Mesh(rg, rm);
      rmesh.rotation.x = Math.PI / 2 - 0.34;
      grp.add(rmesh);
      this.disposables.push(rg, rm);
    }

    this.scene.add(grp);
    return grp;
  }

  /** Spiral galaxy as a point cloud — warm core fading to cool arms. */
  _addGalaxy({ position, radius, count, arms, spin, coreColor, armColor, scale }) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);

    const cCore = new THREE.Color(coreColor);
    const cArm = new THREE.Color(armColor);
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // bias toward the core so it reads as a bulge, not a flat ring
      const r = Math.pow(Math.random(), 1.9) * radius;
      const branch = ((i % arms) / arms) * Math.PI * 2;
      const angle = branch + (r / radius) * spin;

      // scatter widens with radius; thickness stays thin -> disc
      const spread = 0.09 * r + 0.25;
      const sx = (Math.random() - 0.5) * spread;
      const sy = (Math.random() - 0.5) * spread * 0.28;
      const sz = (Math.random() - 0.5) * spread;

      pos[i * 3] = Math.cos(angle) * r + sx;
      pos[i * 3 + 1] = sy;
      pos[i * 3 + 2] = Math.sin(angle) * r + sz;

      tmp.copy(cCore).lerp(cArm, Math.min(r / radius, 1));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      siz[i] = Math.random() * 1.6 + 0.5;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));

    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: scale } },
      vertexShader: /* glsl */`
        attribute float aSize;
        uniform float uScale;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol, a * 0.85);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const pts = new THREE.Points(g, m);
    pts.position.set(...position);
    pts.rotation.set(-1.16, 0, 0.32);   // tilted, so we see the spiral face-on-ish
    this.scene.add(pts);
    this.disposables.push(g, m);
    return pts;
  }

  /** Drifting asteroid field — the debris scattered across the reference. */
  _addAsteroids() {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x4a4640, metalness: 0.3, roughness: 0.9, flatShading: true
    });
    this.disposables.push(rockMat);
    this.asteroids = [];
    const specs = [
      { r: 1.6, p: [22, 8, -70] }, { r: 0.9, p: [-19, 14, -60] },
      { r: 2.2, p: [28, -6, -88] }, { r: 0.7, p: [-25, 4, -55] },
      { r: 1.1, p: [16, 17, -75] }, { r: 0.8, p: [-14, -14, -58] },
      { r: 1.4, p: [31, 13, -95] }
    ];
    for (const sp of specs) {
      // lumpy rock: an icosahedron with its verts jittered
      const geo = new THREE.IcosahedronGeometry(sp.r, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const f = 0.72 + Math.random() * 0.5;
        pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rockMat);
      m.position.set(...sp.p);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.userData.spin = (Math.random() - 0.5) * 0.3;
      this.scene.add(m);
      this.asteroids.push(m);
      this.disposables.push(geo);
    }
  }

  _initCosmos() {
    // Everything here lives far behind the stage and is deliberately dim —
    // it must add depth without ever competing with the ship.
    this._addAsteroids();

    this.galaxy = this._addGalaxy({
      position: [-36, 28, -165],
      radius: 32, count: 12000, arms: 4, spin: 4.1,
      coreColor: 0xffe2b0, armColor: 0x4f8dff, scale: 1.7
    });

    // a second bright compact galaxy / black-hole glow on the RIGHT, matching
    // the reference's blue swirl over there
    this.galaxyR = this._addGalaxy({
      position: [40, -6, -150],
      radius: 15, count: 5000, arms: 3, spin: 5.5,
      coreColor: 0xcfe8ff, armColor: 0x2f7dff, scale: 1.5
    });

    // big hero planet, upper-right, larger and closer like the reference
    this.planetA = this._addPlanet({
      radius: 7.5,
      position: [33, 24, -120],
      bands: ['#c9a06a', '#e8cf9e', '#a8763f', '#e0bd85', '#8a5c33'],
      seed: 7,
      ring: 0xffcf9a,
      tilt: 0.26
    });

    this.planetB = this._addPlanet({
      radius: 3.0,
      position: [-27, -12, -100],
      bands: ['#2f6f9e', '#57a8c9', '#1d4b73', '#6fc3d8'],
      seed: 23,
      tilt: -0.4
    });

    // a small close moon for parallax scale
    this.moon = this._addPlanet({
      radius: 1.1,
      position: [20, -16, -66],
      bands: ['#8d95a4', '#c3c9d4', '#6a7180'],
      seed: 51,
      tilt: 0.1
    });
  }

  /* ------------------------------------------------------- stone pedestal */

  _initPedestal() {
    const grp = new THREE.Group();
    // Dropped below the nozzles so the exhaust plume is visible in the gap —
    // with the pad any higher it just depth-occludes the flames, any lower and
    // it falls out of the stage band behind the countdown row.
    grp.position.y = -4.55;
    grp.scale.setScalar(1.0);      // full size — it reads as a launch platform now

    // Polished machined alloy — clearcoat gives the sharp specular highlights
    // and a faint blue emissive keeps the metal reading "powered", like the ref.
    const deck = new THREE.MeshPhysicalMaterial({
      color: 0x2f3a4c, metalness: 0.9, roughness: 0.28,
      clearcoat: 0.8, clearcoatRoughness: 0.25,
      emissive: 0x06212e, emissiveIntensity: 0.5, envMapIntensity: 1.3
    });
    const deckDark = new THREE.MeshPhysicalMaterial({
      color: 0x141d2a, metalness: 0.85, roughness: 0.4,
      clearcoat: 0.6, emissive: 0x04141d, emissiveIntensity: 0.5, envMapIntensity: 1.1
    });
    const trimLit = new THREE.MeshBasicMaterial({ color: 0x00d5ff });
    this.padTrim = trimLit;

    // stepped platform
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.5, 0.55, 64), deck);
    top.receiveShadow = true; top.castShadow = true;
    grp.add(top);

    const mid = new THREE.Mesh(new THREE.CylinderGeometry(2.74, 2.92, 0.5, 64), deckDark);
    mid.position.y = -0.52;
    mid.receiveShadow = true;
    grp.add(mid);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.06, 3.32, 0.45, 64), deck);
    base.position.y = -1.0;
    base.receiveShadow = true;
    grp.add(base);

    // glowing rim strip sandwiched between the tiers — the main "tech" read
    const rimStrip = new THREE.Mesh(
      new THREE.CylinderGeometry(2.54, 2.54, 0.1, 64, 1, true), trimLit
    );
    rimStrip.position.y = -0.26;
    grp.add(rimStrip);

    const rimStrip2 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.96, 2.96, 0.085, 64, 1, true), trimLit
    );
    rimStrip2.position.y = -0.76;
    grp.add(rimStrip2);

    // armoured buttress blocks with lit gaps between them
    const blockGeo = new THREE.BoxGeometry(0.46, 0.72, 0.55);
    const gapGeo = new THREE.BoxGeometry(0.12, 0.56, 0.57);
    this.disposables.push(blockGeo, gapGeo);
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const b = new THREE.Mesh(blockGeo, deckDark);
      b.position.set(Math.cos(a) * 2.58, -0.1, Math.sin(a) * 2.58);
      b.rotation.y = -a;
      b.castShadow = true;
      grp.add(b);

      const ga = ((i + 0.5) / N) * Math.PI * 2;
      const gmesh = new THREE.Mesh(gapGeo, trimLit);
      gmesh.position.set(Math.cos(ga) * 2.58, -0.1, Math.sin(ga) * 2.58);
      gmesh.rotation.y = -ga;
      grp.add(gmesh);
    }

    // four heavy clamp arms at the cardinals
    const armGeo = new THREE.BoxGeometry(0.26, 0.78, 0.5);
    this.disposables.push(armGeo);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = new THREE.Mesh(armGeo, deck);
      arm.position.set(Math.cos(a) * 2.24, 0.5, Math.sin(a) * 2.24);
      arm.rotation.y = -a;
      arm.rotation.z = Math.cos(a) * 0.18;
      arm.castShadow = true;
      grp.add(arm);

      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.07, 0.46), trimLit
      );
      tip.position.set(Math.cos(a) * 2.24, 0.92, Math.sin(a) * 2.24);
      tip.rotation.y = -a;
      grp.add(tip);
    }

    // Emissive launch-deck glow. Warm gold, not the level colour — in the
    // reference the pad burns amber under every ship.
    this.padMat = new THREE.MeshBasicMaterial({
      color: PAD_GOLD,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    // dark recessed well the vortex sits in, so it reads as a portal in the deck
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.55, 0.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x0a1420, metalness: 0.6, roughness: 0.5 })
    );
    well.position.y = 0.2;
    grp.add(well);
    this.disposables.push(well.geometry, well.material);

    // concentric machined tech rings on the deck top — more of them, alternating
    // metal ridges with thin glowing cyan channels for depth and realism
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0x00c8ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.padGlowRings = glowRingMat;
    this.disposables.push(glowRingMat);
    for (let i = 0; i < 5; i++) {
      const rr = 1.78 + i * 0.19;
      const metalRing = new THREE.Mesh(
        new THREE.TorusGeometry(rr, 0.055, 8, 96), deckDark
      );
      metalRing.rotation.x = -Math.PI / 2;
      metalRing.position.y = 0.3;
      metalRing.castShadow = true;
      grp.add(metalRing);
      this.disposables.push(metalRing.geometry);

      // thin recessed glow channel just inside each metal ridge
      const glowCh = new THREE.Mesh(
        new THREE.TorusGeometry(rr - 0.09, 0.018, 6, 96), glowRingMat
      );
      glowCh.rotation.x = -Math.PI / 2;
      glowCh.position.y = 0.285;
      grp.add(glowCh);
      this.disposables.push(glowCh.geometry);
    }

    // THE VORTEX — swirling orange energy core, animated in the loop
    this.vortexMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHot: { value: new THREE.Color(0xffd257) },
        uCool: { value: new THREE.Color(0xff6a1a) }
      },
      vertexShader: VORTEX_VERT,
      fragmentShader: VORTEX_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.vortex = new THREE.Mesh(new THREE.CircleGeometry(1.9, 64), this.vortexMat);
    this.vortex.rotation.x = -Math.PI / 2;
    this.vortex.position.y = 0.32;
    grp.add(this.vortex);
    this.disposables.push(this.vortex.geometry, this.vortexMat);

    // radiant light-beam cone rising from the core — the volumetric energy
    // glow that makes the portal read as powered (AAA touch)
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.4, 32, 1, true), this.beamMat);
    beam.position.y = 1.5;
    grp.add(beam);
    this.disposables.push(beam.geometry, this.beamMat);

    // bright hot point at the very centre for a strong bloom kick
    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xffe0a0, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.vortexCore = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), this.coreMat);
    this.vortexCore.rotation.x = -Math.PI / 2;
    this.vortexCore.position.y = 0.34;
    grp.add(this.vortexCore);
    this.disposables.push(this.vortexCore.geometry, this.coreMat);

    // faint level-coloured wash over the vortex (kept for recolour hook)
    this.padMat.opacity = 0;

    // counter-rotating outer tech rings (level-coloured)
    this.ringA = new THREE.Mesh(
      new THREE.TorusGeometry(2.42, 0.05, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x00d5ff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ringA.rotation.x = -Math.PI / 2;
    this.ringA.position.y = 0.34;
    grp.add(this.ringA);

    this.ringB = new THREE.Mesh(
      new THREE.TorusGeometry(2.02, 0.032, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0x00d5ff, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ringB.rotation.x = -Math.PI / 2;
    this.ringB.position.y = 0.44;
    grp.add(this.ringB);

    this.pedestal = grp;
    this.scene.add(grp);

    // shockwave ring, fired on launch
    this.shockMat = new THREE.MeshBasicMaterial({
      color: 0x00d5ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    this.shock = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.6, 64), this.shockMat);
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.position.set(0, -3.1, 0);
    this.shock.visible = false;
    this.scene.add(this.shock);
  }

  /* ------------------------------------------------------- post-processing */

  _initComposer() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(w, h);

    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // The single biggest "AAA" lever: physically-plausible glow bleed.
    // Threshold is deliberately high — only genuinely hot pixels (throats,
    // energy pad, warp streaks) bloom, so the hull keeps its PBR detail.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.26, 0.28, 0.82);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
  }

  /* ============================================== procedural ship builder */

  _mats(spec) {
    const hull = new THREE.MeshPhysicalMaterial({
      color: spec.hull,
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.15
    });
    const hullLight = new THREE.MeshPhysicalMaterial({
      color: HULL_WHITE,
      metalness: 0.6,
      roughness: 0.3,
      clearcoat: 1.0,
      clearcoatRoughness: 0.15,
      envMapIntensity: 1.4
    });
    // Pale cap for nose cones — the reference's noses read clearly lighter
    // than the hull, which is most of what makes it look like a toy rocket.
    const nose = new THREE.MeshPhysicalMaterial({
      color: spec.nose,
      metalness: 0.35,
      roughness: 0.28,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.1
    });
    // A full metal (metalness 1) takes ALL its colour from the environment, and
    // RoomEnvironment is a grey room — that read as muddy tan, not gold. Backing
    // metalness off lets the diffuse gold through while keeping the sheen.
    const gold = new THREE.MeshPhysicalMaterial({
      color: GOLD,
      metalness: 0.55,
      roughness: 0.28,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.9
    });
    const goldDeep = new THREE.MeshStandardMaterial({
      color: GOLD_DEEP, metalness: 0.6, roughness: 0.4, envMapIntensity: 0.8
    });
    const trim = new THREE.MeshStandardMaterial({
      color: DARK_TRIM, metalness: 0.7, roughness: 0.45, envMapIntensity: 1.0
    });
    const glow = new THREE.MeshBasicMaterial({ color: spec.accent });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0a2a44, metalness: 0.1, roughness: 0.05,
      transmission: 0.6, thickness: 0.4, envMapIntensity: 2.2
    });

    const all = [hull, hullLight, nose, gold, goldDeep, trim, glow, glass];
    this.disposables.push(...all);
    return { hull, hullLight, nose, gold, goldDeep, trim, glow, glass };
  }

  /**
   * Barrel only — flared skirt, straight body, rounded shoulder. The nose is a
   * separate mesh so it can carry its own pale material.
   * Spans y = -body/2 .. +body/2, ending at NOSE_NECK * R.
   */
  _fuselageGeo(spec) {
    const pts = [];
    const H = spec.body;
    const R = spec.radius;
    const STEPS = 36;

    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const y = -H * 0.5 + t * H;
      let r;
      if (t > 0.86) {
        // shoulder: ease from full radius down to the nose neck
        const st = (t - 0.86) / 0.14;
        r = R * (1 - (1 - NOSE_NECK) * st * st);
      } else if (t < 0.09) {
        // skirt flare at the base
        const st = t / 0.09;
        r = R * (1.14 - 0.14 * st);
      } else {
        r = R;
      }
      pts.push(new THREE.Vector2(r, y));
    }
    return new THREE.LatheGeometry(pts, 64);
  }

  /** Nose cone: tapered profile with a softly rounded tip, not a needle. */
  _noseGeo(spec) {
    const pts = [];
    const L = spec.noseLen;
    const R = spec.radius * NOSE_NECK;
    const STEPS = 26;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      // rounded ogive: full at the neck, gently blunted at the tip
      const r = R * Math.pow(Math.cos(t * Math.PI * 0.5), 0.62);
      pts.push(new THREE.Vector2(Math.max(r, 0.008), t * L));
    }
    return new THREE.LatheGeometry(pts, 64);
  }

  /**
   * Big swept wing panel. These are the widest thing on the reference ship and
   * carry most of its silhouette, so they are deliberately oversized.
   */
  _wingGeo(spec) {
    const s = new THREE.Shape();
    const span = spec.wingSpan;
    const drop = spec.wingDrop;
    // Aggressive fighter-jet fin: notched leading edge and a hooked rear talon
    // instead of a plain triangle, for a futuristic silhouette.
    s.moveTo(0, 0.72);
    s.lineTo(span * 0.34, 0.36);          // shoulder
    s.lineTo(span * 0.64, 0.04);          // leading-edge notch
    s.lineTo(span, -drop * 0.5);          // swept tip
    s.lineTo(span * 0.97, -drop * 0.82);
    s.lineTo(span * 0.72, -drop);         // rear talon
    s.lineTo(span * 0.48, -drop * 0.84);
    s.lineTo(0, -drop * 0.64);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.17, bevelEnabled: true, bevelThickness: 0.045,
      bevelSize: 0.045, bevelSegments: 2
    });
  }

  buildRocket(level) {
    const spec = SHIPS[level];
    const M = this._mats(spec);
    const g = new THREE.Group();
    const H = spec.body;          // barrel height
    const R = spec.radius;
    const TOP = H * 0.5;          // where the barrel ends / nose begins

    /* ---- barrel */
    const body = new THREE.Mesh(this._fuselageGeo(spec), M.hull);
    body.castShadow = true;
    g.add(body);

    /* ---- pale nose cone, seated on the shoulder */
    const nose = new THREE.Mesh(this._noseGeo(spec), M.nose);
    nose.position.y = TOP;
    nose.castShadow = true;
    g.add(nose);

    // collar hiding the barrel/nose seam
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(R * NOSE_NECK * 1.15, R * NOSE_NECK * 1.22, 0.13, 48),
      M.gold
    );
    collar.position.y = TOP - 0.02;
    g.add(collar);

    /* ---- gold band rings around the barrel */
    for (let i = 0; i < spec.bands; i++) {
      const y = -H * 0.30 + i * (H * 0.34);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.1, 64, 1, true),
        M.gold
      );
      band.position.y = y;
      band.castShadow = true;
      g.add(band);
    }

    /* ---- bold gold chevrons on the upper barrel.
       These are the ship's signature marking in the reference, so they are cut
       thick and sized off the hull radius rather than a fixed scale. */
    const cw = R * 0.62;          // half-width
    const ch = R * 0.42;          // rise
    const ct = R * 0.20;          // stroke thickness
    const chevShape = new THREE.Shape();
    chevShape.moveTo(-cw, 0);
    chevShape.lineTo(0, ch);
    chevShape.lineTo(cw, 0);
    chevShape.lineTo(cw, -ct);
    chevShape.lineTo(0, ch - ct);
    chevShape.lineTo(-cw, -ct);
    chevShape.closePath();
    const chevGeo = new THREE.ExtrudeGeometry(chevShape, {
      depth: 0.07, bevelEnabled: true, bevelThickness: 0.02,
      bevelSize: 0.02, bevelSegments: 1
    });
    this.disposables.push(chevGeo);

    for (let i = 0; i < spec.chevrons; i++) {
      const y = TOP - 0.42 - i * (ch + ct + R * 0.14);
      for (const side of [1, -1]) {
        const c = new THREE.Mesh(chevGeo, M.gold);
        c.position.set(0, y, side * (R * 0.95));
        if (side < 0) c.rotation.y = Math.PI;
        c.castShadow = true;
        g.add(c);
      }
    }

    /* ---- central grille panel low on the barrel */
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(R * 0.64, H * 0.30, 0.05), M.trim
      );
      plate.position.set(0, -H * 0.16, side * (R * 0.965));
      g.add(plate);

      for (let i = 0; i < 6; i++) {
        const rung = new THREE.Mesh(
          new THREE.BoxGeometry(R * 0.5, 0.05, 0.05), M.gold
        );
        rung.position.set(0, -H * 0.27 + i * (H * 0.045), side * (R * 0.995));
        g.add(rung);
      }
    }

    /* ---- big swept wings: BLUE panel framed in GOLD, like the reference.
       Built as three stacked layers so the gold reads as a trim edge around a
       hull-coloured face, not a flat slab. */
    const wingGeo = this._wingGeo(spec);
    this.disposables.push(wingGeo);
    for (let i = 0; i < spec.wings; i++) {
      // offset so a pair points straight left/right at the camera
      const a = (i / spec.wings) * Math.PI * 2 + Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.rotation.y = a;

      // 1. gold frame (full size, the visible trim edge)
      const frame = new THREE.Mesh(wingGeo, M.gold);
      frame.position.set(R * 0.78, -H * 0.24, -0.08);
      frame.castShadow = true;
      pivot.add(frame);

      // 2. blue face on both sides, inset so gold reads as a thin trim border
      for (const z of [0.058, -0.058]) {
        const face = new THREE.Mesh(wingGeo, M.hull);
        face.position.set(R * 0.78, -H * 0.24 + 0.03, z);
        face.scale.set(0.88, 0.9, 0.5);
        pivot.add(face);
      }

      // 3. bright gold leading-edge rib along the swept front
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, spec.wingDrop * 1.35, 0.2), M.gold
      );
      rib.position.set(R * 0.78 + spec.wingSpan * 0.5, -H * 0.28, 0);
      rib.rotation.z = 0.62;
      rib.castShadow = true;
      pivot.add(rib);

      // 4. glowing energy strip inset on each face — the futuristic accent
      for (const z of [0.12, -0.12]) {
        const glowStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, spec.wingDrop * 1.05, 0.02),
          new THREE.MeshBasicMaterial({ color: spec.flameEdge })
        );
        glowStrip.position.set(R * 0.78 + spec.wingSpan * 0.34, -H * 0.28, z);
        glowStrip.rotation.z = 0.6;
        pivot.add(glowStrip);
        this.disposables.push(glowStrip.material);
      }


      g.add(pivot);
    }

    /* ---- gold vertical accent stripes down the barrel (reference detail) */
    for (const side of [0.5, -0.5]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, H * 0.52, 0.06), M.gold
      );
      const ang = side * 0.9;
      stripe.position.set(Math.sin(ang) * R * 0.98, H * 0.04, Math.cos(ang) * R * 0.98);
      stripe.rotation.y = -ang;
      g.add(stripe);
    }

    /* ---- side boosters: pale nose cap, blue tube, gold skirt.
       Two boosters sit left/right; four add an inner pair set back in Z so the
       cluster reads as a heavy multi-engine tail. */
    if (spec.boosters) {
      const bs = spec.boosterScale;
      const layout = spec.boosters <= 2
        ? [{ side: -1, z: 0, s: 1 }, { side: 1, z: 0, s: 1 }]
        : [{ side: -1, z: 0, s: 1 }, { side: 1, z: 0, s: 1 },
           { side: -0.55, z: 0.55, s: 0.8 }, { side: 0.55, z: 0.55, s: 0.8 }];
      for (let i = 0; i < spec.boosters; i++) {
        const L = layout[i % layout.length];
        const side = L.side;
        const bg = new THREE.Group();
        bg.scale.setScalar(L.s);
        bg.position.set(side * (R + bs * 0.72), -H * 0.18, L.z * R);

        const tube = new THREE.Mesh(
          new THREE.CapsuleGeometry(bs * 0.42, H * 0.42, 8, 32), M.hull
        );
        tube.castShadow = true;
        bg.add(tube);

        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(bs * 0.43, bs * 1.2, 32), M.nose
        );
        cap.position.y = H * 0.21 + bs * 0.6;
        cap.castShadow = true;
        bg.add(cap);

        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(bs * 0.46, bs * 0.46, 0.09, 32, 1, true), M.gold
        );
        ring.position.y = H * 0.05;
        bg.add(ring);

        const skirt = new THREE.Mesh(
          new THREE.CylinderGeometry(bs * 0.52, bs * 0.4, 0.3, 32, 1, true), M.goldDeep
        );
        skirt.material.side = THREE.DoubleSide;
        skirt.position.y = -H * 0.21 - 0.12;
        bg.add(skirt);

        g.add(bg);
      }
    }

    /* ---- gold engine housing spanning the whole cluster */
    const spanX = Math.max(...spec.engines.map(e => Math.abs(e.x)));
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(
        Math.max(R * 1.02, spanX + 0.34),
        Math.max(R * 0.92, spanX + 0.28),
        0.3, 48
      ),
      M.gold
    );
    housing.position.y = -H * 0.5 - 0.1;
    housing.castShadow = true;
    g.add(housing);

    // glowing intake band just above the housing — reads as live engine energy
    const intakeMat = new THREE.MeshBasicMaterial({ color: spec.flameEdge });
    this.disposables.push(intakeMat);
    const intake = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.03, R * 1.03, 0.1, 48, 1, true), intakeMat
    );
    intake.position.y = -H * 0.5 + 0.14;
    g.add(intake);

    /* ---- engine nozzles + glowing throats */
    this.nozzles = [];
    const engineY = -H * 0.5 - 0.3;
    for (const e of spec.engines) {
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(e.r * 1.3, e.r * 0.82, 0.44, 32, 1, true),
        M.goldDeep
      );
      bell.material.side = THREE.DoubleSide;
      bell.position.set(e.x, engineY - 0.16, e.z);
      bell.castShadow = true;
      g.add(bell);

      // Deliberately NOT flameCore — a pure-white basic material here sits far
      // above the bloom threshold and smears the engine bay into a blob.
      const throat = new THREE.Mesh(
        new THREE.CircleGeometry(e.r * 1.15, 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(spec.flameEdge).multiplyScalar(0.7)
        })
      );
      throat.rotation.x = Math.PI / 2;
      throat.position.set(e.x, engineY - 0.36, e.z);
      g.add(throat);

      this.nozzles.push({ x: e.x, z: e.z, r: e.r, y: engineY - 0.36 });
    }

    /* ==== per-tier distinguishing features (make each ship its own model) ==== */
    const feat = spec.feat || [];
    this.animParts = [];   // parts the loop animates (spinning cores, blinking lights)

    // ARMOR PLATES — heavy overlapping side plates (LV3/LV5): a bulky, armoured read
    if (feat.includes('armor')) {
      for (const side of [1, -1]) {
        for (let i = 0; i < 3; i++) {
          const plate = new THREE.Mesh(
            new THREE.BoxGeometry(R * 0.5, H * 0.16, 0.12), M.goldDeep
          );
          const ang = side * 0.55;
          plate.position.set(Math.sin(ang) * R * 1.02, -H * 0.02 - i * H * 0.15, Math.cos(ang) * R * 1.02);
          plate.rotation.y = -ang;
          plate.rotation.x = 0.05;
          plate.castShadow = true;
          g.add(plate);
        }
      }
    }

    // VENTS — glowing heat-vent slits low on the flanks (LV3/LV5)
    if (feat.includes('vents')) {
      const ventMat = new THREE.MeshBasicMaterial({ color: spec.flameEdge });
      this.disposables.push(ventMat);
      for (const side of [1, -1]) {
        for (let i = 0; i < 4; i++) {
          const vent = new THREE.Mesh(new THREE.BoxGeometry(R * 0.34, 0.05, 0.04), ventMat);
          const ang = side * 0.62;
          vent.position.set(Math.sin(ang) * R * 1.0, -H * 0.28 + i * 0.11, Math.cos(ang) * R * 1.0);
          vent.rotation.y = -ang;
          g.add(vent);
        }
      }
    }

    // ENERGY CORES — spinning glowing ring cores on the shoulders (LV4/LV5)
    if (feat.includes('cores')) {
      const coreMat = new THREE.MeshBasicMaterial({
        color: spec.accent, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      this.disposables.push(coreMat);
      for (const side of [1, -1]) {
        const core = new THREE.Mesh(new THREE.TorusGeometry(R * 0.26, 0.05, 8, 24), coreMat);
        core.position.set(side * R * 0.62, H * 0.12, R * 0.55);
        core.userData.spin = side * 3.2;
        g.add(core);
        this.animParts.push(core);
        this.disposables.push(core.geometry);
      }
    }

    // SIDE STABILIZERS — canard fins high on the hull (LV5 hero read)
    if (feat.includes('stabilizers')) {
      const stabGeo = new THREE.BoxGeometry(R * 1.1, 0.1, 0.34);
      this.disposables.push(stabGeo);
      for (const side of [1, -1]) {
        const stab = new THREE.Mesh(stabGeo, M.gold);
        stab.position.set(side * R * 1.3, H * 0.2, 0);
        stab.rotation.z = side * 0.28;
        stab.castShadow = true;
        g.add(stab);
        const tipMat = new THREE.MeshBasicMaterial({ color: spec.flameEdge });
        this.disposables.push(tipMat);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), tipMat);
        tip.position.set(side * R * 1.85, H * 0.2 + side * side * 0.05, 0);
        g.add(tip);
        this.animParts.push({ mesh: tip, blink: true, mat: tipMat });
      }
    }

    // TOP ANTENNA STRUCTURES — comms mast + blinking beacon on the nose (LV5)
    if (feat.includes('antenna')) {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.05, H * 0.5, 8), M.gold
      );
      mast.position.y = H * 0.5 + spec.noseLen + 0.2;
      g.add(mast);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
      this.disposables.push(beaconMat);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), beaconMat);
      beacon.position.y = H * 0.5 + spec.noseLen + 0.46;
      g.add(beacon);
      this.animParts.push({ mesh: beacon, blink: true, mat: beaconMat });
      // two angled side antennas
      for (const side of [1, -1]) {
        const a = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, H * 0.28, 6), M.goldDeep);
        a.position.set(side * R * 0.4, H * 0.5 + spec.noseLen * 0.4, 0);
        a.rotation.z = side * 0.5;
        g.add(a);
      }
    }

    // ENERGY STRIPS — glowing accent lines down the hull (LV2/LV4)
    if (feat.includes('strips')) {
      const stripMat = new THREE.MeshBasicMaterial({ color: spec.flameEdge });
      this.disposables.push(stripMat);
      for (const side of [1, -1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, H * 0.44, 0.03), stripMat);
        const ang = side * 0.4;
        strip.position.set(Math.sin(ang) * R * 1.0, 0, Math.cos(ang) * R * 1.0);
        strip.rotation.y = -ang;
        g.add(strip);
      }
    }

    return g;
  }

  /**
   * Fit the camera to whatever was just built. Ship proportions differ per
   * tier, so hardcoded distances drift; measuring the bounds keeps every ship
   * seated in the same stage band.
   */
  _frameCamera() {
    // Frame the rocket plus the visible deck rim. The deck's deep base extends
    // below this point and sits behind the opaque reward panel (as in the
    // reference), so the rocket reads big while the panel keeps its 25%.
    const box = new THREE.Box3().setFromObject(this.rocket);
    box.expandByPoint(new THREE.Vector3(0, this.pedestal.position.y + 0.2, 0));

    const worldH = Math.max(box.max.y - box.min.y, 0.001);
    const worldW = Math.max(box.max.x - box.min.x, 0.001);
    const centre = (box.max.y + box.min.y) / 2;

    const cw = this.container.clientWidth || 390;
    const ch = this.container.clientHeight || 844;

    // DOM-AWARE BAND: read where the banner ends and the reward panel begins,
    // in canvas pixels. The ship must live between them on ANY phone — banner
    // and panel have fixed pixel heights, so their FRACTION grows on short
    // (browser-chrome-heavy) viewports; a fixed fraction would push the nose
    // into the banner. Measuring the real gap keeps it clear everywhere.
    let topPx = ch * 0.12, botPx = ch * 0.74;
    try {
      const cvs = this.renderer.domElement.getBoundingClientRect();
      const banner = document.querySelector('.lucky-bag-banner');
      const reward = document.querySelector('.rewards-section');
      if (banner) topPx = banner.getBoundingClientRect().bottom - cvs.top;
      if (reward) botPx = reward.getBoundingClientRect().top - cvs.top;
    } catch (_) {}
    // breathing margins so the nose/base never kiss the chrome
    topPx += ch * 0.035;
    botPx -= ch * 0.015;
    const bandH = Math.max(botPx - topPx, 10);
    const centreFrac = ((topPx + botPx) / 2) / ch;

    // Fit the assembly to the band by HEIGHT…
    let fillFrac = bandH / ch;
    let viewH = worldH / fillFrac;
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const aspect = cw / ch;

    // …but cap by WIDTH so the wings never reach the level badges on the left.
    // Keep the ship within the central corridor (badges sit in the outer ~18%).
    const maxWidthFrac = 0.64;
    const viewW = viewH * aspect;                 // world units across the view
    const wFrac = worldW / viewW;
    if (wFrac > maxWidthFrac) viewH *= wFrac / maxWidthFrac;  // pull back

    this.camZ = viewH / (2 * Math.tan(halfFov));
    this.aimY = centre - (0.5 - centreFrac) * viewH;

    // Lift the camera and aim down so the deck + vortex read as an ellipse
    // (the reference's 3/4 hero angle), not edge-on.
    this.camY = this.aimY + this.camZ * Math.tan(CAM_PITCH);

    this.camera.position.set(0, this.camY, this.camZ);
    this.camera.lookAt(0, this.aimY, 0);
  }


  /* ------------------------------------------------------------- flames */

  _buildFlames(spec) {
    const grp = new THREE.Group();
    this.flameUniforms = [];
    this.flames = [];

    // Plumes blend additively, so three engines would otherwise be three times
    // as hot as one and pool into a white blob at the base.
    const gain = 1 / (0.55 + 0.45 * this.nozzles.length);

    for (const n of this.nozzles) {
      const u = {
        uTime: { value: 0 },
        uThrottle: { value: this.throttle },
        uGain: { value: gain },
        uCore: { value: new THREE.Color(spec.flameCore) },
        uEdge: { value: new THREE.Color(spec.flameEdge) }
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });

      // ConeGeometry puts the apex at +Y and the wide base at -Y. Flip it so the
      // BASE sits at the nozzle mouth (y = 0) and the apex tapers away downward,
      // otherwise the plume fires up through the hull.
      const len = n.r * 5.6;
      const geo = new THREE.ConeGeometry(n.r * 0.85, len, 28, 1, true);
      geo.rotateX(Math.PI);
      geo.translate(0, -len / 2, 0);   // base at y=0, apex at y=-len

      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(n.x, n.y, n.z);
      cone.renderOrder = 5;

      grp.add(cone);
      this.flames.push(cone);
      this.flameUniforms.push(u);
      this.disposables.push(geo, mat);
    }
    return grp;
  }

  /* ------------------------------------------------- exhaust spark system */

  _buildSparks(spec) {
    const COUNT = 420;
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);
    this.sparkVel = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      this._respawnSpark(pos, i, true);
      size[i] = Math.random() * 2.4 + 0.7;
      seed[i] = Math.random();
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.sparkUniforms = {
      uTime: { value: 0 },
      uWarp: { value: 0 },
      uAlpha: { value: 0.15 },        // faint at idle, driven up on launch
      uWhite: { value: 0.15 },        // stay in the flame colour, not white
      uColor: { value: new THREE.Color(spec.flameEdge) }
    };

    const m = new THREE.ShaderMaterial({
      uniforms: this.sparkUniforms,
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.disposables.push(g, m);
    return new THREE.Points(g, m);
  }

  _respawnSpark(pos, i, initial) {
    const n = this.nozzles[(Math.random() * this.nozzles.length) | 0];
    pos[i * 3] = n.x + (Math.random() - 0.5) * n.r * 1.4;
    pos[i * 3 + 1] = n.y - (initial ? Math.random() * 3 : 0);
    pos[i * 3 + 2] = n.z + (Math.random() - 0.5) * n.r * 1.4;
    this.sparkVel[i * 3] = (Math.random() - 0.5) * 0.6;
    this.sparkVel[i * 3 + 1] = -(2.2 + Math.random() * 3.4);
    this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }

  /* --------------------------------------------------------- public API */

  setLevel(level, instant = false) {
    const spec = SHIPS[level] || SHIPS[4];
    this.level = level;
    this.spec = spec;

    // tear down the previous ship
    if (this.shipRoot) {
      this.scene.remove(this.shipRoot);
      this.shipRoot.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        }
      });
    }

    this.shipRoot = new THREE.Group();
    const rocket = this.buildRocket(level);
    this.rocket = rocket;
    this.shipRoot.add(rocket);
    this.shipRoot.add(this._buildFlames(spec));

    if (this.sparks) this.scene.remove(this.sparks);
    this.sparks = this._buildSparks(spec);
    this.shipRoot.add(this.sparks);

    this.shipRoot.position.set(0, SHIP_LIFT, 0);   // framed at hover height
    this.scene.add(this.shipRoot);

    // Re-fit the camera: each tier has its own proportions.
    this._frameCamera();

    // recolour the level-driven lighting + pedestal.
    // rim2 stays a neutral cool white — keeping BOTH rims level-tinted was what
    // wrapped the hull in a heavy coloured halo. One tinted rim is enough.
    const c = new THREE.Color(spec.accent);
    this.rim.color.copy(c);
    this.engineLight.color.copy(new THREE.Color(spec.flameEdge));
    this.flight = FLIGHT[level] || FLIGHT[4];
    this.ringA.material.color.copy(c);
    this.padTrim.color.copy(c);
    this.ringB.material.color.copy(c);
    this.shockMat.color.copy(c);
    this.starUniforms.uColor.value.copy(c);

    if (!instant) {
      // AAA warp-drop entry from above with a landing impact
      this.shipRoot.scale.setScalar(0.9);
      this._entryT = 0;
      this._entryLanded = false;
    } else {
      this.shipRoot.scale.setScalar(1);
      this._entryT = 1;
      this._entryLanded = true;
    }
  }

  setThrottle(v) { this.targetThrottle = v; }

  /**
   * Full launch choreography. Resolves when the ship has cleared frame,
   * so the caller can roll the prize at exactly the right beat.
   */
  launch() {
    if (this.isLaunching) return Promise.resolve();
    this.isLaunching = true;
    this._launchT = 0;
    this._fired = false;          // liftoff burst fires once
    this.targetWarp = 0;          // warp holds until release, then snaps on

    // The flight runs in three beats: CHARGE (pad spins up, ship crouches),
    // IGNITION (violent hold-down rattle), LIFT (explosive climb). Durations
    // scale with tier weight so the heavy lifter feels heavy.
    const dur = { 1: 2.0, 2: 2.2, 3: 2.8, 4: 2.4, 5: 2.6 }[this.level] || 2.3;
    this._launchDur = dur;
    this._chargeEnd = 0.24;       // fraction: end of charge
    this._igniteEnd = 0.44;       // fraction: release point

    return new Promise(resolve => { this._launchResolve = resolve; });
  }

  _fireLiftoff() {
    this._fired = true;
    this.shake = (this.flight || FLIGHT[4]).shake;   // per-tier camera punch
    this.shock.visible = true;
    this._shockT = 0;

    // ground smoke burst: a ring of billboarded puffs that bloom outward once
    if (!this.smoke) {
      const COUNT = 60;
      const pos = new Float32Array(COUNT * 3);
      const siz = new Float32Array(COUNT);
      const seed = new Float32Array(COUNT);
      this.smokeVel = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 5;
        pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
        this.smokeVel[i * 3] = Math.cos(a) * sp;
        this.smokeVel[i * 3 + 1] = 0.5 + Math.random() * 1.5;
        this.smokeVel[i * 3 + 2] = Math.sin(a) * sp * 0.5;
        siz[i] = 4 + Math.random() * 5;
        seed[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.smokeUniforms = {
        uTime: { value: 0 }, uWarp: { value: 0 },
        uAlpha: { value: 1 }, uWhite: { value: 0.7 },
        uColor: { value: new THREE.Color(0xbfe6ff) }
      };
      const m = new THREE.ShaderMaterial({
        uniforms: this.smokeUniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
        transparent: true, depthWrite: false, blending: THREE.NormalBlending
      });
      this.smoke = new THREE.Points(g, m);
      this.smoke.position.y = this.pedestal.position.y + 0.3;
      this.scene.add(this.smoke);
      this.disposables.push(g, m);
    }
    this._smokeBase = this.smoke.geometry.attributes.position.array.slice();
    this._smokeT = 0;
    this.smoke.visible = true;
  }

  reset() {
    this.isLaunching = false;
    this._launchT = 0;
    this._fired = false;
    this.padSurge = 0;
    this.targetThrottle = 0.32;
    this.targetWarp = 0;
    this.shake = 0;
    if (this.smoke) this.smoke.visible = false;
    if (this.shipRoot) {
      this.shipRoot.position.set(0, SHIP_LIFT, 0);
      this.shipRoot.scale.setScalar(1);
      this.shipRoot.visible = true;
    }
    // replay the entry drop after a launch, so the ship arrives fresh
    this._entryT = 0;
    this._entryLanded = false;
  }

  /* ------------------------------------------------------------- loop */

  _animate() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // eased throttle + warp
    this.throttle += (this.targetThrottle - this.throttle) * Math.min(dt * 5.5, 1);
    this.warp += (this.targetWarp - this.warp) * Math.min(dt * 2.6, 1);

    // ---- AAA entry: ship warp-drops from above onto the deck, then a landing
    // flash + shockwave + shake fire as it seats. Runs on load and level swap.
    if (this._entryT < 1) {
      this._entryT = Math.min(this._entryT + dt * 1.7, 1);
      const p = this._entryT;
      const ease = 1 - Math.pow(1 - p, 3.2);        // fast-in, hard settle
      const drop = 18 * (1 - ease);                 // falls from +18
      const overshoot = Math.sin(p * Math.PI) * 0.25 * (1 - p); // squash at base
      this.shipRoot.position.y = SHIP_LIFT + drop - overshoot;
      this.shipRoot.scale.setScalar(0.9 + 0.1 * ease);
      this.shipRoot.rotation.set(0, 0, 0);
      this.warp = Math.max(0, 1 - p * 2);            // streak the stars on arrival
      if (!this._entryLanded && p > 0.82) {          // impact beat
        this._entryLanded = true;
        this.shake = 0.8;
        this.shock.visible = true;
        this._shockT = 0;
        this.padSurge = 1;
      }
    } else if (this.shipRoot && !this.isLaunching) {
      // idle hover — lifted clear so the vortex glows in the gap below the engines
      this.shipRoot.position.y = SHIP_LIFT + Math.sin(t * 1.15) * 0.1;
      this.shipRoot.rotation.set(0, 0, 0);
      this.padSurge = Math.max(0, (this.padSurge || 0) - dt * 1.5);
    }

    // ---- launch flight: CHARGE -> IGNITION -> LIFT
    if (this.isLaunching) {
      this._launchT += dt;
      const p = Math.min(this._launchT / this._launchDur, 1);

      const F = this.flight || FLIGHT[4];
      if (p < this._chargeEnd) {
        // CHARGE: engines spool up smoothly, pad surges, ship dips to crouch.
        // Deeper crouch for the heavy lifter, barely any for the agile scout.
        const v = p / this._chargeEnd;
        const ev = v * v * (3 - 2 * v);                       // smoothstep
        this.targetThrottle = 0.4 + ev * 0.45;
        const crouch = F.style === 'heavy' ? 0.28 : F.style === 'zip' ? 0.08 : 0.18;
        this.shipRoot.position.y = SHIP_LIFT - crouch * ev;
        this.shipRoot.position.x = 0;
        this.shipRoot.rotation.set(0, 0, 0);
        this.padSurge = ev;
      } else if (p < this._igniteEnd) {
        // IGNITION: full throttle, hold-down rattle scaled per tier (heavy shakes
        // hard, scout barely holds down before it bolts).
        const v = (p - this._chargeEnd) / (this._igniteEnd - this._chargeEnd);
        this.targetThrottle = 1.0;
        const rumble = (0.05 * (1 - v) + 0.03) * F.vibrate;
        this.shipRoot.position.y = SHIP_LIFT - 0.18 + v * 0.24 + Math.sin(t * 60) * rumble;
        this.shipRoot.position.x = Math.sin(t * 47) * rumble * 0.5;
        this.padSurge = 1;
        if (!this._fired && v > 0.86) this._fireLiftoff();
      } else {
        // LIFT: per-tier climb. climbPow shapes the acceleration (heavy is slow
        // and ponderous, scout is explosive), rollTurns sets the barrel rolls,
        // sway adds a side weave for the agile ships.
        if (!this._fired) this._fireLiftoff();
        this.targetWarp = 1.0;
        const c = (p - this._igniteEnd) / (1 - this._igniteEnd);
        const acc = Math.pow(c, F.climbPow);
        this.shipRoot.position.y = SHIP_LIFT + 0.06 + acc * 36;
        // agile ships weave side to side on the way up
        this.shipRoot.position.x = Math.sin(c * Math.PI * 2.2) * F.sway * (1 - c);
        this.shipRoot.rotation.y = (c * c) * Math.PI * 2 * F.rollTurns;
        this.shipRoot.rotation.z = this.shipRoot.position.x * -0.12;  // bank into the weave
        this.shipRoot.scale.setScalar(1 - c * 0.35);
      }

      if (p >= 1 && this._launchResolve) {
        const r = this._launchResolve;
        this._launchResolve = null;
        this.shipRoot.visible = false;
        r();
      }
    }

    // ---- liftoff smoke burst expands then fades
    if (this.smoke && this.smoke.visible) {
      this._smokeT += dt;
      const sp = this._smokeT;
      const arr = this.smoke.geometry.attributes.position.array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3]     = this._smokeBase[i * 3]     + this.smokeVel[i * 3]     * sp;
        arr[i * 3 + 1] = this._smokeBase[i * 3 + 1] + this.smokeVel[i * 3 + 1] * sp;
        arr[i * 3 + 2] = this._smokeBase[i * 3 + 2] + this.smokeVel[i * 3 + 2] * sp;
      }
      this.smoke.geometry.attributes.position.needsUpdate = true;
      this.smoke.material.opacity = Math.max(0, 1 - sp / 1.4);
      if (sp > 1.4) this.smoke.visible = false;
    }

    // ---- camera: dolly-punch on ignition + decaying shake
    // A quick push-in during the hold-down, snapping back as the ship leaves —
    // this is what sells the launch as an event rather than a slide-up.
    let dollyZ = this.camZ;
    if (this.isLaunching) {
      const p = Math.min(this._launchT / this._launchDur, 1);
      if (p < this._igniteEnd) dollyZ = this.camZ - (p / this._igniteEnd) * 2.4;
      else dollyZ = this.camZ - 2.4 + ((p - this._igniteEnd) / (1 - this._igniteEnd)) * 5;
    }
    this.camera.position.z += (dollyZ - this.camera.position.z) * Math.min(dt * 6, 1);

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 0.55);
      const s = this.shake * this.shake * 0.45;
      this.camera.position.x = (Math.random() - 0.5) * s;
      this.camera.position.y = this.camY + (Math.random() - 0.5) * s;
    } else {
      this.camera.position.x += (0 - this.camera.position.x) * dt * 4;
      this.camera.position.y += (this.camY - this.camera.position.y) * dt * 4;
    }
    this.camera.lookAt(0, this.aimY, 0);

    // ---- flames
    if (this.flameUniforms) {
      for (const u of this.flameUniforms) {
        u.uTime.value = t;
        u.uThrottle.value = this.throttle;
      }
    }

    // ---- flame plumes lengthen with throttle, scaled per tier (LV1 small,
    //      LV5 huge volumetric). Width breathes so the plume feels alive.
    if (this.flames) {
      const fs = (this.spec && this.spec.flameScale) || 1;
      const s = (0.92 + this.throttle * 1.2) * fs;
      const wob = 1 + Math.sin(t * 22) * 0.05;
      for (const f of this.flames) f.scale.set(wob, s, wob);
    }

    // ---- animated ship parts: spinning energy cores, blinking beacons
    if (this.animParts) {
      for (const a of this.animParts) {
        if (a.spin !== undefined) { a.rotation.z += dt * a.spin; }
        else if (a.userData && a.userData.spin) { a.rotation.z += dt * a.userData.spin; }
        else if (a.blink) {
          const on = (Math.sin(t * 5) > 0) ? 1 : 0.2;
          a.mat.opacity = on; a.mat.transparent = true;
          a.mesh.scale.setScalar(0.7 + on * 0.5);
        }
      }
    }

    // ---- engine light pulses with throttle
    this.engineLight.intensity = 1.6 + this.throttle * 12 + Math.sin(t * 26) * 0.7;
    if (this.shipRoot) this.engineLight.position.y = this.shipRoot.position.y - 2.6;

    // ---- deep-space props drift, very slowly
    if (this.galaxy) this.galaxy.rotation.z += dt * 0.012;
    if (this.galaxyR) this.galaxyR.rotation.z += dt * 0.02;
    if (this.planetA) this.planetA.rotation.y += dt * 0.018;
    if (this.planetB) this.planetB.rotation.y += dt * 0.03;
    if (this.moon) this.moon.rotation.y += dt * 0.05;
    if (this.asteroids) {
      for (const a of this.asteroids) {
        a.rotation.y += dt * a.userData.spin;
        a.rotation.x += dt * a.userData.spin * 0.6;
      }
    }

    // ---- pedestal
    this.ringA.rotation.z += dt * 0.55;
    this.ringB.rotation.z -= dt * 0.9;
    // vortex swirls faster and flares brighter as the launch charges
    const surge = this.padSurge || 0;
    if (this.vortexMat) {
      this.vortexMat.uniforms.uTime.value = t * (1 + surge * 2.5) + this.throttle;
      const pulse = 1 + surge * 0.35 + Math.sin(t * 3) * 0.04;
      this.vortex.scale.setScalar(pulse);
    }
    this.ringA.rotation.z += dt * surge * 3;     // rings spin up with the charge
    this.ringB.rotation.z -= dt * surge * 4;
    this.pedestal.visible = !(this.isLaunching && this._launchT > this._launchDur * 0.75);

    // ---- shockwave
    if (this.shock.visible) {
      this._shockT += dt;
      const sp = Math.min(this._shockT / 0.85, 1);
      this.shock.scale.setScalar(0.5 + sp * 3.4);
      this.shockMat.opacity = (1 - sp) * 0.85;
      if (sp >= 1) this.shock.visible = false;
    }

    // ---- sparks
    if (this.sparks) {
      const p = this.sparks.geometry.attributes.position.array;
      const mult = 0.4 + this.throttle * 2.4;
      for (let i = 0; i < p.length / 3; i++) {
        p[i * 3] += this.sparkVel[i * 3] * dt * mult;
        p[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt * mult;
        p[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt * mult;
        if (p[i * 3 + 1] < -4.5) this._respawnSpark(p, i, false);
      }
      this.sparks.geometry.attributes.position.needsUpdate = true;
      this.sparkUniforms.uTime.value = t;
      this.sparkUniforms.uWarp.value = this.warp * 0.6;
      // faint at idle, blazing on launch — this is what kept the vortex hidden
      this.sparkUniforms.uAlpha.value = 0.08 + this.throttle * 0.9;
    }

    // ---- stars streak toward camera during warp
    if (this.stars) {
      this.starUniforms.uTime.value = t;
      this.starUniforms.uWarp.value = this.warp;
      const sp = this.stars.geometry.attributes.position.array;
      const speed = (2.5 + this.warp * 150) * dt;
      for (let i = 0; i < sp.length / 3; i++) {
        sp[i * 3 + 2] += speed;
        if (sp[i * 3 + 2] > 8) {
          sp[i * 3] = (Math.random() - 0.5) * 90;
          sp[i * 3 + 1] = (Math.random() - 0.5) * 90;
          sp[i * 3 + 2] = -130;
        }
      }
      this.stars.geometry.attributes.position.needsUpdate = true;
    }

    // ---- bloom swells with throttle so launches feel hot
    this.bloom.strength = 0.22 + this.throttle * 0.3 + this.warp * 0.3;

    this.composer.render();
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    this.disposables.forEach(d => d.dispose && d.dispose());
    this.envRT && this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/* ------------------------------------------------------------------ boot */

function boot() {
  const host = document.getElementById('stage-3d');
  if (!host) {
    console.error('[engine3d] mount point #stage-3d not found');
    return;
  }
  try {
    window.GachaEngine = new GachaEngine(host);
    window.dispatchEvent(new CustomEvent('gacha-engine-ready'));
    console.info('[engine3d] real 3D engine online — three r180, PBR + IBL + bloom');
  } catch (err) {
    console.error('[engine3d] init failed', err);
    document.documentElement.classList.add('no-webgl');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
