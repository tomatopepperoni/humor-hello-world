import Link from "next/link";
import PostCard from "@/app/components/PostCard";
import { getCurrentProfile } from "@/lib/profile";
import { getMyStats, getRecentPosts, getTopPostsToday } from "@/lib/posts";
import { todaysTheme } from "@/lib/vibes";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, profile } = await getCurrentProfile();
  const theme = todaysTheme();

  let recent: Awaited<ReturnType<typeof getRecentPosts>> = [];
  let top: Awaited<ReturnType<typeof getTopPostsToday>> = [];
  let stats: { posts: number; votes: number } | null = null;
  let loadError: string | null = null;
  try {
    [recent, top, stats] = await Promise.all([
      getRecentPosts(20),
      getTopPostsToday(3),
      user ? getMyStats(user.id) : Promise.resolve(null),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load the feed.";
  }

  const loggedIn = !!user;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      {/* Hero / today's theme */}
      <section className="rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 p-6 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
          Today&apos;s theme
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{theme}</h1>
        <p className="mt-2 max-w-md text-sm text-white/90">
          Drop a photo or a one-liner, pick a vibe, and Gemini writes three captions.
          The campus votes. Best caption of the day wins bragging rights.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={loggedIn ? "/create" : "/login?next=/create"}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-rose-600 shadow hover:bg-rose-50"
          >
            {loggedIn ? "Caption something →" : "Sign in to post →"}
          </Link>
          {stats && (
            <span className="text-xs text-white/80">
              Hi {profile?.first_name ?? "there"} — {stats.posts} posts · {stats.votes} votes cast
            </span>
          )}
          {!loggedIn && (
            <span className="text-xs text-white/80">Anyone can browse. Voting needs a login.</span>
          )}
        </div>
      </section>

      {loadError && (
        <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {loadError}
          <br />
          <span className="text-xs">
            (Did you run <code>supabase/week4_rating.sql</code> in the SQL editor?)
          </span>
        </p>
      )}

      {/* Top today */}
      {top.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">🏆 Top today</h2>
            <Link href="/top" className="text-sm text-gray-500 hover:underline">
              All-time board →
            </Link>
          </div>
          <div className="space-y-4">
            {top.map((p, i) => (
              <PostCard key={p.id} post={p} loggedIn={loggedIn} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* Fresh */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">🆕 Fresh</h2>
          <span className="text-sm text-gray-500">{recent.length} latest</span>
        </div>
        {recent.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-gray-500">
            <p>Nothing here yet. Be the first to post for today&apos;s theme.</p>
            <Link
              href={loggedIn ? "/create" : "/login?next=/create"}
              className="mt-3 inline-block rounded-full bg-black px-4 py-2 text-sm text-white"
            >
              Create a post
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
