import Link from "next/link";
import { redirect } from "next/navigation";
import ProfileForm from "@/app/components/ProfileForm";
import AvatarUploader from "./AvatarUploader";
import { getCurrentProfile } from "@/lib/profile";

export default async function ProfilePage() {
  const { user, profile } = await getCurrentProfile();
  if (!user) redirect("/login?next=/profile");

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="mx-auto max-w-lg flex-1 p-8">
      <Link href="/" className="text-sm text-gray-500 underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Your profile</h1>
      <p className="mt-1 text-gray-600">{profile?.email ?? user.email}</p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Photo</h2>
        <AvatarUploader
          userId={user.id}
          avatarUrl={profile?.avatar_url ?? null}
          name={fullName || (user.email ?? "")}
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Details</h2>
        <ProfileForm
          defaults={{
            first_name: profile?.first_name,
            last_name: profile?.last_name,
            bio: profile?.bio,
          }}
          submitLabel="Save changes"
        />
      </section>
    </main>
  );
}
