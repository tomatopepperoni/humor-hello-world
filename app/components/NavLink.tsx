"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header link that shows which section you're in. */
export default function NavLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-white text-sign" : "text-white/80 hover:bg-white/10 hover:text-white"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
