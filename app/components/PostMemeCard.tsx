"use client";

import Link from "next/link";
import { useContext, useState } from "react";
import VoteButtons from "@/app/components/VoteButtons";
import { CopyButton } from "@/app/components/CopyButton";
import { LineBullet, VibeBullet } from "@/app/components/LineBullet";
import { SignVisual } from "@/app/components/MemeCard";
import { Avatar } from "@/app/components/PostCard";
import { ActiveVoiceContext } from "@/app/components/VoiceFilter";
import type { Vibe } from "@/lib/vibes";

export type CardCaption = {
  id: string;
  text: string;
  vibe: Vibe | null;
  upvotes: number;
  downvotes: number;
  myVote: number;
};

/**
 * One post in the feed: the photo once, with its captions one at a time on top
 * of it (week 11: three cards with the same photo read as duplicates). The
 * pager on the photo flips between captions; each one is voted on separately.
 *
 * The caption on show is remembered by id, so a refresh after a vote (which can
 * change scores) never swaps the caption under the reader.
 */
export default function PostMemeCard({
  postId,
  imageUrl,
  context,
  createdAt,
  ago,
  authorName,
  authorAvatar,
  captions,
  startId,
  loggedIn,
  rank,
  champion = false,
}: {
  postId: string;
  imageUrl: string | null;
  context: string | null;
  createdAt: string;
  /** "3h ago", worked out on the server so both renders agree */
  ago: string;
  authorName: string;
  authorAvatar: string | null;
  /** in a stable order (position) */
  captions: CardCaption[];
  /** caption to open on (the leading one) */
  startId: string;
  loggedIn: boolean;
  rank?: number;
  champion?: boolean;
}) {
  const voice = useContext(ActiveVoiceContext);
  const [sel, setSel] = useState<{ id: string; voice: Vibe | null }>({ id: startId, voice: null });

  // A voice filter that was switched on after the last pick jumps to that voice's caption.
  let index = captions.findIndex((c) => c.id === sel.id);
  if (sel.voice !== voice && voice) {
    const match = captions.findIndex((c) => c.vibe === voice);
    if (match >= 0) index = match;
  }
  if (index < 0) index = 0;
  const caption = captions[index];
  const total = captions.length;
  if (!caption) return null;

  const go = (step: number) => setSel({ id: captions[(index + step + total) % total].id, voice });
  const href = `/p/${postId}#c-${caption.id}`;
  const pagerBtn =
    "flex h-8 w-8 items-center justify-center rounded-full text-[17px] font-bold leading-none text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-metro";

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow duration-200 hover:shadow-[0_10px_28px_-14px_rgb(0_0_0/0.4)]">
      <div className="relative overflow-hidden">
        <Link href={href} className="block" aria-label={`Open the post: ${caption.text}`}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={context ?? "Photo from the post"}
              loading="lazy"
              className="aspect-[4/3] w-full bg-ink/5 object-cover transition-transform duration-300 group-hover:scale-[1.03] sm:aspect-square"
            />
          ) : (
            <SignVisual text={context ?? ""} className="aspect-[4/3] sm:aspect-square" />
          )}
        </Link>
        {rank !== undefined && (
          <span className="pointer-events-none absolute left-3 top-3">
            <LineBullet letter={rank} bg="#fccc0a" fg="#16181a" size={34} title={`Rank ${rank}`} />
          </span>
        )}
        {total > 1 && (
          <div className="absolute right-2 top-2 flex items-center rounded-full bg-sign/85 text-white">
            <button type="button" onClick={() => go(-1)} aria-label="Previous caption" className={pagerBtn}>
              ‹
            </button>
            <span className="px-0.5 text-xs font-semibold tabular-nums">
              {index + 1} of {total}
            </span>
            <button type="button" onClick={() => go(1)} aria-label="Next caption" className={pagerBtn}>
              ›
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p aria-live="polite" className="min-h-[70px] text-[17px] font-semibold leading-snug text-ink">
          {caption.vibe && (
            <span className="mr-1.5 inline-block align-[-4px]">
              <VibeBullet vibe={caption.vibe} size={20} />
            </span>
          )}
          {caption.text}
        </p>
        {imageUrl && context && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{context}</p>}

        <div className="mt-auto flex items-start justify-between gap-2 pt-4">
          <VoteButtons
            key={caption.id}
            captionId={caption.id}
            upvotes={caption.upvotes}
            downvotes={caption.downvotes}
            myVote={caption.myVote}
            loggedIn={loggedIn}
          />
          <CopyButton text={caption.text} />
        </div>

        <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted">
          <Avatar name={authorName} url={authorAvatar} size={18} />
          <span className="font-medium text-ink/80">{authorName}</span>
          {champion && <LineBullet letter="C" bg="#fccc0a" fg="#16181a" size={16} title="First to Columbia this week" />}
          <time dateTime={createdAt}>{ago}</time>
          {total > 1 && <span className="ml-auto">{total} captions to compare</span>}
        </p>
      </div>
    </article>
  );
}
