import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, displayName, timeAgo } from "@/app/components/PostCard";
import { VibeBullet } from "@/app/components/LineBullet";
import { getCurrentProfile } from "@/lib/profile";
import { getMyStats, getMyVotedMemes, getPostsByUser, type PostWithCaptions, type VotedMeme } from "@/lib/posts";
import { badgesFor, getRace, STOPS_TO_COLUMBIA } from "@/lib/race";
import { BadgeDiamond, ProgressLine, riderStatus } from "@/app/components/Race";
import { isVibe } from "@/lib/vibes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your profile" };

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function Thumb({ post }: { post: PostWithCaptions }) {
  return post.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg border object-cover" />
  ) : (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-paper">
      {isVibe(post.vibe) && <VibeBullet vibe={post.vibe} size={26} />}
    </span>
  );
}

function MyPostRow({ post }: { post: PostWithCaptions }) {
  const top = post.captions.find((c) => c.id === post.leading_caption_id) ?? post.captions[0];
  return (
    <li>
      <Link href={`/p/${post.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-paper">
        <Thumb post={post} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] leading-snug">{top ? top.text : post.context}</span>
          <span className="mt-0.5 block text-sm text-muted">
            {timeAgo(post.created_at)}, {post.captions.length} captions
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${
            post.total_score > 0 ? "bg-go/10 text-go" : "bg-paper text-muted"
          }`}
        >
          {post.total_score > 0 ? `+${post.total_score}` : post.total_score}
        </span>
      </Link>
    </li>
  );
}

function MyVoteRow({ m }: { m: VotedMeme }) {
  const up = m.caption.my_vote === 1;
  return (
    <li>
      <Link href={`/p/${m.post.id}#c-${m.caption.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-paper">
        <Thumb post={m.post} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] leading-snug">{m.caption.text}</span>
          <span className="mt-0.5 block text-sm text-muted">
            {displayName(m.post.author?.first_name)}&apos;s post, voted {timeAgo(m.voted_at)}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${up ? "bg-go/10 text-go" : "bg-hold/10 text-hold"}`}
        >
          {up ? "▲ Funny" : "▼ Not funny"}
        </span>
      </Link>
    </li>
  );
}

/**
 * Your profile: who you are and what you've done. Editing lives on /settings
 * (week 5 feedback: the old page mixed a dashboard and a form).
 */
export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { user, profile } = await getCurrentProfile();
  if (!user) redirect("/login?next=/profile");
  const { deleted, tab: tabParam } = await searchParams;
  const tab = tabParam === "votes" ? "votes" : "posts";

  const [posts, votes, stats, race] = await Promise.all([
    getPostsByUser(user.id),
    getMyVotedMemes(user.id),
    getMyStats(user.id),
    getRace().catch(() => null),
  ]);
  const me = race?.riders.find((r) => r.user_id === user.id);
  const earned = badgesFor(me);
  const points = posts.reduce((sum, p) => sum + p.total_score, 0);
  const fullName =
    [profile?.first_name ? displayName(profile.first_name) : null, profile?.last_name].filter(Boolean).join(" ") || "Your profile";

  const tabs = [
    { key: "posts", label: "Posts", count: stats.posts },
    { key: "votes", label: "Votes", count: stats.votes },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      {deleted === "1" && (
        <p role="status" className="mb-4 rounded-xl border bg-card p-3 text-sm">
          Post deleted.
        </p>
      )}

      {/* Who you are */}
      <section className="flex flex-wrap items-center gap-4">
        <Avatar name={fullName} url={profile?.avatar_url ?? null} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">{fullName}</h1>
          {profile?.bio ? (
            <p className="mt-0.5 text-[15px] text-ink/80">{profile.bio}</p>
          ) : (
            <p className="mt-0.5 text-[15px] text-muted">No bio yet.</p>
          )}
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold hover:border-ink/40"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
          Settings
        </Link>
      </section>

      {/* What you've done, at a glance */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat value={stats.posts} label={stats.posts === 1 ? "post" : "posts"} />
        <Stat value={points} label="points earned" />
        <Stat value={stats.votes} label="votes cast" />
      </div>

      {/* This week's race: one line + progress. The full map and rules live on /race. */}
      <section aria-labelledby="ride" className="mt-4 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ride" className="text-[15px] font-semibold">
            {me && me.points_week > 0 ? riderStatus(me) : "Not on the train yet this week"}
          </h2>
          <span className="text-sm tabular-nums text-muted">
            {Math.min(me?.points_week ?? 0, STOPS_TO_COLUMBIA)}/{STOPS_TO_COLUMBIA} stops
          </span>
        </div>
        <div className="mt-3">
          <ProgressLine station={me?.station ?? 0} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-muted">
            {earned.length > 0 ? (
              <>
                {earned.map((b) => (
                  <BadgeDiamond key={b.id} badge={b} size={18} />
                ))}
                <span className="ml-1">
                  {earned.length} {earned.length === 1 ? "badge" : "badges"}
                </span>
              </>
            ) : (
              "No badges yet"
            )}
          </span>
          <Link href="/race" className="text-sm font-semibold text-bullet-blue hover:underline">
            View details
          </Link>
        </div>
      </section>

      {/* Your posts and your votes, as two clear sections */}
      <section aria-label="Your activity" className="mt-10">
        <div role="tablist" aria-label="Activity" className="inline-flex rounded-full border bg-card p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              href={t.key === "posts" ? "/profile" : "/profile?tab=votes"}
              scroll={false}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.key ? "bg-sign text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
            </Link>
          ))}
        </div>

        <div className="mt-4" role="tabpanel">
          {tab === "posts" ? (
            posts.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px]">
                <p>You haven&apos;t posted yet. Your posts and their points will show up here.</p>
                <Link href="/create" className="mt-3 inline-block rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep">
                  Create your first post
                </Link>
              </div>
            ) : (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {posts.map((p) => (
                  <MyPostRow key={p.id} post={p} />
                ))}
              </ul>
            )
          ) : votes.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-6 text-center text-[15px]">
              <p>No votes yet. The memes you vote on will show up here.</p>
              <Link href="/#fresh" className="mt-3 inline-block rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep">
                Vote on today&apos;s memes
              </Link>
            </div>
          ) : (
            <>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {votes.map((m) => (
                  <MyVoteRow key={m.caption.id} m={m} />
                ))}
              </ul>
              {stats.votes > votes.length && (
                <p className="mt-2 text-sm text-muted">Showing your {votes.length} most recent votes.</p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
