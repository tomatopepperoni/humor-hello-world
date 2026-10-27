"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import SubwayMap, { type MapRider } from "./SubwayMap";
import MapErrorBoundary from "./live/MapErrorBoundary";

// The WebGL map is only downloaded when someone opens it.
const loadLiveMap = () => import("./live/LiveMap");
const LiveMap = dynamic(loadLiveMap, {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#9ad6f2]">
      <p className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow">Laying the tracks…</p>
    </div>
  ),
});

/** Runs a state change inside a view transition when the browser has them, so the card grows into the full map. */
function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !reduce) doc.startViewTransition(() => flushSync(update));
  else update();
}

/**
 * Level 1 of the race map: the small, cute SVG line on /race. Tapping it opens
 * level 2, the full-screen live map (./live), as an overlay with its own
 * history entry, so the back button closes it.
 */
export default function RaceMapCard({ riders, startOpen = false }: { riders: MapRider[]; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);

  const show = useCallback(() => {
    withTransition(() => setOpen(true));
    if (new URLSearchParams(window.location.search).get("map") !== "live") {
      window.history.pushState({ liveMap: true }, "", "?map=live");
    }
  }, []);

  const hide = useCallback(() => {
    if (window.history.state?.liveMap) window.history.back();
    else {
      withTransition(() => setOpen(false));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      const live = new URLSearchParams(window.location.search).get("map") === "live";
      withTransition(() => setOpen(live));
    };
    window.addEventListener("popstate", onPop);
    // fetch the map's code in the background once the page is idle
    const idle = window.setTimeout(() => void loadLiveMap(), 2500);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open]);

  return (
    <>
      <style>{`
        ::view-transition-group(race-map) { animation-duration: 480ms; animation-timing-function: cubic-bezier(.2,.8,.2,1); }
        ::view-transition-old(race-map), ::view-transition-new(race-map) { height: 100%; object-fit: cover; }
      `}</style>
      <div className="group relative" style={open ? undefined : { viewTransitionName: "race-map" }}>
        {/* the whole card opens the map; the button below is the keyboard/screen-reader way in */}
        <div onClick={show} onPointerEnter={() => void loadLiveMap()} className="cursor-zoom-in">
          <SubwayMap riders={riders} />
        </div>
        <button
          type="button"
          onClick={show}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-sign px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-transform group-hover:scale-105"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5a52] opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5a52]" />
          </span>
          Open live map
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>
      {open && (
        <MapErrorBoundary riders={riders} onClose={hide}>
          <LiveMap initialRiders={riders} pollUrl="/race/riders" onClose={hide} transitionName="race-map" />
        </MapErrorBoundary>
      )}
    </>
  );
}
