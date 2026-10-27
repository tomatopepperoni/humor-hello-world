"use client";

import { useEffect, useMemo, useRef } from "react";
import { STATIONS, STOPS_TO_COLUMBIA } from "@/lib/line1";

/**
 * Race map, take two. The old one drew all of Manhattan with six lines and
 * dozens of trains; feedback was that it was too much. This one is just the 1
 * train as a toy track that snakes uptown, a handful of landmark stops, the
 * other riders as little avatar pins, and one cute train (you) that rides from
 * South Ferry to your stop, waits there, and does it again.
 */

export type MapRider = {
  id: string;
  name: string;
  avatarUrl: string | null;
  station: number;
  points: number;
  me: boolean;
};

const LANDMARKS: Record<number, { label: string; icon: string }> = {
  0: { label: "South Ferry", icon: "⛴️" },
  8: { label: "14 St", icon: "🍕" },
  13: { label: "Times Sq", icon: "🎭" },
  15: { label: "Columbus Cir", icon: "🌳" },
  20: { label: "96 St", icon: "🥯" },
  [STOPS_TO_COLUMBIA]: { label: "Columbia", icon: "🎓" },
};

type Layout = { key: string; w: number; h: number; rows: number; x0: number; x1: number; yBottom: number; r: number };

// Wide screens: three rows. Phones: five shorter rows, so labels stay readable.
const WIDE: Layout = { key: "wide", w: 960, h: 430, rows: 3, x0: 96, x1: 864, yBottom: 338, r: 62 };
const TALL: Layout = { key: "tall", w: 400, h: 610, rows: 5, x0: 68, x1: 332, yBottom: 508, r: 50 };

type P = { x: number; y: number; dx: number; dy: number; onArc: boolean };

