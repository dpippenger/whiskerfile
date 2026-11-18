import { eq } from "drizzle-orm";
import { files } from "../db/schema";
import { fileResponse, MAX_UPLOAD_BYTES, storeUpload } from "../files";
import { error, idParam, type AppContext, type Authed } from "../http";

export function fileRoutes({ db, dataDir }: AppContext, authed: Authed) {
  return {
    "/api/files": {
      // multipart/form-data with one "file" field.
      POST: authed(async (req, user) => {
        if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
          return error(413, "Files can be at most 25 MB");
        }
        const form = await req.formData().catch(() => null);
        const upload = form?.get("file");
        if (!(upload instanceof File)) return error(400, "Send the file in a form field named \"file\"");
        if (upload.size > MAX_UPLOAD_BYTES) return error(413, "Files can be at most 25 MB");
        if (upload.size === 0) return error(400, "The file is empty");
        return Response.json(await storeUpload(db, dataDir, upload, user.id), { status: 201 });
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
