import Link from "next/link";
import { signOut } from "@/app/actions/profile";
import { getCurrentProfile } from "@/lib/profile";
import NavLink from "@/app/components/NavLink";
import { Avatar, displayName } from "@/app/components/PostCard";

/** Black station-sign band with the thin white rule MTA signs have along the top. */
export default async function Header() {
  const { user, profile } = await getCurrentProfile();
  const name = profile?.first_name ? displayName(profile.first_name) : (user?.email ?? null);

  return (
    <header className="sticky top-0 z-20 bg-sign text-white">
      <div className="mx-auto max-w-2xl px-4">
        <div className="h-px bg-white/70" />
        <nav className="flex items-center justify-between gap-2 py-2.5" aria-label="Main">
          <Link href="/" className="flex items-center gap-2 rounded-md pr-1 text-[17px] font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-metro text-[13px] font-bold text-ink"
            >
              C
            </span>
            <span>
              Captioned <span className="hidden font-medium text-white/70 min-[380px]:inline">NYC</span>
            </span>
          </Link>

          <div className="flex items-center gap-0.5 sm:gap-1">
            <NavLink href="/" className="hidden sm:inline-flex">
              Feed
            </NavLink>
            <NavLink href="/top">Top</NavLink>
            {user ? (
              <>
                <Link
                  href="/create"
                  className="ml-1 rounded-full bg-metro px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-metro-deep"
                >
                  <span className="sm:hidden">Post</span>
                  <span className="hidden sm:inline">New post</span>
                </Link>
                <Link
                  href="/profile"
                  className="ml-1 flex items-center gap-2 rounded-full p-0.5 hover:bg-white/10 sm:pr-3"
                  aria-label="Your profile"
                >
                  <Avatar name={name} url={profile?.avatar_url ?? null} size={30} onDark />
                  <span className="hidden max-w-24 truncate text-sm font-medium sm:inline">{name}</span>
                </Link>
                <form action={signOut} className="hidden sm:block">
                  <button className="rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="ml-1 rounded-full bg-metro px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-metro-deep"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
