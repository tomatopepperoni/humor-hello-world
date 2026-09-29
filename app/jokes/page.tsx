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
    return <p className="p-8 text-red-600">Error: {error.message}</p>;
  }

  return (
    <main className="mx-auto max-w-2xl flex-1 p-8">
      <h1 className="mb-6 text-3xl font-bold">Jokes</h1>
      <ul className="space-y-4">
        {jokes?.map((j: Joke) => (
          <li key={j.id} className="rounded-lg border p-4">
            <p className="font-medium">{j.setup}</p>
            <p className="text-gray-600">{j.punchline}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
