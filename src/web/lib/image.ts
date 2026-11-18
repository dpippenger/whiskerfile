/**
 * Re-encodes an image at most `maxEdge` pixels on its longer side. This keeps
 * uploads from phone cameras small and drops their metadata, including the
 * location a phone records in each photo. Throws if the browser cannot read
 * the format (for example HEIC on most browsers).
 */
export async function downsizeImage(file: File, maxEdge: number): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image format can't be used here. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
  // Browsers that cannot encode WebP fall back to PNG; use JPEG instead.
  if (blob.type !== "image/webp") blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "photo"}.${ext}`, { type: blob.type });
}
