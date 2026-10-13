import Link from "next/link";
import PostCard from "@/app/components/PostCard";
import { LineBullet } from "@/app/components/LineBullet";
import { getCurrentProfile } from "@/lib/profile";
import { getRecentPosts, getTopPostsToday, type PostWithCaptions } from "@/lib/posts";
import { startOfTodayNY, todayLabelNY, todaysTheme, tomorrowsTheme } from "@/lib/vibes";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Post a moment", body: "A photo, a one-liner from your week in the city, or both." },
  { title: "Gemini writes three captions", body: "Pick the vibe: deadpan, roast, Midwest nice or main character." },
  { title: "Everyone votes", body: "The funniest caption tops today's board. Copy the winner for your story." },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how" className="mt-5 rounded-xl border bg-card p-5">
      <h2 id="how" className="text-base font-semibold">
        How it works
      </h2>
      <ol className="mt-4 grid gap-5 sm:grid-cols-3 sm:gap-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 sm:block">
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[10px] top-6 -bottom-5 w-1 bg-bullet-blue sm:bottom-auto sm:left-6 sm:top-[10px] sm:h-1 sm:w-[calc(100%_-_8px)]"
              />
            )}
            <span
              aria-hidden="true"
              className="relative z-10 block h-6 w-6 shrink-0 rounded-full border-[5px] border-bullet-blue bg-white"
            />
            <div className="sm:mt-3">
              <p className="font-semibold leading-snug">{s.title}</p>
              <p className="mt-0.5 text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
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
  let top: PostWithCaptions[] = [];
  let loadError: string | null = null;
  try {
    [recent, top] = await Promise.all([getRecentPosts(20), getTopPostsToday(3)]);
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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      {/* Today's theme, styled as a station sign */}
      <section aria-labelledby="theme" className="rounded-xl bg-sign px-5 pb-6 pt-4 text-white sm:px-7 sm:pb-7">
        <div aria-hidden="true" className="h-px bg-white/60" />
        <div className="mt-4 flex items-center gap-3">
          <LineBullet letter={dayOfMonth} bg="#fccc0a" fg="#16181a" size={34} />
          <p className="text-sm text-white/80">Today&apos;s theme, {long}</p>
        </div>
        <h1 id="theme" className="mt-3 text-[30px] font-bold leading-[1.08] tracking-tight text-balance sm:text-[40px]">
          {theme}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href={postHref}
            className="rounded-full bg-metro px-5 py-2.5 text-[15px] font-semibold text-ink transition-colors hover:bg-metro-deep"
          >
            {loggedIn ? "Post for today's theme" : "Sign in to post"}
          </Link>
          <p className="text-sm text-white/70">
            New theme at midnight. Tomorrow: {tomorrow}
          </p>
        </div>
      </section>

      {loggedIn && waiting > 0 && (
        <Link
          href="#fresh"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-ink/30"
        >
          <span className="text-[15px]">
            <span className="font-semibold">{waiting}</span> {waiting === 1 ? "post from today is" : "posts from today are"} waiting for your vote
          </span>
          <span className="shrink-0 text-sm font-semibold text-bullet-blue">Vote now</span>
        </Link>
      )}

      {!loggedIn && <HowItWorks />}

      {loadError && (
        <p role="alert" className="mt-6 rounded-xl border border-bullet-red/30 bg-bullet-red/5 p-4 text-sm text-ink">
          The feed didn&apos;t load ({loadError}). Refresh the page to try again.
        </p>
      )}

      {top.length > 0 && (
        <section aria-labelledby="top-today" className="mt-10">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="top-today" className="text-xl font-bold tracking-tight">
              Top today
            </h2>
            <Link href="/top" className="text-sm font-medium text-muted hover:text-ink">
              Full leaderboard
            </Link>
          </div>
          <div className="space-y-4">
            {top.map((p, i) => (
              <PostCard key={p.id} post={p} loggedIn={loggedIn} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      <section id="fresh" aria-labelledby="fresh-title" className="mt-10 scroll-mt-20">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="fresh-title" className="text-xl font-bold tracking-tight">
            Fresh
          </h2>
          {recent.length > 0 && <span className="text-sm text-muted">Newest first</span>}
        </div>
        {recent.length === 0 && !loadError ? (
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
          <div className="space-y-4">
            {recent.map((p) => (
              <PostCard key={p.id} post={p} loggedIn={loggedIn} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
