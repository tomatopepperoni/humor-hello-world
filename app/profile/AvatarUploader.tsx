"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setAvatarUrl } from "@/app/actions/profile";

const MAX_BYTES = 5 * 1024 * 1024;

export default function AvatarUploader({
  userId,
  avatarUrl,
  name,
}: {
  userId: string;
  avatarUrl: string | null;
  name: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      // One file per user, overwritten on each upload. The binary lives in
      // Supabase Storage; only its public URL is stored in the profiles table.
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new image shows immediately after overwrite.
      const url = `${publicUrl}?v=${Date.now()}`;

      const res = await setAvatarUrl(url);
      if (res.error) throw new Error(res.error);

      setPreview(url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <div className="flex items-center gap-5">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Your profile photo"
          className="h-24 w-24 rounded-full border object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-gray-100 text-2xl font-semibold text-gray-500">
          {initials || "?"}
        </div>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          disabled={uploading}
          className="hidden"
          id="avatar-input"
        />
        <label
          htmlFor="avatar-input"
          className={`inline-block cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-gray-50 ${
            uploading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {uploading ? "Uploading…" : preview ? "Change photo" : "Upload photo"}
        </label>
        <p className="mt-1 text-xs text-gray-500">JPG, PNG or WebP, up to 5 MB.</p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
