import { redirect } from "next/navigation";
import ProfileForm from "@/app/components/ProfileForm";
import { getCurrentProfile } from "@/lib/profile";

/**
 * Shown right after first login when the profile has no first/last name yet.
 * The proxy also redirects here for any protected route while names are missing.
 */
export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

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
    <main className="mx-auto max-w-lg flex-1 p-8">
      <h1 className="text-3xl font-bold">Welcome! 👋</h1>
      <p className="mt-2 text-gray-600">
        Before you continue, tell us what to call you.
      </p>
      <div className="mt-8">
        <ProfileForm defaults={defaults} next={next} submitLabel="Continue" />
      </div>
    </main>
  );
}