/** The track is straight rows joined by half circles; positions are worked out exactly, no DOM measuring. */
function geometry(L: Layout) {
  const len = L.x1 - L.x0;
  const arc = Math.PI * L.r;
  const total = L.rows * len + (L.rows - 1) * arc;

  const at = (sIn: number): P => {
    let s = Math.max(0, Math.min(sIn, total));
    for (let i = 0; i < L.rows; i++) {
      const y = L.yBottom - i * 2 * L.r;
      const right = i % 2 === 0;
      if (s <= len || i === L.rows - 1) {
        const d = Math.min(s, len);
        return { x: right ? L.x0 + d : L.x1 - d, y, dx: right ? 1 : -1, dy: 0, onArc: false };
      }
      s -= len;
      if (s <= arc) {
        const th = s / L.r;
        const side = right ? 1 : -1;
        const cx = right ? L.x1 : L.x0;
        return {
          x: cx + side * L.r * Math.sin(th),
          y: y - L.r + L.r * Math.cos(th),
          dx: side * Math.cos(th),
          dy: -Math.sin(th),
          // only the middle of a bend counts: there the label goes inside the curve
          onArc: th > 0.9 && th < Math.PI - 0.9,
        };
      }
      s -= arc;
    }
    return { x: L.x1, y: L.yBottom, dx: 1, dy: 0, onArc: false };
  };

  let d = `M ${L.x0} ${L.yBottom}`;
  for (let i = 0; i < L.rows; i++) {
    const y = L.yBottom - i * 2 * L.r;
    const right = i % 2 === 0;
    const xEnd = right ? L.x1 : L.x0;
    d += ` H ${xEnd}`;
    if (i < L.rows - 1) d += ` A ${L.r} ${L.r} 0 0 ${right ? 0 : 1} ${xEnd} ${y - 2 * L.r}`;
  }

  const stationS = STATIONS.map((_, k) => (k / STOPS_TO_COLUMBIA) * total);
  return { total, at, d, stationS };
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

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

/** Rounded, smiling 1 train, drawn facing right with its centre on the track. */
function Train() {
  return (
    <g className="cm-bob">
      <rect x={-30} y={-27} width={10} height={5} rx={2} fill="#fccc0a" stroke="#16181a" strokeWidth={1.5} />
      <rect x={-34} y={-23} width={66} height={30} rx={13} fill="#ee352e" stroke="#16181a" strokeWidth={2.5} />
      <rect x={-27} y={-17} width={13} height={11} rx={3.5} fill="#dff3ff" stroke="#16181a" strokeWidth={1.6} />
      <rect x={-10} y={-17} width={13} height={11} rx={3.5} fill="#dff3ff" stroke="#16181a" strokeWidth={1.6} />
      {/* face */}
      <circle cx={13} cy={-11} r={2.4} fill="#16181a" />
      <circle cx={22} cy={-11} r={2.4} fill="#16181a" />
      <circle cx={13.8} cy={-11.8} r={0.8} fill="#fff" />
      <circle cx={22.8} cy={-11.8} r={0.8} fill="#fff" />
      <path d="M 14 -5 Q 17.5 -1.5 21 -5" fill="none" stroke="#16181a" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={10} cy={-5} r={2.3} fill="#ff9aa2" />
      <circle cx={25} cy={-5} r={2.3} fill="#ff9aa2" />
      <circle cx={-21} cy={2} r={4.2} fill="#fff" stroke="#16181a" strokeWidth={1.2} />
      <text x={-21} y={3.9} textAnchor="middle" fontSize={6.5} fontWeight={800} fill="#ee352e">
        1
      </text>
      {[-20, 18].map((x) => (
        <g key={x} transform={`translate(${x} 9)`}>
          <g className="cm-wheel">
            <circle r={5.2} fill="#16181a" />
            <path d="M -3.4 0 H 3.4 M 0 -3.4 V 3.4" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" />
          </g>
        </g>
      ))}
    </g>
  );
}

function Pin({ r, layoutKey }: { r: MapRider; layoutKey: string }) {
  const clip = `cm-${layoutKey}-${r.id}`;
  return (
    <g>
      <title>{`${r.name}: ${r.points} ${r.points === 1 ? "stop" : "stops"}`}</title>
      <path d="M -5 9 L 0 16 L 5 9 Z" fill="#fff" stroke="#16181a" strokeWidth={1.5} strokeLinejoin="round" />
      <circle r={13} fill="#fff" stroke="#16181a" strokeWidth={1.8} />
      {r.avatarUrl ? (
        <>
          <clipPath id={clip}>
            <circle r={10.5} />
          </clipPath>
          <image href={r.avatarUrl} x={-10.5} y={-10.5} width={21} height={21} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : (
        <>
          <circle r={10.5} fill="#e9e3ff" />
          <text y={3.6} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#16181a">
            {initials(r.name)}
          </text>
        </>
      )}
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-1.5} y={2} width={3} height={7} rx={1} fill="#8a5a33" />
      <circle r={7} fill="#5cc474" />
      <circle cx={-2.5} cy={-2} r={2.2} fill="#8ee0a0" />
    </g>
  );
}

function Cloud({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="cm-cloud" style={{ animationDelay: `${delay}s` }}>
        <ellipse cx={0} cy={0} rx={22} ry={11} fill="#fff" />
        <ellipse cx={-12} cy={2} rx={13} ry={9} fill="#fff" />
        <ellipse cx={13} cy={3} rx={12} ry={8} fill="#fff" />
        <ellipse cx={2} cy={-7} rx={12} ry={9} fill="#fff" />
      </g>
    </g>
  );
}

function MapSvg({ L, riders, className }: { L: Layout; riders: MapRider[]; className: string }) {
  const g = useMemo(() => geometry(L), [L]);
  const trainRef = useRef<SVGGElement>(null);
  const bubbleRef = useRef<SVGGElement>(null);
  const bubbleText = useRef<SVGTextElement>(null);
  const bubbleBox = useRef<SVGRectElement>(null);

  const me = riders.find((r) => r.me);
  const target = me ? me.station : STOPS_TO_COLUMBIA;
  const message = me
    ? me.station === 0
      ? "Vote to leave the station!"
      : me.station >= STOPS_TO_COLUMBIA
        ? "You made it to Columbia!"
        : `You're at ${STATIONS[me.station]}!`
    : "Next stop: Columbia!";

  // Other riders as pins (top 8 by stops), grouped per station so they sit side by side.
  const pins = useMemo(() => {
    const others = riders.filter((r) => !r.me && r.points > 0).sort((a, b) => b.points - a.points).slice(0, 8);
    const byStation = new Map<number, MapRider[]>();
    for (const r of others) byStation.set(r.station, [...(byStation.get(r.station) ?? []), r]);
    const out: { r: MapRider; x: number; y: number }[] = [];
    byStation.forEach((list, k) => {
      const p = g.at(g.stationS[k]);
      // On a bend, pins go inside the curve so they never fall off the edge.
      const inward = p.onArc ? (p.x > L.w / 2 ? -1 : 1) : 0;
      list.forEach((r, j) => {
        const off = (j - (list.length - 1) / 2) * 24;
        out.push(inward ? { r, x: p.x + inward * 34, y: p.y + off } : { r, x: p.x + off, y: p.y - 32 });
      });
    });
    return out;
  }, [riders, g, L.w]);

  useEffect(() => {
    const train = trainRef.current;
    const bubble = bubbleRef.current;
    if (!train || !bubble) return;

    // Size the speech bubble to its text once.
    const t = bubbleText.current;
    const box = bubbleBox.current;
    if (t && box) {
      const w = t.getComputedTextLength() + 22;
      box.setAttribute("x", String(-w / 2));
      box.setAttribute("width", String(w));
    }

    const sEnd = g.stationS[target];
    const place = (s: number, moving: boolean) => {
      const p = g.at(s);
      let ang = (Math.atan2(p.dy, p.dx) * 180) / Math.PI;
      // Never upside down: on rows going left, mirror instead of rotating.
      const flip = p.dx < -0.001;
      if (flip) ang -= 180;
      train.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${ang}) scale(${flip ? -1 : 1} 1)`);
      train.dataset.moving = moving ? "true" : "false";
      // Keep the bubble inside the map.
      const bx = Math.max(110, Math.min(L.w - 110, p.x));
      bubble.setAttribute("transform", `translate(${bx} ${p.y - 46})`);
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      place(sEnd, false);
      bubble.style.opacity = "1";
      return;
    }

    const ride = Math.max(1.8, 0.32 * target); // seconds
    const wait = 2.8;
    const cycle = ride + wait + 0.5;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const el = ((now - t0) / 1000) % cycle;
      if (el < ride) {
        place(ease(el / ride) * sEnd, true);
        bubble.style.opacity = "0";
        train.style.opacity = "1";
      } else if (el < ride + wait) {
        place(sEnd, false);
        bubble.style.opacity = "1";
      } else {
        // short fade, then back to South Ferry
        const f = (el - ride - wait) / 0.5;
        train.style.opacity = String(1 - f);
        bubble.style.opacity = String(1 - f);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [g, target, L.w]);

  // Trees in the gap between rows, next to the Central Park stops.
  const trees = [16, 17, 18, 19].flatMap((k, i) => {
    const p = g.at(g.stationS[k]);
    if (p.onArc) return [];
    const big = L.key === "wide" ? 1.35 : 1;
    return [{ x: p.x + (i % 2 ? 14 : -12), y: p.y + L.r - 2, s: (i % 2 ? 0.85 : 1) * big }];
  });
  const sf = g.at(0);
  const end = g.at(g.total);

  return (
    <svg viewBox={`0 0 ${L.w} ${L.h}`} className={className} role="img" aria-label="The 1 train from South Ferry to Columbia, with this week's riders">
      <rect width={L.w} height={L.h} rx={24} fill="#fff6df" />
      {/* sky decorations */}
      <Cloud x={L.w * 0.2} y={34} s={0.9} />
      <Cloud x={L.w * 0.62} y={28} s={0.7} delay={2} />
      <g transform={`translate(${end.x + (L.key === "wide" ? 52 : 26)} ${end.y - (L.key === "wide" ? 44 : 58)})`}>
        <circle r={16} fill="#ffd84d" />
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            x1={0}
            y1={-21}
            x2={0}
            y2={-26}
            stroke="#ffc400"
            strokeWidth={3}
            strokeLinecap="round"
            transform={`rotate(${i * 45})`}
          />
        ))}
      </g>

      {/* the harbour at the bottom */}
      <path d={`M 0 ${L.h - 34} q 20 -10 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 Q 262 ${L.h - 30} 262 ${L.h} H 0 Z`} fill="#bfe6ff" />
      <path
        d={`M 18 ${L.h - 16} q 8 -5 16 0 M 62 ${L.h - 20} q 8 -5 16 0 M 120 ${L.h - 14} q 8 -5 16 0 M 170 ${L.h - 21} q 8 -5 16 0`}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {trees.map((t, i) => (
        <Tree key={i} {...t} />
      ))}

      {/* the track */}
      <path d={g.d} fill="none" stroke="#ffd2cf" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
      <path d={g.d} fill="none" stroke="#ee352e" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <path d={g.d} fill="none" stroke="#fff" strokeOpacity={0.75} strokeWidth={2} strokeDasharray="1 11" strokeLinecap="round" />

      {/* stations */}
      {STATIONS.map((name, k) => {
        const p = g.at(g.stationS[k]);
        const lm = LANDMARKS[k];
        if (!lm) {
          return (
            <circle key={k} cx={p.x} cy={p.y} r={4.5} fill="#fff" stroke="#16181a" strokeWidth={2}>
              <title>{name}</title>
            </circle>
          );
        }
        // Labels sit under the track; on a bend they go inside the curve, where there's room.
        const side = p.onArc ? (p.x > L.w / 2 ? -1 : 1) : 0;
        const lx = side ? p.x + side * 22 : Math.max(50, Math.min(L.w - 50, p.x));
        const ly = side ? p.y + 5 : p.y + 31;
        const anchor = side === -1 ? "end" : side === 1 ? "start" : "middle";
        return (
          <g key={k}>
            <title>{name}</title>
            <circle cx={p.x} cy={p.y} r={14} fill="#fff" stroke="#16181a" strokeWidth={2.2} />
            <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={14}>
              {lm.icon}
            </text>
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              fontSize={L.key === "wide" ? 13 : 12.5}
              fontWeight={700}
              fill="#16181a"
              stroke="#fff6df"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {lm.label}
            </text>
          </g>
        );
      })}

      {/* start and finish */}
      <g transform={`translate(${end.x + 6} ${end.y - 44})`}>
        <line x1={0} y1={0} x2={0} y2={28} stroke="#16181a" strokeWidth={2} strokeLinecap="round" />
        <path d="M 0 0 h 16 v 10 h -16 Z" fill="#fff" stroke="#16181a" strokeWidth={1.5} />
        <path d="M 0 0 h 4 v 5 h -4 Z M 8 0 h 4 v 5 h -4 Z M 4 5 h 4 v 5 h -4 Z M 12 5 h 4 v 5 h -4 Z" fill="#16181a" />
      </g>

      {/* other riders */}
      {pins.map(({ r, x, y }) => (
        <g key={r.id} transform={`translate(${x} ${y})`}>
          <Pin r={r} layoutKey={L.key} />
        </g>
      ))}

      {/* you */}
      <g ref={trainRef} className="cm-train" transform={`translate(${sf.x} ${sf.y})`}>
        <Train />
      </g>
      <g ref={bubbleRef} style={{ opacity: 0, transition: "opacity 200ms" }} pointerEvents="none">
        <rect ref={bubbleBox} x={-80} y={-15} width={160} height={26} rx={13} fill="#16181a" />
        <path d="M -6 10 L 0 17 L 6 10 Z" fill="#16181a" />
        <text ref={bubbleText} y={3.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#fff">
          {message}
        </text>
      </g>
    </svg>
  );
}

export default function SubwayMap({ riders }: { riders: MapRider[] }) {
  const me = riders.find((r) => r.me);
  return (
    <div className="overflow-hidden rounded-[24px] border-2 border-ink/10 bg-[#fff6df]">
      <style>{`
        .cm-wheel { transform-box: fill-box; transform-origin: center; animation: cm-spin .45s linear infinite; }
        .cm-train[data-moving="false"] .cm-wheel { animation-play-state: paused; }
        .cm-bob { animation: cm-bob .5s ease-in-out infinite alternate; }
        .cm-train[data-moving="false"] .cm-bob { animation-duration: 1.4s; }
        .cm-cloud { animation: cm-drift 9s ease-in-out infinite alternate; }
        @keyframes cm-spin { to { transform: rotate(360deg); } }
        @keyframes cm-bob { from { transform: translateY(0); } to { transform: translateY(-1.6px); } }
        @keyframes cm-drift { from { transform: translateX(-14px); } to { transform: translateX(18px); } }
        @media (prefers-reduced-motion: reduce) { .cm-wheel, .cm-bob, .cm-cloud { animation: none; } }
      `}</style>
      <MapSvg L={WIDE} riders={riders} className="hidden h-auto w-full sm:block" />
      <MapSvg L={TALL} riders={riders} className="block h-auto w-full sm:hidden" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t-2 border-ink/5 bg-white/60 px-4 py-2.5 text-[13px] text-ink/80">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-md border-2 border-ink bg-bullet-red" />
          {me ? "You" : "The 1 train"}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-full border-2 border-ink bg-[#e9e3ff]" />
          Other riders
        </span>
        <span>Every vote = 1 stop uptown</span>
      </div>
    </div>
  );
}
