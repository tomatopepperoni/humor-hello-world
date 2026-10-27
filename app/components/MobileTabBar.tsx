"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  feed: <path d="M4 5h16M4 12h16M4 19h10" />,
  race: (
    <>
      <path d="M6 20V4" />
      <circle cx="6" cy="6" r="2" fill="currentColor" />
      <circle cx="6" cy="18" r="2" fill="currentColor" />
      <path d="M10 6h8M10 12h6M10 18h8" />
    </>
  ),
  top: <path d="M7 4h10v4a5 5 0 0 1-10 0V4ZM12 13v4M8 20h8M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />,
  you: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
};

/**
 * Phones: navigation lives at the bottom, within thumb reach, instead of in
 * the top band. "Post" is the one yellow button.
 */
export default function MobileTabBar({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Feed", icon: "feed" },
    { href: "/race", label: "Race", icon: "race" },
    { href: loggedIn ? "/create" : "/login?next=/create", label: "Post", icon: "post" },
    { href: "/top", label: "Leaderboard", icon: "top" },
    { href: loggedIn ? "/profile" : "/login?next=/profile", label: loggedIn ? "Profile" : "Sign in", icon: "you" },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-sign pb-[env(safe-area-inset-bottom)] text-white md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map((it) => {
          const path = it.href.split("?")[0];
          const active = path === "/" ? pathname === "/" : pathname.startsWith(path) && !it.href.includes("login");
          if (it.icon === "post") {
            return (
              <li key={it.label} className="flex justify-center">
                <Link
                  href={it.href}
                  aria-label="New post"
                  className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-metro text-ink shadow-[0_0_0_4px_#000] transition-colors hover:bg-metro-deep"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </Link>
              </li>
            );
          }
          return (
            <li key={it.label}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-metro" : "text-white/70"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[it.icon]}
                </svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
