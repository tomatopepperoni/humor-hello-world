import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";

export default async function Home() {
  const { user, profile } = await getCurrentProfile();

  return (
    <main className="mx-auto max-w-2xl flex-1 p-8">
      <h1 className="text-3xl font-bold">Hello World</h1>

      {user ? (
        // ---- Gated UI: only rendered for logged-in users ----
        <section className="mt-6 rounded-lg border bg-green-50 p-6">
          <p className="text-lg">
            Welcome back,{" "}
            <span className="font-semibold">
              {profile?.first_name ?? user.email}
            </span>
            !
          </p>
          <p className="mt-1 text-sm text-gray-600">
            You&apos;re signed in as {user.email}.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/jokes"
              className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
            >
              View jokes →
            </Link>
            <Link
              href="/profile"
              className="rounded-md border px-4 py-2 text-sm hover:bg-white"
            >
              Edit profile
            </Link>
          </div>
        </section>
      ) : (
        // ---- Public UI ----
        <section className="mt-6 rounded-lg border bg-gray-50 p-6">
          <p className="text-gray-700">
            The jokes are for members only. Sign in with Google to read them.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            Sign in
          </Link>
        </section>
      )}
    </main>
  );
}
