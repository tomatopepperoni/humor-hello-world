"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { vote } from "@/app/actions/captions";

type Counts = { up: number; down: number; myVote: number };

/**
 * Up / down vote with both counts visible. Switching from ▼ to ▲ visibly moves
 * your one vote from one side to the other (the net score changes by 2, which
 * looked like a bug when only the net was shown). After every click the server
 * returns the counts it just read back from the database, and those replace the
 * optimistic numbers.
 */
export default function VoteButtons({
  captionId,
  upvotes,
  downvotes,
  myVote,
  loggedIn,
}: {
  captionId: string;
  upvotes: number;
  downvotes: number;
  myVote: number;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Counts>({ up: upvotes, down: downvotes, myVote });
  const [seen, setSeen] = useState<Counts>({ up: upvotes, down: downvotes, myVote });
  const [error, setError] = useState<string | null>(null);

  // The same caption can be on screen twice (Top today + Fresh). When the
  // server sends new numbers after a refresh, adopt them.
  if (seen.up !== upvotes || seen.down !== downvotes || seen.myVote !== myVote) {
    const next = { up: upvotes, down: downvotes, myVote };
    setSeen(next);
    setLocal(next);
  }

  function cast(value: 1 | -1) {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setError(null);
    const prev = local;
    const nextVote = prev.myVote === value ? 0 : value;
    setLocal({
      up: prev.up - (prev.myVote === 1 ? 1 : 0) + (nextVote === 1 ? 1 : 0),
      down: prev.down - (prev.myVote === -1 ? 1 : 0) + (nextVote === -1 ? 1 : 0),
      myVote: nextVote,
    });

    startTransition(async () => {
      const res = await vote(captionId, value);
      if (res.error) {
        setLocal(prev);
        setError(res.error);
        return;
      }
      // What the database says now, including other people's votes.
      setLocal({ up: res.upvotes ?? 0, down: res.downvotes ?? 0, myVote: res.my_vote ?? 0 });
      router.refresh();
    });
  }

  const up = local.myVote === 1;
  const down = local.myVote === -1;
  const hint = loggedIn ? null : "Sign in to vote";

  return (
    <div className="flex flex-col">
      <div className={`flex items-center gap-1.5 ${pending ? "opacity-70" : ""}`} aria-busy={pending}>
        <button
          type="button"
          onClick={() => cast(1)}
          disabled={pending}
          aria-pressed={up}
          aria-label={`${up ? "Remove your upvote" : "Upvote"} (${local.up} up)`}
          title={hint ?? (up ? "You upvoted this. Click again to remove." : "Funny")}
          className={`flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors ${
            up ? "border-go bg-go text-white" : "bg-white text-ink/75 hover:border-go hover:text-go"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1.5 11 9.5H1z" fill="currentColor" />
          </svg>
          {local.up}
        </button>
        <button
          type="button"
          onClick={() => cast(-1)}
          disabled={pending}
          aria-pressed={down}
          aria-label={`${down ? "Remove your downvote" : "Downvote"} (${local.down} down)`}
          title={hint ?? (down ? "You downvoted this. Click again to remove." : "Not funny")}
          className={`flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors ${
            down ? "border-hold bg-hold text-white" : "bg-white text-ink/75 hover:border-hold hover:text-hold"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 10.5 1 2.5h10z" fill="currentColor" />
          </svg>
          {local.down}
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {local.up} up, {local.down} down
      </span>
      {error && <span className="mt-1 max-w-40 text-xs text-bullet-red">{error}</span>}
    </div>
  );
}
