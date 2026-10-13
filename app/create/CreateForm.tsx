"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateCaptions, type GenerateState } from "@/app/actions/captions";
import { VibeBullet } from "@/app/components/LineBullet";
import { resizeImage } from "@/lib/resize-image";
import ServiceAlert from "@/app/components/ServiceAlert";
import { DEFAULT_VIBE, VIBES, VIBE_KEYS, type Vibe } from "@/lib/vibes";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const PROGRESS = [
  "Sending your post to Gemini",
  "Gemini is looking at your moment",
  "Writing three different captions",
  "Checking they aren't all the same joke",
  "Almost there",
];

/** Shown while the server action runs: a train riding the line, plus what's happening. */
function Working({ hasPhoto }: { hasPhoto: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, PROGRESS.length - 1)), 2600);
    return () => window.clearInterval(t);
  }, []);
  const text = step === 1 && hasPhoto ? "Gemini is looking at your photo" : PROGRESS[step];
  return (
    <div role="status" aria-live="polite" className="rounded-xl bg-sign p-5 text-white">
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25" />
        <span className="train absolute top-0 flex h-7 w-7 items-center justify-center rounded-full bg-metro text-xs font-bold text-ink">
          C
        </span>
      </div>
      <p className="mt-3 text-[15px] font-medium">{text}…</p>
      <p className="mt-0.5 text-sm text-white/70">Usually 5 to 15 seconds. Keep this tab open.</p>
    </div>
  );
}

