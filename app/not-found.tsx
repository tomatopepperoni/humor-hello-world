import Link from "next/link";
import { LineBullet } from "@/app/components/LineBullet";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="rounded-xl bg-sign p-6 text-white">
        <div aria-hidden="true" className="h-px bg-white/60" />
        <div className="mt-4 flex items-center gap-3">
          <LineBullet letter="?" bg="#6d6e71" size={34} />
          <h1 className="text-2xl font-bold tracking-tight">No train to this stop</h1>
        </div>
        <p className="mt-3 text-[15px] text-white/80">
          This post was deleted, or the link is mistyped.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-metro px-5 py-2.5 text-sm font-semibold text-ink hover:bg-metro-deep"
        >
          Go to the feed
        </Link>
      </div>
    </main>
  );
}
