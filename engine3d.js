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
const FRAME_FILL = 0.44;
const FRAME_CENTRE = 0.40;

// Where the barrel hands off to the nose cone, as a fraction of hull radius.
// Kept high: the reference nose is a broad stubby cap, not a narrow spire.
const NOSE_NECK = 0.72;

// The launch deck burns amber in the reference regardless of ship tier.
const PAD_GOLD = 0xffb03a;

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
    wingSpan: 0.86,
    wingDrop: 1.0,
    boosters: 0,
    engines: [{ x: 0, z: 0, r: 0.34 }],
    chevrons: 2,
    bands: 2
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
    wingSpan: 0.95,
    wingDrop: 1.1,
    boosters: 2,
    boosterScale: 0.54,
    engines: [
      { x: -0.30, z: 0, r: 0.26 },
      { x: 0.30, z: 0, r: 0.26 }
    ],
    chevrons: 3,
    bands: 2
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
    wingSpan: 1.18,
    wingDrop: 1.18,
    boosters: 2,
    boosterScale: 0.66,
    engines: [
      { x: 0, z: 0, r: 0.42 },
      { x: -0.55, z: 0, r: 0.28 },
      { x: 0.55, z: 0, r: 0.28 }
    ],
    chevrons: 3,
    bands: 3
  },
  4: {
    name: 'FLAGSHIP',
    accent: 0x00d5ff,
    flameCore: 0xffffff,
    flameEdge: 0x00b0ff,
    hull: 0x1a6ad8,          // the reference's bright royal blue
    nose: 0x8fdcf5,          // pale cyan nose cap
    body: 3.7,
    radius: 0.66,
    noseLen: 1.2,
    wings: 4,
    wingSpan: 1.06,
    wingDrop: 1.25,
    boosters: 2,
    boosterScale: 0.58,
    engines: [
      { x: 0, z: 0, r: 0.38 },
      { x: -0.60, z: 0, r: 0.25 },
      { x: 0.60, z: 0, r: 0.25 }
    ],
    chevrons: 4,
    bands: 2
  }
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
    a *= (0.22 + uThrottle * 0.55) * uGain;
    if (a < 0.01) discard;

    // white-hot at the throat, level colour further out
    float heat = smoothstep(0.5, 0.0, y) * 0.85 + uThrottle * 0.15;
    vec3 col = mix(uEdge, uCore, clamp(heat, 0.0, 1.0));
    // a restrained hot core: enough to catch bloom, not enough to blow the hull out
    col += uCore * pow(1.0 - y, 6.0) * (0.25 + uThrottle * 0.45);

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
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // stretch the sprite vertically as warp ramps up -> real motion streaks
    c.y /= (1.0 + uWarp * 5.0);
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.01) discard;
    vec3 col = mix(vec3(1.0), uColor, 0.35 + vSeed * 0.3);
    gl_FragColor = vec4(col, a);
  }
