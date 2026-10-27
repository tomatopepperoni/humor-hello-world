import * as THREE from "three";
import CameraControls from "camera-controls";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { buildDiorama, distToLine, type Diorama } from "./diorama";
import { STATIONS, STOPS_TO_COLUMBIA } from "@/lib/line1";
import { along, geo, type Geo, type Pt } from "./geo";

/**
 * The live map as a 3D toy diorama (three.js). React (LiveMap.tsx) mounts it
 * and draws the buttons and cards; this class owns the scene, the camera and
 * everything that moves. The public API is the same one the 2D map had.
 *
 * Coordinates: geo.ts gives flat "world px" (x right, y down, uptown = up).
 * Here x stays x, y becomes z, and the world is centred on the origin.
 */

CameraControls.install({ THREE });

export type LiveRider = {
  id: string;
  name: string;
  avatarUrl: string | null;
  station: number;
  points: number;
  me: boolean;
};

export type SceneEvents = {
  onSelectRider: (id: string) => void;
  onSelectStation: (k: number) => void;
  onArrive: (r: LiveRider) => void;
  onCameraChange?: (following: boolean) => void;
};

const COL = {
  water: 0x8fd3f0,
  sky: 0xcfeaf7,
  land: 0xf6ecd8,
  landSide: 0xe7d6b5,
  far: 0xcfe0bf,
  red: 0xee352e,
  white: 0xffffff,
  ink: 0x16181a,
  yellow: 0xfccc0a,
  grey: 0xdfe5ea,
  pillar: 0xf2ece2,
};

const LANDMARKS: Record<number, string> = {
  0: "⛴️ South Ferry",
  2: "🏙️ WTC Cortlandt",
  8: "🍕 14 St",
  12: "🚉 34 St–Penn",
  13: "🎭 Times Sq",
  15: "🌳 Columbus Circle",
  20: "🥯 96 St",
  [STOPS_TO_COLUMBIA]: "🎓 Columbia",
};

const SLAB = 10; // height of the Manhattan slab
const DECK_Y = 22; // top of the elevated track
const RAIL = 7; // each rail sits this far either side of the centre line

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

type TrainView = {
  rider: LiveRider;
  group: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  label: CSS2DObject;
  el: HTMLDivElement;
  s: number;
  from: number;
  to: number;
  t0: number;
  dur: number;
  moving: boolean;
  queue: number;
  phase: number;
};

export class LiveScene {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: CameraControls;
  private clock = new THREE.Timer();
  private g: Geo;
  private ev: SceneEvents;
  private host: HTMLElement;
  private reduce: boolean;
  private cx: number;
  private cz: number;
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private hemi = new THREE.HemisphereLight(0xdff1ff, 0xf3e3c4, 1.4);

  private trains = new Map<string, TrainView>();
  private service: { group: THREE.Group; wheels: THREE.Mesh[]; offset: number }[] = [];
  private stationLabels: { obj: CSS2DObject; major: boolean }[] = [];
  private pickables: THREE.Object3D[] = [];
  private following: string | null = null;
  private selected: string | null = null;
  private sound = false;
  private audio: AudioContext | null = null;
  private time = 0;
  private destroyed = false;
  private resizeObs: ResizeObserver;
  private downAt: { x: number; y: number } | null = null;
  private trainGeo: { body: THREE.BufferGeometry; wheel: THREE.BufferGeometry; window: THREE.BufferGeometry; eye: THREE.BufferGeometry; smile: THREE.BufferGeometry };
  private mats: Record<string, THREE.Material> = {};
  private dio!: Diorama;
  private water!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private signMat!: THREE.MeshStandardMaterial;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private tiltH: ShaderPass | null = null;
  private tiltV: ShaderPass | null = null;
  private night = 0;
  private lightCheck = -1;
  /** high: desktop; medium: phones; low: no shadows or post-processing */
  quality: "high" | "medium" | "low";
  private forced: number | null = null;

