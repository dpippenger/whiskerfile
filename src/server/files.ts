import { and, eq } from "drizzle-orm";
import { mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./db";
import { files, type StoredFile } from "./db/schema";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Images up to this size are shown as their own preview; larger ones need a separate one. */
export const PREVIEW_MAX_BYTES = 512 * 1024;

/** Types that are shown in the browser. Everything else is served as a download. */
export const INLINE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] as const;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

/**
 * Identifies a file from its first bytes. The client's declared type is never
 * trusted: serving an uploaded HTML or SVG file as such would let it run
 * script on the app's origin.
 */
export function sniffMime(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "image/gif";
  if (startsWith(bytes, ascii("%PDF-"))) return "application/pdf";
  return "application/octet-stream";
}

export function isInline(mime: string): boolean {
  return (INLINE_TYPES as readonly string[]).includes(mime);
}

export const uploadPath = (dataDir: string, sha256: string) => join(dataDir, "uploads", sha256);

/**
 * Stores an upload. The bytes are kept once per distinct content, but each
 * (content, name, uploader) gets its own row, so uploading the same bytes
 * under another name or as another member keeps that name and uploader; only
 * an exact repeat returns the existing row. The file is written under a
 * ".partial" name and renamed once complete, so the backup never copies a
 * half-written file.
 */
export async function storeUpload(db: Db, dataDir: string, upload: File, userId: number): Promise<StoredFile> {
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

  // Write the bytes whenever the stored copy is missing or short, even if the
  // row exists: uploading the same file again then repairs a lost copy.
  const target = uploadPath(dataDir, sha256);
  const onDisk = await stat(target).catch(() => null);
  if (onDisk?.size !== bytes.length) {
    await mkdir(join(dataDir, "uploads"), { recursive: true });
    const partial = `${target}.${crypto.randomUUID()}.partial`;
    await Bun.write(partial, bytes);
    await rename(partial, target);
  }

  const originalName = upload.name.slice(0, 200) || "upload";
  const existing = db
    .select()
    .from(files)
    .where(and(eq(files.sha256, sha256), eq(files.originalName, originalName), eq(files.uploadedBy, userId)))
    .get();
  if (existing) return existing;
  return db
    .insert(files)
    .values({
      sha256,
      mime: sniffMime(bytes),
      sizeBytes: bytes.length,
      originalName,
      uploadedBy: userId,
      createdAt: Date.now(),
    })
    .returning()
    .get();
}

/** The response for downloading or viewing a stored file. */
export function fileResponse(dataDir: string, file: StoredFile, download: boolean): Response {
  const disposition = download || !isInline(file.mime) ? "attachment" : "inline";
  return new Response(Bun.file(uploadPath(dataDir, file.sha256)), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      // A row's bytes never change, so the browser may keep them.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
