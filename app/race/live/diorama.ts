import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { STOPS_TO_COLUMBIA } from "@/lib/line1";
import { inside, rng, type Geo, type Pt } from "./geo";

/**
 * The city around the 1 line: buildings, Central Park, landmarks, the ferry
 * and clouds. Everything is built from primitives in code (no downloaded
 * models), and repeated things are instanced so the whole city is a handful
 * of draw calls.
 */

export type Diorama = {
  group: THREE.Group;
  /** call every frame; night is 0–1 */
  update: (time: number, night: number, motion: boolean) => void;
};

type V = (p: Pt, y?: number) => THREE.Vector3;

const PASTELS = [0xffc9a8, 0xffe28a, 0xc4e2ff, 0xd9ccff, 0xbfeccc, 0xffc2cf, 0xf3dcc0, 0xb8e8e0];
const SLAB = 10;

function boxGeo0() {
  const b = new THREE.BoxGeometry(1, 1, 1);
  b.translate(0, 0.5, 0);
  return b;
}

function distToLine(p: Pt, pts: Pt[]) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

/** How tall the city is at a given point: tall downtown and midtown, low in the Village and uptown. */
function zoneHeight(y: number, g: Geo, r: () => number) {
  const st = g.stations;
  const fidi = st[3].y; // Chambers St
  const village = st[8].y; // 14 St
  const midS = st[11].y; // 28 St
  const midN = st[15].y; // 59 St
  const lerp = (a: number, b: number) => a + (b - a) * r();
  if (y > fidi) return lerp(26, 78);
  if (y > village) return lerp(10, 24);
  if (y > midS) return lerp(16, 40);
  if (y > midN) return lerp(34, 96);
  return lerp(14, 34);
}

