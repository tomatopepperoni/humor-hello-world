import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CreateForm from "./CreateForm";
import { getCurrentProfile } from "@/lib/profile";
import { todaysTheme } from "@/lib/vibes";
import { DAILY_RUNS, runsLeftToday } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Server actions on this page call Gemini, which can take a while when it is busy.
export const maxDuration = 60;
export const metadata: Metadata = { title: "New post" };

/** Protected route (proxy.ts also redirects logged-out users to /login). */
export default async function CreatePage() {
  const { user } = await getCurrentProfile();
  if (!user) redirect("/login?next=/create");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-[28px] font-bold tracking-tight">New post</h1>
      <p className="mt-1 text-[15px] text-muted">
        Share a moment from your week. Gemini writes three captions in the subway voice you pick, and everyone else votes on them.
      </p>
      <div className="mt-6">
        <CreateForm
          userId={user.id}
          theme={todaysTheme()}
          runsLeft={await runsLeftToday(await createClient(), user.id)}
          dailyRuns={DAILY_RUNS}
        />
      </div>
    </main>
  );
}
