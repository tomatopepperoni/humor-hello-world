"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AREA_LABELS,
  BROOKLYN_QUEENS,
  CENTRAL_PARK,
  LINES,
  MANHATTAN,
  NEW_JERSEY,
  ONE_STATION_U,
  SHORT_NAMES,
  TRANSFERS,
  at,
  evenStops,
  oneStationDistances,
  poly,
  type MapLine,
  type Pt,
} from "@/lib/subway-map";
import { STATIONS, STOPS_TO_COLUMBIA } from "@/lib/line1";
import { VIBES, type Vibe } from "@/lib/vibes";

export type MapRider = {
  id: string;
  name: string;
  avatarUrl: string | null;
  station: number;
  points: number;
  me: boolean;
};

export type MapMeme = { id: string; postId: string; text: string; author: string; score: number };

type Traffic = Partial<Record<Vibe, MapMeme[]>>;

/** Every 2 memes written in a voice put another train on its line (1 minimum, 5 maximum). */
const trainsFor = (memes: number) => Math.max(1, Math.min(5, Math.ceil(memes / 2)));

const LANDMARKS = new Set([0, 8, 13, 15, 20, 23]);

type Proj = {
  w: number;
  h: number;
  portrait: boolean;
  p: (pt: Pt) => [number, number];
  /** screen angle (degrees) for a heading in map units */
  angle: (a: number) => number;
};

const LANDSCAPE: Proj = {
  w: 1000,
  h: 590,
  portrait: false,
  p: ([u, v]) => [u, v],
  angle: (a) => (a * 180) / Math.PI,
};
const PORTRAIT: Proj = {
  w: 420,
  h: 1000,
  portrait: true,
  p: ([u, v]) => [v - 110, 1000 - u],
  angle: (a) => (Math.atan2(-Math.cos(a), Math.sin(a)) * 180) / Math.PI,
};

const pathD = (pts: readonly Pt[], pr: Proj) =>
  pts.map((pt, i) => `${i ? "L" : "M"}${pr.p(pt)[0].toFixed(1)},${pr.p(pt)[1].toFixed(1)}`).join(" ");

/* ---------------- trains (animated outside React for smoothness) ---------------- */

type Train = {
  key: string;
  line: MapLine;
  lineIdx: number;
  stops: number[];
  stopIdx: number;
  dir: 1 | -1;
  phase: "dwell" | "move" | "docked";
  t: number;
  dur: number;
  from: number;
  to: number;
  s: number;
  rider?: MapRider;
  /** landscape: which callout row above the river (0 = nearest) */
  lane?: number;
  /** index among riders who finish at the same stop */
  stack?: number;
  memes: MapMeme[];
};

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function initials(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}

/* ---------------- arrivals board ---------------- */

type BoardRow = { bullet: { letter: string; bg: string; fg: string }; left: string; right: string };

