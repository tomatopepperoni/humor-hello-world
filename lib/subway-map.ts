/**
 * Schematic subway map in the Vignelli / MTA-diagram tradition: straight runs,
 * 45° turns, parallel lines at a fixed spacing. Coordinates are in "map units":
 *   u = distance up Manhattan (0 = the Battery, 1000 = upper Manhattan)
 *   v = distance across (small = west/Hudson, large = east/Brooklyn & Queens)
 * The component projects (u, v) to a landscape map on wide screens and a
 * portrait map on phones. Shared by server and client.
 */
import type { Vibe } from "@/lib/vibes";

export type Pt = readonly [u: number, v: number];

export type MapLine = {
  /** caption voice carried by this line */
  vibe: Vibe;
  letter: string;
  color: string;
  /** text colour on the bullet */
  fg: string;
  /** polyline waypoints, 0/45/90° segments only */
  path: readonly Pt[];
  /** where the line ends, for the arrivals board */
  terminals: readonly [string, string];
};

/* ---- the 1: the race line, one stop per real station ---- */
const ONE_STEP = 40;
export const ONE_STATION_U = Array.from({ length: 24 }, (_, i) => 40 + i * ONE_STEP);

export const LINES: readonly MapLine[] = [
  {
    vibe: "conductor",
    letter: "1",
    color: "#ee352e",
    fg: "#ffffff",
    path: [
      [40, 245],
      [520, 245],
      [550, 215],
      [960, 215],
    ],
    terminals: ["South Ferry", "116 St–Columbia"],
  },
  {
    vibe: "showtime",
    letter: "A",
    color: "#0039a6",
    fg: "#ffffff",
    path: [
      [960, 240],
      [640, 240],
      [610, 270],
      [150, 270],
      [100, 320],
      [100, 450],
      [60, 490],
      [40, 490],
    ],
    terminals: ["Inwood", "Far Rockaway"],
  },
  {
    vibe: "overheard",
    letter: "L",
    color: "#a7a9ac",
    fg: "#16181a",
    path: [
      [360, 270],
      [360, 345],
      [315, 390],
      [215, 390],
      [180, 425],
      [180, 490],
    ],
    terminals: ["8 Av", "Canarsie"],
  },
  {
    vibe: "roast",
    letter: "R",
    color: "#fccc0a",
    fg: "#16181a",
    path: [
      [880, 470],
      [700, 470],
      [630, 400],
      [630, 330],
      [600, 300],
      [90, 300],
      [50, 340],
      [50, 495],
    ],
    terminals: ["Forest Hills", "Bay Ridge"],
  },
  {
    vibe: "service-alert",
    letter: "G",
    color: "#6cbe45",
    fg: "#16181a",
    path: [
      [700, 430],
      [300, 430],
      [255, 475],
      [120, 475],
      [100, 495],
    ],
    terminals: ["Court Sq", "Church Av"],
  },
];

/** Transfer stations drawn as white pills spanning the lines that meet there. */
export const TRANSFERS: readonly { name: string; u: number; v0: number; v1: number }[] = [
  { name: "Times Sq", u: 560, v0: 215, v1: 300 },
  { name: "14 St", u: 360, v0: 245, v1: 300 },
  { name: "59 St", u: 640, v0: 215, v1: 240 },
];

/* ---- geography ---- */
export const MANHATTAN: readonly Pt[] = [
  [22, 262],
  [45, 205],
  [140, 190],
  [300, 180],
  [520, 172],
  [760, 162],
  [1000, 158],
  [1000, 290],
  [900, 305],
  [760, 335],
  [640, 350],
  [480, 352],
  [330, 352],
  [190, 340],
  [90, 325],
  [40, 300],
];

export const NEW_JERSEY: readonly Pt[] = [
  [0, 0],
  [1000, 0],
  [1000, 118],
  [600, 128],
  [300, 135],
  [0, 150],
];