`;

/* =============================================================== ENGINE == */

class GachaEngine {
  constructor(container) {
    this.container = container;
    this.level = 4;
    this.throttle = 0.28;      // idle burn
    this.targetThrottle = 0.28;
    this.warp = 0;
    this.targetWarp = 0;
    this.isLaunching = false;
    this.shake = 0;
    this.clock = new THREE.Clock();
    this.disposables = [];

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initStars();
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
    this.renderer.toneMappingExposure = 1.0;
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
    new THREE.TextureLoader().load('assets/bg_space_balloons.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = tex;
      this.scene.backgroundIntensity = 0.62;   // sit it behind the ship
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
    this.key = new THREE.DirectionalLight(0xfff0dd, 2.6);
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
    this.rim = new THREE.DirectionalLight(0x00d5ff, 3.4);
    this.rim.position.set(5.5, 2.2, -5);
    this.scene.add(this.rim);

    // Fill — cool bounce from below
    this.fill = new THREE.DirectionalLight(0x88b8ff, 0.7);
    this.fill.position.set(2, -4, 4);
    this.scene.add(this.fill);

    this.scene.add(new THREE.AmbientLight(0x4a5a78, 0.5));

    // Engine light — lives at the nozzles, drives the pedestal hot-spot
    this.engineLight = new THREE.PointLight(0x00d5ff, 14, 16, 2);
    this.engineLight.position.set(0, -2.6, 0.4);
    this.scene.add(this.engineLight);
  }

  /* ------------------------------------------------------- 3D star field */

  _initStars() {
    const COUNT = 520;
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

  /* ------------------------------------------------------- stone pedestal */

  _initPedestal() {
    const grp = new THREE.Group();
    // Dropped below the nozzles so the exhaust plume is visible in the gap —
    // with the pad any higher it just depth-occludes the flames, any lower and
    // it falls out of the stage band behind the countdown row.
    grp.position.y = -4.25;
    grp.scale.setScalar(0.72);

    const stone = new THREE.MeshStandardMaterial({
      color: 0x39424f,
      metalness: 0.15,
      roughness: 0.85
    });
    const stoneDark = new THREE.MeshStandardMaterial({
      color: 0x222a35,
      metalness: 0.2,
      roughness: 0.75
    });

    // stepped plinth
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.2, 0.34, 48), stone);
    top.position.y = 0;
    top.receiveShadow = true;
    top.castShadow = true;
    grp.add(top);

    const mid = new THREE.Mesh(new THREE.CylinderGeometry(2.32, 2.5, 0.3, 48), stoneDark);
    mid.position.y = -0.32;
    mid.receiveShadow = true;
    grp.add(mid);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.75, 0.26, 48), stone);
    base.position.y = -0.62;
    base.receiveShadow = true;
    grp.add(base);

    // radial notches around the rim — reads as carved stone under raking light
    const notchGeo = new THREE.BoxGeometry(0.16, 0.36, 0.3);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const n = new THREE.Mesh(notchGeo, stoneDark);
      n.position.set(Math.cos(a) * 2.18, -0.02, Math.sin(a) * 2.18);
      n.rotation.y = -a;
      n.castShadow = true;
      grp.add(n);
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
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.85, 48), this.padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.18;
    grp.add(pad);

    // counter-rotating tech rings
    this.ringA = new THREE.Mesh(
      new THREE.TorusGeometry(2.05, 0.035, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x00d5ff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ringA.rotation.x = -Math.PI / 2;
    this.ringA.position.y = 0.22;
    grp.add(this.ringA);

    this.ringB = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.022, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0x00d5ff, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ringB.rotation.x = -Math.PI / 2;
    this.ringB.position.y = 0.30;
    grp.add(this.ringB);

    this.pedestal = grp;
    this.scene.add(grp);

    // shockwave ring, fired on launch
    this.shockMat = new THREE.MeshBasicMaterial({
      color: 0x00d5ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    this.shock = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 64), this.shockMat);
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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.42, 0.72);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
  }

  /* ============================================== procedural ship builder */

  _mats(spec) {
    const hull = new THREE.MeshPhysicalMaterial({
      color: spec.hull,
      metalness: 0.62,       // less mirror, more painted-metal so the colour holds
      roughness: 0.3,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      envMapIntensity: 0.85  // reined in — IBL was bleaching the blue to grey
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
    // Narrow at the tip and strongly raked, so it reads as a swept fin rather
    // than the flat slab a straight quad gives you.
    s.moveTo(0, 0.62);
    s.lineTo(span * 0.5, -drop * 0.14);
    s.lineTo(span, -drop * 0.78);
    s.lineTo(span * 0.82, -drop);
    s.lineTo(0, -drop * 0.66);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.16, bevelEnabled: true, bevelThickness: 0.04,
      bevelSize: 0.04, bevelSegments: 2
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

    /* ---- big swept wings (widest feature, drives the silhouette) */
    const wingGeo = this._wingGeo(spec);
    this.disposables.push(wingGeo);
    for (let i = 0; i < spec.wings; i++) {
      // offset so a pair points straight left/right at the camera
      const a = (i / spec.wings) * Math.PI * 2 + Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.rotation.y = a;

      const wing = new THREE.Mesh(wingGeo, M.gold);
      wing.position.set(R * 0.80, -H * 0.26, -0.065);
      wing.castShadow = true;
      pivot.add(wing);

      // blue inset panel near the root
      const inset = new THREE.Mesh(wingGeo, M.hull);
      inset.position.set(R * 0.80, -H * 0.26 + 0.14, -0.065);
      inset.scale.set(0.56, 0.6, 1.18);
      pivot.add(inset);

      g.add(pivot);
    }

    /* ---- side boosters: pale nose cap, blue tube, gold skirt */
    if (spec.boosters) {
      const bs = spec.boosterScale;
      for (let i = 0; i < spec.boosters; i++) {
        const side = i === 0 ? -1 : 1;
        const bg = new THREE.Group();
        bg.position.set(side * (R + bs * 0.72), -H * 0.18, 0);

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

    return g;
  }

  /**
   * Fit the camera to whatever was just built. Ship proportions differ per
   * tier, so hardcoded distances drift; measuring the bounds keeps every ship
   * seated in the same stage band.
   */
  _frameCamera() {
    // Measure the hull only. Flames and the spark cloud have loose, animated
    // bounds, so including them makes the framing jitter between rebuilds.
    const box = new THREE.Box3().setFromObject(this.rocket);
    box.expandByPoint(new THREE.Vector3(0, this.pedestal.position.y - 0.6, 0));

    const height = Math.max(box.max.y - box.min.y, 0.001);
    const centre = (box.max.y + box.min.y) / 2;

    const viewH = height / FRAME_FILL;
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;

    this.camZ = viewH / (2 * Math.tan(halfFov));
    // put the box centre at FRAME_CENTRE down the screen instead of dead middle
    this.camY = centre - (0.5 - FRAME_CENTRE) * viewH;

    this.camera.position.set(0, this.camY, this.camZ);
    this.camera.lookAt(0, this.camY, 0);
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
      const len = n.r * 5;
      const geo = new THREE.ConeGeometry(n.r * 1.05, len, 28, 1, true);
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

    this.shipRoot.position.set(0, 0, 0);
    this.scene.add(this.shipRoot);

    // Re-fit the camera: each tier has its own proportions.
    this._frameCamera();

    // recolour the level-driven lighting + pedestal
    const c = new THREE.Color(spec.accent);
    this.rim.color.copy(c);
    this.engineLight.color.copy(new THREE.Color(spec.flameEdge));
    this.ringA.material.color.copy(c);
    this.ringB.material.color.copy(c);
    this.shockMat.color.copy(c);
    this.starUniforms.uColor.value.copy(c);

    if (!instant) {
      // snappy materialise-in (scale only — the ship never rotates)
      this.shipRoot.scale.setScalar(0.78);
      this._spawnT = 0;
    } else {
      this.shipRoot.scale.setScalar(1);
      this._spawnT = 1;
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
    this.targetThrottle = 1.0;
    this.targetWarp = 1.0;
    this.shake = 1.0;

    this.shock.visible = true;
    this._shockT = 0;

    const profile = { 1: 1.5, 2: 1.75, 3: 2.35, 4: 1.9 }[this.level] || 1.9;
    this._launchDur = profile;

    return new Promise(resolve => { this._launchResolve = resolve; });
  }

  reset() {
    this.isLaunching = false;
    this._launchT = 0;
    this.targetThrottle = 0.28;
    this.targetWarp = 0;
    this.shake = 0;
    if (this.shipRoot) {
      this.shipRoot.position.set(0, 0, 0);
      this.shipRoot.scale.setScalar(1);
      this.shipRoot.visible = true;
    }
    this._spawnT = 0;
  }

  /* ------------------------------------------------------------- loop */

  _animate() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // eased throttle + warp
    this.throttle += (this.targetThrottle - this.throttle) * Math.min(dt * 5.5, 1);
    this.warp += (this.targetWarp - this.warp) * Math.min(dt * 2.6, 1);

    // ---- ship idle motion: a slow hover only. No spin, no lean — the
    // reference client presents the ship dead-on and perfectly still.
    if (this.shipRoot && !this.isLaunching) {
      this.shipRoot.position.y = Math.sin(t * 1.15) * 0.09;
      this.shipRoot.rotation.set(0, 0, 0);
    }

    // ---- level-switch materialise
    if (this._spawnT < 1) {
      this._spawnT = Math.min(this._spawnT + dt * 3.4, 1);
      const e = 1 - Math.pow(1 - this._spawnT, 3);
      this.shipRoot.scale.setScalar(0.78 + 0.22 * e);
    }

    // ---- launch flight
    if (this.isLaunching) {
      this._launchT += dt;
      const p = Math.min(this._launchT / this._launchDur, 1);

      if (p < 0.32) {
        // hold-down: violent engine vibration before release
        const v = p / 0.32;
        this.shipRoot.position.y = v * 0.22 + (Math.random() - 0.5) * 0.09 * v;
        this.shipRoot.position.x = (Math.random() - 0.5) * 0.07 * v;
        this.shipRoot.rotation.y += dt * 0.5;
      } else {
        // release: accelerating climb with a slight barrel roll
        const c = (p - 0.32) / 0.68;
        const acc = Math.pow(c, 2.6);
        this.shipRoot.position.y = 0.22 + acc * 26;
        this.shipRoot.position.x = 0;
        this.shipRoot.rotation.y += dt * (0.5 + c * 7);
        this.shipRoot.scale.setScalar(1 - c * 0.35);
      }

      if (p >= 1 && this._launchResolve) {
        const r = this._launchResolve;
        this._launchResolve = null;
        this.shipRoot.visible = false;
        r();
      }
    }

    // ---- camera shake, decaying
    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 0.55);
      const s = this.shake * this.shake * 0.35;
      this.camera.position.x = (Math.random() - 0.5) * s;
      this.camera.position.y = this.camY + (Math.random() - 0.5) * s;
    } else {
      this.camera.position.x += (0 - this.camera.position.x) * dt * 4;
      this.camera.position.y += (this.camY - this.camera.position.y) * dt * 4;
    }
    this.camera.lookAt(0, this.camera.position.y, 0);

    // ---- flames
    if (this.flameUniforms) {
      for (const u of this.flameUniforms) {
        u.uTime.value = t;
        u.uThrottle.value = this.throttle;
      }
    }

    // ---- flame plumes lengthen with throttle
    if (this.flames) {
      const s = 0.55 + this.throttle * 1.1;
      for (const f of this.flames) f.scale.set(1, s, 1);
    }

    // ---- engine light pulses with throttle
    this.engineLight.intensity = 2.2 + this.throttle * 14 + Math.sin(t * 26) * 0.7;
    if (this.shipRoot) this.engineLight.position.y = this.shipRoot.position.y - 2.6;

    // ---- pedestal
    this.ringA.rotation.z += dt * 0.55;
    this.ringB.rotation.z -= dt * 0.9;
    this.padMat.opacity = 0.16 + this.throttle * 0.22 + Math.sin(t * 4) * 0.03;
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
    this.bloom.strength = 0.38 + this.throttle * 0.42 + this.warp * 0.35;

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
