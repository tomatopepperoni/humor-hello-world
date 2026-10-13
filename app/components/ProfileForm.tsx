"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileFormState } from "@/app/actions/profile";

type Props = {
  defaults: { first_name?: string | null; last_name?: string | null; bio?: string | null };
  next?: string;
  submitLabel?: string;
  showBio?: boolean;
};

export default function ProfileForm({
  defaults,
  next,
  submitLabel = "Save",
  showBio = true,
}: Props) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    updateProfile,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">First name</span>
          <input
            name="first_name"
            required
            defaultValue={defaults.first_name ?? ""}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[15px] focus:border-ink focus:outline-none"
            placeholder="Ada"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Last name</span>
          <input
            name="last_name"
            required
            defaultValue={defaults.last_name ?? ""}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[15px] focus:border-ink focus:outline-none"
            placeholder="Lovelace"
          />
        </label>
      </div>

      {showBio && (
        <label className="block">
          <span className="text-sm font-medium">
            Bio <span className="font-normal text-muted">(optional)</span>
          </span>
          <textarea
            name="bio"
            rows={3}
            defaultValue={defaults.bio ?? ""}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[15px] focus:border-ink focus:outline-none"
            placeholder="Which part of the city are you still figuring out?"
          />
        </label>
      )}

      {state.error && <p role="alert" className="text-sm text-bullet-red">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-go">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-metro px-5 py-2.5 font-semibold text-ink transition-colors hover:bg-metro-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
