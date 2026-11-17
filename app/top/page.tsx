import type { Metadata } from "next";
import Link from "next/link";
import MemeCard from "@/app/components/MemeCard";
import { Avatar, displayName } from "@/app/components/PostCard";
import { ProgressLine, riderStatus } from "@/app/components/Race";
import { VoiceStandings } from "@/app/components/WeekPulse";
import { getCurrentProfile } from "@/lib/profile";
import { getTopMemesAllTime, getTopMemesToday } from "@/lib/posts";
import { getWeekPulse } from "@/lib/pulse";
import { getRace } from "@/lib/race";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard" };

/** Ranks memes (one caption + its photo), not posts, so each caption competes on its own. */
export default async function TopPage() {
  const [{ user }, today, allTime, pulse, race] = await Promise.all([
    getCurrentProfile(),
    getTopMemesToday(6),
    getTopMemesAllTime(12),
    getWeekPulse().catch(() => null),
    getRace().catch(() => null),
  ]);
  const loggedIn = !!user;
  const riders = (race?.riders ?? []).filter((r) => r.points_week > 0).slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-[28px] font-bold tracking-tight">Leaderboard</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-muted">
        Every caption is its own meme and is ranked on its own: upvotes minus downvotes. Today&apos;s board resets at
        midnight New York time. For the weekly race, see{" "}
        <Link href="/race" className="font-medium text-bullet-blue hover:underline">
          Race to Columbia
        </Link>
        .
      </p>

      <section aria-labelledby="today" className="mt-8">
        <h2 id="today" className="mb-3 text-xl font-bold tracking-tight">
          Top memes today
        </h2>
        {today.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px]">
            <p>No votes yet today, so nobody is winning.</p>
            <Link href="/#fresh" className="mt-3 inline-block rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep">
              Vote on today&apos;s memes
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {today.map((m, i) => (
              <MemeCard key={m.caption.id} meme={m} loggedIn={loggedIn} rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      {(pulse || riders.length > 0) && (
        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
          {pulse && (
            <section id="voices" aria-labelledby="voices-title" className="scroll-mt-20">
              <h2 id="voices-title" className="text-xl font-bold tracking-tight">
                Which voice is winning this week
              </h2>
              <p className="mb-3 mt-1 text-sm text-muted">
                Upvotes on memes posted since Monday, by the subway voice Gemini wrote them in.
              </p>
              <VoiceStandings pulse={pulse} />
            </section>
          )}

          <section aria-labelledby="riders-title">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="riders-title" className="text-xl font-bold tracking-tight">
                Riders this week
              </h2>
              <Link href="/race" className="text-sm font-medium text-bullet-blue hover:underline">
                Race to Columbia
              </Link>
            </div>
            <p className="mb-3 mt-1 text-sm text-muted">Who is furthest up the 1 train.</p>
            {riders.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px] text-muted">
                Nobody has left South Ferry yet. One vote gets you moving.
              </p>
            ) : (
              <ol className="divide-y rounded-xl border bg-card">
                {riders.map((r, i) => {
                  const name = displayName(r.first_name);
                  return (
                    <li key={r.user_id} className="flex items-center gap-3 p-4">
                      <span className="w-4 text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
                      <Avatar name={name} url={r.avatar_url} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[15px] font-semibold">
                            {name}
                            {r.user_id === user?.id && <span className="ml-1.5 font-normal text-muted">(you)</span>}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted">
                            {r.points_week} {r.points_week === 1 ? "stop" : "stops"}
                          </span>
                        </span>
                        <span className="mb-2 block truncate text-xs text-muted">{riderStatus(r)}</span>
                        <ProgressLine station={r.station} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}

      <section aria-labelledby="all-time" className="mt-12">
        <h2 id="all-time" className="mb-3 text-xl font-bold tracking-tight">
          Best memes of all time
        </h2>
        {allTime.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px] text-muted">
            Nothing has an upvote yet. The first one you give puts a meme here.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {allTime.map((m, i) => (
              <MemeCard key={m.caption.id} meme={m} loggedIn={loggedIn} rank={i + 1} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
