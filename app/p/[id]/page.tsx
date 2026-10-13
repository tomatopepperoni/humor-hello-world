import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PostCard, { displayName } from "@/app/components/PostCard";
import { ShareButton } from "@/app/components/CopyButton";
import OwnerTools from "./OwnerTools";
import { getCurrentProfile } from "@/lib/profile";
import { getPost } from "@/lib/posts";
import { isVibe } from "@/lib/vibes";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CAPTIONS = 9;

/** Link previews in group chats show the leading caption and the photo. */
export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Post not found" };
  const post = await getPost(id).catch(() => null);
  if (!post) return { title: "Post not found" };
  const top = post.captions.find((c) => c.id === post.leading_caption_id) ?? post.captions[0];
  const title = top ? `“${top.text}”` : "A post on Captioned NYC";
  const description = `${displayName(post.author?.first_name)} posted ${post.theme ? `for “${post.theme}”` : "a moment"}. Vote on the funniest caption.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: post.image_url ? [{ url: post.image_url }] : undefined,
    },
    twitter: { card: post.image_url ? "summary_large_image" : "summary", title, description },
  };
}

export default async function PostPage({ params, searchParams }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const [{ user }, post] = await Promise.all([getCurrentProfile(), getPost(id)]);
  if (!post) notFound();

  const mine = user?.id === post.user_id;
  const top = post.captions.find((c) => c.id === post.leading_caption_id) ?? post.captions[0];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
        Back to the feed
      </Link>

      {mine && isNew === "1" && (
        <div role="status" className="mt-4 rounded-xl bg-sign p-4 text-white sm:p-5">
          <p className="text-lg font-semibold">Your captions are ready.</p>
          <p className="mt-1 text-sm text-white/80">
            Copy the one you like, or send the post to friends so they can vote on it.
          </p>
          <ShareButton
            url={`/p/${post.id}`}
            title="Captioned NYC"
            text="Which caption is funniest? Vote here"
            className="mt-3 rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep"
          >
            Send to friends
          </ShareButton>
        </div>
      )}

      <div className="mt-4">
        <PostCard post={post} loggedIn={!!user} full />
      </div>

      {!user && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-[15px]">
            {top ? "Think you know which caption wins?" : "Want to join in?"} Sign in with Google to vote.
          </p>
          <Link
            href={`/login?next=/p/${post.id}`}
            className="rounded-full bg-metro px-4 py-2 text-sm font-semibold text-ink hover:bg-metro-deep"
          >
            Sign in to vote
          </Link>
        </div>
      )}

      {mine && (
        <OwnerTools
          postId={post.id}
          currentVibe={isVibe(post.vibe) ? post.vibe : "chronically-online"}
          captionCount={post.captions.length}
          maxCaptions={MAX_CAPTIONS}
        />
      )}

      {user && !mine && (
        <div className="mt-6 text-center">
          <Link href="/create" className="text-sm font-medium text-bullet-blue hover:underline">
            Got your own moment from this week? Post it
          </Link>
        </div>
      )}
    </main>
  );
}
