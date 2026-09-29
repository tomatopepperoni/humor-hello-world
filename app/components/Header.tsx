import Link from "next/link";
import { signOut } from "@/app/actions/profile";
import { getCurrentProfile } from "@/lib/profile";

export default async function Header() {
  const { user, profile } = await getCurrentProfile();
  const name = profile?.first_name ?? user?.email ?? null;

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-2xl items-center justify-between p-4">
        <Link href="/" className="font-semibold">
          Humor Hello World
        </Link>

        {user ? (
          <div className="flex items-center gap-4 text-sm">
            <Link href="/jokes" className="hover:underline">
              Jokes
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
              <span>{name}</span>
            </Link>
            <form action={signOut}>
              <button className="rounded-md border px-3 py-1 hover:bg-gray-50">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
