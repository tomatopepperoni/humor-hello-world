"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { vote } from "@/app/actions/captions";

type VoteState = { score: number; myVote: number };

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
  const [local, setLocal] = useState<VoteState>({ score, myVote });
  const [seen, setSeen] = useState<VoteState>({ score, myVote });
  const [error, setError] = useState<string | null>(null);

  // The same caption can be on screen twice (Top today + Fresh). When the
  // server sends new numbers after a refresh, adopt them.
  if (seen.score !== score || seen.myVote !== myVote) {
    setSeen({ score, myVote });
    setLocal({ score, myVote });
  }

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
  const hint = loggedIn ? null : "Sign in to vote";

  return (
    <div className="flex flex-col items-center">
      <div
        className={`flex items-center rounded-full border bg-white ${pending ? "opacity-70" : ""}`}
        aria-busy={pending}
      >
        <button
          type="button"
          onClick={() => cast(1)}
          disabled={pending}
          aria-pressed={up}
          aria-label={up ? "Remove upvote" : "Upvote this caption"}
          title={hint ?? (up ? "Remove upvote" : "Funny")}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
            up ? "bg-go text-white" : "text-muted hover:bg-go/10 hover:text-go"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1.5 11 9.5H1z" fill="currentColor" />
          </svg>
        </button>
        <span
          aria-live="polite"
          className={`min-w-6 text-center text-sm font-semibold tabular-nums ${
            local.score > 0 ? "text-go" : local.score < 0 ? "text-hold" : "text-muted"
          }`}
        >
          {local.score}
        </span>
        <button
          type="button"
          onClick={() => cast(-1)}
          disabled={pending}
          aria-pressed={down}
          aria-label={down ? "Remove downvote" : "Downvote this caption"}
          title={hint ?? (down ? "Remove downvote" : "Not funny")}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
            down ? "bg-hold text-white" : "text-muted hover:bg-hold/10 hover:text-hold"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 10.5 1 2.5h10z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {error && <span className="mt-1 max-w-28 text-center text-xs text-bullet-red">{error}</span>}
    </div>
  );
}
