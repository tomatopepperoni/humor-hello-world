"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { announcementFor } from "@/lib/announce";
import { STATIONS, STOPS_TO_COLUMBIA } from "@/lib/line1";
import { LiveScene, type LiveRider } from "./scene";
import type { VoiceLine } from "../voice-lines";
import Fallback2D from "./Fallback2D";

/**
 * Full-screen live map. The WebGL scene (scene.ts) draws and animates; this
 * component owns the data (polling, or a simulation in demo mode) and the
 * buttons, cards and keyboard shortcuts on top of it.
 */

type Selection = { kind: "rider"; id: string } | { kind: "station"; k: number } | null;

const POLL_MS = 20_000;

/** Station labels and rider bubbles are HTML laid over the 3D scene (CSS2DRenderer). */
const LABEL_CSS = `
.lm-label { pointer-events: auto; cursor: pointer; font: inherit; white-space: nowrap; border: 0; background: none; padding: 0; color: #16181a; }
.lm-major { font-size: 14px; font-weight: 800; background: #fff; border: 2.5px solid #16181a; border-radius: 999px; padding: 3px 10px; box-shadow: 0 3px 0 rgba(22,24,26,.18); }
.lm-minor { font-size: 12px; font-weight: 700; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }
.lm-major:hover, .lm-minor:hover { transform: translateY(-1px); }
.lm-bubble { pointer-events: auto; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: transform .15s; }
.lm-bubble:hover, .lm-selected { transform: scale(1.12); }
.lm-face { position: relative; width: 34px; height: 34px; border-radius: 999px; background: #e9e3ff; border: 3px solid #fff; outline: 2.5px solid #16181a; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,.18); }
.lm-face img { width: 100%; height: 100%; object-fit: cover; }
.lm-me .lm-face { width: 42px; height: 42px; background: #fff3b0; border-color: #fccc0a; }
.lm-name { font-size: 12px; font-weight: 800; color: #16181a; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }
.lm-hint { font-size: 12px; font-weight: 800; color: #fff; background: #16181a; border-radius: 999px; padding: 3px 10px; margin-bottom: 2px; animation: lm-pulse 1.6s ease-in-out infinite; }
.lm-compact .lm-face { width: 22px; height: 22px; font-size: 9px; border-width: 2px; }
.lm-selected { transform: none; z-index: 10; }
.lm-selected .lm-face { width: 76px; height: 76px; font-size: 24px; border-width: 4px; border-color: #fccc0a; outline-width: 3px; box-shadow: 0 8px 22px rgba(0,0,0,.3); }
.lm-selected .lm-name { font-size: 15px; }
.lm-face { transition: width .2s ease, height .2s ease; }
.lm-compact .lm-name { display: none; }
@keyframes lm-pulse { 50% { transform: scale(1.06); } }
.lm-pop { font-size: 20px; font-weight: 900; color: #00933c; text-shadow: 0 0 4px #fff, 0 0 4px #fff, 0 0 6px #fff; animation: lm-rise 1.4s ease-out forwards; pointer-events: none; }
@keyframes lm-rise { from { opacity: 0; translate: 0 8px; } 15% { opacity: 1; } to { opacity: 0; translate: 0 -34px; } }
@media (prefers-reduced-motion: reduce) { .lm-hint { animation: none; } }
`;

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

function Face({ r, size = 40 }: { r: LiveRider; size?: number }) {
  if (r.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r.avatarUrl} alt="" width={size} height={size} className="shrink-0 rounded-full border-2 border-ink object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 border-ink text-sm font-extrabold ${r.me ? "bg-[#fff3b0]" : "bg-[#e9e3ff]"}`}
    >
      {initials(r.name)}
    </span>
  );
}

function Btn({ onClick, children, label, active = false }: { onClick: () => void; children: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-10 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
        active ? "bg-metro text-ink" : "bg-white text-ink hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

const I = {
  me: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  ),
  line: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  ),
  rotateLeft: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 1 1 3 6.2" />
      <path d="M4 6v6h6" />
    </svg>
  ),
  rotateRight: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 0-3 6.2" />
      <path d="M20 6v6h-6" />
    </svg>
  ),
  tilt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17 12 7l9 10" />
      <path d="M7 17h10" />
    </svg>
  ),
  replay: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  minus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  ),
  soundOn: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  ),
  soundOff: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m17 9 5 6M22 9l-5 6" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
};

