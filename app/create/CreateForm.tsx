"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateCaptions, type GenerateState } from "@/app/actions/captions";
import { VIBES, VIBE_KEYS, type Vibe } from "@/lib/vibes";

const MAX_BYTES = 8 * 1024 * 1024;

export default function CreateForm({ userId, theme }: { userId: string; theme: string }) {
  const [state, formAction, submitting] = useActionState<GenerateState, FormData>(
    generateCaptions,
    {}
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [vibe, setVibe] = useState<Vibe>("chronically-online");
  const [context, setContext] = useState("");

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) return setUploadError("Please choose an image file.");
    if (file.size > MAX_BYTES) return setUploadError("Image must be 8 MB or smaller.");

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // RLS on storage.objects only allows uploads into <userId>/…
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from("photos").getPublicUrl(path);
      setImagePath(path);
      setImageUrl(publicUrl);
      setPreview(URL.createObjectURL(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
      setImagePath("");
      setImageUrl("");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  function clearPhoto() {
    setImagePath("");
    setImageUrl("");
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const canSubmit = !submitting && !uploading && (imagePath !== "" || context.trim() !== "");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="image_path" value={imagePath} />
      <input type="hidden" name="image_url" value={imageUrl} />

      {/* Photo */}
      <div>
        <label className="block text-sm font-medium">Photo <span className="text-gray-400">(optional)</span></label>
        <input
          ref={inputRef}
          id="photo-input"
          type="file"
          accept="image/*"
          onChange={onFileChange}
          disabled={uploading || submitting}
          className="hidden"
        />
        {preview ? (
          <div className="mt-2 flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="max-h-64 rounded-xl border object-contain" />
            <button type="button" onClick={clearPhoto} className="text-sm text-gray-500 underline">
              Remove
            </button>
          </div>
        ) : (
          <label
            htmlFor="photo-input"
            className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-50 ${
              uploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <span className="text-2xl">📷</span>
            <span className="mt-1">{uploading ? "Uploading…" : "Tap to upload a photo"}</span>
            <span className="text-xs text-gray-400">JPG, PNG or WebP · up to 8 MB</span>
          </label>
        )}
        {uploadError && <p className="mt-1 text-sm text-red-600">{uploadError}</p>}
      </div>

      {/* Context */}
      <div>
        <label htmlFor="context" className="block text-sm font-medium">
          What&apos;s the moment? <span className="text-gray-400">(optional if you added a photo)</span>
        </label>
        <textarea
          id="context"
          name="context"
          rows={2}
          maxLength={200}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. 45 minutes in line at Levain for one cookie"
          className="mt-2 w-full rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
        <p className="mt-1 text-right text-xs text-gray-400">{context.length}/200</p>
      </div>

      {/* Vibe */}
      <div>
        <p className="block text-sm font-medium">Vibe</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VIBE_KEYS.map((k) => (
            <label
              key={k}
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm transition ${
                vibe === k ? "border-black bg-black text-white" : "hover:bg-gray-50"
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
              <span className="text-xl">{VIBES[k].emoji}</span>
              <span className="mt-1 block">{VIBES[k].label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Theme */}
      <label className="flex items-start gap-3 rounded-xl border bg-orange-50 p-3 text-sm">
        <input type="checkbox" name="use_theme" defaultChecked className="mt-1" />
        <span>
          <span className="font-medium">Enter today&apos;s theme:</span> {theme}
          <span className="block text-xs text-gray-500">
            Themed posts compete on the “Top today” board.
          </span>
        </span>
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-full bg-black px-5 py-3 font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "Asking Gemini… (a few seconds)" : "Generate 3 captions ✨"}
      </button>
    </form>
  );
}
