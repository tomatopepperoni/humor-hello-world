import { redirect } from "next/navigation";
import CreateForm from "./CreateForm";
import { getCurrentProfile } from "@/lib/profile";
import { todaysTheme } from "@/lib/vibes";

export const dynamic = "force-dynamic";

/** Protected route (proxy.ts also redirects logged-out users to /login). */
export default async function CreatePage() {
  const { user } = await getCurrentProfile();
  if (!user) redirect("/login?next=/create");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold">Caption something</h1>
      <p className="mt-1 text-sm text-gray-600">
        Upload a photo and/or describe the moment. You get three AI captions; the
        campus votes on them.
      </p>
      <div className="mt-6">
        <CreateForm userId={user.id} theme={todaysTheme()} />
      </div>
    </main>
  );
}
