import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Header from "@/app/components/Header";

export const metadata: Metadata = {
  title: {
    default: "Captioned NYC",
    template: "%s | Captioned NYC",
  },
  description:
    "Post a photo or a moment from your week in New York. Gemini writes three captions, the campus votes, and the best one tops today's board.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-metro px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <Header />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <footer className="mt-16 border-t bg-card">
          <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>Captions are written by Google Gemini. Every post shows the exact prompt it was given.</p>
            <nav className="flex shrink-0 gap-4" aria-label="Footer">
              <Link href="/top" className="hover:text-ink">
                Leaderboard
              </Link>
              <Link href="/profile" className="hover:text-ink">
                Your posts
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
