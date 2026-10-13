import Link from "next/link";
import MemeCard from "@/app/components/MemeCard";
import { LineBullet, VibeBullet } from "@/app/components/LineBullet";
import NextThemeClock from "@/app/components/NextThemeClock";
import { RaceMini } from "@/app/components/Race";
import { getCurrentProfile } from "@/lib/profile";
import { getRecentMemes, getTopMemesToday, type Meme, type PostWithCaptions } from "@/lib/posts";
import { getRace, type Race } from "@/lib/race";
import { VIBES, VIBE_KEYS, startOfTodayNY, todayLabelNY, todaysTheme, tomorrowsTheme } from "@/lib/vibes";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Post a moment", body: "A photo, a one-liner from your week in the city, or both." },
  { title: "Pick a subway voice", body: "Conductor, service alert, showtime, overheard or roast. Gemini writes three." },
  { title: "Everyone votes", body: "Votes move you up the 1 train. First to Columbia wins the week." },
];

/** A real sequence, so it's drawn as three stops on one line. */
function HowItWorks() {
  return (
    <section aria-labelledby="how" className="rounded-xl border bg-card p-5">
      <h2 id="how" className="text-base font-bold">
        How it works
      </h2>
      <ol className="mt-4 grid gap-5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-1 lg:gap-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 sm:block lg:flex">
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute -bottom-5 left-[10px] top-6 w-1 bg-bullet-red sm:bottom-auto sm:left-6 sm:top-[10px] sm:h-1 sm:w-[calc(100%_-_8px)] lg:-bottom-5 lg:left-[10px] lg:top-6 lg:h-auto lg:w-1"
              />
            )}
            <span
              aria-hidden="true"
              className="relative z-10 block h-6 w-6 shrink-0 rounded-full border-[5px] border-bullet-red bg-white"
            />
            <div className="sm:mt-3 lg:mt-0">
              <p className="font-semibold leading-snug">{s.title}</p>
              <p className="mt-0.5 text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Legend of the five voices, like the line list on a station map. */