function ArrivalsBoard({ rows }: { rows: BoardRow[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (rows.length <= 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % rows.length), 3600);
    return () => window.clearInterval(t);
  }, [rows.length]);
  const shown = rows.length <= 2 ? rows : [rows[i % rows.length], rows[(i + 1) % rows.length]];

  return (
    <div className="rounded-xl bg-sign p-3 sm:p-4" aria-label="Arrivals board" role="status" aria-live="off">
      <div className="space-y-2">
        {shown.map((r, k) => (
          <div key={`${i}-${k}`} className="led-row flex items-center gap-3 overflow-hidden" style={{ animationDelay: `${k * 90}ms` }}>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
              style={{ background: r.bullet.bg, color: r.bullet.fg }}
            >
              {r.bullet.letter}
            </span>
            <span className="led min-w-0 flex-1 truncate">{r.left}</span>
            <span className="led shrink-0 text-right">{r.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- the map ---------------- */

export default function SubwayMap({ riders, traffic }: { riders: MapRider[]; traffic: Traffic }) {
  const [portrait, setPortrait] = useState<boolean | null>(null);
  // A line lights up while you hover/focus its legend button, and stays lit once clicked.
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const focus = hover ?? pinned;
  const [popup, setPopup] = useState<{ x: number; y: number; w: number; line: MapLine; meme: MapMeme | null } | null>(null);
  const pick = useRef(0);
  const [replayKey, setReplayKey] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const trainEls = useRef(new Map<string, SVGGElement>());
  const rippleEls = useRef<SVGCircleElement[]>([]);
  const avatarEls = useRef(new Map<string, SVGGElement>());

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const pr = portrait ? PORTRAIT : LANDSCAPE;
  const polys = useMemo(() => LINES.map((l) => poly(l.path)), []);
  const oneStops = useMemo(() => oneStationDistances(polys[0]), [polys]);
  const active = useMemo(() => riders.filter((r) => r.points > 0), [riders]);
  const me = riders.find((r) => r.me);

  // Build the train roster: meme trains per line + one train per rider on the 1.
  const trains = useMemo<Train[]>(() => {
    const list: Train[] = [];
    LINES.forEach((line, li) => {
      const stops = li === 0 ? oneStops : evenStops(polys[li]);
      const memes = traffic[line.vibe] ?? [];
      const n = trainsFor(memes.length);
      for (let k = 0; k < n; k++) {
        const stopIdx = Math.round(((k + 0.5) / n) * (stops.length - 1));
        list.push({
          key: `${line.letter}-${k}`,
          line,
          lineIdx: li,
          stops,
          stopIdx,
          dir: k % 2 ? -1 : 1,
          phase: "dwell",
          t: 0,
          dur: 0.4 + (k % 3) * 0.5,
          from: stops[stopIdx],
          to: stops[stopIdx],
          s: stops[stopIdx],
          memes: memes.filter((_, m) => m % n === k),
        });
      }
    });
    // Callout rows: greedy, so name tags of riders at nearby stops never overlap.
    const lanes: number[][] = [[], [], []];
    const laneOf = new Map<string, number>();
    [...active]
      .sort((a, b) => a.station - b.station || Number(b.me) - Number(a.me))
      .forEach((r, i) => {
        const u = ONE_STATION_U[r.station];
        const free = lanes.findIndex((row) => row.every((x) => Math.abs(x - u) >= 125));
        const lane = free === -1 ? i % lanes.length : free;
        lanes[lane].push(u);
        laneOf.set(r.id, lane);
      });
    const byStop = new Map<number, number>();
    [...active]
      .sort((a, b) => Number(b.me) - Number(a.me) || b.points - a.points)
      .forEach((r, idx) => {
        const stack = byStop.get(r.station) ?? 0;
        byStop.set(r.station, stack + 1);
        list.push({
          key: `rider-${r.id}`,
          line: LINES[0],
          lineIdx: 0,
          stops: oneStops,
          stopIdx: 0,
          dir: 1,
          phase: r.station === 0 ? "docked" : "dwell",
          t: 0,
          dur: 0.6 + idx * 0.45, // staggered departures from South Ferry
          from: 0,
          to: 0,
          s: 0,
          rider: r,
          lane: laneOf.get(r.id) ?? 0,
          stack,
          memes: [],
        });
      });
    return list;
    // replayKey resets every train to its starting point
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traffic, active, oneStops, polys, replayKey]);

  // Animation loop: writes transforms straight to the SVG, no React re-renders.
  useEffect(() => {
    if (portrait === null) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const P = portrait ? PORTRAIT : LANDSCAPE;
    // Mutable simulation state lives here, not in render data.
    const sim: Train[] = trains.map((t) => ({ ...t }));

    const place = (tr: Train) => {
      const el = trainEls.current.get(tr.key);
      if (!el) return;
      const pt = at(polys[tr.lineIdx], tr.s);
      const [x, y] = P.p([pt.u, pt.v]);
      const deg = P.angle(pt.angle) + (tr.dir === -1 ? 180 : 0);
      const body = el.querySelector<SVGGElement>("[data-body]");
      body?.setAttribute("transform", `rotate(${deg.toFixed(1)})`);
      el.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      const streak = el.querySelector("[data-streak]");
      streak?.setAttribute("opacity", tr.phase === "move" ? "1" : "0");
      if (tr.rider) {
        const av = avatarEls.current.get(tr.key);
        if (!av) return;
        const laneV = P.portrait ? 125 : 92 - (tr.lane ?? 0) * 30;
        const [lx, ly] = P.p([pt.u, laneV]);
        av.setAttribute("transform", `translate(${lx.toFixed(1)},${ly.toFixed(1)})`);
        const leader = av.querySelector("[data-leader]");
        leader?.setAttribute("x2", (x - lx).toFixed(1));
        leader?.setAttribute("y2", (y - ly).toFixed(1));
      }
    };

    let ripple = 0;
    const ripples: { el: SVGCircleElement; t: number }[] = [];
    const spawnRipple = (tr: Train) => {
      if (reduced) return;
      const el = rippleEls.current[ripple++ % rippleEls.current.length];
      if (!el) return;
      const pt = at(polys[tr.lineIdx], tr.s);
      const [x, y] = P.p([pt.u, pt.v]);
      el.setAttribute("cx", x.toFixed(1));
      el.setAttribute("cy", y.toFixed(1));
      el.setAttribute("stroke", tr.line.color);
      ripples.push({ el, t: 0 });
    };

    // Reduced motion: riders already at their stop, everything else parked.
    if (reduced) {
      for (const tr of sim) {
        if (tr.rider) tr.s = tr.stops[tr.rider.station];
        place(tr);
      }
      return;
    }

    let raf = 0;
    let last = performance.now();
    let visible = true;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (!visible) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      for (const tr of sim) {
        if (tr.phase === "docked") {
          place(tr);
          continue;
        }
        tr.t += dt;
        if (tr.phase === "dwell") {
          if (tr.t >= tr.dur) {
            // pick the next stop
            if (tr.rider) {
              if (tr.stopIdx >= tr.rider.station) {
                tr.phase = "docked";
                continue;
              }
              tr.stopIdx += 1;
            } else {
              if (tr.stopIdx + tr.dir < 0 || tr.stopIdx + tr.dir >= tr.stops.length) tr.dir = (tr.dir * -1) as 1 | -1;
              tr.stopIdx += tr.dir;
            }
            tr.from = tr.s;
            tr.to = tr.stops[tr.stopIdx];
            const dist = Math.abs(tr.to - tr.from);
            tr.dur = tr.rider ? Math.max(0.16, dist / 260) : Math.max(0.45, dist / 95);
            tr.phase = "move";
            tr.t = 0;
          }
        } else {
          const k = Math.min(1, tr.t / tr.dur);
          tr.s = tr.from + (tr.to - tr.from) * (tr.rider ? k : easeInOut(k));
          if (k >= 1) {
            tr.phase = "dwell";
            tr.t = 0;
            tr.dur = tr.rider ? 0.04 : 0.7 + Math.random() * 0.9;
            if (!tr.rider || tr.stopIdx === tr.rider.station) spawnRipple(tr);
          }
        }
        place(tr);
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.t += dt;
        const k = r.t / 0.9;
        if (k >= 1) {
          r.el.setAttribute("opacity", "0");
          ripples.splice(i, 1);
          continue;
        }
        r.el.setAttribute("r", (6 + k * 20).toFixed(1));
        r.el.setAttribute("opacity", (0.7 * (1 - k)).toFixed(2));
      }
    };
    raf = requestAnimationFrame(step);

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (wrapRef.current) io.observe(wrapRef.current);
    const onVis = () => (visible = document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [trains, portrait, polys]);

  // Close the meme popup on Escape / outside click.
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPopup(null);
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-popup],[data-train]")) setPopup(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [popup]);

  const openTrain = (tr: Train) => {
    const el = trainEls.current.get(tr.key);
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const a = el.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    const meme = tr.memes.length ? tr.memes[pick.current++ % tr.memes.length] : null;
    setPopup({ x: a.left + a.width / 2 - b.left, y: a.top - b.top, w: b.width, line: tr.line, meme });
  };

  /* ---------- board rows ---------- */
  const rows: BoardRow[] = useMemo(() => {
    const out: BoardRow[] = [];
    const one = { letter: "1", bg: "#ee352e", fg: "#fff" };
    const ranked = [...active].sort((a, b) => b.points - a.points);
    if (me && me.points > 0) {
      const left = Math.max(0, STOPS_TO_COLUMBIA - me.points);
      out.push({ bullet: one, left: `You at ${SHORT_NAMES[me.station]}`, right: left === 0 ? "Arrived" : `${left} stops to go` });
    }
    ranked.filter((r) => !r.me).slice(0, 4).forEach((r) => {
      const left = Math.max(0, STOPS_TO_COLUMBIA - r.points);
      out.push({ bullet: one, left: `${r.name} at ${SHORT_NAMES[r.station]}`, right: left === 0 ? "Arrived" : `${left} stops` });
    });
    LINES.forEach((l) => {
      const n = (traffic[l.vibe] ?? []).length;
      out.push({
        bullet: { letter: l.letter, bg: l.color, fg: l.fg },
        left: `${VIBES[l.vibe].label} to ${l.terminals[1]}`,
        right: `${trainsFor(n)} ${trainsFor(n) === 1 ? "train" : "trains"}`,
      });
    });
    if (out.length === LINES.length) out.unshift({ bullet: one, left: "Everyone at South Ferry", right: "Vote to board" });
    return out;
  }, [active, me, traffic]);

  if (portrait === null) {
    return <div className="aspect-[1000/590] w-full rounded-xl bg-[#cfe2ec]" aria-hidden="true" />;
  }

  const lineOpacity = (i: number) => (focus === null || focus === i ? 1 : 0.18);
  const replay = () => {
    setPopup(null);
    setReplayKey((k) => k + 1);
  };
  const fs = pr.portrait ? 13 : 11.5;

  return (
    <div className="space-y-3">
      <ArrivalsBoard rows={rows} />

      <div ref={wrapRef} className="relative overflow-hidden rounded-xl border bg-[#cfe2ec]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${pr.w} ${pr.h}`}
          className="block h-auto w-full select-none"
          role="img"
          aria-labelledby="subway-title subway-desc"
          key={`${pr.portrait}-${replayKey}`}
        >
          <title id="subway-title">Subway map: Race to Columbia</title>
          <desc id="subway-desc">
            The 1 line from South Ferry to 116 St–Columbia University with every rider at their stop, and the four other
            caption lines with trains for this week&apos;s memes.
          </desc>

          <defs>
            {[...LINES.map((l) => [l.letter, l.color]), ["me", "#fccc0a"]].map(([id, c]) => (
              <linearGradient key={id} id={`streak-${id}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={c} stopOpacity={0} />
                <stop offset="1" stopColor={c} stopOpacity={0.75} />
              </linearGradient>
            ))}
          </defs>

          {/* land, parks */}
          <path d={pathD(NEW_JERSEY, pr) + "Z"} fill="#e7e9e3" />
          <path d={pathD(BROOKLYN_QUEENS, pr) + "Z"} fill="#e7e9e3" />
          <path d={pathD(MANHATTAN, pr) + "Z"} fill="#f3f4f0" stroke="#d6dad3" strokeWidth={1.5} />
          <path d={pathD(CENTRAL_PARK, pr) + "Z"} fill="#cfe5c6" />
          {AREA_LABELS.map((a) => {
            const [x, y] = pr.p(a.at);
            const turn = pr.portrait && a.kind !== "land";
            if (!turn && (x < 40 || x > pr.w - 40 || y < 10 || y > pr.h - 10)) return null;
            return (
              <text
                key={a.text}
                x={x}
                y={y}
                transform={turn ? `rotate(-90 ${x} ${y})` : undefined}
                dominantBaseline={turn ? "middle" : undefined}
                textAnchor="middle"
                fontSize={a.kind === "land" ? 15 : 12}
                fontStyle={a.kind === "water" ? "italic" : "normal"}
                fontWeight={a.kind === "land" ? 600 : 500}
                fill={a.kind === "water" ? "#5d84a0" : a.kind === "park" ? "#4f8a5f" : "#9aa09a"}
                letterSpacing={a.kind === "land" ? 1.5 : 0.3}
              >
                {a.text}
              </text>
            );
          })}

          {/* lines (drawn in on load) */}
          {LINES.map((l, i) => (
            <g key={l.letter} opacity={lineOpacity(i)} style={{ transition: "opacity .25s" }}>
              <path
                d={pathD(l.path, pr)}
                fill="none"
                stroke={l.color}
                strokeWidth={i === 0 ? 10 : 8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="line-draw"
                style={{ strokeDasharray: polys[i].length, strokeDashoffset: polys[i].length, animationDelay: `${i * 160}ms` }}
              />
              {i > 0 &&
                evenStops(polys[i]).map((s, k) => {
                  const pt = at(polys[i], s);
                  const [x, y] = pr.p([pt.u, pt.v]);
                  return <circle key={k} cx={x} cy={y} r={2.6} fill="#fff" stroke="#16181a" strokeWidth={1.2} />;
                })}
            </g>
          ))}

          {/* terminal bullets */}
          {LINES.map((l, i) =>
            [0, 1].map((end) => {
              const pts = l.path;
              const a = end === 0 ? pts[0] : pts[pts.length - 1];
              const b = end === 0 ? pts[1] : pts[pts.length - 2];
              const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
              const off: Pt = [a[0] + ((a[0] - b[0]) / d) * 20, a[1] + ((a[1] - b[1]) / d) * 20];
              if (i === 0 && end === 1) return null; // Columbia gets its own marker
              const [x, y] = pr.p(off);
              return (
                <g key={`${l.letter}-${end}`} opacity={lineOpacity(i)}>
                  <circle cx={x} cy={y} r={11} fill={l.color} stroke="#fff" strokeWidth={2} />
                  <text x={x} y={y + 4.3} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={l.fg}>
                    {l.letter}
                  </text>
                </g>
              );
            })
          )}

          {/* transfers */}
          {TRANSFERS.map((t) => {
            const [x0, y0] = pr.p([t.u, t.v0]);
            const [x1, y1] = pr.p([t.u, t.v1]);
            const x = Math.min(x0, x1) - 6.5;
            const y = Math.min(y0, y1) - 6.5;
            return (
              <rect
                key={t.name}
                x={x}
                y={y}
                width={Math.abs(x1 - x0) + 13}
                height={Math.abs(y1 - y0) + 13}
                rx={6.5}
                fill="#fff"
                stroke="#16181a"
                strokeWidth={2}
              />
            );
          })}

          {/* the 1's stations + labels */}
          <g opacity={lineOpacity(0)}>
            {oneStops.map((s, i) => {
              const pt = at(polys[0], s);
              const [x, y] = pr.p([pt.u, pt.v]);
              const last = i === oneStops.length - 1;
              const land = LANDMARKS.has(i);
              const reached = active.some((r) => r.station >= i) && i > 0;
              return (
                <g key={i}>
                  {last && <circle cx={x} cy={y} r={16} fill="none" stroke="#fccc0a" strokeWidth={3} className="beacon" />}
                  <circle
                    cx={x}
                    cy={y}
                    r={last ? 9 : 4.6}
                    fill={last ? "#fccc0a" : "#fff"}
                    stroke="#16181a"
                    strokeWidth={last ? 2.5 : 1.6}
                  >
                    <title>{`${STATIONS[i]}${reached ? `, reached by ${active.filter((r) => r.station >= i).length}` : ""}`}</title>
                  </circle>
                  {last && !pr.portrait ? (
                    <g>
                      <line x1={x} y1={y + 9} x2={x} y2={y + 41} stroke="#16181a" strokeWidth={1.6} />
                      <rect x={x - 116} y={y + 41} width={140} height={40} rx={10} fill="#fccc0a" stroke="#16181a" strokeWidth={1.6} />
                      <text x={x - 46} y={y + 58} textAnchor="middle" fontSize={13} fontWeight={700} fill="#16181a">
                        116 St–Columbia
                      </text>
                      <text x={x - 46} y={y + 73} textAnchor="middle" fontSize={11} fontWeight={600} fill="#16181a">
                        University · finish
                      </text>
                    </g>
                  ) : last ? (
                    <g>
                      <rect x={x - 90} y={y - 17} width={76} height={34} rx={9} fill="#fccc0a" stroke="#16181a" strokeWidth={1.6} />
                      <text x={x - 52} y={y - 3} textAnchor="middle" fontSize={12} fontWeight={700} fill="#16181a">
                        116 St
                      </text>
                      <text x={x - 52} y={y + 11} textAnchor="middle" fontSize={11} fontWeight={600} fill="#16181a">
                        Columbia
                      </text>
                    </g>
                  ) : pr.portrait ? (
                    <text
                      x={x - 12}
                      y={y + 4.2}
                      textAnchor="end"
                      fontSize={fs}
                      fontWeight={last || land ? 700 : 500}
                      fill={last ? "#16181a" : land ? "#16181a" : "#4a4f54"}
                      stroke="#f3f4f0"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {SHORT_NAMES[i]}
                    </text>
                  ) : (
                    <text
                      x={x + 5}
                      y={y - 10}
                      transform={`rotate(-45 ${x + 5} ${y - 10})`}
                      fontSize={fs}
                      fontWeight={land ? 700 : 500}
                      fill={land ? "#16181a" : "#4a4f54"}
                      stroke="#f3f4f0"
                      strokeWidth={3}
                      strokeOpacity={0.9}
                      paintOrder="stroke"
                    >
                      {i === 12 || x + 5 + STATIONS[i].length * fs * 0.58 * 0.71 > pr.w - 8 ? SHORT_NAMES[i] : STATIONS[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* ripples (pooled) */}
          <g>
            {Array.from({ length: 18 }, (_, i) => (
              <circle
                key={i}
                ref={(el) => {
                  if (el) rippleEls.current[i] = el;
                }}
                r={0}
                fill="none"
                strokeWidth={2.5}
                opacity={0}
              />
            ))}
          </g>

          {/* trains */}
          {trains.map((tr) => {
            const r = tr.rider;
            const label = r
              ? `${r.me ? "Your train" : `${r.name}'s train`}, going to ${STATIONS[r.station]}`
              : `${tr.line.letter} train (${VIBES[tr.line.vibe].label}), ${tr.memes.length ? `carrying ${tr.memes.length} meme${tr.memes.length === 1 ? "" : "s"}` : "empty"}`;
            return (
              <g
                key={tr.key}
                data-train
                ref={(el) => {
                  if (el) trainEls.current.set(tr.key, el);
                  else trainEls.current.delete(tr.key);
                }}
                role={r ? undefined : "button"}
                tabIndex={r ? undefined : 0}
                aria-label={label}
                className={r ? "" : "cursor-pointer outline-none [&:focus-visible_[data-body]_rect]:stroke-[#0039a6]"}
                onClick={r ? undefined : () => openTrain(tr)}
                onKeyDown={
                  r
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openTrain(tr);
                        }
                      }
                }
                opacity={lineOpacity(tr.lineIdx)}
              >
                <g data-body>
                  <rect
                    data-streak
                    x={-52}
                    y={-4}
                    width={40}
                    height={8}
                    rx={4}
                    fill={`url(#streak-${r?.me ? "me" : tr.line.letter})`}
                    opacity={0}
                    style={{ transition: "opacity .3s" }}
                  />
                  <rect x={-15} y={-5.5} width={30} height={11} rx={5.5} fill={r?.me ? "#fccc0a" : tr.line.color} stroke="#16181a" strokeWidth={1.6} />
                  <rect x={-9} y={-2.2} width={4} height={4.4} rx={1} fill="#fff" opacity={0.9} />
                  <rect x={-2} y={-2.2} width={4} height={4.4} rx={1} fill="#fff" opacity={0.9} />
                  <rect x={5} y={-2.2} width={4} height={4.4} rx={1} fill="#fff" opacity={0.9} />
                  <circle cx={13} cy={0} r={1.8} fill="#fff6c4" />
                  {!r && <rect x={-24} y={-22} width={48} height={44} fill="transparent" />}
                </g>
              </g>
            );
          })}

          {/* riders: a callout per rider, joined to their train by a dashed leader */}
          {trains
            .filter((tr) => tr.rider)
            .map((tr) => {
              const r = tr.rider as MapRider;
              const hidden = pr.portrait && (tr.stack ?? 0) > 0;
              const others = active.filter((x) => x.station === r.station).length - 1;
              return (
                <g
                  key={`av-${tr.key}`}
                  ref={(el) => {
                    if (el) avatarEls.current.set(tr.key, el);
                    else avatarEls.current.delete(tr.key);
                  }}
                  display={hidden ? "none" : undefined}
                  opacity={lineOpacity(0)}
                  pointerEvents="none"
                  transform="translate(-100 -100)"
                >
                  <line data-leader x1={0} y1={0} x2={0} y2={0} stroke="#16181a" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.65} />
                  <circle r={r.me ? 12.5 : 11} fill={r.me ? "#fccc0a" : "#fff"} stroke="#16181a" strokeWidth={r.me ? 2.4 : 1.6} />
                  {r.avatarUrl ? (
                    <>
                      <clipPath id={`av-${tr.key}`}>
                        <circle r={9} />
                      </clipPath>
                      <image href={r.avatarUrl} x={-9} y={-9} width={18} height={18} clipPath={`url(#av-${tr.key})`} preserveAspectRatio="xMidYMid slice" />
                    </>
                  ) : (
                    <text y={4.3} textAnchor="middle" fontSize={12} fontWeight={700} fill="#16181a">
                      {initials(r.name)}
                    </text>
                  )}
                  {!pr.portrait && (
                    <g transform="translate(16 0)">
                      <rect x={0} y={-9} width={r.me ? 34 : Math.min(92, r.name.length * 6.6 + 12)} height={18} rx={9} fill={r.me ? "#16181a" : "#fff"} stroke="#16181a" strokeWidth={1.2} />
                      <text x={r.me ? 17 : 6} y={4} textAnchor={r.me ? "middle" : "start"} fontSize={11} fontWeight={700} fill={r.me ? "#fccc0a" : "#16181a"}>
                        {r.me ? "You" : r.name.slice(0, 12)}
                      </text>
                    </g>
                  )}
                  {pr.portrait && others > 0 && (
                    <g transform="translate(10 -10)">
                      <circle r={7.5} fill="#16181a" />
                      <text y={3.3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
                        +{others}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
        </svg>

        {/* meme popup */}
        {popup && (
          <div
            data-popup
            role="dialog"
            aria-label={`${popup.line.letter} train`}
            className="absolute z-10 w-64 -translate-x-1/2 -translate-y-full rounded-xl border bg-white p-3 text-sm shadow-lg"
            style={{ left: Math.max(136, Math.min(popup.x, popup.w - 136)), top: Math.max(popup.y - 8, 150) }}
          >
            <p className="flex items-center gap-2 text-xs font-semibold text-muted">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: popup.line.color, color: popup.line.fg }}
              >
                {popup.line.letter}
              </span>
              {VIBES[popup.line.vibe].label} line
            </p>
            {popup.meme ? (
              <>
                <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">{popup.meme.text}</p>
                <p className="mt-1 text-xs text-muted">
                  by {popup.meme.author}, {popup.meme.score >= 0 ? "+" : ""}
                  {popup.meme.score}
                </p>
                <Link href={`/p/${popup.meme.postId}#c-${popup.meme.id}`} className="mt-2 inline-block text-sm font-semibold text-bullet-blue hover:underline">
                  Open this meme
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-[15px] leading-snug text-ink">This train is running empty. Post a moment in this voice to put memes on it.</p>
                <Link href="/create" className="mt-2 inline-block text-sm font-semibold text-bullet-blue hover:underline">
                  Post a moment
                </Link>
              </>
            )}
          </div>
        )}

        {!pr.portrait && (
          <button
            type="button"
            onClick={replay}
            className="absolute bottom-3 right-3 rounded-full border border-ink/15 bg-white/95 px-3.5 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-white"
          >
            Replay the week
          </button>
        )}
      </div>

      {pr.portrait && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Tap a train to read its meme.</p>
          <button
            type="button"
            onClick={replay}
            className="shrink-0 rounded-full border bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-ink/40"
          >
            Replay the week
          </button>
        </div>
      )}

      {/* legend: hover a line to light it up */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {LINES.map((l, i) => {
          const n = (traffic[l.vibe] ?? []).length;
          return (
            <li key={l.letter}>
              <button
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setPinned((f) => (f === i ? null : i))}
                aria-pressed={pinned === i}
                className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors sm:gap-3 sm:p-3 ${
                  focus === i ? "border-ink bg-white" : "bg-card hover:border-ink/40"
                }`}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:h-8 sm:w-8"
                  style={{ background: l.color, color: l.fg }}
                >
                  {l.letter}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold sm:text-[15px]">{VIBES[l.vibe].label}</span>
                  <span className="block text-xs text-muted">
                    {trainsFor(n)} {trainsFor(n) === 1 ? "train" : "trains"} · {n} {n === 1 ? "meme" : "memes"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted">
        Every two memes written in a voice this week put another train on its line{pr.portrait ? "" : "; click one to read the meme it's carrying"}. Your
        votes, posts and upvotes move your own train up the 1. Pick a line above to light it up.
      </p>
    </div>
  );
}