export default function CreateForm({
  userId,
  theme,
  runsLeft,
  dailyRuns,
}: {
  userId: string;
  theme: string;
  runsLeft: number;
  dailyRuns: number;
}) {
  const [state, formAction, submitting] = useActionState<GenerateState, FormData>(generateCaptions, {});

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [vibe, setVibe] = useState<Vibe>(DEFAULT_VIBE);
  const [context, setContext] = useState("");

  async function upload(original: File) {
    setUploadError(null);
    if (!original.type.startsWith("image/") && !/\.(heic|heif)$/i.test(original.name)) {
      setUploadError("That file isn't a photo. Choose a JPG, PNG or WebP image.");
      return;
    }

    setUploading(true);
    try {
      const file = await resizeImage(original);
      if (!ALLOWED.includes(file.type)) {
        throw new Error(
          "This photo format can't be read in this browser. Choose a JPG or PNG, or open the site in Safari."
        );
      }
      if (file.size > MAX_BYTES) throw new Error("This photo is over 8 MB even after resizing. Choose a smaller one.");

      const supabase = createClient();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
      // RLS on storage.objects only allows uploads into <userId>/…
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from("photos").getPublicUrl(path);
      setImagePath(path);
      setImageUrl(publicUrl);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The upload didn't go through. Try again.");
      setImagePath("");
      setImageUrl("");
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clearPhoto() {
    setImagePath("");
    setImageUrl("");
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  const hasInput = imagePath !== "" || context.trim() !== "";
  const outOfRuns = runsLeft <= 0 || !!state.limit;
  const canSubmit = !submitting && !uploading && hasInput && !outOfRuns;

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="image_path" value={imagePath} />
      <input type="hidden" name="image_url" value={imageUrl} />

      <fieldset disabled={submitting} className="space-y-7">
        {/* Photo */}
        <div>
          <p className="text-[15px] font-semibold">
            Photo
          </p>
          <p className="mt-0.5 text-sm text-muted">
            The photo is the meme: each caption is shown on it as its own card. No photo? What you write below becomes
            a station-sign card instead.
          </p>
          <input
            ref={inputRef}
            id="photo-input"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
            disabled={uploading || submitting}
            className="sr-only"
          />
          {preview ? (
            <div className="mt-2 flex items-start gap-4 rounded-xl border bg-card p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Your photo" className="max-h-56 max-w-[60%] rounded-lg object-contain" />
              <div className="flex flex-col items-start gap-2 text-sm">
                <p className="text-go">Uploaded</p>
                <label htmlFor="photo-input" className="cursor-pointer font-medium text-ink underline-offset-4 hover:underline">
                  Replace
                </label>
                <button type="button" onClick={clearPhoto} className="text-muted underline-offset-4 hover:text-ink hover:underline">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="photo-input"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
              className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-9 text-center transition-colors has-[:focus-visible]:outline-2 ${
                dragging ? "border-bullet-blue bg-bullet-blue/5" : "hover:border-ink/40"
              } ${uploading ? "pointer-events-none opacity-60" : ""}`}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted" aria-hidden="true">
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <circle cx="12" cy="13" r="3.5" />
                <path d="M8 6l1.5-2h5L16 6" />
              </svg>
              <span className="mt-2 text-[15px] font-medium">{uploading ? "Uploading…" : "Add a photo"}</span>
              <span className="mt-0.5 text-sm text-muted">Tap to choose, or drop one here. Big phone photos are resized for you.</span>
            </label>
          )}
          {uploadError && (
            <p role="alert" className="mt-2 text-sm text-bullet-red">
              {uploadError}
            </p>
          )}
        </div>

        {/* Context */}
        <div>
          <label htmlFor="context" className="text-[15px] font-semibold">
            What happened? <span className="font-normal text-muted">{imagePath ? "(optional, gives the captions context)" : "(required without a photo)"}</span>
          </label>
          <textarea
            id="context"
            name="context"
            rows={2}
            maxLength={200}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="45 minutes in line at Levain for one cookie"
            className="mt-2 w-full resize-none rounded-xl border bg-card p-3 text-[15px] placeholder:text-muted/70 focus:border-ink focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-muted">{context.length}/200</p>
        </div>

        {/* Vibe */}
        <fieldset>
          <legend className="text-[15px] font-semibold">Pick a subway voice</legend>
          <p className="mt-0.5 text-sm text-muted">Each voice is a line. Same moment, different ride.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {VIBE_KEYS.map((k) => {
              const on = vibe === k;
              return (
                <label
                  key={k}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bullet-blue ${
                    on ? "border-ink bg-ink text-white" : "bg-card hover:border-ink/40"
                  }`}
                >
                  <input type="radio" name="vibe" value={k} checked={on} onChange={() => setVibe(k)} className="sr-only" />
                  <VibeBullet vibe={k} size={30} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{VIBES[k].label}</span>
                    <span className={`block text-sm ${on ? "text-white/75" : "text-muted"}`}>{VIBES[k].blurb}</span>
                    <span className={`mt-2 block text-[13px] italic leading-snug ${on ? "text-white/90" : "text-ink/70"}`}>
                      {VIBES[k].sample}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Theme */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-sign p-4 text-white">
          <input type="checkbox" name="use_theme" defaultChecked className="mt-1 h-4 w-4 accent-metro" />
          <span>
            <span className="block font-semibold">Enter today&apos;s theme: {theme}</span>
            <span className="mt-0.5 block text-sm text-white/70">Themed posts compete for Top today. Untick it for anything else.</span>
          </span>
        </label>
      </fieldset>

      {state.error && !submitting && <ServiceAlert error={state.error} busy={!!state.busy} keptInput />}

      {submitting ? (
        <Working hasPhoto={!!imagePath} />
      ) : (
        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-metro px-5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-metro-deep disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-muted"
          >
            {outOfRuns ? "No caption runs left today" : state.error ? "Try again" : "Write 3 captions"}
          </button>
          <p className="mt-2 text-center text-sm text-muted">
            {!hasInput && !outOfRuns ? "Add a photo or say what happened to continue. " : ""}
            {outOfRuns
              ? `You've used all ${dailyRuns} caption runs for today. More at midnight.`
              : `${runsLeft} of ${dailyRuns} caption runs left today.`}
          </p>
        </div>
      )}
    </form>
  );
}
