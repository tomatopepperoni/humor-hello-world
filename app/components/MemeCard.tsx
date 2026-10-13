import Link from "next/link";
import VoteButtons from "@/app/components/VoteButtons";
import { CopyButton } from "@/app/components/CopyButton";
import { LineBullet, VibeBullet } from "@/app/components/LineBullet";
import { Avatar, displayName, timeAgo } from "@/app/components/PostCard";
import type { Meme } from "@/lib/posts";
import { isVibe, type Vibe } from "@/lib/vibes";

/**
 * A post without a photo still needs a picture: its moment is set as a station
 * sign, so the grid never shows a bare one-liner.
 */
export function SignVisual({ text, vibe = null, className = "" }: { text: string; vibe?: Vibe | null; className?: string }) {
  const size = text.length > 110 ? "text-[19px]" : text.length > 60 ? "text-[23px]" : "text-[28px]";
  return (
    <div className={`flex flex-col justify-end bg-sign p-5 text-white ${className}`}>
      <div aria-hidden="true" className="mb-4 h-px bg-white/50" />
      <div className="flex items-start gap-3">
        {vibe && (
          <span className="mt-1">
            <VibeBullet vibe={vibe} size={28} />
          </span>
        )}
        <p className={`font-bold leading-[1.15] tracking-tight text-balance ${size}`}>{text}</p>
      </div>
    </div>
  );
}

/** One caption + its post's photo: the unit people vote on. */
export default function MemeCard({ meme, loggedIn, rank }: { meme: Meme; loggedIn: boolean; rank?: number }) {
  const { caption, post } = meme;
  const postVibe = isVibe(post.vibe) ? post.vibe : null;
  const vibe = caption.vibe ?? postVibe;
  const name = displayName(post.author?.first_name);
  const href = `/p/${post.id}#c-${caption.id}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-card">
      <Link href={href} className="relative block" aria-label={`Open the post: ${caption.text}`}>
        {post.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image_url}
            alt={post.context ?? "Photo from the post"}
            loading="lazy"
            className="aspect-[4/3] w-full bg-ink/5 object-cover sm:aspect-square"
          />
        ) : (
          <SignVisual text={post.context ?? ""} className="aspect-[4/3] sm:aspect-square" />
        )}
        {rank !== undefined && (
          <span className="absolute left-3 top-3">
            <LineBullet letter={rank} bg="#fccc0a" fg="#16181a" size={34} title={`Rank ${rank}`} />
          </span>
        )}
        {meme.total > 1 && (
          <span className="absolute right-3 top-3 rounded-full bg-sign/80 px-2.5 py-1 text-xs font-semibold text-white">
            {meme.index} of {meme.total}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[17px] font-semibold leading-snug text-ink">
          {vibe && (
            <span className="mr-1.5 inline-block align-[-4px]">
              <VibeBullet vibe={vibe} size={20} />
            </span>
          )}
          {caption.text}
        </p>
        {post.image_url && post.context && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{post.context}</p>}

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <VoteButtons
            captionId={caption.id}
            upvotes={caption.upvotes}
            downvotes={caption.downvotes}
            myVote={caption.my_vote}
            loggedIn={loggedIn}
          />
          <CopyButton text={caption.text} />
        </div>

        <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted">
          <Avatar name={name} url={post.author?.avatar_url ?? null} size={18} />
          <span className="font-medium text-ink/80">{name}</span>
          <time dateTime={post.created_at}>{timeAgo(post.created_at)}</time>
        </p>
      </div>
    </article>
  );
}
