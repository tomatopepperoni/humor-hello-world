"use client";

import { useState, type ReactNode } from "react";
import { LineBullet } from "@/app/components/LineBullet";
import { VIBES, type Vibe } from "@/lib/vibes";

export type VoiceFilterItem = { id: string; vibe: Vibe | null; node: ReactNode };

/**
 * Chips that narrow a grid of memes to one subway voice. Cards that don't match
 * are hidden, not unmounted, so a vote you just cast keeps its state.
 */
export default function VoiceFilter({ items, gridClassName }: { items: VoiceFilterItem[]; gridClassName: string }) {
  const [active, setActive] = useState<Vibe | null>(null);

  const counts = new Map<Vibe, number>();
  for (const item of items) if (item.vibe) counts.set(item.vibe, (counts.get(item.vibe) ?? 0) + 1);
  const voices = (Object.keys(VIBES) as Vibe[]).filter((v) => counts.has(v));
  const shown = active ? counts.get(active) ?? 0 : items.length;

  const chip = (on: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      on ? "border-sign bg-sign text-white" : "bg-card text-ink hover:border-ink/40"
    }`;

  return (
    <>
      {voices.length > 1 && (
        <div role="group" aria-label="Filter memes by subway voice" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" aria-pressed={active === null} onClick={() => setActive(null)} className={chip(active === null)}>
            All
            <span className={active === null ? "text-white/70" : "text-muted"}>{items.length}</span>
          </button>
          {voices.map((v) => {
            const on = active === v;
            const b = VIBES[v].bullet;
            return (
              <button key={v} type="button" aria-pressed={on} onClick={() => setActive(on ? null : v)} className={chip(on)}>
                <LineBullet letter={b.letter} bg={b.bg} fg={b.fg} size={20} />
                {VIBES[v].label}
                <span className={on ? "text-white/70" : "text-muted"}>{counts.get(v)}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="sr-only" role="status">
        {active ? `Showing ${shown} ${VIBES[active].label} ${shown === 1 ? "meme" : "memes"}.` : `Showing all ${shown} memes.`}
      </p>
      <div className={gridClassName}>
        {items.map((item) => (
          <div key={item.id} className={!active || item.vibe === active ? "grid" : "hidden"}>
            {item.node}
          </div>
        ))}
      </div>
    </>
  );
}
