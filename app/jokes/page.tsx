import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Joke = { id: number; setup: string; punchline: string };

export default async function JokesPage() {
  const { data: jokes, error } = await supabase
    .from("jokes")
    .select("id, setup, punchline")
    .order("id");

  if (error) {
    return <p className="p-8 text-red-600">Error: {error.message}</p>;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
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
