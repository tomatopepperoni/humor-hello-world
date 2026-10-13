"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addCaptions, deletePost, type MoreState } from "@/app/actions/captions";
import { VibeBullet } from "@/app/components/LineBullet";
import { VIBES, VIBE_KEYS, type Vibe } from "@/lib/vibes";
import ServiceAlert from "@/app/components/ServiceAlert";

/** Owner-only: ask Gemini for 3 more captions (any vibe), or delete the post. */
export default function OwnerTools({
  postId,
  currentVibe,
  captionCount,
  maxCaptions,
}: {
  postId: string;
  currentVibe: Vibe;
  captionCount: number;
  maxCaptions: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MoreState, FormData>(addCaptions, {});
  const [vibe, setVibe] = useState<Vibe>(currentVibe);
  const [confirming, setConfirming] = useState(false);
  const full = captionCount >= maxCaptions;

  // New captions were saved: re-render the server card above.
  useEffect(() => {
    if (state.at) router.refresh();
  }, [state.at, router]);

  return (
    <section aria-labelledby="owner-tools" className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="owner-tools" className="text-base font-semibold">
        Not feeling these?
      </h2>
      {full ? (
        <p className="mt-1 text-sm text-muted">
          This post has {maxCaptions} captions, the most a post can have.
        </p>
      ) : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="post_id" value={postId} />
          <fieldset disabled={pending}>
            <legend className="text-sm text-muted">Get three more in any subway voice. They won&apos;t repeat the ones above.</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {VIBE_KEYS.map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-center rounded-full border py-1 pl-1 pr-3 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bullet-blue ${
                    vibe === k ? "border-ink bg-ink text-white" : "bg-white hover:border-ink/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="vibe"
                    value={k}
                    checked={vibe === k}
                    onChange={() => setVibe(k)}
                    className="sr-only"
                  />
                  <VibeBullet vibe={k} size={22} />
                  <span className={`ml-1.5 ${vibe === k ? "text-white" : ""}`}>{VIBES[k].label}</span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="mt-4 rounded-full bg-metro px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-metro-deep disabled:opacity-60"
            >
              {pending ? "Writing three more…" : "Write 3 more captions"}
            </button>
          </fieldset>
          {state.error && !pending && (
            <div className="mt-3">
              <ServiceAlert error={state.error} busy={!!state.busy} />
            </div>
          )}
          {state.added && !pending && (
            <p role="status" className="mt-3 text-sm text-go">
              Added {state.added} captions to the list above.
            </p>
          )}
        </form>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
        {confirming ? (
          <form action={deletePost} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="post_id" value={postId} />
            <span>Delete this post, its captions and votes?</span>
            <button className="rounded-full bg-bullet-red px-4 py-1.5 font-semibold text-white hover:opacity-90">
              Delete post
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-full border px-4 py-1.5 hover:bg-paper">
              Keep it
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-full px-1 text-muted underline-offset-4 hover:text-bullet-red hover:underline"
          >
            Delete this post
          </button>
        )}
      </div>
    </section>
  );
}
