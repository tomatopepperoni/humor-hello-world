"use client";

import { useEffect, useRef, useState } from "react";
import { chime, isMuted } from "@/app/components/AnnounceButton";
import { LANDMARK_STATIONS, STATIONS, STOPS_TO_COLUMBIA } from "@/lib/line1";

const CONFETTI = ["#ee352e", "#fccc0a", "#6cbe45", "#0039a6", "#a7a9ac", "#ffffff"];

/**
 * Shows a station sign when your train moves. It sits in the layout and waits
 * for VoteButtons to announce a new vote, then asks /race/me for one number, so
 * no page has to load the whole race just in case someone votes.
 * Landmark stations get the door chime (unless sound was switched off), and
 * 116 St gets confetti.
 */
export default function StationArrival() {
  const [arrived, setArrived] = useState<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const onVote = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch("/race/me", { cache: "no-store" });
        const data = (await res.json()) as { station: number | null; points?: number | null };
        // A new vote is one stop. Past 116 St the train has nowhere left to go, so no sign.
        if (data.station === null || !data.points || data.points > STOPS_TO_COLUMBIA) return;
        setArrived(data.station);
        if ((LANDMARK_STATIONS.has(data.station) || data.station >= STOPS_TO_COLUMBIA) && !isMuted()) void chime();
      } catch {
        /* no sign this time */
      } finally {
        busy.current = false;
      }
    };
    window.addEventListener("captioned:voted", onVote);
    return () => window.removeEventListener("captioned:voted", onVote);
  }, []);

  useEffect(() => {
    if (arrived === null) return;
    const t = window.setTimeout(() => setArrived(null), arrived >= STOPS_TO_COLUMBIA ? 7000 : 4200);
    return () => window.clearTimeout(t);
  }, [arrived]);

  if (arrived === null) return null;
  const end = arrived >= STOPS_TO_COLUMBIA;
  const left = STOPS_TO_COLUMBIA - arrived;

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
      <div className="arrive-in relative w-full max-w-md overflow-hidden rounded-2xl bg-sign px-5 pb-4 pt-3 text-white shadow-2xl ring-2 ring-white/15">
        {end && (
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 28 }, (_, i) => (
              <span
                key={i}
                className="confetti absolute top-0 h-2.5 w-1.5 rounded-[1px]"
                style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 7) * 110}ms` }}
              />
            ))}
          </div>
        )}
        <div aria-hidden="true" className="h-px bg-white/60" />
        <div className="relative mt-3 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bullet-red text-xl font-bold">1</span>
          <p className="min-w-0 leading-tight">
            <span className="block text-xs text-white/70">{end ? "Last stop" : "Now arriving"}</span>
            <span className="block truncate text-[22px] font-bold tracking-tight">{STATIONS[Math.min(arrived, STOPS_TO_COLUMBIA)]}</span>
          </p>
        </div>
        <p className="relative mt-2 text-sm text-white/85">
          {end ? "You made it to Columbia this week." : `${left} ${left === 1 ? "stop" : "stops"} to Columbia. Keep voting.`}
        </p>
      </div>
    </div>
  );
}
