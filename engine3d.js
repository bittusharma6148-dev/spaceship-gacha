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
// stage band — above the countdown row, below the event banner. A LEVEL camera
// dropped below the ship puts the assembly in the upper 40% with no keystoning,
// and gives the slightly-from-below hero angle rockets want.
// Framed so the full assembly (nose +2.8 .. pedestal base -4.7, centre -0.95)
// lands inside the stage band rather than spilling behind the countdown row.
const CAM_Y = -2.95;
const CAM_Z = 26.5;

const GOLD = 0xf0a828;
const GOLD_DEEP = 0xb87415;
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
    hull: 0x1f8f5c,
    height: 4.6,
    radius: 0.52,
    noseSharp: 1.55,        // higher = pointier nose
    finCount: 3,
    finSpan: 0.85,
    finSweep: 0.55,
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
    hull: 0x5b1f8f,
    height: 5.0,
    radius: 0.6,
    noseSharp: 1.35,
    finCount: 4,
    finSpan: 0.95,
    finSweep: 0.5,
    boosters: 2,
    boosterScale: 0.52,
    engines: [
      { x: -0.30, z: 0, r: 0.26 },
      { x: 0.30, z: 0, r: 0.26 }
    ],
    chevrons: 3,
    bands: 3
  },
  3: {
    name: 'HEAVY LIFTER',
    accent: 0xff1744,
    flameCore: 0xffe2d2,
    flameEdge: 0xff4500,
    hull: 0x8f1f2c,
    height: 5.4,
    radius: 0.78,
    noseSharp: 1.05,
    finCount: 3,
    finSpan: 1.25,
    finSweep: 0.72,
    boosters: 2,
    boosterScale: 0.66,
    engines: [
      { x: 0, z: 0, r: 0.42 },
      { x: -0.52, z: 0, r: 0.28 },
      { x: 0.52, z: 0, r: 0.28 }
    ],
    chevrons: 3,
    bands: 3
  },
  4: {
    name: 'FLAGSHIP',
    accent: 0x00d5ff,
    flameCore: 0xffffff,
    flameEdge: 0x00b0ff,
    hull: 0x1552c8,
    height: 5.6,
    radius: 0.70,
    noseSharp: 1.25,
    finCount: 4,
    finSpan: 1.15,
    finSweep: 0.62,
    boosters: 2,
    boosterScale: 0.6,
    engines: [
      { x: 0, z: 0, r: 0.40 },
      { x: -0.62, z: 0, r: 0.26 },
      { x: 0.62, z: 0, r: 0.26 }
    ],
    chevrons: 4,
    bands: 3
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
    this.tilt = { x: 0, y: 0 };
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
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
    this.camera.position.set(0, CAM_Y, CAM_Z);
    this.camera.lookAt(0, CAM_Y, 0);

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
    const COUNT = 1400;
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

    // emissive energy disc — the glow the ship sits in
    this.padMat = new THREE.MeshBasicMaterial({
      color: 0x00d5ff,
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
    const gold = new THREE.MeshPhysicalMaterial({
      color: GOLD,
      metalness: 1.0,
      roughness: 0.16,
      clearcoat: 0.6,
      envMapIntensity: 2.0
    });
    const goldDeep = new THREE.MeshStandardMaterial({
      color: GOLD_DEEP, metalness: 1.0, roughness: 0.32, envMapIntensity: 1.6
    });
    const trim = new THREE.MeshStandardMaterial({
      color: DARK_TRIM, metalness: 0.7, roughness: 0.45, envMapIntensity: 1.0
    });
    const glow = new THREE.MeshBasicMaterial({ color: spec.accent });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0a2a44, metalness: 0.1, roughness: 0.05,
      transmission: 0.6, thickness: 0.4, envMapIntensity: 2.2
    });

    const all = [hull, hullLight, gold, goldDeep, trim, glow, glass];
    this.disposables.push(...all);
    return { hull, hullLight, gold, goldDeep, trim, glow, glass };
  }

  /** Lathe profile: ogive nose -> cylindrical barrel -> flared skirt. */
  _fuselageGeo(spec) {
    const pts = [];
    const H = spec.height;
    const R = spec.radius;
    const STEPS = 40;

    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const y = -H * 0.5 + t * H;
      let r;
      if (t > 0.74) {
        // Nose: a short, full ogive that ends in a blunt cap — a long thin
        // spike reads as a dart, not the stubby bullet nose of the reference.
        const nt = (t - 0.74) / 0.26;
        r = R * Math.pow(1 - nt * nt, 0.42 / spec.noseSharp);
        r = Math.max(r, R * 0.1);
      } else if (t < 0.1) {
        // skirt flare at the base
        const st = t / 0.1;
        r = R * (1.16 - 0.16 * st);
      } else {
        r = R;
      }
      pts.push(new THREE.Vector2(r, y));
    }
    return new THREE.LatheGeometry(pts, 64);
  }

  /** Swept delta fin as an extruded profile — real volume, not a plane. */
  _finGeo(spec) {
    const s = new THREE.Shape();
    const span = spec.finSpan;
    const sweep = spec.finSweep;
    s.moveTo(0, 0.1);
    s.lineTo(span, -0.55 - sweep);
    s.lineTo(span * 0.92, -0.95 - sweep);
    s.lineTo(0, -0.62);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.11, bevelEnabled: true, bevelThickness: 0.03,
      bevelSize: 0.03, bevelSegments: 2
    });
  }

  buildRocket(level) {
    const spec = SHIPS[level];
    const M = this._mats(spec);
    const g = new THREE.Group();
    const H = spec.height;
    const R = spec.radius;

    /* ---- fuselage */
    const body = new THREE.Mesh(this._fuselageGeo(spec), M.hull);
    body.castShadow = true;
    g.add(body);

    /* ---- white belly stripe (a slightly larger lathe slice, front only) */
    const stripeGeo = this._fuselageGeo(spec);
    stripeGeo.scale(1.008, 1, 1.008);
    const stripe = new THREE.Mesh(stripeGeo, M.hullLight);
    stripe.geometry.clearGroups();
    stripe.geometry.addGroup(0, Infinity, 0);
    stripe.scale.set(0.35, 1, 1);       // narrow band down the centreline
    stripe.position.z = 0.001;
    g.add(stripe);

    /* ---- gold band rings around the barrel */
    for (let i = 0; i < spec.bands; i++) {
      const t = 0.16 + i * (0.34 / Math.max(spec.bands - 1, 1));
      const y = -H * 0.5 + t * H;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 1.035, R * 1.035, 0.085, 64, 1, true),
        M.gold
      );
      band.position.y = y;
      band.castShadow = true;
      g.add(band);
    }

    /* ---- gold chevrons on the nose (the "»" arrows from the reference) */
    const chevShape = new THREE.Shape();
    chevShape.moveTo(-0.28, 0);
    chevShape.lineTo(0, 0.22);
    chevShape.lineTo(0.28, 0);
    chevShape.lineTo(0.28, -0.1);
    chevShape.lineTo(0, 0.12);
    chevShape.lineTo(-0.28, -0.1);
    chevShape.closePath();
    const chevGeo = new THREE.ExtrudeGeometry(chevShape, {
      depth: 0.05, bevelEnabled: true, bevelThickness: 0.015,
      bevelSize: 0.015, bevelSegments: 1
    });
    this.disposables.push(chevGeo);

    // Kept on the straight barrel, not the tapering nose — up there the hull
    // pulls away from the decal and they float off the surface.
    for (let i = 0; i < spec.chevrons; i++) {
      const y = H * 0.02 + i * 0.34;
      const scale = 1 - i * 0.06;
      for (const side of [1, -1]) {
        const c = new THREE.Mesh(chevGeo, M.gold);
        c.scale.setScalar(scale * R * 1.9);
        c.position.set(0, y, side * (R * 0.94));
        if (side < 0) c.rotation.y = Math.PI;
        c.castShadow = true;
        g.add(c);
      }
    }

    /* ---- central grille panel (ladder detail low on the fuselage) */
    const grille = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(R * 0.62, 0.045, 0.05), M.goldDeep
      );
      rung.position.set(0, -H * 0.24 + i * 0.088, R * 0.985);
      grille.add(rung);
    }
    const grillePlate = new THREE.Mesh(
      new THREE.BoxGeometry(R * 0.78, 0.72, 0.04), M.trim
    );
    grillePlate.position.set(0, -H * 0.24 + 0.26, R * 0.96);
    grille.add(grillePlate);
    g.add(grille);

    /* ---- cockpit glass */
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
      M.glass
    );
    cockpit.position.set(0, H * 0.30, R * 0.62);
    cockpit.rotation.x = Math.PI * 0.42;
    g.add(cockpit);

    /* ---- fins */
    const finGeo = this._finGeo(spec);
    this.disposables.push(finGeo);
    for (let i = 0; i < spec.finCount; i++) {
      const a = (i / spec.finCount) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.rotation.y = a;

      const fin = new THREE.Mesh(finGeo, M.gold);
      fin.position.set(R * 0.88, -H * 0.30, -0.055);
      fin.castShadow = true;
      pivot.add(fin);

      // inset accent panel on each fin
      const inset = new THREE.Mesh(finGeo, M.hull);
      inset.position.set(R * 0.88, -H * 0.30, -0.055);
      inset.scale.set(0.62, 0.62, 1.12);
      inset.position.y += 0.1;
      pivot.add(inset);

      g.add(pivot);
    }

    /* ---- side boosters */
    if (spec.boosters) {
      const bs = spec.boosterScale;
      for (let i = 0; i < spec.boosters; i++) {
        const side = i === 0 ? -1 : 1;
        const bg = new THREE.Group();
        // Pushed clear of the fuselage and seated low, so each booster reads as
        // its own body instead of a gold spike poking out from behind the hull.
        bg.position.set(side * (R + bs * 0.78), -H * 0.26, 0);

        const tube = new THREE.Mesh(
          new THREE.CapsuleGeometry(bs * 0.42, H * 0.34, 8, 32), M.hull
        );
        tube.castShadow = true;
        bg.add(tube);

        // nose cone sits on top of the booster body
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(bs * 0.43, bs * 0.85, 32), M.gold
        );
        cap.position.y = H * 0.17 + bs * 0.42;
        cap.castShadow = true;
        bg.add(cap);

        // flared skirt at the booster's own nozzle
        const skirt = new THREE.Mesh(
          new THREE.CylinderGeometry(bs * 0.5, bs * 0.4, 0.28, 32, 1, true), M.goldDeep
        );
        skirt.material.side = THREE.DoubleSide;
        skirt.position.y = -H * 0.17 - 0.1;
        bg.add(skirt);

        g.add(bg);
      }
    }

    /* ---- engine nozzles + glowing throats */
    this.nozzles = [];
    const engineY = -H * 0.5 - 0.06;
    for (const e of spec.engines) {
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(e.r * 1.25, e.r * 0.8, 0.42, 32, 1, true),
        M.goldDeep
      );
      bell.material.side = THREE.DoubleSide;
      bell.position.set(e.x, engineY - 0.12, e.z);
      bell.castShadow = true;
      g.add(bell);

      // Deliberately NOT flameCore — a pure-white basic material here sits far
      // above the bloom threshold and smears the whole engine bay into a blob.
      const throat = new THREE.Mesh(
        new THREE.CircleGeometry(e.r * 1.1, 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(spec.flameEdge).multiplyScalar(0.7)
        })
      );
      throat.rotation.x = Math.PI / 2;
      throat.position.set(e.x, engineY - 0.30, e.z);
      g.add(throat);

      this.nozzles.push({ x: e.x, z: e.z, r: e.r, y: engineY - 0.3 });
    }

    return g;
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

    // recolour the level-driven lighting + pedestal
    const c = new THREE.Color(spec.accent);
    this.rim.color.copy(c);
    this.engineLight.color.copy(new THREE.Color(spec.flameEdge));
    this.padMat.color.copy(c);
    this.ringA.material.color.copy(c);
    this.ringB.material.color.copy(c);
    this.shockMat.color.copy(c);
    this.starUniforms.uColor.value.copy(c);

    if (!instant) {
      // snappy materialise-in
      this.shipRoot.scale.setScalar(0.78);
      this.shipRoot.rotation.y = -0.7;
      this._spawnT = 0;
    } else {
      this.shipRoot.scale.setScalar(1);
      this._spawnT = 1;
    }
  }

  setThrottle(v) { this.targetThrottle = v; }

  setTilt(x, y) { this.tilt.x = x; this.tilt.y = y; }

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

    // ---- ship idle motion
    if (this.shipRoot && !this.isLaunching) {
      this.shipRoot.position.y = Math.sin(t * 1.15) * 0.11;
      this.shipRoot.rotation.y += dt * 0.24;
      this.shipRoot.rotation.z = Math.sin(t * 0.8) * 0.022 + this.tilt.x * 0.14;
      this.shipRoot.rotation.x = this.tilt.y * 0.1;
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
      this.camera.position.y = CAM_Y + (Math.random() - 0.5) * s;
    } else {
      this.camera.position.x += (0 - this.camera.position.x) * dt * 4;
      this.camera.position.y += (CAM_Y - this.camera.position.y) * dt * 4;
    }
    // subtle parallax orbit from pointer/gyro
    const aimY = this.camera.position.y;
    this.camera.position.x += this.tilt.x * 1.6;
    this.camera.position.y += this.tilt.y * -1.0;
    this.camera.lookAt(0, aimY, 0);

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