export const BROOKLYN_QUEENS: readonly Pt[] = [
  [0, 395],
  [180, 388],
  [360, 382],
  [540, 372],
  [660, 392],
  [820, 372],
  [1000, 360],
  [1000, 640],
  [0, 640],
];

export const CENTRAL_PARK: readonly Pt[] = [
  [650, 252],
  [835, 252],
  [835, 292],
  [650, 292],
];

export const AREA_LABELS: readonly { text: string; at: Pt; kind: "water" | "land" | "park" }[] = [
  { text: "Hudson River", at: [850, 145], kind: "water" },
  { text: "East River", at: [420, 368], kind: "water" },
  { text: "Brooklyn", at: [300, 560], kind: "land" },
  { text: "Queens", at: [820, 545], kind: "land" },
  { text: "Central Park", at: [742, 275], kind: "park" },
];

/** Short names for the 1's stations on narrow (portrait) maps. */
export const SHORT_NAMES = [
  "South Ferry",
  "Rector",
  "WTC",
  "Chambers",
  "Franklin",
  "Canal",
  "Houston",
  "Christopher",
  "14 St",
  "18 St",
  "23 St",
  "28 St",
  "34 St",
  "Times Sq",
  "50 St",
  "59 St",
  "66 St",
  "72 St",
  "79 St",
  "86 St",
  "96 St",
  "103 St",
  "110 St",
  "116 St–Columbia",
];

/* ---- polyline helpers (no DOM needed) ---- */
export type Poly = { pts: readonly Pt[]; cum: number[]; length: number };

export function poly(pts: readonly Pt[]): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const [u0, v0] = pts[i - 1];
    const [u1, v1] = pts[i];
    cum.push(cum[i - 1] + Math.hypot(u1 - u0, v1 - v0));
  }
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Point and heading (radians, in map units) at distance s along the line. */
export function at(p: Poly, s: number): { u: number; v: number; angle: number } {
  const d = Math.max(0, Math.min(p.length, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const [u0, v0] = p.pts[i - 1];
  const [u1, v1] = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const t = (d - p.cum[i - 1]) / seg;
  return { u: u0 + (u1 - u0) * t, v: v0 + (v1 - v0) * t, angle: Math.atan2(v1 - v0, u1 - u0) };
}

/** Distance along a line to the point closest to (u, v) — used to place the 1's stations. */
export function distanceTo(p: Poly, u: number, v: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < p.pts.length; i++) {
    const [u0, v0] = p.pts[i - 1];
    const [u1, v1] = p.pts[i];
    const du = u1 - u0;
    const dv = v1 - v0;
    const len2 = du * du + dv * dv || 1;
    const t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / len2));
    const pu = u0 + du * t;
    const pv = v0 + dv * t;
    const dist = Math.hypot(pu - u, pv - v);
    if (dist < bestD) {
      bestD = dist;
      best = p.cum[i - 1] + Math.sqrt(len2) * t;
    }
  }
  return best;
}

/** The 1's stations as distances along its path (by their u position). */
export function oneStationDistances(one: Poly): number[] {
  return ONE_STATION_U.map((u) => {
    // find the v of the path at this u
    for (let i = 1; i < one.pts.length; i++) {
      const [u0, v0] = one.pts[i - 1];
      const [u1, v1] = one.pts[i];
      if (u >= Math.min(u0, u1) && u <= Math.max(u0, u1)) {
        const t = u1 === u0 ? 0 : (u - u0) / (u1 - u0);
        return distanceTo(one, u, v0 + (v1 - v0) * t);
      }
    }
    return distanceTo(one, u, one.pts[0][1]);
  });
}

/** Evenly spaced stops for the other lines (every ~70 units, ends included). */
export function evenStops(p: Poly, every = 70): number[] {
  const n = Math.max(2, Math.round(p.length / every));
  return Array.from({ length: n + 1 }, (_, i) => (p.length * i) / n);
}
