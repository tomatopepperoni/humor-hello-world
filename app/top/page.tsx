import type { Metadata } from "next";
import Link from "next/link";
import VoteButtons from "@/app/components/VoteButtons";
import PostCard, { Avatar, displayName, timeAgo } from "@/app/components/PostCard";
import { CopyButton } from "@/app/components/CopyButton";
import { VibeBullet } from "@/app/components/LineBullet";
import { getCurrentProfile } from "@/lib/profile";
import { getTopCaptionsAllTime, getTopPostsToday } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard" };

export default async function TopPage() {
  const [{ user }, today, allTime] = await Promise.all([
    getCurrentProfile(),
    getTopPostsToday(5),
    getTopCaptionsAllTime(20),
  ]);
  const loggedIn = !!user;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <h1 className="text-[28px] font-bold tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-[15px] text-muted">
        Ranked by votes (up minus down). Today&apos;s board resets at midnight New York time.
      </p>

      <section aria-labelledby="today" className="mt-8">
        <h2 id="today" className="mb-3 text-xl font-bold tracking-tight">
          Top posts today
        </h2>
        {today.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px]">
            <p>No votes yet today, so nobody is winning.</p>
            <Link href="/#fresh" className="mt-3 inline-block rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep">
              Vote on today&apos;s posts
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {today.map((p, i) => (
              <PostCard key={p.id} post={p} loggedIn={loggedIn} rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="all-time" className="mt-12">
        <h2 id="all-time" className="mb-3 text-xl font-bold tracking-tight">
          Best captions of all time
        </h2>
        {allTime.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px] text-muted">
            Nothing has an upvote yet. The first one you give puts a caption here.
          </p>
        ) : (
          <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
            {allTime.map(({ caption, post }, i) => (
              <li key={caption.id} className="flex items-start gap-3 p-4">
                <span
                  className={`w-6 shrink-0 pt-0.5 text-right text-lg font-bold tabular-nums ${i < 3 ? "text-ink" : "text-muted"}`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] leading-snug">
                    {caption.vibe && (
                      <span className="mr-1.5 inline-block align-[-3px]">
                        <VibeBullet vibe={caption.vibe} size={18} />
                      </span>
                    )}
                    {caption.text}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Avatar name={post.author?.first_name ?? null} url={post.author?.avatar_url ?? null} size={18} />
                    <span>{displayName(post.author?.first_name)}</span>
                    <span>{timeAgo(post.created_at)}</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1">
                    <VoteButtons captionId={caption.id} score={caption.score} myVote={caption.my_vote} loggedIn={loggedIn} />
                    <Link href={`/p/${post.id}`} className="rounded-full px-2.5 py-1 text-sm font-medium text-ink hover:bg-paper">
                      Open
                    </Link>
                    <CopyButton text={caption.text} />
                  </div>
                </div>
                {post.image_url && (
                  <Link href={`/p/${post.id}`} className="shrink-0" aria-label="Open post">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.image_url} alt="" className="h-16 w-16 rounded-lg border object-cover" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
