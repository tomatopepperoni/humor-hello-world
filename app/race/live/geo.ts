import { LINE_1 } from "@/lib/line1";

/**
 * Geography for the live map. Lat/lng are turned into flat metres around
 * midtown, then turned 29° so Manhattan's street grid runs straight up and
 * across the screen (uptown = up), then scaled to world pixels.
 */

export type Pt = { x: number; y: number };

const LAT0 = 40.755;
const LNG0 = -73.985;
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const ROT = (29 * Math.PI) / 180;
export const SCALE = 0.3; // world px per metre

/** World is padded so the harbour and both rivers show around the island. */
const PAD_X = 900;
const PAD_TOP = 520;
const PAD_BOTTOM = 760;

function raw(lat: number, lng: number): Pt {
  const e = (lng - LNG0) * M_PER_DEG_LNG;
  const n = (lat - LAT0) * M_PER_DEG_LAT;
  const x = e * Math.cos(ROT) - n * Math.sin(ROT);
  const y = e * Math.sin(ROT) + n * Math.cos(ROT);
  return { x: x * SCALE, y: -y * SCALE };
}

// Rough shoreline of Manhattan, Battery → up the Hudson → down the East River.
const MANHATTAN_LL: [number, number][] = [
  [40.7003, -74.0153], [40.7036, -74.0186], [40.7095, -74.0176], [40.7172, -74.0139], [40.7262, -74.0118],
  [40.7368, -74.0107], [40.7457, -74.0094], [40.7531, -74.0066], [40.7609, -74.0021], [40.7702, -73.9947],
  [40.7801, -73.9879], [40.7896, -73.9815], [40.7993, -73.9738], [40.8085, -73.9667], [40.8172, -73.9606],
  [40.8255, -73.9541], [40.8255, -73.9308], [40.8131, -73.9295], [40.8016, -73.9283], [40.7935, -73.9322],
  [40.7852, -73.9408], [40.7761, -73.9425], [40.7684, -73.9509], [40.7586, -73.9595], [40.7489, -73.9677],
  [40.7395, -73.9728], [40.7289, -73.9719], [40.7189, -73.9737], [40.7105, -73.9789], [40.7076, -73.9947],
  [40.7041, -74.0057], [40.7012, -74.0118],
];
// New Jersey and Brooklyn/Queens shores, closed off far outside the view.
const NJ_LL: [number, number][] = [
  [40.69, -74.16], [40.69, -74.039], [40.7048, -74.0329], [40.7196, -74.0335], [40.7349, -74.0279],
  [40.7505, -74.0223], [40.7654, -74.0158], [40.7825, -74.0031], [40.7986, -73.9895], [40.8141, -73.9768],
  [40.83, -73.9632], [40.84, -73.9566], [40.84, -74.16],
];
const BK_QNS_LL: [number, number][] = [
  [40.69, -73.85], [40.69, -73.9933], [40.6961, -73.9998], [40.7028, -73.9951], [40.7049, -73.9843],
  [40.7105, -73.9691], [40.7207, -73.9611], [40.7338, -73.9598], [40.7437, -73.9581], [40.7535, -73.9483],
  [40.7618, -73.9408], [40.7716, -73.9346], [40.7799, -73.9268], [40.7891, -73.9159], [40.80, -73.905],
  [40.84, -73.9], [40.84, -73.85],
];
const CENTRAL_PARK_LL: [number, number][] = [
  [40.7681, -73.9819], [40.7644, -73.973], [40.7968, -73.9493], [40.8006, -73.958],
];

export type Geo = {
  width: number;
  height: number;
  manhattan: Pt[];
  nj: Pt[];
  bk: Pt[];
  park: Pt[];
  stations: Pt[];
  /** The 1 line as a smooth polyline, with cumulative length per point. */
  line: { pts: Pt[]; cum: number[]; length: number };
  /** distance along the line of every station */
  stationS: number[];
  /** world position of a lat/lng */
  at: (lat: number, lng: number) => Pt;
};

function catmullRom(points: Pt[], perSeg = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

let cached: Geo | null = null;

export function geo(): Geo {
  if (cached) return cached;
  const isl = MANHATTAN_LL.map(([a, b]) => raw(a, b));
  const minX = Math.min(...isl.map((p) => p.x)) - PAD_X;
  const maxX = Math.max(...isl.map((p) => p.x)) + PAD_X;
  const st = LINE_1.map((s) => raw(s.lat, s.lng));
  const minY = Math.min(...st.map((p) => p.y)) - PAD_TOP;
  const maxY = Math.max(...st.map((p) => p.y)) + PAD_BOTTOM;
  const shift = (p: Pt): Pt => ({ x: p.x - minX, y: p.y - minY });
  const at = (lat: number, lng: number) => shift(raw(lat, lng));

  const stations = st.map(shift);
  const pts = catmullRom(stations);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  // station k sits at sample k*perSeg
  const stationS = stations.map((_, k) => cum[k * 16]);

  cached = {
    width: maxX - minX,
    height: maxY - minY,
    manhattan: isl.map(shift),
    nj: NJ_LL.map(([a, b]) => at(a, b)),
    bk: BK_QNS_LL.map(([a, b]) => at(a, b)),
    park: CENTRAL_PARK_LL.map(([a, b]) => at(a, b)),
    stations,
    line: { pts, cum, length: cum[cum.length - 1] },
    stationS,
    at,
  };
  return cached;
}

/** Point and heading (radians) at distance s along the line. */
export function along(g: Geo, s: number): { x: number; y: number; angle: number } {
  const { pts, cum, length } = g.line;
  const d = Math.max(0, Math.min(s, length));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / seg;
  const a = pts[lo];
  const b = pts[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function inside(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Small seeded random, so the city looks the same on every visit. */
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
