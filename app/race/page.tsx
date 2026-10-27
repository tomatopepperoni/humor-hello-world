import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, displayName } from "@/app/components/PostCard";
import { BadgeLegend, BadgeRow, ProgressLine, ordinal, riderStatus } from "@/app/components/Race";
import { LineBullet } from "@/app/components/LineBullet";
import { getCurrentProfile } from "@/lib/profile";
import { STATIONS, STOPS_TO_COLUMBIA, getRace } from "@/lib/race";
import type { MapRider } from "./SubwayMap";
import RaceMapCard from "./RaceMapCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Race to Columbia" };

const RULES = [
  { pts: "+1", what: "for every caption you vote on" },
  { pts: "+2", what: "for every moment you post" },
  { pts: "+1", what: "for every upvote someone else gives your captions" },
];

export default async function RacePage({ searchParams }: PageProps<"/race">) {
  const { map } = await searchParams;
  const [{ user }, race] = await Promise.all([getCurrentProfile(), getRace()]);
  const meId = user?.id ?? null;
  const me = race.riders.find((r) => r.user_id === meId);
  const active = race.riders.filter((r) => r.points_week > 0);
  const myRank = me ? active.findIndex((r) => r.user_id === meId) + 1 : 0;
  const left = me ? Math.max(0, STOPS_TO_COLUMBIA - me.points_week) : STOPS_TO_COLUMBIA;
  const mapRiders: MapRider[] = race.riders.map((r) => ({
    id: r.user_id,
    name: displayName(r.first_name),
    avatarUrl: r.avatar_url,
    station: r.station,
    points: r.points_week,
    me: r.user_id === meId,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
      <section aria-labelledby="race-title" className="rounded-xl bg-sign px-5 pb-6 pt-4 text-white sm:px-7">
        <div aria-hidden="true" className="h-px bg-white/60" />
        <div className="mt-4 flex items-center gap-3">
          <LineBullet letter="1" bg="#ee352e" size={34} />
          <p className="text-sm text-white/80">Uptown to 116 St–Columbia University, this week</p>
        </div>
        <h1 id="race-title" className="mt-3 text-[30px] font-bold leading-[1.08] tracking-tight sm:text-[40px]">
          Race to Columbia
        </h1>
        <p className="mt-2 max-w-xl text-[16px] text-white/85">
          Every vote moves you one stop up the 1 train. First to Columbia wins the week.
        </p>
        <details className="group mt-4 max-w-xl">
          <summary className="cursor-pointer list-none text-sm font-semibold text-metro hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">How scoring works ↓</span>
            <span className="hidden group-open:inline">Hide scoring ↑</span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {RULES.map((r) => (
              <li key={r.what}>
                <span className="font-bold text-metro">
                  {r.pts} stop{r.pts === "+1" ? "" : "s"}
                </span>{" "}
                <span className="text-white/80">{r.what}</span>
              </li>
            ))}
            <li className="text-white/60">Everyone restarts at South Ferry every Monday.</li>
          </ul>
        </details>
      </section>

      {user && me && (
        <section aria-labelledby="my-ride" className="mt-5 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="my-ride" className="text-lg font-bold">
              {me.points_week === 0 ? "You haven't boarded yet" : riderStatus(me)}
            </h2>
            {myRank > 0 && <span className="text-sm font-semibold text-muted">{myRank === 1 ? "Leading the race" : `${ordinal(myRank)} this week`}</span>}
          </div>
          <div className="mt-3">
            <ProgressLine station={me.station} />
          </div>
          <p className="mt-3 text-[15px]">
            {left === 0
              ? "You made it this week. Keep voting: your badges still count."
              : `${left} more ${left === 1 ? "stop" : "stops"}: vote on ${left} ${left === 1 ? "caption" : "captions"}, or post and get upvoted.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/#fresh" className="rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep">
              Vote on today&apos;s posts
            </Link>
            <Link href="/create" className="rounded-full border bg-white px-4 py-2 text-sm font-semibold hover:border-ink/40">
              Post a moment
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">
            This week: {me.votes_week} {me.votes_week === 1 ? "vote" : "votes"}, {me.posts_week}{" "}
            {me.posts_week === 1 ? "post" : "posts"}, {me.upvotes_received_week}{" "}
            {me.upvotes_received_week === 1 ? "upvote" : "upvotes"} received.
          </p>
        </section>
      )}

      {!user && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-[15px]">Sign in to board the 1 train and see where you are.</p>
          <Link href="/login?next=/race" className="rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep">
            Sign in
          </Link>
        </div>
      )}

      <section aria-labelledby="map" className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="map" className="text-xl font-bold tracking-tight">
            The 1 line right now
          </h2>
          <p className="text-sm text-muted">{me ? "The red train is you. Tap the map to open it full screen." : "Tap the map to open it full screen."}</p>
        </div>
        <RaceMapCard riders={mapRiders} startOpen={map === "live"} />
        {!race.exact && (
          <p className="mt-2 text-xs text-muted">
            Estimated from posts and upvotes. Run supabase/week5.sql to count votes too.
          </p>
        )}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="standings">
          <h2 id="standings" className="mb-3 text-xl font-bold tracking-tight">
            Standings
          </h2>
          {active.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px] text-muted">
              Everyone is still at South Ferry. The first vote of the week takes the lead.
            </p>
          ) : (
            <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
              {active.map((r, i) => (
                <li key={r.user_id} className={`flex items-center gap-3 p-4 ${r.user_id === meId ? "bg-metro/15" : ""}`}>
                  <span className="w-6 text-right text-lg font-bold tabular-nums">{i + 1}</span>
                  <Avatar name={displayName(r.first_name)} url={r.avatar_url} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{displayName(r.first_name)}</span>
                      <BadgeRow rider={r} size={16} />
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{riderStatus(r)}</p>
                    <div className="mt-2 max-w-sm">
                      <ProgressLine station={r.station} />
                    </div>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-lg font-bold tabular-nums">{r.points_week}</span>
                    <span className="block text-xs text-muted">stops</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="badges">
          <h2 id="badges" className="mb-3 text-xl font-bold tracking-tight">
            Badges
          </h2>
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-4 text-sm text-muted">
              Shown next to your name in the standings. {me ? "Dashed ones are still to earn." : "Sign in to collect them."}
            </p>
            <BadgeLegend rider={me} />
          </div>
          <p className="mt-3 text-sm text-muted">
            Stations: {STATIONS[0]} to {STATIONS[STATIONS.length - 1]}, {STOPS_TO_COLUMBIA} stops on the 1.
          </p>
        </section>
      </div>
    </main>
  );
}
