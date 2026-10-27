import { Application, Circle, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { STATIONS, STOPS_TO_COLUMBIA } from "@/lib/line1";
import { along, geo, inside, rng, type Geo } from "./geo";

/**
 * The live map's WebGL scene (PixiJS). React only mounts it and draws the
 * buttons and cards on top; everything that moves lives here.
 *
 * Layers, bottom to top: water, shores, Manhattan (blocks, park, landmarks),
 * night tint, the 1 line + stations, trains, labels and avatar bubbles,
 * effects (ripples, sparks, confetti, +1 pops), clouds.
 */

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

const C = {
  water: 0x9ad6f2,
  waterLight: 0xc8ecfb,
  land: 0xf7efdf,
  shore: 0xeadfc7,
  street: 0xefe5d0,
  park: 0x9fd88a,
  parkDark: 0x7cc66b,
  red: 0xee352e,
  ink: 0x16181a,
  yellow: 0xfccc0a,
  white: 0xffffff,
  blocks: [0xfde3c9, 0xf8d4d0, 0xd8e7f7, 0xe7ddf5, 0xfff1bc, 0xdaf0dc, 0xf3e6d6],
};

const LANDMARK_STATIONS: Record<number, string> = {
  0: "⛴️ South Ferry",
  2: "🏙️ WTC Cortlandt",
  8: "🍕 14 St",
  12: "🚉 34 St–Penn",
  13: "🎭 Times Sq",
  15: "🌳 Columbus Circle",
  20: "🥯 96 St",
  [STOPS_TO_COLUMBIA]: "🎓 Columbia",
};

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

function nightness(): { night: number; dusk: number } {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const m = new Date().getMinutes() / 60;
  const t = h + m;
  const night = t >= 20 || t < 5 ? 1 : t >= 18 ? (t - 18) / 2 : t < 7 ? 1 - (t - 5) / 2 : 0;
  const dusk = t >= 16.5 && t < 19.5 ? 1 - Math.abs(t - 18) / 1.5 : t >= 5.5 && t < 7.5 ? 1 - Math.abs(t - 6.5) : 0;
  return { night: clamp(night, 0, 1), dusk: clamp(dusk, 0, 1) };
}

type TrainView = {
  rider: LiveRider;
  root: Container; // on the track, rotated with it
  body: Container;
  bubble: Container; // avatar + name, screen-sized
  nameTag: Text;
  hint: Container | null;
  ring: Graphics;
  s: number;
  from: number;
  to: number;
  t0: number;
  dur: number;
  moving: boolean;
  queue: number;
  slot: number;
  phase: number;
  lastAngle: number;
};

type Particle = { g: Graphics; vx: number; vy: number; life: number; max: number; spin: number; gravity: number };

export class LiveScene {
  readonly app: Application;
  readonly vp: Viewport;
  readonly g: Geo;
  private ev: SceneEvents;
  private reduce: boolean;
  private font: string;

  private world = new Container();
  private ground = new Container();
  private trees: Graphics[] = [];
  private shimmer: { g: Graphics; x: number; y: number; ph: number }[] = [];
  private lights = new Graphics();
  private tint = new Graphics();
  private trackLayer = new Container();
  private trainLayer = new Container();
  private labelLayer = new Container();
  private bubbleLayer = new Container();
  private fxLayer = new Container();
  private cloudLayer = new Container();
  private clouds: { c: Container; bx: number; by: number; speed: number }[] = [];
  private minorLabels: Container[] = [];
  private majorLabels: Container[] = [];
  private finishGlow = new Graphics();
  private ferry = new Container();
  private billboards: Graphics[] = [];

  private trains = new Map<string, TrainView>();
  private service: { root: Container; offset: number; speed: number }[] = [];
  private particles: Particle[] = [];
  private ripples: { g: Graphics; t: number }[] = [];
  private selected: string | null = null;
  private following = false;
  private sound = false;
  private audio: AudioContext | null = null;
  private time = 0;
  private destroyed = false;
  /** for screenshots: ?time=day|night|dusk */
  forcedTime: { night: number; dusk: number } | null = null;

  static async create(el: HTMLElement, riders: LiveRider[], ev: SceneEvents): Promise<LiveScene> {
    const app = new Application();
    await app.init({
      resizeTo: el,
      background: C.water,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    app.canvas.style.display = "block";
    app.canvas.style.touchAction = "none";
    el.appendChild(app.canvas);
    return new LiveScene(app, riders, ev);
  }

  private constructor(app: Application, riders: LiveRider[], ev: SceneEvents) {
    this.app = app;
    this.ev = ev;
    this.g = geo();
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const forced = new URLSearchParams(window.location.search).get("time");
    if (forced === "day") this.forcedTime = { night: 0, dusk: 0 };
    else if (forced === "night") this.forcedTime = { night: 1, dusk: 0 };
    else if (forced === "dusk") this.forcedTime = { night: 0.4, dusk: 1 };

    this.vp = new Viewport({
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      worldWidth: this.g.width,
      worldHeight: this.g.height,
      events: app.renderer.events,
      ticker: app.ticker,
    });
    this.vp
      .drag()
      .pinch()
      .wheel({ smooth: 4 })
      .decelerate({ friction: 0.92 })
      .clampZoom({ minScale: 0.08, maxScale: 2.6 })
      .clamp({ direction: "all", underflow: "center" });
    this.vp.on("drag-start", () => this.stopFollow());
    this.vp.on("pinch-start", () => this.stopFollow());
    this.vp.on("wheel-start", () => this.stopFollow());
    app.stage.addChild(this.vp);
    this.vp.addChild(this.world);

    this.world.addChild(this.ground, this.tint, this.lights, this.trackLayer, this.trainLayer, this.labelLayer, this.bubbleLayer, this.fxLayer, this.cloudLayer);
    this.lights.eventMode = "none";
    this.tint.eventMode = "none";
    this.cloudLayer.eventMode = "none";
    this.fxLayer.eventMode = "none";

    this.drawGround();
    this.drawTrack();
    this.drawClouds();
    this.applyTimeOfDay();
    this.addServiceTrains();
    this.setRiders(riders, true);

    app.renderer.on("resize", (w: number, h: number) => this.vp.resize(w, h, this.g.width, this.g.height));
    this.wholeLine(true);
    app.ticker.add((t) => this.tick(t.deltaMS));
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /* ------------------------------------------------------------------ scenery */

  private drawGround() {
    const g = this.g;
    const r = rng(11);

    // water shimmer (animated in tick)
    for (let i = 0; i < 140; i++) {
      const p = { x: r() * g.width, y: r() * g.height };
      if (inside(p, g.manhattan) || inside(p, g.nj) || inside(p, g.bk)) continue;
      const s = new Graphics().roundRect(-9, -1.2, 18, 2.4, 1.2).fill({ color: C.white, alpha: 0.7 });
      s.position.set(p.x, p.y);
      this.ground.addChild(s);
      this.shimmer.push({ g: s, x: p.x, y: p.y, ph: r() * Math.PI * 2 });
    }

    const shores = new Graphics();
    for (const poly of [g.nj, g.bk]) {
      shores.poly(poly.flatMap((p) => [p.x, p.y]), true).fill(C.shore);
    }
    // a lighter beach line around Manhattan
    shores.poly(g.manhattan.flatMap((p) => [p.x, p.y]), true).stroke({ width: 14, color: C.waterLight, alpha: 0.9, join: "round" });
    shores.poly(g.manhattan.flatMap((p) => [p.x, p.y]), true).fill(C.land);
    this.ground.addChild(shores);

    // city blocks on the (rotated) street grid; a few are taller buildings
    const blocks = new Graphics();
    const night: { x: number; y: number }[] = [];
    const bw = 66;
    const bh = 20;
    const gapX = 12;
    const gapY = 7;
    const xs = g.manhattan.map((p) => p.x);
    const ys = g.manhattan.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const tall: { x: number; y: number; h: number; c: number }[] = [];
    for (let y = minY; y < maxY; y += bh + gapY) {
      for (let x = minX; x < maxX; x += bw + gapX) {
        const c1 = { x: x + 4, y: y + 4 };
        const c2 = { x: x + bw - 4, y: y + bh - 4 };
        if (!inside(c1, g.manhattan) || !inside(c2, g.manhattan)) continue;
        if (inside({ x: x + bw / 2, y: y + bh / 2 }, g.park)) continue;
        const col = C.blocks[Math.floor(r() * C.blocks.length)];
        blocks.roundRect(x + 2, y + 3, bw, bh, 4).fill({ color: 0x8a7a5a, alpha: 0.1 });
        blocks.roundRect(x, y, bw, bh, 4).fill(col);
        if (r() < 0.07) tall.push({ x, y, h: 10 + r() * 22, c: col });
        if (r() < 0.45) night.push({ x: x + 6 + r() * (bw - 12), y: y + 5 + r() * (bh - 10) });
      }
    }
    // taller buildings get a side face, drawn after so they overlap their row
    for (const t of tall) {
      blocks.roundRect(t.x + 3, t.y - t.h + 5, bw - 6, bh + t.h - 6, 4).fill({ color: 0x000000, alpha: 0.1 });
      blocks.roundRect(t.x + 4, t.y - t.h, bw - 8, bh + t.h - 4, 4).fill(shade(t.c, 0.86));
      blocks.roundRect(t.x + 4, t.y - t.h, bw - 8, bh - 4, 4).fill(shade(t.c, 1.04));
    }
    this.ground.addChild(blocks);

    for (const p of night) {
      this.lights.circle(p.x + 2, p.y + 1.5, 6).fill({ color: 0xffd36b, alpha: 0.16 });
      this.lights.roundRect(p.x, p.y, 4, 3, 1).fill(0xfff1a8);
    }

    // Central Park with the Reservoir and swaying trees
    const park = new Graphics();
    park.poly(g.park.flatMap((p) => [p.x, p.y]), true).fill(C.park).stroke({ width: 4, color: C.parkDark });
    const res = g.at(40.7856, -73.9622);
    park.ellipse(res.x, res.y, 70, 44).fill(C.water).stroke({ width: 3, color: C.white, alpha: 0.7 });
    this.ground.addChild(park);
    const pr = rng(3);
    const pxs = g.park.map((p) => p.x);
    const pys = g.park.map((p) => p.y);
    for (let i = 0; i < 260; i++) {
      const p = { x: Math.min(...pxs) + pr() * (Math.max(...pxs) - Math.min(...pxs)), y: Math.min(...pys) + pr() * (Math.max(...pys) - Math.min(...pys)) };
      if (!inside(p, g.park) || Math.hypot((p.x - res.x) / 80, (p.y - res.y) / 54) < 1) continue;
      const s = 7 + pr() * 7;
      const t = new Graphics();
      t.ellipse(2, s * 0.9, s * 0.8, s * 0.35).fill({ color: 0x2f6b2a, alpha: 0.18 });
      t.circle(0, 0, s).fill(pr() < 0.5 ? 0x5cc474 : 0x4fb468);
      t.circle(-s * 0.35, -s * 0.35, s * 0.35).fill({ color: 0xb8f0b0, alpha: 0.7 });
      t.position.set(p.x, p.y);
      t.pivot.set(0, s * 0.6);
      this.ground.addChild(t);
      this.trees.push(t);
    }

    this.drawLandmarks();
  }

  private drawLandmarks() {
    const g = this.g;
    const L = new Container();
    this.ground.addChild(L);

    // Statue of Liberty, moved closer so she's in frame
    const lib = g.at(40.6948, -74.0335);
    const isle = new Graphics().ellipse(0, 18, 46, 18).fill(0xbfe7b2).stroke({ width: 3, color: C.white });
    isle.roundRect(-14, -4, 28, 22, 4).fill(0xd9cbb0);
    isle.roundRect(-6, -48, 12, 46, 5).fill(0x7fcfb8);
    isle.circle(0, -54, 8).fill(0x7fcfb8);
    isle.moveTo(-6, -60).lineTo(-9, -68).moveTo(0, -62).lineTo(0, -71).moveTo(6, -60).lineTo(9, -68).stroke({ width: 3, color: 0x7fcfb8, cap: "round" });
    isle.roundRect(5, -78, 5, 22, 2).fill(0x7fcfb8);
    isle.circle(7.5, -82, 5).fill(0xffd84d);
    isle.position.set(lib.x, lib.y);
    L.addChild(isle);

    // One World Trade Center
    const wtc = g.at(40.7127, -74.0134);
    L.addChild(tower(wtc.x + 70, wtc.y, 30, 120, 0xcfe3f5, true));
    // Empire State Building
    const esb = g.at(40.7484, -73.9857);
    const e = new Container();
    e.addChild(tower(0, 0, 40, 70, 0xf1e1c4, false), tower(0, -70, 26, 40, 0xf1e1c4, false), tower(0, -110, 12, 26, 0xf1e1c4, true));
    e.position.set(esb.x, esb.y);
    L.addChild(e);

    // Times Square billboards (colours cycle in tick)
    const ts = g.at(40.758, -73.9855);
    const colours = [0xff5d8f, 0x4cc9f0, 0xffd60a, 0x7b61ff, 0x06d6a0];
    for (let i = 0; i < 5; i++) {
      const b = new Graphics().roundRect(-13, -9, 26, 18, 4).fill(colours[i]).stroke({ width: 2, color: C.ink });
      b.position.set(ts.x + 40 + (i % 3) * 30, ts.y - 30 + Math.floor(i / 3) * 24);
      L.addChild(b);
      this.billboards.push(b);
    }

    // Columbia: Low Library's dome on the lawn
    const cu = g.at(40.8079, -73.9622);
    const low = new Graphics();
    low.roundRect(-70, -6, 140, 70, 10).fill(0xb7e3a3);
    low.roundRect(-46, -26, 92, 44, 4).fill(0xf4ead6).stroke({ width: 2.5, color: C.ink });
    for (let i = 0; i < 6; i++) low.rect(-38 + i * 14, -20, 5, 32).fill(0xe0d2b6);
    low.moveTo(-50, -26).lineTo(0, -44).lineTo(50, -26).closePath().fill(0xf4ead6).stroke({ width: 2.5, color: C.ink, join: "round" });
    low.ellipse(0, -48, 22, 18).fill(0x9fd3e8).stroke({ width: 2.5, color: C.ink });
    low.rect(-26, -48, 52, 6).fill(0xf4ead6);
    low.circle(0, -66, 4).fill(C.yellow);
    low.position.set(cu.x, cu.y);
    L.addChild(low);

    // Staten Island ferry in the harbour (moves in tick)
    const f = this.ferry;
    const hull = new Graphics();
    hull.roundRect(-34, -10, 68, 20, 10).fill(0xff8a1f).stroke({ width: 2.5, color: C.ink });
    hull.roundRect(-20, -22, 40, 14, 5).fill(C.white).stroke({ width: 2, color: C.ink });
    for (let i = 0; i < 4; i++) hull.rect(-15 + i * 9, -18, 5, 5).fill(0x9fd3e8);
    f.addChild(hull);
    this.ground.addChild(f);
  }

  private drawTrack() {
    const g = this.g;
    const pts = g.line.pts;
    const line = (gr: Graphics, width: number, color: number, alpha = 1, dx = 0, dy = 0) => {
      gr.moveTo(pts[0].x + dx, pts[0].y + dy);
      for (let i = 1; i < pts.length; i++) gr.lineTo(pts[i].x + dx, pts[i].y + dy);
      gr.stroke({ width, color, alpha, cap: "round", join: "round" });
    };
    const t = new Graphics();
    line(t, 30, 0x000000, 0.12, 5, 7);
    line(t, 26, C.white);
    line(t, 14, C.red);
    // sleepers
    for (let s = 0; s < g.line.length; s += 16) {
      const p = along(g, s);
      const nx = -Math.sin(p.angle);
      const ny = Math.cos(p.angle);
      t.moveTo(p.x - nx * 4, p.y - ny * 4).lineTo(p.x + nx * 4, p.y + ny * 4);
    }
    t.stroke({ width: 2, color: 0xffffff, alpha: 0.55, cap: "round" });
    this.trackLayer.addChild(t);

    // finish glow under Columbia
    const end = g.stations[STOPS_TO_COLUMBIA];
    this.finishGlow.circle(0, 0, 40).fill({ color: C.yellow, alpha: 0.35 });
    this.finishGlow.position.set(end.x, end.y);
    this.trackLayer.addChild(this.finishGlow);

    g.stations.forEach((p, k) => {
      const major = LANDMARK_STATIONS[k];
      const st = new Graphics();
      if (major) st.circle(0, 0, 12).fill(C.white).stroke({ width: 5, color: C.ink });
      else st.circle(0, 0, 7).fill(C.white).stroke({ width: 3.5, color: C.ink });
      st.position.set(p.x, p.y);
      st.eventMode = "static";
      st.cursor = "pointer";
      st.hitArea = new Circle(0, 0, 26);
      st.on("pointertap", () => {
        this.ev.onSelectStation(k);
        this.flyToStation(k);
      });
      this.trackLayer.addChild(st);

      // label to the east of the line, sized for the screen (scaled in tick)
      const label = new Container();
      label.position.set(p.x, p.y);
      const txt = new Text({
        text: major ?? STATIONS[k],
        style: {
          fontFamily: this.font,
          fontSize: major ? 15 : 12,
          fontWeight: major ? "800" : "600",
          fill: C.ink,
          stroke: major ? undefined : { color: C.white, width: 4, join: "round" },
        },
        resolution: 3,
      });
      txt.anchor.set(0, 0.5);
      if (major) {
        const pad = 8;
        const pill = new Graphics()
          .roundRect(16, -txt.height / 2 - 5, txt.width + pad * 2, txt.height + 10, 12)
          .fill(C.white)
          .stroke({ width: 2.5, color: C.ink });
        txt.position.set(16 + pad, 0);
        label.addChild(pill, txt);
        this.majorLabels.push(label);
      } else {
        txt.position.set(14, 0);
        label.addChild(txt);
        this.minorLabels.push(label);
      }
      this.labelLayer.addChild(label);
    });
  }

  private drawClouds() {
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const c = new Container();
      const sh = new Graphics();
      const body = new Graphics();
      const s = 0.8 + r() * 1.1;
      for (const [x, y, rx, ry] of [
        [0, 0, 46, 22],
        [-30, 6, 28, 18],
        [32, 8, 26, 16],
        [4, -14, 26, 20],
      ]) {
        sh.ellipse(x * s + 26, y * s + 60, rx * s, ry * s).fill({ color: 0x1a2a40, alpha: 0.06 });
        body.ellipse(x * s, y * s, rx * s, ry * s).fill({ color: C.white, alpha: 0.92 });
      }
      c.addChild(sh, body);
      const bx = r() * this.g.width;
      const by = r() * this.g.height;
      c.position.set(bx, by);
      this.cloudLayer.addChild(c);
      this.clouds.push({ c, bx, by, speed: 6 + r() * 10 });
    }
  }

  private applyTimeOfDay() {
    const { night, dusk } = this.forcedTime ?? nightness();
    // The tint reaches far past the world so zoomed-out edges match.
    const big = 6000;
    this.tint.clear();
    // multiply keeps the pastel colours, just bluer and darker at night, warmer at dusk
    const col = mix(mix(0xffffff, 0x5e6cb8, night), 0xffb58a, dusk * 0.6);
    this.tint.rect(-big, -big, this.g.width + big * 2, this.g.height + big * 2).fill(col);
    this.tint.blendMode = "multiply";
    this.tint.visible = night > 0 || dusk > 0;
    this.lights.alpha = night;
    this.app.renderer.background.color = multiply(C.water, col);
  }

  /* ------------------------------------------------------------------ trains */

  private makeTrainBody(color: number, stripe: number) {
    const b = new Container();
    const g = new Graphics();
    // drawn facing +x, centred on the track
    g.roundRect(-22, -11, 46, 22, 9).fill({ color: 0x000000, alpha: 0.18 });
    g.roundRect(-24, -12, 46, 22, 9).fill(color).stroke({ width: 2.5, color: C.ink });
    g.rect(-20, -2, 38, 4).fill(stripe);
    g.roundRect(-17, -8, 9, 6, 2).fill(0xdff3ff);
    g.roundRect(-5, -8, 9, 6, 2).fill(0xdff3ff);
    g.roundRect(10, -9, 9, 18, 4).fill(0xdff3ff).stroke({ width: 1.5, color: C.ink });
    g.circle(14, -3, 1.6).fill(C.ink);
    g.circle(14, 3, 1.6).fill(C.ink);
    g.circle(21, 0, 2.2).fill(C.yellow);
    b.addChild(g);
    return b;
  }

  private addServiceTrains() {
    if (this.reduce) return;
    for (let i = 0; i < 3; i++) {
      const root = new Container();
      root.addChild(this.makeTrainBody(0xdfe5ea, C.red));
      root.alpha = 0.95;
      root.eventMode = "none";
      this.trainLayer.addChild(root);
      this.service.push({ root, offset: i * 17.3, speed: 1 });
    }
  }

  private makeBubble(r: LiveRider) {
    const bubble = new Container();
    const ring = new Graphics();
    const size = r.me ? 40 : 32;
    ring.circle(0, 0, size / 2 + 3).fill(r.me ? C.yellow : C.white).stroke({ width: 2.5, color: C.ink });
    bubble.addChild(ring);
    const fallback = new Graphics().circle(0, 0, size / 2 - 1).fill(r.me ? 0xfff3b0 : 0xe9e3ff);
    const ini = new Text({ text: initials(r.name), style: { fontFamily: this.font, fontSize: size * 0.36, fontWeight: "800", fill: C.ink }, resolution: 3 });
    ini.anchor.set(0.5);
    bubble.addChild(fallback, ini);
    // pointer towards the train, which runs just east of the bubble
    const tip = new Graphics().moveTo(size / 2 + 1, -6).lineTo(size / 2 + 11, 0).lineTo(size / 2 + 1, 6).closePath().fill(r.me ? C.yellow : C.white).stroke({ width: 2.5, color: C.ink, join: "round" });
    bubble.addChildAt(tip, 0);

    if (r.avatarUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        if (this.destroyed) return;
        const sp = new Sprite(Texture.from(img));
        const d = size - 2;
        const k = d / Math.min(img.width, img.height);
        sp.scale.set(k);
        sp.anchor.set(0.5);
        const mask = new Graphics().circle(0, 0, d / 2).fill(C.white);
        sp.mask = mask;
        bubble.addChild(mask, sp);
        fallback.visible = false;
        ini.visible = false;
      };
      img.src = r.avatarUrl;
    }

    const nameTag = new Text({
      text: r.me ? "You" : r.name.split(" ")[0],
      style: { fontFamily: this.font, fontSize: 12, fontWeight: "800", fill: C.ink, stroke: { color: C.white, width: 4, join: "round" } },
      resolution: 3,
    });
    nameTag.anchor.set(0.5, 0);
    nameTag.position.set(0, -size / 2 - 19);
    bubble.addChild(nameTag);

    let hint: Container | null = null;
    if (r.me && r.station === 0) {
      hint = new Container();
      const t = new Text({ text: "Vote to depart!", style: { fontFamily: this.font, fontSize: 12, fontWeight: "800", fill: C.white }, resolution: 3 });
      t.anchor.set(0.5);
      const bg = new Graphics().roundRect(-t.width / 2 - 10, -12, t.width + 20, 24, 12).fill(C.ink);
      hint.addChild(bg, t);
      hint.position.set(0, -size / 2 - 36);
      bubble.addChild(hint);
    }

    bubble.eventMode = "static";
    bubble.cursor = "pointer";
    bubble.hitArea = new Circle(0, 0, size / 2 + 6);
    bubble.on("pointertap", () => this.select(r.id));
    return { bubble, ring, nameTag, hint };
  }

  /** Add, update or remove riders. On the first call (or replay) everyone rides up from South Ferry. */
  setRiders(riders: LiveRider[], intro = false) {
    const now = performance.now();
    const seen = new Set<string>();
    const sorted = [...riders].sort((a, b) => b.points - a.points);
    sorted.forEach((r, rank) => {
      seen.add(r.id);
      const target = this.g.stationS[clamp(r.station, 0, STOPS_TO_COLUMBIA)];
      let t = this.trains.get(r.id);
      if (!t) {
        const root = new Container();
        const body = this.makeTrainBody(r.me ? C.yellow : C.red, r.me ? C.red : C.white);
        root.addChild(body);
        root.eventMode = "static";
        root.cursor = "pointer";
        root.hitArea = new Circle(0, 0, 24);
        root.on("pointertap", () => this.select(r.id));
        const { bubble, ring, nameTag, hint } = this.makeBubble(r);
        this.trainLayer.addChild(root);
        this.bubbleLayer.addChild(bubble);
        t = { rider: r, root, body, bubble, ring, nameTag, hint, s: 0, from: 0, to: target, t0: now, dur: 0, moving: false, queue: 0, slot: 0, phase: Math.random() * 6, lastAngle: 0 };
        this.trains.set(r.id, t);
        if (intro && !this.reduce) this.rideTo(t, 0, target, now + 300 + (sorted.length - rank) * 140);
        else this.rideTo(t, target, target, now);
      } else if (r.station !== t.rider.station) {
        const delta = r.points - t.rider.points;
        this.rideTo(t, t.s, target, now);
        if (delta > 0) this.pop(t, `+${delta}`);
      }
      t.rider = r;
    });
    for (const [id, t] of this.trains) {
      if (seen.has(id)) continue;
      t.root.destroy({ children: true });
      t.bubble.destroy({ children: true });
      this.trains.delete(id);
    }
    // riders at the same stop queue up behind each other
    const byStation = new Map<number, TrainView[]>();
    for (const t of this.trains.values()) byStation.set(t.rider.station, [...(byStation.get(t.rider.station) ?? []), t]);
    byStation.forEach((list) => {
      list.sort((a, b) => Number(b.rider.me) - Number(a.rider.me) || b.rider.points - a.rider.points);
      list.forEach((t, i) => {
        t.queue = i * 34;
        t.slot = i;
      });
    });
  }

  private rideTo(t: TrainView, from: number, to: number, start: number) {
    t.from = from;
    t.to = to;
    t.t0 = start;
    t.dur = this.reduce ? 0 : 900 + Math.abs(to - from) * 0.9;
    t.moving = this.reduce ? false : to !== from;
    if (this.reduce) t.s = to;
  }

  /** Everyone back to South Ferry, then the week replays. */
  replay() {
    const riders = [...this.trains.values()].map((t) => t.rider);
    for (const t of this.trains.values()) {
      t.root.destroy({ children: true });
      t.bubble.destroy({ children: true });
    }
    this.trains.clear();
    this.setRiders(riders, true);
    this.wholeLine();
  }

  /* ------------------------------------------------------------------ camera */

  private animateTo(x: number, y: number, scale: number, done?: () => void) {
    this.vp.plugins.remove("animate");
    if (this.reduce) {
      this.vp.setZoom(scale, true);
      this.vp.moveCenter(x, y);
      done?.();
      return;
    }
    this.vp.animate({ position: { x, y }, scale, time: 900, ease: "easeInOutCubic", removeOnInterrupt: true, callbackOnComplete: () => done?.() });
  }

  wholeLine(instant = false) {
    this.stopFollow();
    const xs = this.g.stations.map((p) => p.x);
    const ys = this.g.stations.map((p) => p.y);
    // leave room for the title bar (top) and the controls (bottom)
    const top = 76;
    const bottom = 96;
    const w = Math.max(...xs) - Math.min(...xs) + 560;
    const h = Math.max(...ys) - Math.min(...ys) + 200;
    const scale = Math.min(this.app.screen.width / w, (this.app.screen.height - top - bottom) / h);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2 + 110;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2 - 10 + (bottom - top) / 2 / scale;
    if (instant) {
      this.vp.setZoom(scale, true);
      this.vp.moveCenter(cx, cy);
    } else this.animateTo(cx, cy, scale);
  }

  findMe() {
    const me = [...this.trains.values()].find((t) => t.rider.me);
    if (!me) return false;
    this.select(me.rider.id, false);
    this.animateTo(me.root.x, me.root.y, 1.25, () => {
      this.vp.follow(me.root, { speed: 0, acceleration: null, radius: null });
      this.following = true;
      this.ev.onCameraChange?.(true);
    });
    return true;
  }

  flyToStation(k: number) {
    const p = this.g.stations[k];
    this.stopFollow();
    this.animateTo(p.x + 60, p.y, Math.max(1.1, this.vp.scale.x));
  }

  flyToRider(id: string) {
    const t = this.trains.get(id);
    if (!t) return;
    this.stopFollow();
    this.animateTo(t.root.x, t.root.y, Math.max(1.15, this.vp.scale.x));
  }

  zoomBy(f: number) {
    this.stopFollow();
    const c = this.vp.center;
    this.animateTo(c.x, c.y, clamp(this.vp.scale.x * f, 0.08, 2.6));
  }

  pan(dx: number, dy: number) {
    this.stopFollow();
    const c = this.vp.center;
    this.vp.moveCenter(c.x + dx / this.vp.scale.x, c.y + dy / this.vp.scale.y);
  }

  private stopFollow() {
    if (!this.following) return;
    this.vp.plugins.remove("follow");
    this.following = false;
    this.ev.onCameraChange?.(false);
  }

  select(id: string | null, notify = true) {
    this.selected = id;
    if (id && notify) this.ev.onSelectRider(id);
  }

  setSound(on: boolean) {
    this.sound = on;
    if (on && !this.audio) this.audio = new AudioContext();
  }

  /* ------------------------------------------------------------------ effects */

  private chime() {
    if (!this.sound || !this.audio) return;
    const a = this.audio;
    [880, 1318.5].forEach((f, i) => {
      const o = a.createOscillator();
      const gn = a.createGain();
      o.frequency.value = f;
      o.type = "sine";
      const t = a.currentTime + i * 0.12;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(gn).connect(a.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  }

  private ripple(x: number, y: number) {
    if (this.reduce) return;
    const g = new Graphics();
    g.position.set(x, y);
    this.fxLayer.addChild(g);
    this.ripples.push({ g, t: 0 });
  }

  private pop(t: TrainView, text: string) {
    const tx = new Text({ text, style: { fontFamily: this.font, fontSize: 18, fontWeight: "900", fill: 0x00933c, stroke: { color: C.white, width: 5, join: "round" } }, resolution: 3 });
    tx.anchor.set(0.5);
    tx.position.set(t.root.x + 30, t.root.y - 10);
    this.fxLayer.addChild(tx);
    this.particles.push({ g: tx as unknown as Graphics, vx: 0, vy: -40, life: 0, max: 1400, spin: 0, gravity: 0 });
  }

  private sparks(x: number, y: number) {
    if (this.reduce || this.particles.length > 160) return;
    for (let i = 0; i < 2; i++) {
      const g = new Graphics().circle(0, 0, 1.6 + Math.random() * 1.6).fill(Math.random() < 0.5 ? 0xffd84d : 0xff9f1c);
      g.position.set(x, y);
      this.fxLayer.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 70;
      this.particles.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 350 + Math.random() * 250, spin: 0, gravity: 120 });
    }
  }

  confetti(x?: number, y?: number) {
    if (this.reduce) return;
    const end = this.g.stations[STOPS_TO_COLUMBIA];
    const cx = x ?? end.x;
    const cy = y ?? end.y;
    const colours = [0xee352e, 0xfccc0a, 0x0039a6, 0x00933c, 0xb933ad, 0xff6f91];
    for (let i = 0; i < 140; i++) {
      const g = new Graphics().rect(-4, -2, 8, 4).fill(colours[i % colours.length]);
      g.position.set(cx, cy);
      g.rotation = Math.random() * Math.PI;
      this.fxLayer.addChild(g);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 220 + Math.random() * 320;
      this.particles.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 2200 + Math.random() * 900, spin: (Math.random() - 0.5) * 12, gravity: 380 });
    }
  }

  /* ------------------------------------------------------------------ frame */

  private tick(dms: number) {
    if (this.destroyed) return;
    const dt = Math.min(dms, 50) / 1000;
    this.time += dt;
    const now = performance.now();
    const z = this.vp.scale.x;
    const inv = 1 / z;
    const motion = !this.reduce;

    // water, trees, billboards, ferry, clouds
    if (motion) {
      for (const s of this.shimmer) {
        s.g.x = s.x + Math.sin(this.time * 0.8 + s.ph) * 10;
        s.g.alpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 1.6 + s.ph));
      }
      this.trees.forEach((t, i) => (t.rotation = Math.sin(this.time * 1.3 + i * 0.7) * 0.06));
      this.billboards.forEach((b, i) => (b.alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 3 + i * 1.7))));
      const a = this.g.at(40.6935, -74.0215);
      const b2 = this.g.at(40.6996, -74.0145);
      const k = 0.5 + 0.5 * Math.sin(this.time * 0.18);
      this.ferry.position.set(a.x + (b2.x - a.x) * k + 260 * (k - 0.5), a.y + (b2.y - a.y) * k + 140);
      this.ferry.scale.x = Math.cos(this.time * 0.18) > 0 ? 1 : -1;
      this.finishGlow.scale.set(1 + 0.18 * Math.sin(this.time * 2.4));
      this.finishGlow.alpha = 0.6 + 0.4 * Math.sin(this.time * 2.4);
    }
    const c = this.vp.center;
    for (const cl of this.clouds) {
      if (motion) cl.bx = (cl.bx + cl.speed * dt) % (this.g.width + 300);
      // parallax: clouds drift with the camera a little
      cl.c.position.set(cl.bx - 150 + (c.x - this.g.width / 2) * 0.35, cl.by + (c.y - this.g.height / 2) * 0.35);
    }
    // clouds fade away when you zoom in close (and are dimmer at night)
    this.cloudLayer.alpha = clamp((0.9 - z) / 0.5, 0, 0.9) * (1 - 0.45 * this.lights.alpha);

    // service trains: stop at every station, run to the end and back
    for (const s of this.service) {
      const seg = 2.4; // seconds per station: 1.7 moving + 0.7 dwell
      const t = this.time + s.offset * seg;
      const legs = STOPS_TO_COLUMBIA * 2;
      const n = Math.floor(t / seg) % legs;
      const local = t % seg;
      const up = n < STOPS_TO_COLUMBIA;
      const a = up ? n : legs - n;
      const b = up ? a + 1 : a - 1;
      const f = local < 1.7 ? ease(local / 1.7) : 1;
      const sPos = this.g.stationS[a] + (this.g.stationS[b] - this.g.stationS[a]) * f;
      const p = along(this.g, sPos);
      // run on the opposite track, a little to the side
      const side = up ? 9 : -9;
      s.root.position.set(p.x - Math.sin(p.angle) * side, p.y + Math.cos(p.angle) * side);
      s.root.rotation = p.angle + (up ? 0 : Math.PI);
      s.root.scale.set(clamp(0.55 * inv, 1, 2.2));
    }

    // rider trains
    const bubbleScale = clamp(inv, 0.7, 6);
    const showAllBubbles = z > 0.32;
    const top3 = new Set([...this.trains.values()].sort((a, b) => b.rider.points - a.rider.points).slice(0, 3).map((t) => t.rider.id));
    for (const t of this.trains.values()) {
      if (t.moving) {
        const p = (now - t.t0) / t.dur;
        if (p >= 0) {
          const k = clamp(p, 0, 1);
          t.s = t.from + (t.to - t.from) * ease(k);
          if (k >= 1) {
            t.moving = false;
            t.s = t.to;
            const st = along(this.g, t.to);
            this.ripple(st.x, st.y);
            this.chime();
            if (t.rider.station >= STOPS_TO_COLUMBIA) {
              this.confetti();
              this.ev.onArrive(t.rider);
            }
          }
        } else t.s = t.from;
      }
      const pos = along(this.g, Math.max(0, t.s - t.queue));
      const trainScale = clamp(0.5 * inv, 1, 2.2);
      t.root.position.set(pos.x, pos.y);
      t.root.rotation = pos.angle;
      t.root.scale.set(trainScale);
      const bob = motion ? Math.sin(this.time * (t.moving ? 18 : 3) + t.phase) * (t.moving ? 0.6 : 1.2) : 0;
      t.body.y = bob;
      if (t.moving && motion) {
        const turn = Math.abs(((pos.angle - t.lastAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (turn > 0.004 && Math.random() < 0.8) this.sparks(pos.x, pos.y);
      }
      t.lastAngle = pos.angle;

      // bubble floats above, the same size on screen at every zoom
      const visible = showAllBubbles || t.rider.me || t.rider.id === this.selected || top3.has(t.rider.id);
      t.bubble.visible = visible;
      t.bubble.scale.set(bubbleScale * (t.rider.id === this.selected ? 1.15 : 1));
      // bubbles sit west of the line (labels are east); riders at one stop fan out in columns
      const size = t.rider.me ? 40 : 32;
      const floatY = motion && !t.moving ? Math.sin(this.time * 2 + t.phase) * 2 * bubbleScale : 0;
      t.bubble.position.set(pos.x - (size / 2 + 13 + t.slot * 40) * bubbleScale - 10 * trainScale, pos.y + floatY);
      t.nameTag.visible = z > 0.5 || t.rider.me || t.rider.id === this.selected;
      if (t.hint) t.hint.scale.set(1 + (motion ? 0.06 * Math.sin(this.time * 4) : 0));
      t.bubble.zIndex = t.rider.me ? 1000 : t.rider.id === this.selected ? 999 : t.rider.points;
    }
    this.bubbleLayer.sortableChildren = true;

    // labels: screen-sized; small stops only when zoomed in
    const ls = clamp(inv, 0.8, 7);
    for (const l of this.majorLabels) l.scale.set(ls * 0.95);
    for (const l of this.minorLabels) {
      l.visible = z > 0.6;
      l.scale.set(ls);
    }

    // ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      const k = r.t / 0.9;
      r.g.clear().circle(0, 0, 14 + k * 46).stroke({ width: 4 * (1 - k), color: C.yellow, alpha: 1 - k });
      if (k >= 1) {
        r.g.destroy();
        this.ripples.splice(i, 1);
      }
    }
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dms;
      p.vy += p.gravity * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += p.spin * dt;
      p.g.alpha = 1 - p.life / p.max;
      if (p.life >= p.max) {
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  private onVisibility = () => {
    if (document.hidden) this.app.ticker.stop();
    else this.app.ticker.start();
  };

  destroy() {
    this.destroyed = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.audio?.close().catch(() => {});
    this.app.destroy(true, { children: true, texture: true });
  }
}

/* ------------------------------------------------------------------ helpers */

function multiply(a: number, b: number) {
  const m = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

function mix(a: number, b: number, k: number) {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

function shade(c: number, k: number) {
  const r = clamp(Math.round(((c >> 16) & 255) * k), 0, 255);
  const g = clamp(Math.round(((c >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((c & 255) * k), 0, 255);
  return (r << 16) | (g << 8) | b;
}

function tower(x: number, y: number, w: number, h: number, color: number, spire: boolean) {
  const g = new Graphics();
  g.roundRect(-w / 2 + 6, -h + 8, w, h, 4).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(-w / 2, -h, w, h, 4).fill(color).stroke({ width: 2.5, color: 0x16181a });
  for (let yy = -h + 8; yy < -6; yy += 10) for (let xx = -w / 2 + 5; xx < w / 2 - 5; xx += 8) g.rect(xx, yy, 4, 5).fill(0x9fc7e8);
  if (spire) g.moveTo(0, -h).lineTo(0, -h - 24).stroke({ width: 3, color: 0x16181a, cap: "round" });
  g.position.set(x, y);
  return g;
}

