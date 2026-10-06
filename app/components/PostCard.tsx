import Link from "next/link";
import VoteButtons from "@/app/components/VoteButtons";
import type { PostWithCaptions } from "@/lib/posts";
import { VIBES, isVibe } from "@/lib/vibes";

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Avatar({
  name,
  url,
  size = 28,
}: {
  name: string | null;
  url: string | null;
  size?: number;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size }} className="rounded-full border object-cover" />;
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600"
    >
      {(name ?? "?")[0]?.toUpperCase()}
    </span>
  );
}

export default function PostCard({
  post,
  loggedIn,
  rank,
  showPrompt = false,
}: {
  post: PostWithCaptions;
  loggedIn: boolean;
  rank?: number;
  showPrompt?: boolean;
}) {
  const vibe = isVibe(post.vibe) ? VIBES[post.vibe] : null;
  const name = post.author?.first_name ?? "Someone";

  return (
    <article className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      {/* header */}
      <div className="flex items-center gap-3 px-4 pt-4">
        {rank !== undefined && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
            {rank}
          </span>
        )}
        <Avatar name={name} url={post.author?.avatar_url ?? null} />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{name}</span>
          <span className="text-gray-400"> · {timeAgo(post.created_at)}</span>
        </div>
        {vibe && (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
            {vibe.emoji} {vibe.label}
          </span>
        )}
      </div>

      {/* theme + context */}
      {(post.theme || post.context) && (
        <div className="px-4 pt-3">
          {post.theme && (
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">
              Theme: {post.theme}
            </p>
          )}
          {post.context && <p className="mt-1 text-gray-800">{post.context}</p>}
        </div>
      )}

      {/* image */}
      {post.image_url && (
        <Link href={`/p/${post.id}`} className="mt-3 block bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image_url}
            alt={post.context ?? "Uploaded photo"}
            className="mx-auto max-h-[480px] w-full object-contain"
          />
        </Link>
      )}

      {/* captions */}
      <ul className="divide-y">
        {post.captions.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-4 py-3">
            <VoteButtons captionId={c.id} score={c.score} myVote={c.my_vote} loggedIn={loggedIn} />
            <div className="min-w-0 flex-1">
              <p className="leading-snug">{c.text}</p>
              {showPrompt && (
                <details className="mt-2 text-xs text-gray-500">
                  <summary className="cursor-pointer select-none">
                    Prompt · {c.model}
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[11px] leading-relaxed">
                    {c.prompt}
                  </pre>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
        <span>
          {post.captions.length} captions · {post.total_score} total points
        </span>
        <Link href={`/p/${post.id}`} className="font-medium text-gray-700 hover:underline">
          Open →
        </Link>
      </div>
    </article>
  );
}
