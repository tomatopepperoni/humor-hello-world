import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Joke = { id: number; setup: string; punchline: string };

/** Protected route: proxy.ts redirects logged-out users to /login. */
export default async function JokesPage() {
  const supabase = await createClient();

  // Belt and braces: also check on the page itself.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/jokes");

  const { data: jokes, error } = await supabase
    .from("jokes")
    .select("id, setup, punchline")
    .order("id");

  if (error) {
    return <p className="p-8 text-bullet-red">The jokes didn&apos;t load: {error.message}</p>;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <h1 className="mb-1 text-[28px] font-bold tracking-tight">Jokes</h1>
      <p className="mb-6 text-[15px] text-muted">The week 2 jokes table, kept as a members-only page.</p>
      <ul className="space-y-4">
        {jokes?.map((j: Joke) => (
          <li key={j.id} className="rounded-xl border bg-card p-4">
            <p className="font-medium">{j.setup}</p>
            <p className="text-muted">{j.punchline}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
