import { eq } from "drizzle-orm";
import { files } from "../db/schema";
import { fileResponse, IMAGE_TYPES, MAX_UPLOAD_BYTES, PREVIEW_MAX_BYTES, sniffMime, storeUpload } from "../files";
import { error, idParam, type AppContext, type Authed } from "../http";

/** The "file" field of a multipart upload, or the error response to send. */
export async function readUpload(req: Request): Promise<File | Response> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return error(413, "Files can be at most 25 MB");
  }
  const form = await req.formData().catch(() => null);
  const upload = form?.get("file");
  if (!(upload instanceof File)) return error(400, 'Send the file in a form field named "file"');
  if (upload.size > MAX_UPLOAD_BYTES) return error(413, "Files can be at most 25 MB");
  if (upload.size === 0) return error(400, "The file is empty");
  return upload;
}

export function fileRoutes({ db, dataDir }: AppContext, authed: Authed) {
  return {
    "/api/files": {
      // multipart/form-data with one "file" field.
      POST: authed(async (req, user) => {
        const upload = await readUpload(req);
        if (upload instanceof Response) return upload;
        return Response.json(await storeUpload(db, dataDir, upload, user.id), { status: 201 });
      }),
    },

    // A small preview of a large image, made by the browser that uploaded it.
    "/api/files/:id/preview": {
      PUT: authed<"/api/files/:id/preview">(async (req, user) => {
        const id = idParam(req.params.id);
        const original = id ? db.select().from(files).where(eq(files.id, id)).get() : undefined;
        if (!original) return error(404, "File not found");
        if (!IMAGE_TYPES.includes(original.mime)) return error(400, "Only images have previews");
        const upload = await readUpload(req);
        if (upload instanceof Response) return upload;
        if (upload.size > PREVIEW_MAX_BYTES) return error(400, "A preview can be at most 512 KB");
        // Check the type before storing, so a rejected preview leaves nothing behind.
        const head = new Uint8Array(await upload.slice(0, 16).arrayBuffer());
        if (!IMAGE_TYPES.includes(sniffMime(head))) return error(400, "A preview must be an image");
        const preview = await storeUpload(db, dataDir, upload, user.id);
        return Response.json(
          db.update(files).set({ previewId: preview.id }).where(eq(files.id, original.id)).returning().get(),
        );
      }),
    },

    "/api/files/:id": {
      // ?download forces a download instead of showing the file.
      GET: authed<"/api/files/:id">((req) => {
        const id = idParam(req.params.id);
        const file = id ? db.select().from(files).where(eq(files.id, id)).get() : undefined;
        if (!file) return error(404, "File not found");
        return fileResponse(dataDir, file, new URL(req.url).searchParams.has("download"));
      }),
    },
  };
}
