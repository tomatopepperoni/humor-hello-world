import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ProfileForm from "@/app/components/ProfileForm";
import AvatarUploader from "@/app/profile/AvatarUploader";
import { signOut } from "@/app/actions/profile";
import { displayName } from "@/app/components/PostCard";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

/**
 * Account settings, kept apart from the profile (week 5 feedback): the profile
 * is what you've done, this page is what you can change. The only Sign out
 * button in the app lives here.
 */
export default async function SettingsPage() {
  const { user, profile } = await getCurrentProfile();
  if (!user) redirect("/login?next=/settings");
  const fullName = [profile?.first_name ? displayName(profile.first_name) : null, profile?.last_name].filter(Boolean).join(" ");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <Link href="/profile" className="text-sm font-medium text-muted hover:text-ink">
        ← Back to profile
      </Link>
      <h1 className="mt-2 text-[28px] font-bold tracking-tight">Settings</h1>
      <p className="mt-0.5 text-[15px] text-muted">How you show up on Captioned NYC.</p>

      <section aria-labelledby="photo" className="mt-8">
        <h2 id="photo" className="mb-3 text-lg font-bold">
          Profile photo
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          <AvatarUploader userId={user.id} avatarUrl={profile?.avatar_url ?? null} name={fullName || (user.email ?? "")} />
        </div>
      </section>

      <section aria-labelledby="details" className="mt-8">
        <h2 id="details" className="mb-3 text-lg font-bold">
          Name and bio
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          <ProfileForm
            defaults={{ first_name: profile?.first_name, last_name: profile?.last_name, bio: profile?.bio }}
            submitLabel="Save changes"
          />
        </div>
      </section>

      <section aria-labelledby="account" className="mt-8">
        <h2 id="account" className="mb-3 text-lg font-bold">
          Account
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">Signed in with Google as</p>
            <p className="truncate text-[15px] font-medium">{profile?.email ?? user.email}</p>
          </div>
          <form action={signOut}>
            <button className="rounded-full border bg-white px-4 py-2 text-sm font-semibold hover:border-ink/40">Sign out</button>
          </form>
        </div>
      </section>
    </main>
  );
}