function Lines() {
  return (
    <section aria-labelledby="lines" className="rounded-xl border bg-card p-5">
      <h2 id="lines" className="text-base font-bold">
        The lines
      </h2>
      <p className="mt-0.5 text-sm text-muted">Every caption speaks in one subway voice.</p>
      <ul className="mt-4 space-y-3.5">
        {VIBE_KEYS.map((k) => (
          <li key={k} className="flex gap-3">
            <span className="mt-0.5">
              <VibeBullet vibe={k} size={26} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{VIBES[k].label}</span>
              <span className="block text-[13px] italic leading-snug text-ink/70">{VIBES[k].sample}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function Home() {
  const { user } = await getCurrentProfile();
  const loggedIn = !!user;
  const theme = todaysTheme();
  const tomorrow = tomorrowsTheme();
  const { long, dayOfMonth } = todayLabelNY();

  let recent: PostWithCaptions[] = [];
  let memes: Meme[] = [];
  let top: Meme[] = [];
  let race: Race | null = null;
  let loadError: string | null = null;
  try {
    const [r, t, rc] = await Promise.all([getRecentMemes(12), getTopMemesToday(4), getRace().catch(() => null)]);
    recent = r.posts;
    memes = r.memes;
    top = t;
    race = rc;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "unknown error";
  }

  // Today's posts by other people that this viewer hasn't voted on yet.
  const since = Date.parse(startOfTodayNY());
  const waiting = user
    ? recent.filter((p) => Date.parse(p.created_at) >= since && p.user_id !== user.id && !p.voted_by_me).length
    : 0;

  const postHref = loggedIn ? "/create" : "/login?next=/create";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
      {/* First impression: what this is, then today's theme */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col justify-center rounded-xl border bg-card p-5 sm:p-7">
          <h1 className="text-[28px] font-bold leading-[1.08] tracking-tight text-balance sm:text-[38px]">
            Your week in New York, captioned by the subway.
          </h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink/80">
            Post a photo from your week. Gemini turns it into memes in five subway voices: a conductor, an MTA service
            alert, a showtime crew, an overheard stranger or a roast. Everyone votes on each meme, and every vote moves
            you a stop up the 1 train toward Columbia.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={postHref}
              className="rounded-full bg-metro px-5 py-2.5 text-[15px] font-semibold text-ink transition-colors hover:bg-metro-deep"
            >
              {loggedIn ? "Post a photo" : "Sign in to post"}
            </Link>
            <Link href="#fresh" className="rounded-full border bg-white px-5 py-2.5 text-[15px] font-semibold hover:border-ink/40">
              Vote on memes
            </Link>
          </div>
        </div>

        <section aria-labelledby="theme" className="rounded-xl bg-sign px-5 pb-6 pt-4 text-white sm:px-7">
          <div aria-hidden="true" className="h-px bg-white/60" />
          <div className="mt-4 flex items-center gap-3">
            <LineBullet letter={dayOfMonth} bg="#fccc0a" fg="#16181a" size={34} />
            <p className="text-sm text-white/80">Today&apos;s theme, {long}</p>
          </div>
          <h2 id="theme" className="mt-3 text-[28px] font-bold leading-[1.08] tracking-tight text-balance sm:text-[40px]">
            {theme}
          </h2>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href={postHref}
              className="rounded-full bg-metro px-5 py-2.5 text-[15px] font-semibold text-ink transition-colors hover:bg-metro-deep"
            >
              {loggedIn ? "Post for today's theme" : "Sign in to post"}
            </Link>
            <NextThemeClock tomorrow={tomorrow} />
          </div>
        </section>
      </section>

      {loggedIn && waiting > 0 && (
        <Link
          href="#fresh"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-ink/30"
        >
          <span className="text-[15px]">
            <span className="font-semibold">{waiting}</span> {waiting === 1 ? "post from today is" : "posts from today are"} waiting for
            your vote. Each vote is one stop toward Columbia.
          </span>
          <span className="shrink-0 text-sm font-semibold text-bullet-blue">Vote now</span>
        </Link>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        {/* Sidebar: first on phones (above the feed), right column on desktop */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:order-2 lg:self-start">
          {!loggedIn && <HowItWorks />}
          {race && <RaceMini riders={race.riders} meId={user?.id ?? null} />}
          <div className="hidden lg:block">
            <Lines />
          </div>
        </aside>

        <div className="min-w-0 lg:order-1">
          {loadError && (
            <p role="alert" className="mb-6 rounded-xl border border-bullet-red/30 bg-bullet-red/5 p-4 text-sm text-ink">
              The feed didn&apos;t load ({loadError}). Refresh the page to try again.
            </p>
          )}

          {top.length > 0 && (
            <section aria-labelledby="top-today" className="mb-10">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="top-today" className="text-xl font-bold tracking-tight">
                  Top memes today
                </h2>
                <Link href="/top" className="text-sm font-medium text-muted hover:text-ink">
                  Full leaderboard
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {top.map((m, i) => (
                  <MemeCard key={m.caption.id} meme={m} loggedIn={loggedIn} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          <section id="fresh" aria-labelledby="fresh-title" className="scroll-mt-20">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="fresh-title" className="text-xl font-bold tracking-tight">
                Fresh
              </h2>
              {memes.length > 0 && <span className="text-sm text-muted">Newest posts first, one card per caption</span>}
            </div>
            {memes.length === 0 && !loadError ? (
              <div className="rounded-xl border border-dashed bg-card p-8 text-center">
                <p className="text-[15px]">Nothing posted yet. Be the first one on today&apos;s theme.</p>
                <Link
                  href={postHref}
                  className="mt-4 inline-block rounded-full bg-metro px-5 py-2.5 text-sm font-semibold text-ink hover:bg-metro-deep"
                >
                  {loggedIn ? "Create a post" : "Sign in to post"}
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {memes.map((m) => (
                  <MemeCard key={m.caption.id} meme={m} loggedIn={loggedIn} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
