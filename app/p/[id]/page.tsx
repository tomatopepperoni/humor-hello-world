import Link from "next/link";
import { notFound } from "next/navigation";
import PostCard from "@/app/components/PostCard";
import { deletePost } from "@/app/actions/captions";
import { getCurrentProfile } from "@/lib/profile";
import { getPost } from "@/lib/posts";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PostPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [{ user }, post] = await Promise.all([getCurrentProfile(), getPost(id)]);
  if (!post) notFound();

  const mine = user?.id === post.user_id;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Back to feed
      </Link>

      <div className="mt-4">
        <PostCard post={post} loggedIn={!!user} showPrompt />
      </div>

      {!user && (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-center text-sm text-gray-600">
          <Link href={`/login?next=/p/${post.id}`} className="font-medium underline">
            Sign in
          </Link>{" "}
          to vote on these captions.
        </p>
      )}

      {mine && (
        <div className="mt-6 flex items-center justify-between rounded-xl border p-4 text-sm">
          <span className="text-gray-600">This is your post.</span>
          <div className="flex gap-3">
            <Link href="/create" className="rounded-full border px-4 py-1.5 hover:bg-gray-50">
              Post another
            </Link>
            <form action={deletePost}>
              <input type="hidden" name="post_id" value={post.id} />
              <button className="rounded-full border border-red-200 px-4 py-1.5 text-red-600 hover:bg-red-50">
                Delete
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
