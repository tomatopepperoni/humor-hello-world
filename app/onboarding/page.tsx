import { redirect } from "next/navigation";
import ProfileForm from "@/app/components/ProfileForm";
import { getCurrentProfile } from "@/lib/profile";
import { safeNext } from "@/lib/safe-next";

/**
 * Shown right after first login when the profile has no first/last name yet.
 * The proxy also redirects here for any protected route while names are missing.
 */
export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const { user, profile } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (profile?.first_name && profile?.last_name) redirect(next);

  // Prefill from what Google told us, so the user just has to confirm.
  const meta = user.user_metadata ?? {};
  const defaults = {
    first_name: profile?.first_name ?? meta.given_name ?? "",
    last_name: profile?.last_name ?? meta.family_name ?? "",
    bio: profile?.bio ?? "",
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <h1 className="text-[28px] font-bold tracking-tight">Welcome to Captioned NYC</h1>
      <p className="mt-2 text-[15px] text-muted">
        One step before you post: how should your name show up next to your posts? Only your first name is shown publicly.
      </p>
      <div className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <ProfileForm defaults={defaults} next={next} submitLabel="Continue" />
      </div>
    </main>
  );
}
