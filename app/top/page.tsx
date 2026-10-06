import Link from "next/link";
import VoteButtons from "@/app/components/VoteButtons";
import { Avatar, timeAgo } from "@/app/components/PostCard";
import { getCurrentProfile } from "@/lib/profile";
import { getTopCaptionsAllTime, getTopPostsToday } from "@/lib/posts";
import PostCard from "@/app/components/PostCard";

export const dynamic = "force-dynamic";

export default async function TopPage() {
  const [{ user }, today, allTime] = await Promise.all([
    getCurrentProfile(),
    getTopPostsToday(5),
    getTopCaptionsAllTime(20),
  ]);
  const loggedIn = !!user;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <p className="mt-1 text-sm text-gray-600">
        Ranked by votes. “Today” resets at midnight New York time.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">🏆 Top posts today</h2>
        {today.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-gray-500">
            No votes yet today.{" "}
            <Link href="/" className="underline">
              Go vote on something
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            {today.map((p, i) => (
              <PostCard key={p.id} post={p} loggedIn={loggedIn} rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">🔥 Best captions of all time</h2>
        {allTime.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-gray-500">
            Nothing has been voted on yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {allTime.map(({ caption, post }, i) => (
              <li key={caption.id} className="flex items-start gap-3 rounded-xl border bg-white p-3">
                <span className="mt-1 w-6 text-right text-sm font-bold text-gray-400">{i + 1}</span>
                <VoteButtons
                  captionId={caption.id}
                  score={caption.score}
                  myVote={caption.my_vote}
                  loggedIn={loggedIn}
                />
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">{caption.text}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <Avatar name={post.author?.first_name ?? null} url={post.author?.avatar_url ?? null} size={18} />
                    <span>{post.author?.first_name ?? "Someone"}</span>
                    <span>· {timeAgo(post.created_at)}</span>
                    <Link href={`/p/${post.id}`} className="hover:underline">
                      · open
                    </Link>
                  </div>
                </div>
                {post.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.image_url} alt="" className="h-14 w-14 rounded-lg border object-cover" />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
