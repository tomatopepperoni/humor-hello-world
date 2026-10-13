import type { Metadata } from "next";
import Link from "next/link";
import MemeCard from "@/app/components/MemeCard";
import { getCurrentProfile } from "@/lib/profile";
import { getTopMemesAllTime, getTopMemesToday } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard" };

/** Ranks memes (one caption + its photo), not posts, so each caption competes on its own. */
export default async function TopPage() {
  const [{ user }, today, allTime] = await Promise.all([
    getCurrentProfile(),
    getTopMemesToday(6),
    getTopMemesAllTime(12),
  ]);
  const loggedIn = !!user;

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
