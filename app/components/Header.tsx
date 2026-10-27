import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";
import NavLink from "@/app/components/NavLink";
import HeaderShell from "@/app/components/HeaderShell";
import { Avatar, displayName } from "@/app/components/PostCard";

/**
 * Black station-sign band with the thin white rule MTA signs have along the top.
 * Tablet/desktop: full navigation here. Phones: just the name and your account;
 * navigation moves to the bottom tab bar (MobileTabBar).
 */
export default async function Header() {
  const { user, profile } = await getCurrentProfile();
  const name = profile?.first_name ? displayName(profile.first_name) : (user?.email ?? null);

  return (
    <HeaderShell>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="h-px bg-white/70" />
        <nav className="flex items-center justify-between gap-2 py-2.5" aria-label="Site">
          <Link href="/" className="flex items-center gap-2 rounded-md pr-1 text-[17px] font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-metro text-[13px] font-bold text-ink"
            >
              C
            </span>
            <span>
              Captioned <span className="font-medium text-white/70">NYC</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <div className="hidden items-center gap-1 md:flex">
              <NavLink href="/">Feed</NavLink>
              <NavLink href="/race">Race to Columbia</NavLink>
              <NavLink href="/top">Leaderboard</NavLink>
            </div>
            {user ? (
              <>
                <Link
                  href="/create"
                  className="ml-2 hidden rounded-full bg-metro px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-metro-deep md:inline-block"
                >
                  New post
                </Link>
                <Link
                  href="/profile"
                  className="ml-1 flex items-center gap-2 rounded-full p-0.5 hover:bg-white/10 md:pr-3"
                  aria-label="Your profile"
                >
                  <Avatar name={name} url={profile?.avatar_url ?? null} size={30} onDark />
                  <span className="hidden max-w-28 truncate text-sm font-medium lg:inline">{name}</span>
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                className="ml-2 rounded-full bg-metro px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-metro-deep"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </HeaderShell>
  );
}
