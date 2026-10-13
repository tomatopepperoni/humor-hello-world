import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ProfileForm from "@/app/components/ProfileForm";
import AvatarUploader from "./AvatarUploader";
import { signOut } from "@/app/actions/profile";
import { displayName, timeAgo } from "@/app/components/PostCard";
import { VibeBullet } from "@/app/components/LineBullet";
import { getCurrentProfile } from "@/lib/profile";
import { getMyStats, getPostsByUser, type PostWithCaptions } from "@/lib/posts";
import { getRace } from "@/lib/race";
import { BadgeLegend, ProgressLine, riderStatus } from "@/app/components/Race";
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

function MyPostRow({ post }: { post: PostWithCaptions }) {
  const top = post.captions.find((c) => c.id === post.leading_caption_id) ?? post.captions[0];
  return (
    <li>
      <Link href={`/p/${post.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-paper">
        {post.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg border object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-paper">
            {isVibe(post.vibe) && <VibeBullet vibe={post.vibe} size={26} />}
          </span>
        )}
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

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { user, profile } = await getCurrentProfile();
  if (!user) redirect("/login?next=/profile");
  const { deleted } = await searchParams;

  const [posts, stats, race] = await Promise.all([
    getPostsByUser(user.id),
    getMyStats(user.id),
    getRace().catch(() => null),
  ]);
  const me = race?.riders.find((r) => r.user_id === user.id);
  const points = posts.reduce((sum, p) => sum + p.total_score, 0);
  const fullName = [profile?.first_name ? displayName(profile.first_name) : null, profile?.last_name].filter(Boolean).join(" ");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      {deleted === "1" && (
        <p role="status" className="mb-4 rounded-xl border bg-card p-3 text-sm">
          Post deleted.
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">{fullName || "Your profile"}</h1>
          <p className="mt-0.5 text-[15px] text-muted">{profile?.email ?? user.email}</p>
        </div>
        <form action={signOut}>
          <button className="rounded-full border bg-card px-4 py-2 text-sm font-medium hover:border-ink/40">Sign out</button>
        </form>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat value={stats.posts} label={stats.posts === 1 ? "post" : "posts"} />
        <Stat value={points} label="points earned" />
        <Stat value={stats.votes} label="votes cast" />
      </div>

      <section aria-labelledby="ride" className="mt-8 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ride" className="text-lg font-bold">
            {me && me.points_week > 0 ? riderStatus(me) : "Not on the train yet this week"}
          </h2>
          <Link href="/race" className="text-sm font-semibold text-bullet-blue hover:underline">
            Race to Columbia
          </Link>
        </div>
        <div className="mt-3">
          <ProgressLine station={me?.station ?? 0} />
        </div>
        <h3 className="mb-3 mt-6 text-[15px] font-semibold">Badges</h3>
        <BadgeLegend rider={me} />
      </section>

      <section aria-labelledby="my-posts" className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="my-posts" className="text-xl font-bold tracking-tight">
            Your posts
          </h2>
          <Link href="/create" className="text-sm font-semibold text-bullet-blue hover:underline">
            New post
          </Link>
        </div>
        {posts.length === 0 ? (
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
        )}
      </section>

      <section aria-labelledby="photo" className="mt-10">
        <h2 id="photo" className="mb-3 text-xl font-bold tracking-tight">
          Profile photo
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          <AvatarUploader userId={user.id} avatarUrl={profile?.avatar_url ?? null} name={fullName || (user.email ?? "")} />
        </div>
      </section>

      <section aria-labelledby="details" className="mt-10">
        <h2 id="details" className="mb-3 text-xl font-bold tracking-tight">
          Details
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          <ProfileForm
            defaults={{
              first_name: profile?.first_name,
              last_name: profile?.last_name,
              bio: profile?.bio,
            }}
            submitLabel="Save changes"
          />
        </div>
      </section>
    </main>
  );
}
