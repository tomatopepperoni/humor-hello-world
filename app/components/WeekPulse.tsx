import Link from "next/link";
import { VibeBullet } from "@/app/components/LineBullet";
import type { WeekPulse } from "@/lib/pulse";
import { VIBES } from "@/lib/vibes";

const n = (value: number) => value.toLocaleString("en-US");

/** Home sidebar: three numbers for the week and the voice that's ahead. */
export function PulseCard({ pulse }: { pulse: WeekPulse }) {
  const lead = pulse.voices.find((v) => v.upvotes > 0);
  const figures = [
    { label: pulse.posts === 1 ? "moment" : "moments", value: pulse.posts },
    { label: pulse.memes === 1 ? "meme" : "memes", value: pulse.memes },
    { label: pulse.votes === 1 ? "vote" : "votes", value: pulse.votes },
  ];

  return (
    <section aria-labelledby="pulse" className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="pulse" className="text-base font-bold">
          This week on the line
        </h2>
        <Link href="/top#voices" className="text-sm font-medium text-bullet-blue hover:underline">
          All voices
        </Link>
      </div>

      {pulse.posts === 0 ? (
        <p className="mt-2 text-sm">Nothing posted yet this week. The first moment gets the whole platform.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {figures.map((f) => (
              <div key={f.label} className="rounded-lg bg-paper px-2 py-2.5 text-center">
                <dd className="text-[22px] font-bold leading-none tabular-nums">{n(f.value)}</dd>
                <dt className="mt-1 text-xs text-muted">{f.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-center gap-2 text-sm">
            {lead ? (
              <>
                <VibeBullet vibe={lead.vibe} size={22} />
                <span>
                  <span className="font-semibold">{VIBES[lead.vibe].label}</span> is the funniest voice so far, with {n(lead.upvotes)}{" "}
                  {lead.upvotes === 1 ? "upvote" : "upvotes"}.
                </span>
              </>
            ) : (
              <span>No upvotes yet this week, so every voice is tied.</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}

/** Leaderboard: the five voices ranked by upvotes this week, each with its best line. */
export function VoiceStandings({ pulse }: { pulse: WeekPulse }) {
  const max = Math.max(1, ...pulse.voices.map((v) => v.upvotes));

  return (
    <ol className="divide-y rounded-xl border bg-card">
      {pulse.voices.map((v, i) => (
        <li key={v.vibe} className="grid gap-x-4 gap-y-2 p-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-center">
          <div className="flex items-center gap-2.5">
            <span className="w-4 text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
            <VibeBullet vibe={v.vibe} size={28} />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight">{VIBES[v.vibe].label}</span>
              <span className="block text-xs text-muted">
                {n(v.upvotes)} {v.upvotes === 1 ? "upvote" : "upvotes"} · {n(v.memes)} {v.memes === 1 ? "meme" : "memes"}
              </span>
            </span>
          </div>
          <div className="min-w-0">
            <span className="block h-2.5 w-full rounded-full bg-paper" aria-hidden="true">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(v.upvotes / max) * 100}%`, minWidth: v.upvotes > 0 ? 10 : 0, background: VIBES[v.vibe].bullet.bg }}
              />
            </span>
            {v.best ? (
              <Link href={`/p/${v.best.postId}#c-${v.best.captionId}`} className="mt-1.5 block truncate text-sm text-ink/80 hover:text-ink hover:underline">
                Best line: {v.best.text}
              </Link>
            ) : (
              <p className="mt-1.5 text-sm text-muted">{v.memes > 0 ? "No upvoted line yet." : "No memes in this voice yet this week."}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
