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
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="Ada"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Last name</span>
          <input
            name="last_name"
            required
            defaultValue={defaults.last_name ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="Lovelace"
          />
        </label>
      </div>

      {showBio && (
        <label className="block">
          <span className="text-sm font-medium">
            Bio <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <textarea
            name="bio"
            rows={3}
            defaultValue={defaults.bio ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="Tell us your favorite kind of joke…"
          />
        </label>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-5 py-2 font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
