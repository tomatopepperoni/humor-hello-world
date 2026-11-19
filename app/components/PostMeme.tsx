import PostMemeCard from "@/app/components/PostMemeCard";
import { displayName, timeAgo } from "@/app/components/PostCard";
import type { PostWithCaptions } from "@/lib/posts";
import { isVibe } from "@/lib/vibes";

/** Server side of the feed card: turns a post into the plain props the client card needs. */
export default function PostMeme({
  post,
  loggedIn,
  rank,
  startCaptionId,
  champion = false,
}: {
  post: PostWithCaptions;
  loggedIn: boolean;
  rank?: number;
  /** open on this caption instead of the best-voted one */
  startCaptionId?: string;
  /** the author was first to Columbia this week */
  champion?: boolean;
}) {
  if (post.captions.length === 0) return null;
  const postVibe = isVibe(post.vibe) ? post.vibe : null;
  const ordered = [...post.captions].sort((a, b) => a.position - b.position);
  const best = [...ordered].sort((a, b) => b.score - a.score || a.position - b.position)[0];
  return (
    <PostMemeCard
      postId={post.id}
      imageUrl={post.image_url}
      context={post.context}
      createdAt={post.created_at}
      ago={timeAgo(post.created_at)}
      authorName={displayName(post.author?.first_name)}
      authorAvatar={post.author?.avatar_url ?? null}
      captions={ordered.map((c) => ({
        id: c.id,
        text: c.text,
        vibe: c.vibe ?? postVibe,
        upvotes: c.upvotes,
        downvotes: c.downvotes,
        myVote: c.my_vote,
      }))}
      startId={startCaptionId && ordered.some((c) => c.id === startCaptionId) ? startCaptionId : best.id}
      loggedIn={loggedIn}
      rank={rank}
      champion={champion}
    />
  );
}