export function buildDiorama(g: Geo, v: V, lineNear: (p: Pt) => number): Diorama {
  const group = new THREE.Group();
  const r = rng(21);
  const updaters: ((time: number, night: number, motion: boolean) => void)[] = [];

  /* ---------------- buildings ---------------- */
  type B = { x: number; y: number; w: number; d: number; h: number; c: number; lit: boolean };
  const blocks: B[] = [];
  const bw = 66;
  const bd = 20;
  const xs = g.manhattan.map((p) => p.x);
  const ys = g.manhattan.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let y = minY; y < maxY; y += bd + 9) {
    for (let x = minX; x < maxX; x += bw + 13) {
      // a block is two or three buildings side by side
      const parts = r() < 0.5 ? 2 : 3;
      const pw = bw / parts;
      for (let k = 0; k < parts; k++) {
        const cx = x + pw * k + pw / 2;
        const cy = y + bd / 2;
        const c1 = { x: cx - pw / 2 + 3, y: cy - bd / 2 + 3 };
        const c2 = { x: cx + pw / 2 - 3, y: cy + bd / 2 - 3 };
        if (!inside(c1, g.manhattan) || !inside(c2, g.manhattan)) continue;
        if (inside({ x: cx, y: cy }, g.park)) continue;
        const near = lineNear({ x: cx, y: cy });
        if (near < 34) continue; // keep the viaduct clear
        if (r() < 0.1) continue; // the odd courtyard or plaza
        // low along the line so the trains stay in view
        const h = Math.min(zoneHeight(cy, g, r) * (0.7 + r() * 0.5), near < 110 ? 12 + near * 0.12 : Infinity);
        blocks.push({ x: cx, y: cy, w: pw - 3, d: bd, h, c: PASTELS[Math.floor(r() * PASTELS.length)], lit: r() < 0.55 });
      }
    }
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const bMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const buildings = new THREE.InstancedMesh(boxGeo, bMat, blocks.length);
  const roofGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
  roofGeo.translate(0, 0.5, 0);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), blocks.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  blocks.forEach((b, i) => {
    const p = v({ x: b.x, y: b.y }, SLAB);
    m.compose(p, q, new THREE.Vector3(b.w, b.h, b.d));
    buildings.setMatrixAt(i, m);
    buildings.setColorAt(i, col.setHex(b.c));
    m.compose(new THREE.Vector3(p.x, SLAB + b.h, p.z), q, new THREE.Vector3(b.w * 0.86, 3, b.d * 0.8));
    roofs.setMatrixAt(i, m);
    roofs.setColorAt(i, col.setHex(b.c).offsetHSL(0, 0.05, 0.04));
  });
  buildings.castShadow = buildings.receiveShadow = true;
  roofs.castShadow = roofs.receiveShadow = true;
  group.add(buildings, roofs);

  // window bands: blue glass by day, warm light at night
  const bands: { p: THREE.Vector3; s: THREE.Vector3 }[] = [];
  for (const b of blocks) {
    if (!b.lit) continue;
    const floors = Math.min(6, Math.floor(b.h / 11));
    for (let f = 1; f <= floors; f++) {
      const y = SLAB + (b.h * f) / (floors + 1);
      bands.push({ p: v({ x: b.x, y: b.y }, y), s: new THREE.Vector3(b.w + 0.6, 1.7, b.d + 0.6) });
    }
  }
  const winMat = new THREE.MeshStandardMaterial({ color: 0xbfe2f5, roughness: 0.25, metalness: 0.1, emissive: 0xffc970, emissiveIntensity: 0 });
  const wins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), winMat, bands.length);
  bands.forEach((b, i) => {
    m.compose(b.p, q, b.s);
    wins.setMatrixAt(i, m);
  });
  group.add(wins);
  updaters.push((_, night) => {
    winMat.emissiveIntensity = night * 1.15;
    winMat.color.setHex(night > 0.5 ? 0x4b4a5e : 0xbfe2f5);
  });

  /* ---------------- New Jersey and Brooklyn: a low, muted skyline along the water ---------------- */
  {
    const far: { x: number; y: number; w: number; h: number }[] = [];
    const fr = rng(31);
    for (const poly of [g.nj, g.bk]) {
      for (let i = 0; i < 2600 && far.length < 900; i++) {
        const p = { x: fr() * g.width, y: fr() * g.height };
        if (!inside(p, poly)) continue;
        const shore = Math.min(...g.manhattan.map((e) => Math.hypot(e.x - p.x, e.y - p.y)));
        if (shore > 620 || shore < 170) continue;
        far.push({ x: p.x, y: p.y, w: 20 + fr() * 26, h: 6 + fr() * (shore < 330 ? 26 : 12) });
      }
    }
    const fm = new THREE.InstancedMesh(boxGeo0(), new THREE.MeshStandardMaterial({ roughness: 0.95 }), far.length);
    const greys = [0xe8e2d6, 0xdfe4e6, 0xe9dccf, 0xdad9e6];
    far.forEach((f, i) => {
      m.compose(v(f, 2), q, new THREE.Vector3(f.w, f.h, f.w * 0.7));
      fm.setMatrixAt(i, m);
      fm.setColorAt(i, col.setHex(greys[i % greys.length]));
    });
    fm.receiveShadow = true;
    group.add(fm);
  }

  /* ---------------- Central Park ---------------- */
  const uTime = { value: 0 };
  const res = g.at(40.7856, -73.9622);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: 0x8fd3f0, roughness: 0.2 }));
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(70, 44, 1);
  pool.position.copy(v(res, SLAB + 2.3));
  group.add(pool);

  const trees: Pt[] = [];
  const pxs = g.park.map((p) => p.x);
  const pys = g.park.map((p) => p.y);
  const tr = rng(4);
  for (let i = 0; i < 900 && trees.length < 420; i++) {
    const p = { x: Math.min(...pxs) + tr() * (Math.max(...pxs) - Math.min(...pxs)), y: Math.min(...pys) + tr() * (Math.max(...pys) - Math.min(...pys)) };
    if (!inside(p, g.park) || Math.hypot((p.x - res.x) / 78, (p.y - res.y) / 52) < 1) continue;
    trees.push(p);
  }
  // a few street trees along the Hudson and in Battery Park
  for (let i = 0; i < 600 && trees.length < 520; i++) {
    const p = { x: minX + tr() * (maxX - minX), y: minY + tr() * (maxY - minY) };
    if (!inside(p, g.manhattan)) continue;
    const edge = g.manhattan.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 60);
    if (edge && lineNear(p) > 30) trees.push(p);
  }
  const trunkGeo = new THREE.CylinderGeometry(1.2, 1.6, 9, 6);
  trunkGeo.translate(0, 4.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(7, 1);
  crownGeo.translate(0, 13, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
  crownMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
         float sway = sin(uTime * 1.7 + ip.x * 0.05 + ip.z * 0.03) * 0.09 * max(position.y - 6.0, 0.0);
         transformed.x += sway;
         transformed.z += sway * 0.6;`
      );
  };
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 0.9 }), trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length);
  const greens = [0x6cc77a, 0x5bbd6e, 0x7fd08a, 0x8ed99a, 0x55b56a];
  trees.forEach((p, i) => {
    const s = 0.7 + tr() * 0.7;
    m.compose(v(p, SLAB + 2), q, new THREE.Vector3(s, s * (0.9 + tr() * 0.3), s));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.setHex(greens[i % greens.length]));
  });
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  group.add(trunks, crowns);
  updaters.push((time, _, motion) => {
    if (motion) uTime.value = time;
  });

  /* ---------------- landmarks ---------------- */
  const std = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const add = (mesh: THREE.Mesh, at: THREE.Vector3) => {
    mesh.position.add(at);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, y = 0) => {
    const mm = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(2, w / 8)), mat);
    mm.position.y = y + h / 2;
    return mm;
  };

  // Empire State Building
  {
    const at = v(g.at(40.7484, -73.9857), SLAB);
    const stone = std(0xf3e2c2);
    add(box(56, 70, 44, stone), at);
    add(box(40, 70, 32, stone, 70), at);
    add(box(26, 46, 22, stone, 140), at);
    add(box(14, 22, 12, stone, 186), at);
    const top = add(new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 24, 8), std(0xe8d4ae)), at.clone().setY(at.y + 220));
    const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 30, 6), std(0x9aa0a8)), at.clone().setY(at.y + 247));
    const glow = std(0xff9ec8, { emissive: 0xff7bb0, emissiveIntensity: 0 });
    top.material = glow;
    void antenna;
    const ew = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(0xbfe2f5, { emissive: 0xffd47a, emissiveIntensity: 0, roughness: 0.3 }));
    for (const [y, w, d] of [
      [20, 57, 45],
      [45, 57, 45],
      [95, 41, 33],
      [120, 41, 33],
      [160, 27, 23],
    ]) {
      const b = ew.clone();
      b.scale.set(w, 3, d);
      b.position.copy(at).setY(at.y + y);
      group.add(b);
    }
    updaters.push((_, night) => {
      glow.emissiveIntensity = 0.3 + night * 2.2;
      (ew.material as THREE.MeshStandardMaterial).emissiveIntensity = night * 1.5;
    });
  }

  // One World Trade Center: a tapered glass prism with a spire
  {
    const at = v(g.at(40.7127, -74.0134), SLAB);
    at.x += 40;
    const glass = std(0xbfdcf2, { metalness: 0.35, roughness: 0.15, emissive: 0x9fc9ff, emissiveIntensity: 0 });
    const t = new THREE.Mesh(new THREE.CylinderGeometry(14, 30, 250, 4, 1), glass);
    t.rotation.y = Math.PI / 4;
    t.position.y = 125;
    add(t, at);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1, 2, 70, 6), std(0xdfe3e8)), at.clone().setY(at.y + 285));
    const tip = add(new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), std(0xffffff, { emissive: 0xff4d4d, emissiveIntensity: 0 })), at.clone().setY(at.y + 322));
    updaters.push((time, night) => {
      glass.emissiveIntensity = night * 0.25;
      (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = night > 0.2 ? (Math.sin(time * 3) > 0 ? 2.5 : 0.2) : 0;
    });
  }

  // Statue of Liberty on her island (moved closer so she's in frame)
  {
    const at = v(g.at(40.6948, -74.0335), -2);
    const isle = add(new THREE.Mesh(new THREE.CylinderGeometry(62, 70, 8, 32), std(0xa7dc93, { roughness: 0.9 })), at.clone());
    isle.position.y += 4;
    const fort = add(new THREE.Mesh(new THREE.CylinderGeometry(28, 30, 8, 8), std(0xe9dcc2)), at.clone().setY(at.y + 12));
    void fort;
    add(box(22, 24, 22, std(0xe2d3b5)), at.clone().setY(at.y + 16));
    const copper = std(0x86d1b8, { roughness: 0.55 });
    add(new THREE.Mesh(new THREE.ConeGeometry(9, 40, 12), copper), at.clone().setY(at.y + 60));
    add(new THREE.Mesh(new THREE.SphereGeometry(5.5, 14, 10), copper), at.clone().setY(at.y + 84));
    for (let i = 0; i < 7; i++) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 5), copper);
      ray.position.set(Math.cos((i / 6) * Math.PI) * 6, 89 + Math.sin((i / 6) * Math.PI) * 4, 0);
      ray.rotation.z = (i / 6) * Math.PI - Math.PI / 2;
      add(ray, at.clone());
    }
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 22, 8), copper);
    arm.position.set(7, 86, 0);
    arm.rotation.z = -0.25;
    add(arm, at.clone());
    const flame = add(new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), std(0xffd84d, { emissive: 0xffb300, emissiveIntensity: 0.6 })), at.clone().add(new THREE.Vector3(10, 100, 0)));
    updaters.push((time, night) => {
      (flame.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + night * 2 + Math.sin(time * 6) * 0.2;
    });
  }

  // Times Square: a knot of short towers wrapped in blinking billboards
  {
    const at = v(g.at(40.758, -73.9855), SLAB);
    const boards: THREE.MeshStandardMaterial[] = [];
    const hues = [0xff5d8f, 0x4cc9f0, 0xffd60a, 0x7b61ff, 0x06d6a0, 0xff8a3d];
    for (let i = 0; i < 6; i++) {
      const off = new THREE.Vector3(((i % 3) - 1) * 34 + 40, 0, (Math.floor(i / 3) - 0.5) * 34);
      const h = 60 + (i % 3) * 22;
      add(box(26, h, 26, std(0xeee6f6)), at.clone().add(off));
      const mat = std(hues[i], { emissive: hues[i], emissiveIntensity: 0.6, roughness: 0.4 });
      boards.push(mat);
      const bb = new THREE.Mesh(new THREE.BoxGeometry(27, 18, 27), mat);
      bb.position.copy(at).add(off).setY(at.y + h - 16);
      group.add(bb);
    }
    updaters.push((time, night) => {
      boards.forEach((b, i) => (b.emissiveIntensity = (0.5 + night * 1.6) * (0.55 + 0.45 * Math.sin(time * (2 + i * 0.4) + i))));
    });
  }

  // Columbia: Low Library (columns + dome) on its lawn, and the finish arch over the track
  {
    const at = v(g.at(40.8079, -73.9622), SLAB);
    const lawn = add(new THREE.Mesh(new RoundedBoxGeometry(190, 3, 150, 2, 1.5), std(0xa8dd92, { roughness: 0.95 })), at.clone());
    lawn.position.y += 1.5;
    const stone = std(0xf4ead6);
    add(box(120, 8, 90, stone, 3), at.clone());
    add(box(96, 34, 70, stone, 11), at.clone());
    const colGeo = new THREE.CylinderGeometry(2.4, 2.6, 30, 10);
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(colGeo, std(0xffffff));
      c.position.set(-35 + i * 10, 26, 38);
      add(c, at.clone());
    }
    add(new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 8, 24), stone), at.clone().setY(at.y + 49));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(28, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), std(0x9fd3e8, { roughness: 0.4 }));
    dome.position.y = 53;
    add(dome, at.clone());
    add(new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), std(0xfccc0a, { emissive: 0xfccc0a, emissiveIntensity: 0.5 })), at.clone().setY(at.y + 84));

    const fin = v(g.stations[STOPS_TO_COLUMBIA], 22);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(30, 3.4, 10, 32, Math.PI), std(0xfccc0a, { emissive: 0xfccc0a, emissiveIntensity: 0.35 }));
    arch.position.copy(fin);
    add(arch, new THREE.Vector3());
    arch.rotation.y = Math.PI / 2;
    // checkered flag
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 46, 6), std(0x2b2f33));
    pole.position.copy(fin).add(new THREE.Vector3(34, 23, 0));
    group.add(pole);
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 40;
    const cx = cv.getContext("2d")!;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
      cx.fillStyle = (i + j) % 2 ? "#16181a" : "#ffffff";
      cx.fillRect(i * 8, j * 8, 8, 8);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const flagGeo = new THREE.PlaneGeometry(22, 13, 10, 1);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.copy(fin).add(new THREE.Vector3(45, 40, 0));
    flag.castShadow = true;
    group.add(flag);
    const base = (flagGeo.attributes.position.array as Float32Array).slice();
    updaters.push((time, _, motion) => {
      if (!motion) return;
      const pa = flagGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < pa.length; i += 3) {
        const x = base[i] + 11; // 0 at the pole
        pa[i + 2] = Math.sin(time * 5 + x * 0.35) * 0.12 * x;
      }
      flagGeo.attributes.position.needsUpdate = true;
    });
  }

  /* ---------------- ferry ---------------- */
  {
    const ferry = new THREE.Group();
    const hull = new THREE.Mesh(new RoundedBoxGeometry(64, 10, 22, 3, 4), std(0xff8a1f));
    hull.position.y = 3;
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(40, 10, 16, 2, 3), std(0xffffff));
    cabin.position.y = 13;
    const bridge = new THREE.Mesh(new RoundedBoxGeometry(16, 7, 12, 2, 2), std(0xffffff));
    bridge.position.y = 21;
    for (const mm of [hull, cabin, bridge]) {
      mm.castShadow = true;
      ferry.add(mm);
    }
    group.add(ferry);
    const a = v(g.at(40.689, -74.03), -2);
    const b = v(g.at(40.7004, -74.0115), -2);
    a.x -= 120;
    a.z += 260;
    updaters.push((time, _, motion) => {
      const k = motion ? 0.5 + 0.5 * Math.sin(time * 0.12) : 0.5;
      ferry.position.lerpVectors(a, b, k);
      ferry.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x) + (Math.cos(time * 0.12) < 0 ? Math.PI : 0);
      ferry.position.y = -2 + Math.sin(time * 1.4) * 0.6;
    });
  }

  /* ---------------- clouds (they cast soft shadows on the city) ---------------- */
  {
    const cr = rng(9);
    const puff = new THREE.IcosahedronGeometry(1, 2);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, flatShading: true });
    const clouds: { g: THREE.Group; x: number; z: number; sp: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(cr() * 3);
      for (let k = 0; k < n; k++) {
        const s = 28 + cr() * 30;
        const p = new THREE.Mesh(puff, cloudMat);
        p.scale.set(s * 1.3, s * 0.8, s);
        p.position.set((k - n / 2) * 34 + cr() * 14, cr() * 12, cr() * 30 - 15);
        c.add(p);
      }
      const x = (cr() - 0.5) * g.width * 1.2;
      const z = (cr() - 0.5) * g.height;
      c.position.set(x, 1050 + cr() * 250, z);
      group.add(c);
      clouds.push({ g: c, x, z, sp: 6 + cr() * 8 });
    }
    updaters.push((time, night, motion) => {
      cloudMat.opacity = 0.78 - night * 0.4;
      for (const c of clouds) {
        const x = motion ? ((c.x + time * c.sp + g.width) % (g.width * 1.4)) - g.width * 0.7 : c.x;
        c.g.position.x = x;
      }
    });
  }

  return {
    group,
    update: (time, night, motion) => {
      for (const u of updaters) u(time, night, motion);
    },
  };
}

export { distToLine };
