import Link from "next/link";
import { signOut } from "@/app/actions/profile";
import { getCurrentProfile } from "@/lib/profile";

export default async function Header() {
  const { user, profile } = await getCurrentProfile();
  const name = profile?.first_name ?? user?.email ?? null;

  return (
    <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="rounded-md bg-black px-1.5 py-0.5 text-xs text-white">NYC</span>
          Captioned
        </Link>

        <div className="flex items-center gap-3 text-sm">
          <Link href="/top" className="hover:underline">
            Top
          </Link>
          {user ? (
            <>
              <Link href="/jokes" className="hidden hover:underline sm:inline">
                Jokes
              </Link>
              <Link
                href="/create"
                className="rounded-full bg-black px-3 py-1.5 font-medium text-white hover:bg-gray-800"
              >
                + Post
              </Link>
              <Link href="/profile" className="flex items-center gap-2 hover:underline">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full border object-cover"
                  />
                ) : null}
                <span className="hidden sm:inline">{name}</span>
              </Link>
              <form action={signOut}>
                <button className="rounded-full border px-3 py-1 hover:bg-gray-50">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-black px-3 py-1.5 font-medium text-white hover:bg-gray-800"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
