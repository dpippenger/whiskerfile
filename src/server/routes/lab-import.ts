import { asc } from "drizzle-orm";
import { draftFromExtraction } from "../../shared/lab-import";
import { analytes } from "../db/schema";
import { IMAGE_TYPES, sniffMime } from "../files";
import { error, type AppContext, type Authed } from "../http";
import { READ_TIMEOUT_SECONDS, ReadLabError } from "../import/claude";
import { readUpload } from "./files";

/** The API's limit for one image, measured after base64 encoding. */
const MAX_IMAGE_BASE64_BYTES = 10 * 1024 * 1024;

export function labImportRoutes({ db, readLab }: AppContext, authed: Authed) {
  return {
    // Reads a lab document (multipart "file": a PDF, or a photo the browser has
    // already scaled down) and answers with a draft for the lab form. Nothing is
    // saved; the reader checks the draft and saves it as usual.
    "/api/labs/import": {
      POST: authed(async (req, _user, server) => {
        if (!readLab) return error(503, "Reading documents needs an Anthropic API key; set ANTHROPIC_API_KEY");
        const upload = await readUpload(req);
        if (upload instanceof Response) return upload;
        const bytes = new Uint8Array(await upload.arrayBuffer());
        const mime = sniffMime(bytes);
        if (mime !== "application/pdf" && !IMAGE_TYPES.includes(mime)) {
          return error(400, "Only PDFs and JPEG, PNG, WebP or GIF images can be read");
        }
        if (mime !== "application/pdf" && Math.ceil(bytes.length / 3) * 4 > MAX_IMAGE_BASE64_BYTES) {
          return error(413, "This photo is too large to read; try a smaller one");
        }

        server.timeout(req, READ_TIMEOUT_SECONDS + 15);
        const catalog = db
          .select({ id: analytes.id, code: analytes.code, name: analytes.name })
          .from(analytes)
          .orderBy(asc(analytes.sortOrder))
          .all();
        try {
          const extraction = await readLab({ bytes, mime }, catalog);
          return Response.json(draftFromExtraction(extraction, catalog));
        } catch (err) {
          if (err instanceof ReadLabError) return error(err.status, err.message);
          // Never log the document or what was read from it: they are medical records.
          console.error("Reading a lab document failed:", err instanceof Error ? err.name : "unknown error");
          return error(500, "Reading the document failed");
        }
      }),
    },
  };
}
