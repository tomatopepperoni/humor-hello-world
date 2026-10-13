"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="rounded-xl bg-sign p-6 text-white">
        <div aria-hidden="true" className="h-px bg-white/60" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">This page didn&apos;t load</h1>
        <p className="mt-2 text-[15px] text-white/80">
          The database or the network didn&apos;t answer in time. Your posts and votes are safe.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-full bg-metro px-5 py-2.5 text-sm font-semibold text-ink hover:bg-metro-deep"
          >
            Try again
          </button>
          <Link href="/" className="rounded-full px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">
            Go to the feed
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-xs text-white/50">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