  static async create(el: HTMLElement, riders: LiveRider[], ev: SceneEvents): Promise<LiveScene> {
    // Fail early (and let React show the fallback) when WebGL isn't there.
    const test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) throw new Error("WebGL unavailable");
    return new LiveScene(el, riders, ev);
  }

  private constructor(host: HTMLElement, riders: LiveRider[], ev: SceneEvents) {
    this.host = host;
    this.ev = ev;
    this.g = geo();
    this.cx = this.g.width / 2;
    this.cz = this.g.height / 2;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    this.quality = coarse ? "medium" : "high";
    const forced = new URLSearchParams(window.location.search).get("time");
    this.forced = forced === "day" ? 13 : forced === "dusk" ? 17.6 : forced === "night" ? 23 : null;

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps the pastels pastel (ACES greys them out)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    Object.assign(this.labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    host.appendChild(this.labels.domElement);

    this.scene.background = new THREE.Color(COL.sky);
    this.scene.fog = new THREE.Fog(COL.sky, 14000, 26000);

    this.camera = new THREE.PerspectiveCamera(32, w / h, 10, 20000);
    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    this.setupControls();

    this.trainGeo = {
      body: new RoundedBoxGeometry(44, 16, 18, 4, 5),
      wheel: new THREE.CylinderGeometry(3.2, 3.2, 20, 14),
      window: new RoundedBoxGeometry(8, 6, 19, 2, 1.5),
      eye: new THREE.SphereGeometry(1.6, 10, 8),
      smile: new THREE.TorusGeometry(3, 0.7, 6, 16, Math.PI),
    };

    this.buildLights();
    this.buildGround();
    this.dio = buildDiorama(this.g, (p, y) => this.v(p, y), (p) => distToLine(p, this.g.line.pts));
    this.scene.add(this.dio.group);
    this.buildTrack();
    this.setupPost(w, h);
    this.applyLight();
    this.addServiceTrains();
    this.setRiders(riders, true);
    this.applyLight(); // again, now that the train materials exist

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.renderer.domElement.addEventListener("pointerup", this.onUp);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.intro();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /* ------------------------------------------------------------------ setup */

  private v(p: Pt, y = 0) {
    return new THREE.Vector3(p.x - this.cx, y, p.y - this.cz);
  }

  private setupControls() {
    const c = this.controls;
    const A = CameraControls.ACTION;
    c.mouseButtons.left = A.SCREEN_PAN; // drags over the ground like a map
    c.mouseButtons.right = A.ROTATE;
    c.mouseButtons.wheel = A.DOLLY;
    c.touches.one = A.TOUCH_SCREEN_PAN;
    c.touches.two = A.TOUCH_DOLLY_ROTATE;
    c.dollyToCursor = true;
    c.minPolarAngle = THREE.MathUtils.degToRad(12);
    c.maxPolarAngle = THREE.MathUtils.degToRad(62);
    c.minDistance = 140;
    c.maxDistance = 9000;
    c.smoothTime = 0.45;
    c.draggingSmoothTime = 0.12;
    const pad = 300;
    c.setBoundary(
      new THREE.Box3(new THREE.Vector3(-this.cx + pad, 0, -this.cz + pad), new THREE.Vector3(this.cx - pad, 200, this.cz - pad))
    );
    c.addEventListener("controlstart", () => this.stopFollow());
  }

  private buildLights() {
    this.scene.add(this.hemi);
    const s = this.sun;
    s.position.set(-900, 1600, 900);
    s.castShadow = true;
    s.shadow.mapSize.set(this.quality === "high" ? 2048 : 1024, this.quality === "high" ? 2048 : 1024);
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 1.5;
    const sc = s.shadow.camera;
    sc.near = 100;
    sc.far = 5000;
    sc.left = -900;
    sc.right = 900;
    sc.top = 900;
    sc.bottom = -900;
    this.scene.add(s, s.target);
  }

  private slab(poly: Pt[], depth: number, top: number, color: number, side: number) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x - this.cx, -(p.y - this.cz))));
    const geo3 = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 3, bevelSize: 4, bevelSegments: 3, curveSegments: 4 });
    geo3.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo3, [new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: side, roughness: 1 })]);
    mesh.position.y = top - depth - 3;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildGround() {
    const g = this.g;
    // the river and harbour: one big plane under everything
    const water = (this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(g.width * 3, g.height * 3, 1, 1),
      new THREE.MeshStandardMaterial({ color: COL.water, roughness: 0.35, metalness: 0.05 })
    ));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -2;
    water.receiveShadow = true;
    this.scene.add(water);

    for (const poly of [g.nj, g.bk]) {
      const sl = this.slab(poly, 6, 2, COL.far, 0xc9d2b0);
      this.farMats.push(...(sl.material as THREE.MeshStandardMaterial[]));
      this.scene.add(sl);
    }
    this.scene.add(this.slab(g.manhattan, SLAB, SLAB, COL.land, COL.landSide));

    // Central Park: a slightly raised green pad (trees come in the next phase)
    const park = this.slab(g.park, 2, SLAB + 2, 0x9fd88a, 0x7cc66b);
    this.scene.add(park);
  }

  /** A flat strip along the 1 line: the viaduct deck. */
  private ribbon(pts: Pt[], width: number, y: number, thick: number) {
    const pos: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const L = { x: p.x + nx * (width / 2), y: p.y + ny * (width / 2) };
      const R = { x: p.x - nx * (width / 2), y: p.y - ny * (width / 2) };
      for (const q of [L, R]) for (const yy of [y, y - thick]) pos.push(q.x - this.cx, yy, q.y - this.cz);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const o = i * 4;
      const n = o + 4;
      // top (Ltop=o, Lbot=o+1, Rtop=o+2, Rbot=o+3)
      idx.push(o, n, o + 2, o + 2, n, n + 2);
      // left side
      idx.push(o, o + 1, n, n, o + 1, n + 1);
      // right side
      idx.push(o + 2, n + 2, o + 3, o + 3, n + 2, n + 3);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    return geom;
  }

  private buildTrack() {
    const g = this.g;
    const pts = g.line.pts;
    const deck = new THREE.Mesh(this.ribbon(pts, 30, DECK_Y, 6), new THREE.MeshStandardMaterial({ color: COL.white, roughness: 0.7, side: THREE.DoubleSide }));
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.scene.add(deck);

    // two red rails
    for (const side of [-RAIL, RAIL]) {
      const curve = new THREE.CatmullRomCurve3(
        pts.map((p, i) => {
          const a = pts[Math.max(0, i - 1)];
          const b = pts[Math.min(pts.length - 1, i + 1)];
          const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          return this.v({ x: p.x + (-(b.y - a.y) / l) * side, y: p.y + ((b.x - a.x) / l) * side }, DECK_Y + 1.2);
        })
      );
      const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 2.6, 8, false), this.railMat);
      rail.castShadow = true;
      this.scene.add(rail);
    }

    // pillars every ~110 units
    const count = Math.floor(g.line.length / 110);
    const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(4, 5, DECK_Y - SLAB, 10), new THREE.MeshStandardMaterial({ color: COL.pillar, roughness: 0.9 }), count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const p = along(g, (i + 0.5) * 110);
      m.makeTranslation(p.x - this.cx, SLAB + (DECK_Y - SLAB) / 2 - 4, p.y - this.cz);
      pillars.setMatrixAt(i, m);
    }
    pillars.castShadow = true;
    this.scene.add(pillars);

    // stations: a platform on each side, a lamp post with the round 1 sign, and a label
    const platMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ef, roughness: 0.7 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: COL.yellow, roughness: 0.5 });
    const goldMat = new THREE.MeshStandardMaterial({ color: COL.yellow, roughness: 0.4, emissive: COL.yellow, emissiveIntensity: 0.3 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6 });
    const signMat = (this.signMat = new THREE.MeshStandardMaterial({ color: COL.red, roughness: 0.4, emissive: COL.red, emissiveIntensity: 0.15 }));
    const platGeo = new RoundedBoxGeometry(64, 4, 11, 2, 1.5);
    const platBig = new RoundedBoxGeometry(84, 4, 13, 2, 1.5);
    const stripGeo = new THREE.BoxGeometry(62, 0.6, 1.6);
    const postGeo = new THREE.CylinderGeometry(0.9, 0.9, 22, 8);
    const signGeo = new THREE.CylinderGeometry(5, 5, 1.6, 24);
    g.stations.forEach((p, k) => {
      const major = !!LANDMARKS[k];
      const end = k === STOPS_TO_COLUMBIA;
      const a = along(g, g.stationS[k]);
      const grp = new THREE.Group();
      grp.position.copy(this.v(p, DECK_Y - 1));
      grp.rotation.y = -a.angle;
      for (const side of [-1, 1]) {
        const plat = new THREE.Mesh(major ? platBig : platGeo, end ? goldMat : platMat);
        plat.position.set(0, 0, side * (RAIL + 13));
        plat.castShadow = true;
        plat.receiveShadow = true;
        plat.userData.station = k;
        const strip = new THREE.Mesh(stripGeo, edgeMat);
        strip.position.set(0, 2.2, side * (RAIL + 8));
        grp.add(plat, strip);
        this.pickables.push(plat);
      }
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(major ? 30 : 22, 11, RAIL + 16);
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.rotation.x = Math.PI / 2;
      sign.position.set(major ? 30 : 22, 22, RAIL + 16);
      post.castShadow = true;
      sign.castShadow = true;
      grp.add(post, sign);
      this.scene.add(grp);

      const el = document.createElement("button");
      el.type = "button";
      el.textContent = LANDMARKS[k] ?? STATIONS[k];
      el.className = major ? "lm-label lm-major" : "lm-label lm-minor";
      el.addEventListener("click", () => {
        this.ev.onSelectStation(k);
        this.flyToStation(k);
      });
      const obj = new CSS2DObject(el);
      obj.position.copy(this.v({ x: p.x + 26, y: p.y }, DECK_Y + 4));
      obj.center.set(0, 0.5); // just east of the station
      this.scene.add(obj);
      this.stationLabels.push({ obj, major });
    });
  }


  private setupPost(w: number, h: number) {
    if (this.quality === "low") return;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.quality === "high" ? 4 : 2 });
    const comp = new EffectComposer(this.renderer, rt);
    comp.setPixelRatio(this.renderer.getPixelRatio());
    comp.setSize(w, h);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.4, 1.0);
    comp.addPass(this.bloom);
    if (this.quality === "high") {
      this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
      this.tiltV = new ShaderPass(VerticalTiltShiftShader);
      this.tiltH.uniforms.r.value = this.tiltV.uniforms.r.value = 0.52;
      comp.addPass(this.tiltH);
      comp.addPass(this.tiltV);
    }
    const vig = new ShaderPass(VignetteShader);
    vig.uniforms.offset.value = 1.05;
    vig.uniforms.darkness.value = 0.55;
    comp.addPass(vig);
    comp.addPass(new OutputPass());
    this.composer = comp;
  }

  /** New York hour as a decimal (or the ?time= override). */
  private hourNY() {
    if (this.forced !== null) return this.forced;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return hh + mm / 60;
  }

  /** Sun, sky, water and night lights follow the time in New York. */
  private applyLight() {
    this.lightCheck = this.time;
    const h = this.hourNY();
    const phi = (Math.PI * (h - 6)) / 12; // 0 at 6am, π at 6pm
    const elev = Math.sin(phi);
    const night = clamp(0.5 - elev * 3, 0, 1);
    const dusk = clamp(1 - Math.abs(elev - 0.12) * 5, 0, 1) * (1 - night);
    this.night = night;

    const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const sky = mix(0xcfeaf7, 0xf3c4c8, dusk).lerp(new THREE.Color(0x172042), night);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.water.material.color.copy(mix(0x8fd3f0, 0xb4c3ee, dusk).lerp(new THREE.Color(0x2a3b6b), night));

    if (night < 1) {
      this.sun.color.copy(mix(0xfff1dc, 0xffb48c, dusk));
      this.sun.intensity = (2.1 - dusk * 0.5) * (1 - night) + 0.45 * night;
      this.sunOffset.set(Math.cos(phi) * 1300, Math.max(260, Math.max(0, elev) * 1700), 800);
    } else {
      // moonlight
      this.sun.color.setHex(0xaabaff);
      this.sun.intensity = 0.5;
      this.sunOffset.set(-700, 1500, 500);
    }
    this.hemi.color.copy(mix(0xe2f3ff, 0xeed6ff, dusk).lerp(new THREE.Color(0x4a5a9a), night));
    this.hemi.groundColor.copy(mix(0xf4e4c6, 0xf3d6c8, dusk).lerp(new THREE.Color(0x1c2240), night));
    this.hemi.intensity = 1.3 - night * 0.75;

    this.signMat.emissiveIntensity = 0.15 + night * 1.6;
    this.railMat.emissiveIntensity = night * 0.9; // the line glows at night
    this.farMats.forEach((m, i) => m.color.copy(new THREE.Color(i % 2 ? 0xc9d2b0 : COL.far).lerp(new THREE.Color(0x343c55), night)));
    (this.mats.lamp as THREE.MeshStandardMaterial | undefined)?.setValues({ emissiveIntensity: 1.2 + night * 2.5 });
    (this.mats.glass as THREE.MeshStandardMaterial | undefined)?.setValues({ emissiveIntensity: night * 0.9 });
    if (this.bloom) {
      // only HDR (emissive) pixels bloom, so daylight colours stay crisp
      this.bloom.strength = 0.3 + night * 0.35;
      this.bloom.threshold = 1.0;
      this.bloom.radius = 0.4;
    }
  }

  private sunOffset = new THREE.Vector3(-900, 1600, 900);
  private railMat = new THREE.MeshStandardMaterial({ color: COL.red, roughness: 0.5, emissive: COL.red, emissiveIntensity: 0 });
  private farMats: THREE.MeshStandardMaterial[] = [];

  /* ------------------------------------------------------------------ trains */

  private mat(key: string, make: () => THREE.Material) {
    return (this.mats[key] ??= make());
  }

  private makeTrain(color: number, stripe: number) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    const G = this.trainGeo;
    const shell = new THREE.Mesh(G.body, this.mat(`b${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.45 })));
    shell.castShadow = true;
    body.add(shell);
    const band = new THREE.Mesh(new THREE.BoxGeometry(40, 2.2, 18.6), this.mat(`s${stripe}`, () => new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.5 })));
    band.position.y = -2.5;
    body.add(band);
    const glass = this.mat("glass", () => new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.15, metalness: 0.1, emissive: 0xfff1b0, emissiveIntensity: 0 }));
    for (const x of [-12, 0]) {
      const w = new THREE.Mesh(G.window, glass);
      w.position.set(x, 2.5, 0);
      body.add(w);
    }
    // the face, on the front (+x)
    const face = new THREE.Mesh(new RoundedBoxGeometry(4, 11, 13, 2, 1.5), glass);
    face.position.set(20.5, 1.5, 0);
    body.add(face);
    const inkM = this.mat("ink", () => new THREE.MeshStandardMaterial({ color: COL.ink, roughness: 0.4 }));
    for (const z of [-3.2, 3.2]) {
      const e = new THREE.Mesh(G.eye, inkM);
      e.position.set(22.6, 3.6, z);
      body.add(e);
    }
    const smile = new THREE.Mesh(G.smile, inkM);
    smile.rotation.set(0, Math.PI / 2, Math.PI);
    smile.position.set(22.6, 0.6, 0);
    body.add(smile);
    const cheek = this.mat("cheek", () => new THREE.MeshStandardMaterial({ color: 0xff9aa2, roughness: 0.6 }));
    for (const z of [-5.6, 5.6]) {
      const c = new THREE.Mesh(G.eye, cheek);
      c.scale.setScalar(0.9);
      c.position.set(22.4, 0.6, z);
      body.add(c);
    }
    const lamp = new THREE.Mesh(G.eye, this.mat("lamp", () => new THREE.MeshStandardMaterial({ color: 0xfff3a0, emissive: 0xffd84d, emissiveIntensity: 1.2 })));
    lamp.position.set(21, 7.6, 0);
    lamp.scale.setScalar(1.3);
    body.add(lamp);
    const wheels: THREE.Mesh[] = [];
    for (const x of [-13, 13]) {
      const wh = new THREE.Mesh(G.wheel, inkM);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(x, -8, 0);
      group.add(wh);
      wheels.push(wh);
    }
    body.position.y = 11; // sits on the rail
    return { group, body, wheels };
  }

  private makeLabel(r: LiveRider) {
    const el = document.createElement("div");
    el.className = `lm-bubble${r.me ? " lm-me" : ""}`;
    const face = document.createElement("span");
    face.className = "lm-face";
    if (r.avatarUrl) {
      const img = document.createElement("img");
      img.src = r.avatarUrl;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        img.remove();
        face.textContent = initials(r.name);
      };
      face.appendChild(img);
    } else face.textContent = initials(r.name);
    const name = document.createElement("span");
    name.className = "lm-name";
    name.textContent = r.me ? "You" : r.name.split(" ")[0];
    el.append(name, face);
    if (r.me && r.station === 0) {
      const hint = document.createElement("span");
      hint.className = "lm-hint";
      hint.textContent = "Vote to depart!";
      el.prepend(hint);
    }
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.select(r.id);
    });
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 1);
    return { obj, el };
  }

  private addServiceTrains() {
    if (this.reduce) return;
    for (let i = 0; i < 3; i++) {
      const { group, wheels } = this.makeTrain(COL.grey, COL.red);
      this.scene.add(group);
      this.service.push({ group, wheels, offset: i * 15.3 });
    }
  }

  setRiders(riders: LiveRider[], intro = false) {
    const now = performance.now();
    const seen = new Set<string>();
    const sorted = [...riders].sort((a, b) => b.points - a.points);
    sorted.forEach((r, rank) => {
      seen.add(r.id);
      const target = this.g.stationS[clamp(r.station, 0, STOPS_TO_COLUMBIA)];
      let t = this.trains.get(r.id);
      if (!t) {
        const { group, body, wheels } = this.makeTrain(r.me ? COL.yellow : COL.red, r.me ? COL.red : COL.white);
        if (r.me) group.scale.setScalar(1.15);
        group.traverse((o) => (o.userData.riderId = r.id));
        this.pickables.push(...group.children.flatMap((c) => (c instanceof THREE.Group ? c.children : [c])));
        const { obj, el } = this.makeLabel(r);
        group.add(obj);
        obj.position.set(0, 34, 0);
        this.scene.add(group);
        t = { rider: r, group, body, wheels, label: obj, el, s: 0, from: 0, to: target, t0: now, dur: 0, moving: false, queue: 0, phase: Math.random() * 6 };
        this.trains.set(r.id, t);
        if (intro && !this.reduce) this.rideTo(t, 0, target, now + 900 + (sorted.length - rank) * 150);
        else this.rideTo(t, target, target, now);
      } else if (r.station !== t.rider.station) {
        this.rideTo(t, t.s, target, now);
      }
      t.rider = r;
    });
    for (const [id, t] of this.trains) {
      if (seen.has(id)) continue;
      this.removeTrain(t);
      this.trains.delete(id);
    }
    const byStation = new Map<number, TrainView[]>();
    for (const t of this.trains.values()) byStation.set(t.rider.station, [...(byStation.get(t.rider.station) ?? []), t]);
    byStation.forEach((list) => {
      list.sort((a, b) => Number(b.rider.me) - Number(a.rider.me) || b.rider.points - a.rider.points);
      list.forEach((t, i) => (t.queue = i * 52));
    });
  }

  private removeTrain(t: TrainView) {
    t.label.element.remove();
    t.group.remove(t.label);
    this.scene.remove(t.group);
    this.pickables = this.pickables.filter((p) => p.userData.riderId !== t.rider.id);
  }

  private rideTo(t: TrainView, from: number, to: number, start: number) {
    t.from = from;
    t.to = to;
    t.t0 = start;
    t.dur = this.reduce ? 0 : 1100 + Math.abs(to - from) * 0.9;
    t.moving = !this.reduce && to !== from;
    if (this.reduce) t.s = to;
  }

  replay() {
    const riders = [...this.trains.values()].map((t) => t.rider);
    for (const t of this.trains.values()) this.removeTrain(t);
    this.trains.clear();
    this.setRiders(riders, true);
    this.wholeLine();
  }

  /* ------------------------------------------------------------------ camera */

  private lineBox() {
    const box = new THREE.Box3();
    for (const p of this.g.stations) box.expandByPoint(this.v(p, DECK_Y));
    box.expandByScalar(160);
    return box;
  }

  private intro() {
    const box = this.lineBox();
    const c = box.getCenter(new THREE.Vector3());
    // start high above, nearly top-down, then glide into the diorama view
    this.controls.setLookAt(c.x, 7000, c.z + 900, c.x, 0, c.z, false);
    if (this.reduce) {
      this.wholeLine(true);
      return;
    }
    window.setTimeout(() => {
      if (this.destroyed) return;
      this.controls.smoothTime = 0.9;
      this.wholeLine();
      window.setTimeout(() => (this.controls.smoothTime = 0.45), 2600);
    }, 250);
  }

  wholeLine(instant = false) {
    this.stopFollow();
    const now = !instant && !this.reduce;
    // Wide screens look across the island so the line runs corner to corner; phones look uptown.
    const wide = this.host.clientWidth > this.host.clientHeight * 1.1;
    this.controls.rotateTo(THREE.MathUtils.degToRad(wide ? 64 : 0), THREE.MathUtils.degToRad(wide ? 50 : 34), now);
    void this.controls.fitToBox(this.lineBox(), now, { paddingTop: 70, paddingBottom: 100, paddingLeft: 30, paddingRight: 30 });
  }

  private chaseOffset(t: TrainView) {
    const p = along(this.g, Math.max(0, t.s - t.queue));
    // azimuth that puts the camera behind the train
    return { p, az: Math.atan2(-Math.cos(p.angle), -Math.sin(p.angle)) };
  }

  findMe() {
    const me = [...this.trains.values()].find((t) => t.rider.me);
    if (!me) return false;
    this.selected = me.rider.id;
    this.following = me.rider.id;
    this.ev.onCameraChange?.(true);
    const { p, az } = this.chaseOffset(me);
    const target = this.v(p, DECK_Y + 10);
    this.controls.moveTo(target.x, target.y, target.z, !this.reduce);
    this.controls.rotateTo(az, THREE.MathUtils.degToRad(58), !this.reduce);
    this.controls.dollyTo(340, !this.reduce);
    return true;
  }

  private flyTo(p: Pt, dist: number) {
    this.stopFollow();
    const v = this.v(p, DECK_Y);
    this.controls.moveTo(v.x, v.y, v.z, !this.reduce);
    this.controls.dollyTo(dist, !this.reduce);
    this.controls.rotatePolarTo(THREE.MathUtils.degToRad(50), !this.reduce);
  }

  flyToStation(k: number) {
    this.flyTo(this.g.stations[k], 520);
  }

  flyToRider(id: string) {
    const t = this.trains.get(id);
    if (!t) return;
    const p = along(this.g, Math.max(0, t.s - t.queue));
    this.flyTo({ x: p.x, y: p.y }, 420);
  }

  zoomBy(f: number) {
    this.stopFollow();
    this.controls.dollyTo(clamp(this.controls.distance / f, this.controls.minDistance, this.controls.maxDistance), !this.reduce);
  }

  pan(dx: number, dy: number) {
    this.stopFollow();
    const k = this.controls.distance / 900;
    void this.controls.truck(dx * k, 0, true);
    void this.controls.forward(-dy * k, true);
  }

  private stopFollow() {
    if (!this.following) return;
    this.following = null;
    this.ev.onCameraChange?.(false);
  }

  select(id: string | null) {
    this.selected = id;
    if (id) this.ev.onSelectRider(id);
  }

  setSound(on: boolean) {
    this.sound = on;
    if (on && !this.audio) this.audio = new AudioContext();
  }

  confetti() {
    /* fireworks arrive in phase 3 */
  }

  /* ------------------------------------------------------------------ input */

  private onDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: PointerEvent) => {
    if (!this.downAt || Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) return;
    this.downAt = null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.pickables, false)[0];
    if (!hit) return;
    const id = hit.object.userData.riderId as string | undefined;
    const st = hit.object.userData.station as number | undefined;
    if (id) this.select(id);
    else if (st !== undefined) {
      this.ev.onSelectStation(st);
      this.flyToStation(st);
    }
  };

  private onVisibility = () => {
    this.renderer.setAnimationLoop(document.hidden ? null : () => this.tick());
    if (!document.hidden) this.clock.reset();
  };

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------------ frame */

  private placeOnTrack(group: THREE.Object3D, s: number, side: number, reverse = false) {
    const p = along(this.g, s);
    const nx = -Math.sin(p.angle);
    const ny = Math.cos(p.angle);
    group.position.set(p.x + nx * side - this.cx, DECK_Y, p.y + ny * side - this.cz);
    group.rotation.y = -p.angle + (reverse ? Math.PI : 0);
    return p;
  }

  private tick() {
    if (this.destroyed) return;
    this.clock.update();
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05);
    this.time += dt;
    const now = performance.now();
    const motion = !this.reduce;
    const dist = this.controls.distance;

    // service trains: stop at every station, end to end and back, on the west rail
    for (const s of this.service) {
      const seg = 2.6;
      const t = this.time + s.offset * seg;
      const legs = STOPS_TO_COLUMBIA * 2;
      const n = Math.floor(t / seg) % legs;
      const local = t % seg;
      const up = n < STOPS_TO_COLUMBIA;
      const a = up ? n : legs - n;
      const b = up ? a + 1 : a - 1;
      const moving = local < 1.8;
      const f = moving ? ease(local / 1.8) : 1;
      this.placeOnTrack(s.group, this.g.stationS[a] + (this.g.stationS[b] - this.g.stationS[a]) * f, up ? -RAIL : -RAIL, !up);
      if (moving) for (const w of s.wheels) w.rotation.y += dt * 9;
    }

    // rider trains on the east rail
    for (const t of this.trains.values()) {
      if (t.moving) {
        const p = (now - t.t0) / t.dur;
        if (p >= 0) {
          const k = clamp(p, 0, 1);
          t.s = t.from + (t.to - t.from) * ease(k);
          if (k >= 1) {
            t.moving = false;
            t.s = t.to;
            this.chime();
            if (t.rider.station >= STOPS_TO_COLUMBIA) {
              this.confetti();
              this.ev.onArrive(t.rider);
            }
          }
        } else t.s = t.from;
      }
      this.placeOnTrack(t.group, Math.max(0, t.s - t.queue), RAIL);
      t.body.position.y = 11 + (motion ? Math.sin(this.time * (t.moving ? 16 : 3) + t.phase) * (t.moving ? 0.35 : 0.8) : 0);
      if (t.moving) for (const w of t.wheels) w.rotation.y += dt * 9;

      const top3 = t.rider.points >= this.top3Points;
      const show = dist < 2600 || t.rider.me || t.rider.id === this.selected || top3;
      t.label.visible = show; // CSS2DRenderer owns style.display
      t.el.classList.toggle("lm-selected", t.rider.id === this.selected);
      t.el.classList.toggle("lm-compact", dist > 1400 && !t.rider.me && t.rider.id !== this.selected);
    }

    // chase cam
    if (this.following) {
      const t = this.trains.get(this.following);
      if (t) {
        const { p, az } = this.chaseOffset(t);
        const v = this.v(p, DECK_Y + 10);
        this.controls.moveTo(v.x, v.y, v.z, true);
        if (t.moving) this.controls.rotateAzimuthTo(az, true);
      }
    }

    for (const l of this.stationLabels) l.obj.visible = l.major || dist < 1500;

    // keep the sun's shadow box around what the camera is looking at
    const tgt = this.controls.getTarget(new THREE.Vector3());
    this.sun.target.position.copy(tgt);
    this.sun.position.copy(tgt).add(this.sunOffset);
    const sc = this.sun.shadow.camera;
    const half = clamp(dist * 0.55, 300, 2400);
    if (Math.abs(sc.right - half) > 40) {
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    }

    this.controls.update(Math.min(raw, 0.25));
    if (this.time - this.lightCheck > 5) this.applyLight();
    this.dio.update(this.time, this.night, motion);
    if (this.tiltH && this.tiltV) {
      // miniature look: a little blur at the top and bottom, only when close
      const k = clamp((1800 - dist) / 1200, 0, 1);
      this.tiltH.enabled = this.tiltV.enabled = k > 0.02;
      this.tiltH.uniforms.h.value = (1.3 * k) / this.host.clientWidth;
      this.tiltV.uniforms.v.value = (1.3 * k) / this.host.clientHeight;
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  private get top3Points() {
    const pts = [...this.trains.values()].map((t) => t.rider.points).sort((a, b) => b - a);
    return pts[Math.min(2, pts.length - 1)] ?? Infinity;
  }

  private chime() {
    if (!this.sound || !this.audio) return;
    const a = this.audio;
    [880, 1318.5].forEach((f, i) => {
      const o = a.createOscillator();
      const gn = a.createGain();
      o.frequency.value = f;
      const t = a.currentTime + i * 0.12;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(gn).connect(a.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.renderer.setAnimationLoop(null);
      this.resizeObs.disconnect();
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
      this.renderer.domElement.removeEventListener("pointerup", this.onUp);
      this.controls.dispose();
      this.audio?.close().catch(() => {});
      this.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      this.composer?.dispose();
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.labels.domElement.remove();
    } catch {
      /* never let cleanup take the page down */
    }
  }
}
