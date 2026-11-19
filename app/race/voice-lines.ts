import type { WeekPulse } from "@/lib/pulse";
import { VIBES } from "@/lib/vibes";

/** One subway voice as the live map lists it: its line bullet, this week's upvotes, its best caption. */
export type VoiceLine = {
  key: string;
  label: string;
  letter: string;
  bg: string;
  fg: string;
  upvotes: number;
  memes: number;
  best: { text: string; postId: string } | null;
};

export function voiceLines(pulse: WeekPulse): VoiceLine[] {
  return pulse.voices.map((v) => {
    const b = VIBES[v.vibe].bullet;
    return {
      key: v.vibe,
      label: VIBES[v.vibe].label,
      letter: b.letter,
      bg: b.bg,
      fg: b.fg,
      upvotes: v.upvotes,
      memes: v.memes,
      best: v.best ? { text: v.best.text, postId: v.best.postId } : null,
    };
  });
}
