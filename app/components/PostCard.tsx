import Link from "next/link";
import VoteButtons from "@/app/components/VoteButtons";
import { CopyButton, ShareButton } from "@/app/components/CopyButton";
import { LineBullet, VibeBullet } from "@/app/components/LineBullet";
import type { CaptionWithScore, PostWithCaptions } from "@/lib/posts";
import { isVibe, type Vibe } from "@/lib/vibes";

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function Avatar({
  name,
  url,
  size = 28,
  onDark = false,
}: {
  name: string | null;
  url: string | null;
  size?: number;
  onDark?: boolean;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full border object-cover" />;
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        onDark ? "bg-white text-ink" : "bg-ink/10 text-ink/70"
      }`}
    >
      {(name ?? "?")[0]?.toUpperCase()}
    </span>
  );
}

/** "MINSUK" → "Minsuk" so names in the feed read consistently. */
export function displayName(name: string | null | undefined) {
  if (!name) return "Someone";
  return name === name.toUpperCase() && name.length > 1 ? name[0] + name.slice(1).toLowerCase() : name;
}

const FEED_CAPTIONS = 3;

function SignCard({ text, vibe, href }: { text: string; vibe: Vibe | null; href?: string }) {
  const body = (
    <div className="rounded-xl bg-sign px-4 pb-5 pt-3 text-white sm:px-5">
      <div aria-hidden="true" className="h-px bg-white/50" />
      <div className="mt-3.5 flex items-start gap-3">
        {vibe && (
          <span className="mt-0.5">
            <VibeBullet vibe={vibe} size={30} />
          </span>
        )}
        <p className="text-[20px] font-bold leading-snug tracking-tight text-balance sm:text-[24px]">{text}</p>
      </div>
    </div>
  );
  return (
    <div className="px-4 pt-3 sm:px-5">
      {href ? (
        <Link href={href} className="block rounded-xl" aria-label="Open post">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

function CaptionRow({
  c,
  postVibe,
  leading,
  loggedIn,
}: {
  c: CaptionWithScore;
  postVibe: string;
  leading: boolean;
  loggedIn: boolean;
}) {
  // Caption first (it's the product), then the vote / copy row. The prompt is
  // saved with every caption in the database but not shown to users.
  return (
    <li
      id={`c-${c.id}`}
      className={`relative grid scroll-mt-24 grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2.5 px-4 py-3.5 [grid-template-areas:'text_text_text'_'vote_._copy'] target:bg-bullet-blue/10 sm:px-5 ${
        leading ? "bg-metro/15" : ""
      }`}
    >
      {leading && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-metro" />}
      <div className="[grid-area:vote]">
        <VoteButtons captionId={c.id} upvotes={c.upvotes} downvotes={c.downvotes} myVote={c.my_vote} loggedIn={loggedIn} />
      </div>
      <div className="min-w-0 [grid-area:text]">
        <p className="text-[17px] leading-snug text-ink sm:text-[18px]">
          {c.vibe && c.vibe !== postVibe && (
            <span className="mr-1.5 inline-block align-[-3px]">
              <VibeBullet vibe={c.vibe} size={18} />
            </span>
          )}
          {c.text}
        </p>
        {leading && <p className="mt-1 text-xs font-semibold text-ink/80">Leading caption</p>}
      </div>

      <div className="self-center justify-self-end [grid-area:copy]">
        <CopyButton text={c.text} />
      </div>
    </li>
  );
}

export default function PostCard({
  post,
  loggedIn,
  rank,
  full = false,
}: {
  post: PostWithCaptions;
  loggedIn: boolean;
  rank?: number;
  /** Post page: every caption, the saved prompts, no "open" link. */
  full?: boolean;
}) {
  const postVibe = isVibe(post.vibe) ? post.vibe : null;
  const name = displayName(post.author?.first_name);

  // Feed: the three best captions. Post page: all of them, in the order written.
  const captions = full
    ? post.captions
    : [...post.captions].sort((a, b) => b.score - a.score || a.position - b.position).slice(0, FEED_CAPTIONS);
  const hidden = post.captions.length - captions.length;
  const top = post.captions.find((c) => c.id === post.leading_caption_id) ?? post.captions[0];

  return (
    <article className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        {rank !== undefined && <LineBullet letter={rank} bg="#fccc0a" fg="#16181a" size={28} title={`Rank ${rank}`} />}
        <Avatar name={name} url={post.author?.avatar_url ?? null} />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{name}</span>{" "}
          <time dateTime={post.created_at} className="text-muted">
            {timeAgo(post.created_at)}
          </time>
        </p>
        {postVibe && <VibeBullet vibe={postVibe} withLabel />}
      </header>

      {post.theme && <p className="px-4 pt-3 text-sm text-muted sm:px-5">Theme: {post.theme}</p>}

      {post.context && post.image_url && <p className="px-4 pt-1 text-[15px] text-ink sm:px-5">{post.context}</p>}

      {/* Text-only post: the moment itself becomes a station sign, so it isn't a plain grey line. */}
      {post.context && !post.image_url && (
        <SignCard text={post.context} vibe={postVibe} href={full ? undefined : `/p/${post.id}`} />
      )}

      {post.image_url &&
        (full ? (
          <div className="mt-3 bg-ink/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image_url} alt={post.context ?? "Photo from the post"} className="mx-auto max-h-[560px] w-full object-contain" />
          </div>
        ) : (
          <Link href={`/p/${post.id}`} className="mt-3 block bg-ink/5" aria-label="Open post">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image_url} alt={post.context ?? "Photo from the post"} className="mx-auto max-h-[440px] w-full object-contain" />
          </Link>
        ))}

      {captions.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">No captions on this post yet.</p>
      ) : (
        <ul className={`divide-y border-t ${post.image_url ? "" : "mt-4"}`}>
          {captions.map((c) => (
            <CaptionRow
              key={c.id}
              c={c}
              postVibe={post.vibe}
              leading={c.id === post.leading_caption_id && post.captions.length > 1}
              loggedIn={loggedIn}
            />
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm sm:px-5">
        <p className="text-muted">
          {post.captions.length} {post.captions.length === 1 ? "caption" : "captions"},{" "}
          {post.total_score} {Math.abs(post.total_score) === 1 ? "point" : "points"}
        </p>
        <div className="flex items-center gap-1">
          <ShareButton
            url={`/p/${post.id}`}
            title="Captioned NYC"
            text={top ? `“${top.text}” — vote on it` : "Vote on these captions"}
            className="rounded-full px-3 py-1 font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
          />
          {!full && (
            <Link
              href={`/p/${post.id}`}
              className="rounded-full px-3 py-1 font-medium text-ink transition-colors hover:bg-paper"
            >
              {hidden > 0 ? `See all ${post.captions.length}` : "Open"}
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
