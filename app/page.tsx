import Link from "next/link";
import PostMeme from "@/app/components/PostMeme";
import { LineBullet, VibeBullet } from "@/app/components/LineBullet";
import NextThemeClock from "@/app/components/NextThemeClock";
import { RaceMini } from "@/app/components/Race";
import VoiceFilter from "@/app/components/VoiceFilter";
import { PulseCard } from "@/app/components/WeekPulse";
import { getCurrentProfile } from "@/lib/profile";
import { getRecentMemes, getTopMemesToday, type Meme, type PostWithCaptions } from "@/lib/posts";
import { getWeekPulse, type WeekPulse } from "@/lib/pulse";
import { getRace, type Race } from "@/lib/race";
import { VIBES, type Vibe, isVibe, startOfTodayNY, todayLabelNY, todaysTheme, tomorrowsTheme } from "@/lib/vibes";

export const dynamic = "force-dynamic";

/**
 * The three things you can do here, in order (week 5 feedback: the home page
 * should lead with browse, vote, create; everything else is one click deeper).
 */
function ActionTile({
  n,
  title,
  body,
  href,
  primary = false,
}: {
  n: number;
  title: string;
  body: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-xl border p-4 transition-colors ${
        primary ? "border-metro bg-metro hover:bg-metro-deep" : "bg-white hover:border-ink/40"
      }`}
    >
      <LineBullet letter={n} bg={primary ? "#16181a" : "#ee352e"} fg="#ffffff" size={28} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[16px] font-bold leading-tight">
          {title}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
        <span className={`mt-0.5 block text-sm leading-snug ${primary ? "text-ink/80" : "text-muted"}`}>{body}</span>
      </span>
    </Link>
  );
}

/**
 * Shown to visitors who aren't signed in (week 11 feedback: a new visitor
 * couldn't tell what kind of site this is). One real input and one real output.
 */
function ExampleCaption() {
  return (
    <figure className="mt-4 max-w-xl rounded-xl border bg-white p-3.5">
      <figcaption className="text-xs font-semibold text-muted">Example</figcaption>
      <p className="mt-1.5 text-sm text-ink/75">Someone posts: &ldquo;Waited 45 minutes in line for a cookie.&rdquo;</p>
      <div className="mt-2 flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          <VibeBullet vibe="roast" size={24} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-snug">{VIBES.roast.sample}</span>
          <span className="block text-[13px] text-muted">
            The AI&apos;s caption in the &ldquo;Roast me&rdquo; voice. Everyone votes ▲ or ▼ on it.
          </span>
        </span>
      </div>
    </figure>
  );
}

export default async function Home() {
  const { user } = await getCurrentProfile();
  const loggedIn = !!user;
  const theme = todaysTheme();
  const tomorrow = tomorrowsTheme();
  const { long, dayOfMonth } = todayLabelNY();

  let recent: PostWithCaptions[] = [];
  let top: Meme[] = [];
  let race: Race | null = null;
  let pulse: WeekPulse | null = null;
  let loadError: string | null = null;
  try {
    const [r, t, rc, pl] = await Promise.all([
      getRecentMemes(12),
      getTopMemesToday(12),
      getRace().catch(() => null),
      getWeekPulse().catch(() => null),
    ]);
    recent = r.posts;
    top = t;
    race = rc;
    pulse = pl;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "unknown error";
  }

  // Today's posts by other people that this viewer hasn't voted on yet.
  const since = Date.parse(startOfTodayNY());
  const waiting = user
    ? recent.filter((p) => Date.parse(p.created_at) >= since && p.user_id !== user.id && !p.voted_by_me).length
    : 0;

  const postHref = loggedIn ? "/create" : "/login?next=/create";

  // One card per post (week 11: the same photo three times in a row read as duplicates).
  const feed = recent.filter((p) => p.captions.length > 0);
  // Top today: a post appears once, on its best caption, ranked by that caption's score.
  const topPosts: Meme[] = [];
  for (const m of top) {
    if (topPosts.length < 4 && !topPosts.some((x) => x.post.id === m.post.id)) topPosts.push(m);
  }
  const voicesOf = (p: PostWithCaptions): Vibe[] => {
    const postVibe = isVibe(p.vibe) ? p.vibe : null;
    return p.captions.map((c) => c.vibe ?? postVibe).filter((v): v is Vibe => v !== null);
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* What this is + the three actions */}
        <div className="rounded-xl border bg-card p-5 sm:p-6">
          {!loggedIn && (
            <p className="mb-2 text-sm font-semibold text-bullet-red">
              New here? Captioned NYC is a caption game for Columbia students.
            </p>
          )}
          <h1 className="text-[26px] font-bold leading-[1.1] tracking-tight text-balance sm:text-[34px]">
            Your week in New York, captioned by the subway.
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink/75">
            {loggedIn
              ? "Post a photo, Gemini turns it into memes, and everyone votes on the funniest one."
              : "Post a photo from your week in the city. AI writes funny captions for it in a subway voice, like a conductor announcement or a roast. Everyone votes, and each vote moves you one stop toward Columbia on the 1 train."}
          </p>
          {!loggedIn && <ExampleCaption />}
          {/* On a phone a new visitor gets the explanation, then the feed: the tab bar already has these three. */}
          <div className={`mt-5 gap-3 sm:grid sm:grid-cols-3 ${loggedIn ? "grid" : "hidden"}`}>
            <ActionTile n={1} title="Browse" body="See today's memes from campus." href={topPosts.length ? "#top-today" : "#fresh"} />
            <ActionTile
              n={2}
              title="Vote"
              body={waiting > 0 ? `${waiting} ${waiting === 1 ? "post is" : "posts are"} waiting for your vote.` : "Tap ▲ on the ones that made you laugh."}
              href="#fresh"
            />
            <ActionTile n={3} title={loggedIn ? "Post" : "Sign in to post"} body="Get three AI captions for your photo." href={postHref} primary />
          </div>
        </div>

        {/* Today's theme */}
        <section aria-labelledby="theme" className="flex flex-col rounded-xl bg-sign px-5 pb-5 pt-4 text-white sm:px-6">
          <div aria-hidden="true" className="h-px bg-white/60" />
          <div className="mt-4 flex items-center gap-3">
            <LineBullet letter={dayOfMonth} bg="#fccc0a" fg="#16181a" size={30} />
            <p className="text-sm text-white/80">Today&apos;s theme, {long}</p>
          </div>
          <h2 id="theme" className="mt-3 text-[26px] font-bold leading-[1.1] tracking-tight text-balance sm:text-[34px]">
            {theme}
          </h2>
          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-5">
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

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="min-w-0">
          {loadError && (
            <p role="alert" className="mb-6 rounded-xl border border-bullet-red/30 bg-bullet-red/5 p-4 text-sm text-ink">
              The feed didn&apos;t load ({loadError}). Refresh the page to try again.
            </p>
          )}

          {topPosts.length > 0 && (
            <section id="top-today" aria-labelledby="top-today-title" className="mb-10 scroll-mt-20">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="top-today-title" className="text-xl font-bold tracking-tight">
                  Top memes today
                </h2>
                <Link href="/top" className="text-sm font-medium text-bullet-blue hover:underline">
                  Leaderboard
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {topPosts.map((m, i) => (
                  <PostMeme key={m.post.id} post={m.post} startCaptionId={m.caption.id} loggedIn={loggedIn} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          <section id="fresh" aria-labelledby="fresh-title" className="scroll-mt-20">
            <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <h2 id="fresh-title" className="text-xl font-bold tracking-tight">
                Fresh memes
              </h2>
              {feed.length > 0 && (
                <span className="text-sm text-muted">Newest first. Tap ‹ › on a photo to compare its captions.</span>
              )}
            </div>
            {feed.length === 0 && !loadError ? (
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
              <VoiceFilter
                gridClassName="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
                items={feed.map((p) => ({
                  id: p.id,
                  vibes: voicesOf(p),
                  node: <PostMeme post={p} loggedIn={loggedIn} />,
                }))}
              />
            )}
          </section>
        </div>

        {/* Two small side cards. On phones they sit after the feed. */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {race && <RaceMini riders={race.riders} meId={user?.id ?? null} />}
          {pulse && <PulseCard pulse={pulse} />}
        </aside>
      </div>
    </main>
  );
}
