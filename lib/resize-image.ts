/**
 * Browser-only: shrink a photo to at most `max` px on the long side and
 * re-encode it as JPEG. Phone photos are often 3–12 MB (and HEIC on iPhone),
 * which is slow to upload, slow for Gemini, and over the bucket's limits.
 * If the browser can't decode the file, the original is returned unchanged.
 */
export async function resizeImage(file: File, max = 1600, quality = 0.85): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // e.g. HEIC on Chrome: let the upload decide
  }

  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const small = file.size < 1.5 * 1024 * 1024 && scale === 1 && file.type !== "image/heic";
  if (small && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) {
    bitmap.close();
    return file;
  }

  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
