import type { Metadata } from "next";
import Link from "next/link";
import GoogleSignInButton from "./GoogleSignInButton";
import { LineBullet } from "@/app/components/LineBullet";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

const WHY: Record<string, string> = {
  "/create": "Sign in to post a moment and get your three captions.",
  "/profile": "Sign in to see your posts and how many points they earned.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next, "");
  const hadError = params.error === "auth";
  const wrongDomain = params.error === "domain";
  const reason = WHY[next] ?? (next.startsWith("/p/") ? "Sign in to vote on this post." : null);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="rounded-2xl bg-sign p-6 text-white sm:p-8">
        <div aria-hidden="true" className="h-px bg-white/60" />
        <div className="mt-5 flex gap-1.5" aria-hidden="true">
          <LineBullet letter="O" bg="#b933ad" size={26} />
          <LineBullet letter="R" bg="#ee352e" size={26} />
          <LineBullet letter="M" bg="#fccc0a" fg="#16181a" size={26} />
          <LineBullet letter="C" bg="#0039a6" size={26} />
        </div>
        <h1 className="mt-4 text-[30px] font-bold leading-tight tracking-tight">Sign in to Captioned NYC</h1>
        <p className="mt-2 text-[15px] text-white/80">
          {reason ?? "Sign in to post, get AI captions and vote."} Browsing the feed doesn&apos;t need an account.
        </p>

        {hadError && (
          <p role="alert" className="mt-4 rounded-lg bg-white/10 p-3 text-sm">
            Google sign-in didn&apos;t finish. Try again, and pick the same Google account if you have several.
          </p>
        )}

        {wrongDomain && (
          <p role="alert" className="mt-4 rounded-lg bg-white/10 p-3 text-sm">
            Captioned NYC is for the Columbia community. Sign in with your Columbia or Barnard Google account, or ask
            the site owner to add your address.
          </p>
        )}

        <div className="mt-7">
          <GoogleSignInButton next={next || undefined} />
        </div>
      </div>

      <Link href="/" className="mt-6 text-center text-sm font-medium text-muted hover:text-ink">
        Keep browsing without signing in
      </Link>
    </main>
  );
}
