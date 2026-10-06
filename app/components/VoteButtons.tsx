"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { vote } from "@/app/actions/captions";

export default function VoteButtons({
  captionId,
  score,
  myVote,
  loggedIn,
}: {
  captionId: string;
  score: number;
  myVote: number;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState({ score, myVote });
  const [error, setError] = useState<string | null>(null);

  function cast(value: 1 | -1) {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setError(null);
    // Optimistic update: same arrow = remove vote, other arrow = switch.
    const prev = local;
    const nextVote = prev.myVote === value ? 0 : value;
    setLocal({ score: prev.score - prev.myVote + nextVote, myVote: nextVote });

    startTransition(async () => {
      const res = await vote(captionId, value);
      if (res.error) {
        setLocal(prev);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const up = local.myVote === 1;
  const down = local.myVote === -1;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => cast(1)}
        disabled={pending}
        aria-pressed={up}
        aria-label="Upvote"
        title={loggedIn ? "Upvote" : "Sign in to vote"}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition disabled:opacity-60 ${
          up
            ? "border-orange-500 bg-orange-500 text-white"
            : "border-gray-200 bg-white text-gray-600 hover:border-orange-400 hover:text-orange-600"
        }`}
      >
        ▲
      </button>
      <span
        className={`min-w-7 text-center text-sm font-semibold tabular-nums ${
          local.score > 0 ? "text-orange-600" : local.score < 0 ? "text-blue-600" : "text-gray-500"
        }`}
      >
        {local.score}
      </span>
      <button
        type="button"
        onClick={() => cast(-1)}
        disabled={pending}
        aria-pressed={down}
        aria-label="Downvote"
        title={loggedIn ? "Downvote" : "Sign in to vote"}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition disabled:opacity-60 ${
          down
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600"
        }`}
      >
        ▼
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </div>
  );
}
