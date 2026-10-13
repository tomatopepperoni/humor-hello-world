"use client";

import { useEffect, useState } from "react";
import { startOfTodayNY } from "@/lib/vibes";

/** Milliseconds until the next midnight in New York (handles DST). */
function msUntilNextTheme(now = Date.now()) {
  const today = Date.parse(startOfTodayNY(new Date(now)));
  const tomorrow = Date.parse(startOfTodayNY(new Date(today + 36 * 3_600_000)));
  return Math.max(0, tomorrow - now);
}

function format(ms: number) {
  const mins = Math.ceil(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Platform countdown clock: amber digits on black, like the "next train"
 * displays, counting down to the next daily theme.
 */
export default function NextThemeClock({ tomorrow }: { tomorrow: string }) {
  const [ms, setMs] = useState(() => msUntilNextTheme());
  useEffect(() => {
    const t = window.setInterval(() => setMs(msUntilNextTheme()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span className="font-semibold text-[#ff9e1b]">
        Next theme in{" "}
        <span suppressHydrationWarning className="tabular-nums">
          {format(ms)}
        </span>
      </span>
      <span className="text-white/60">Tomorrow: {tomorrow}</span>
    </div>
  );
}