/** Demo mode: a dozen made-up riders, so the map can be tried without data. */
export function demoRiders(withMe = true): LiveRider[] {
  const names = ["Alex Park", "Timothy Chen", "Jonah Weiss", "Chloe Lee", "Priya Shah", "Diego Ramos", "Sofia Rossi", "Ken Ito", "Maya Cohen", "Leo Martin", "Ava Brooks", "Noah Kim"];
  const pts = [21, 17, 14, 13, 11, 9, 8, 6, 5, 3, 2, 1];
  const list = names.map((name, i) => ({ id: `demo-${i}`, name, avatarUrl: null, points: pts[i], station: Math.min(pts[i], STOPS_TO_COLUMBIA), me: false }));
  if (withMe) list.push({ id: "demo-me", name: "You", avatarUrl: null, points: 12, station: 12, me: true });
  return list;
}

export default function LiveMap({
  initialRiders,
  demo = false,
  pollUrl,
  onClose,
  transitionName,
  voices = [],
}: {
  initialRiders: LiveRider[];
  demo?: boolean;
  pollUrl?: string;
  onClose?: () => void;
  /** view-transition-name, so the race card can grow into the map */
  transitionName?: string;
  /** the five subway voices and how they're doing this week */
  voices?: VoiceLine[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LiveScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [riders, setRiders] = useState(initialRiders);
  const [sel, setSel] = useState<Selection>(null);
  const [following, setFollowing] = useState(false);
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [hint, setHint] = useState(true);

  const sorted = useMemo(() => [...riders].sort((a, b) => b.points - a.points), [riders]);
  const me = riders.find((r) => r.me);

  // Mount the WebGL scene once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    LiveScene.create(host, initialRiders, {
      onSelectRider: (id) => setSel({ kind: "rider", id }),
      onSelectStation: (k) => setSel({ kind: "station", k }),
      onArrive: (r) => setToast(`🎓 ${r.me ? "You" : r.name.split(" ")[0]} made it to Columbia!`),
      onCameraChange: setFollowing,
      onFatal: () => alive && setFailed(true),
    })
      .then((s) => {
        if (!alive) return s.destroy();
        sceneRef.current = s;
        if (demo) (window as unknown as { __liveScene?: LiveScene }).__liveScene = s;
        setReady(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
    // initialRiders only seeds the scene; later changes go through setRiders below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the rider card shrinks that rider's photo back down on the map.
  useEffect(() => {
    if (sel?.kind !== "rider") sceneRef.current?.select(null);
  }, [sel]);

  // New data → the scene moves the trains that scored.
  useEffect(() => {
    if (ready) sceneRef.current?.setRiders(riders);
  }, [riders, ready]);

  // Live data: poll the riders endpoint (votes are private per user, so Realtime can't see them).
  useEffect(() => {
    if (demo || !pollUrl) return;
    const id = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(pollUrl, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { riders: LiveRider[] };
        setRiders(data.riders);
        setUpdatedAt(Date.now());
      } catch {
        /* keep the last good data */
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [demo, pollUrl]);

  // Demo: someone scores every couple of seconds.
  useEffect(() => {
    if (!demo) return;
    const id = window.setInterval(() => {
      setRiders((list) => {
        const open = list.filter((r) => r.station < STOPS_TO_COLUMBIA);
        if (open.length === 0) return demoRiders(list.some((r) => r.me));
        const pick = open[Math.floor(Math.random() * open.length)];
        const gain = Math.random() < 0.25 ? 2 : 1;
        return list.map((r) => (r.id === pick.id ? { ...r, points: r.points + gain, station: Math.min(r.points + gain, STOPS_TO_COLUMBIA) } : r));
      });
      setUpdatedAt(Date.now());
    }, 2600);
    return () => window.clearInterval(id);
  }, [demo]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    const h = window.setTimeout(() => setHint(false), 5000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(h);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const [tilted, setTilted] = useState(false);

  // Sound on: the scene chimes, and the browser reads out your next stop.
  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    sceneRef.current?.setSound(on);
    try {
      const synth = window.speechSynthesis;
      synth?.cancel();
      if (on && synth) {
        const u = new SpeechSynthesisUtterance(me ? announcementFor(me.station) : "This is a Columbia-bound 1 train. Vote on a caption to board.");
        u.lang = "en-US";
        u.rate = 0.92;
        u.pitch = 0.9;
        window.setTimeout(() => synth.speak(u), 600);
      }
    } catch {
      /* no speech on this browser: the chime still plays */
    }
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // Keyboard: arrows pan, +/- zoom, Q/E rotate, F finds you, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = sceneRef.current;
      if (!s || (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      const step = 120;
      if (e.key === "Escape") {
        if (sel) setSel(null);
        else onClose?.();
      } else if (e.key === "ArrowUp") s.pan(0, -step);
      else if (e.key === "ArrowDown") s.pan(0, step);
      else if (e.key === "ArrowLeft") s.pan(-step, 0);
      else if (e.key === "ArrowRight") s.pan(step, 0);
      else if (e.key === "+" || e.key === "=") s.zoomBy(1.3);
      else if (e.key === "-" || e.key === "_") s.zoomBy(1 / 1.3);
      else if (e.key.toLowerCase() === "f") s.findMe();
      else if (e.key.toLowerCase() === "q") s.rotateBy(-30);
      else if (e.key.toLowerCase() === "e") s.rotateBy(30);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sel]);

  const selRider = sel?.kind === "rider" ? riders.find((r) => r.id === sel.id) : undefined;
  const selStation = sel?.kind === "station" ? sel.k : null;
  const atStation = selStation !== null ? sorted.filter((r) => r.station === selStation) : [];
  // An empty station still leads somewhere: the closest train that has left South Ferry.
  const nearest =
    selStation !== null && atStation.length === 0
      ? [...riders].filter((r) => r.points > 0).sort((a, b) => Math.abs(a.station - selStation) - Math.abs(b.station - selStation))[0]
      : undefined;
  const topVoice = Math.max(1, ...voices.map((v) => v.upvotes));
  const ago = Math.max(0, Math.round((now - updatedAt) / 1000));

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden bg-[#9ad6f2] text-ink"
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Race to Columbia live map"
    >
      <style>{LABEL_CSS}</style>
      <div ref={hostRef} className="absolute inset-0 z-0 isolate" role="application" aria-label="Map. Drag to move, scroll or pinch to zoom, tap a train for details." />

      {!ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow">Laying the tracks…</p>
        </div>
      )}
      {failed && <Fallback2D riders={riders} onClose={onClose} />}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(12px,env(safe-area-inset-top))] sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-sign py-1.5 pl-1.5 pr-4 text-white shadow-lg">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bullet-red text-[15px] font-bold">1</span>
          <span className="whitespace-nowrap text-sm font-bold leading-none sm:text-[15px]">Race to Columbia</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5a52] opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5a52]" />
            </span>
            {demo ? "Demo" : "Live"}
          </span>
          <span className="hidden text-xs text-white/60 sm:inline">{ago < 10 ? "updated just now" : `updated ${ago}s ago`}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Btn label={sound ? "Sound on" : "Sound off"} active={sound} onClick={toggleSound}>
            {sound ? I.soundOn : I.soundOff}
          </Btn>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close map" className="flex h-11 w-11 items-center justify-center rounded-full bg-sign text-white shadow-lg hover:bg-ink">
              {I.close}
            </button>
          )}
        </div>
      </div>

      {/* what the map is for + who is where (desktop; phones keep the map clear) */}
      {ready && !failed && (
        <div className="absolute left-4 top-[76px] hidden w-64 rounded-2xl border-2 border-ink bg-white p-3.5 shadow-xl md:block">
          <p className="text-sm font-bold">This week&apos;s scoreboard</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            Each train is a classmate on the 1 line. A vote is one stop uptown, a post is two. First to Columbia wins the week.
          </p>
          {sorted.some((r) => r.points > 0) ? (
            <ol className="mt-2.5 space-y-0.5">
              {sorted
                .filter((r) => r.points > 0)
                .slice(0, 5)
                .map((r, i) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        sceneRef.current?.flyToRider(r.id);
                        setSel({ kind: "rider", id: r.id });
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-paper ${r.me ? "bg-metro/20" : ""}`}
                    >
                      <span className="w-4 text-right font-bold tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{r.me ? "You" : r.name}</span>
                      <span className="shrink-0 text-xs text-muted">{STATIONS[Math.min(r.station, STOPS_TO_COLUMBIA)]}</span>
                    </button>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="mt-2.5 text-sm">Nobody has left South Ferry yet.</p>
          )}
          <Link href="/#fresh" className="mt-2.5 block rounded-full bg-metro px-3 py-1.5 text-center text-sm font-semibold text-ink hover:bg-metro-deep">
            Vote to move your train
          </Link>
        </div>
      )}

      {/* the five voices as lines: which kind of joke is winning this week */}
      {ready && !failed && voices.length > 0 && (
        <div className="absolute right-4 top-[76px] hidden w-64 rounded-2xl border-2 border-ink bg-white p-3.5 shadow-xl lg:block">
          <p className="text-sm font-bold">Lines this week</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">Each subway voice is a line. Longer bar, more upvotes on its captions.</p>
          <ul className="mt-2.5 space-y-2">
            {voices.map((v) => (
              <li key={v.key}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: v.bg, color: v.fg }}>
                    {v.letter}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{v.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{v.upvotes} ▲</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-paper">
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.max(v.upvotes > 0 ? 6 : 0, (v.upvotes / topVoice) * 100)}%`, background: v.bg }} />
                </div>
              </li>
            ))}
          </ul>
          {voices[0]?.best && voices[0].upvotes > 0 && (
            <Link href={`/p/${voices[0].best.postId}`} className="mt-3 block rounded-xl bg-paper p-2.5 hover:bg-metro/20">
              <span className="block text-xs font-semibold text-muted">Best on the {voices[0].label} line</span>
              <span className="mt-0.5 line-clamp-3 block text-[13px] font-semibold leading-snug">{voices[0].best.text}</span>
            </Link>
          )}
        </div>
      )}

      {hint && ready && (
        <p className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-sign/80 px-3.5 py-1.5 text-xs font-medium text-white">
          Drag to move · scroll to zoom · the ⟲ ⟳ buttons turn the map · tap a train
        </p>
      )}

      {toast && (
        <p role="status" className="absolute left-1/2 top-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-metro px-4 py-2 text-sm font-bold shadow-lg">
          {toast}
        </p>
      )}

      {/* detail card */}
      {(selRider || selStation !== null) && (
        <div className="absolute inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] mx-auto max-w-sm rounded-2xl border-2 border-ink bg-white p-4 shadow-xl sm:inset-x-auto sm:bottom-6 sm:left-4">
          <button type="button" onClick={() => setSel(null)} aria-label="Close" className="absolute right-2.5 top-2.5 rounded-full p-1 text-muted hover:bg-paper hover:text-ink">
            {I.close}
          </button>
          {selRider ? (
            <div className="flex items-center gap-3 pr-6">
              <Face r={selRider} size={72} />
              <div className="min-w-0">
                <p className="truncate text-[17px] font-bold">{selRider.me ? "You" : selRider.name}</p>
                <p className="text-sm text-muted">
                  {ordinal(sorted.findIndex((r) => r.id === selRider.id) + 1)} · {Math.min(selRider.points, STOPS_TO_COLUMBIA)}/{STOPS_TO_COLUMBIA} stops
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  {selRider.station >= STOPS_TO_COLUMBIA ? "🎓 Arrived at Columbia" : `At ${STATIONS[selRider.station]}`}
                </p>
              </div>
            </div>
          ) : null}
          {selRider ? (
            selRider.meme ? (
              <Link href={`/p/${selRider.meme.postId}#c-${selRider.meme.captionId}`} className="mt-3 block rounded-xl bg-paper p-3 hover:bg-metro/20">
                <span className="block text-xs font-semibold text-muted">{selRider.me ? "Your" : "Their"} best caption this week</span>
                <span className="mt-0.5 line-clamp-3 block text-sm font-semibold leading-snug">{selRider.meme.text}</span>
                <span className="mt-1 block text-xs font-semibold text-bullet-blue">Open the post and vote →</span>
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted">{selRider.me ? "You haven't" : "Hasn't"} posted this week. This train is moving on votes alone.</p>
            )
          ) : (
            <div className="pr-6">
              <p className="text-[17px] font-bold">{STATIONS[selStation!]}</p>
              <p className="text-sm text-muted">
                Stop {selStation} of {STOPS_TO_COLUMBIA}
                {selStation! < STOPS_TO_COLUMBIA ? ` · ${STOPS_TO_COLUMBIA - selStation!} to Columbia` : ""}
              </p>
              {atStation.length === 0 ? (
                <>
                  <p className="mt-2 text-sm">Nobody is here right now.</p>
                  {nearest && (
                    <button
                      type="button"
                      onClick={() => {
                        sceneRef.current?.flyToRider(nearest.id);
                        setSel({ kind: "rider", id: nearest.id });
                      }}
                      className="mt-2 text-sm font-semibold text-bullet-blue hover:underline"
                    >
                      Nearest train: {nearest.me ? "you" : nearest.name.split(" ")[0]}, at {STATIONS[Math.min(nearest.station, STOPS_TO_COLUMBIA)]} →
                    </button>
                  )}
                </>
              ) : (
                <ul className="mt-3 space-y-2">
                  {atStation.map((r) => (
                    <li key={r.id} className="rounded-xl bg-paper p-2.5">
                      <button type="button" onClick={() => { sceneRef.current?.select(r.id); sceneRef.current?.flyToRider(r.id); }} className="flex items-center gap-1.5 text-sm font-semibold hover:underline">
                        <Face r={r} size={24} />
                        {r.me ? "You" : r.name.split(" ")[0]}
                      </button>
                      {r.meme && (
                        <Link href={`/p/${r.meme.postId}#c-${r.meme.captionId}`} className="mt-1.5 block text-sm leading-snug hover:underline">
                          <span className="line-clamp-2">{r.meme.text}</span>
                          <span className="text-xs font-semibold text-bullet-blue">Open and vote →</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* controls */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:p-5">
        <div className="flex items-center gap-1.5 rounded-full bg-sign p-1.5 shadow-xl">
          {me && (
            <Btn label="Find my train" active={following} onClick={() => sceneRef.current?.findMe()}>
              {I.me}
              <span className="hidden sm:inline">{following ? "Following you" : "Find my train"}</span>
            </Btn>
          )}
          <Btn label="Whole line" onClick={() => sceneRef.current?.wholeLine()}>
            {I.line}
            <span className="hidden sm:inline">Whole line</span>
          </Btn>
          <Btn label="Replay the week" onClick={() => sceneRef.current?.replay()}>
            {I.replay}
            <span className="hidden sm:inline">Replay</span>
          </Btn>
          <span className="mx-0.5 h-6 w-px bg-white/20" aria-hidden="true" />
          <Btn label="Turn the map left" onClick={() => sceneRef.current?.rotateBy(-30)}>
            {I.rotateLeft}
          </Btn>
          <Btn label="Turn the map right" onClick={() => sceneRef.current?.rotateBy(30)}>
            {I.rotateRight}
          </Btn>
          <Btn
            label={tilted ? "Back to the 3D view" : "Look straight down"}
            active={tilted}
            onClick={() => {
              sceneRef.current?.setFlat(!tilted);
              setTilted(!tilted);
            }}
          >
            {I.tilt}
          </Btn>
          <span className="mx-0.5 h-6 w-px bg-white/20" aria-hidden="true" />
          <Btn label="Zoom out" onClick={() => sceneRef.current?.zoomBy(1 / 1.4)}>
            {I.minus}
          </Btn>
          <Btn label="Zoom in" onClick={() => sceneRef.current?.zoomBy(1.4)}>
            {I.plus}
          </Btn>
        </div>
      </div>

      {/* text version for screen readers */}
      <div className="sr-only">
        <h2>Standings this week</h2>
        <ol>
          {sorted.map((r) => (
            <li key={r.id}>
              {r.me ? "You" : r.name}: {Math.min(r.points, STOPS_TO_COLUMBIA)} of {STOPS_TO_COLUMBIA} stops, at {STATIONS[r.station]}.
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
