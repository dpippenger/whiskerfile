import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { isIsoDate } from "../../shared/dates";
import { WEIGHT_UNITS } from "../../shared/records";
import type { Db } from "../db";
import { chipRegistries, files, measurements, pets } from "../db/schema";
import { uploadPath } from "../files";
import { error, idParam, type AppContext, type Authed } from "../http";
import { trendChart, weightChart } from "../report/charts";
import { reportHtml, type ReportAssets } from "../report/html";
import { reportModel } from "../report/model";
import { PDF_TIMEOUT_SECONDS } from "../report/pdf";
import { petHealth } from "./health";
import { petLabReports } from "./labs";

const date = z.string().refine(isIsoDate, "Must be a date (YYYY-MM-DD)");

export const reportQuery = z
  .object({
    today: date,
    weightUnit: z.enum(WEIGHT_UNITS),
    from: date.nullable().default(null),
    to: date.nullable().default(null),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "Must be on or after the start", path: ["to"] });

const dataUrl = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

let fonts: Promise<ReportAssets["fonts"]> | null = null;
/** The app's own fonts, read once, so the PDF looks the same on any machine. */
function reportFonts() {
  const read = async (spec: string) =>
    dataUrl(await Bun.file(Bun.resolveSync(spec, import.meta.dir)).bytes(), "font/woff2");
  fonts ??= Promise.all([
    read("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
    read("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2"),
  ]).then(([sans, mono]) => ({ sans, mono }));
  return fonts;
}

/** The pet's photo as a data URL, using the small preview when there is one. */
async function photo(db: Db, dataDir: string, fileId: number | null): Promise<string | null> {
  if (!fileId) return null;
  const original = db.select().from(files).where(eq(files.id, fileId)).get();
  const preview = original?.previewId
    ? db.select().from(files).where(eq(files.id, original.previewId)).get()
    : undefined;
  const file = preview ?? original;
  if (!file) return null;
  const stored = Bun.file(uploadPath(dataDir, file.sha256));
  return (await stored.exists()) ? dataUrl(await stored.bytes(), file.mime) : null;
}

/** "Sir Reginald" → "sir-reginald"; a name with no ASCII letters or digits → "pet". */
const slug = (name: string) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "pet";

export function reportRoutes({ db, dataDir, renderPdf }: AppContext, authed: Authed) {
  return {
    // A printable health report for one pet. The browser sends its own date and
    // weight unit, since the server can't know either.
    "/api/pets/:id/report.pdf": {
      GET: authed<"/api/pets/:id/report.pdf">(async (req, _user, server) => {
        // Bun drops a request idle for 10 s; give Chromium its full time limit instead.
        server.timeout(req, PDF_TIMEOUT_SECONDS + 5);
        const petId = idParam(req.params.id);
        const pet = petId
          ? db
              .select({ pet: pets, registry: chipRegistries.name })
              .from(pets)
              .leftJoin(chipRegistries, eq(chipRegistries.id, pets.chipRegistryId))
              .where(eq(pets.id, petId))
              .get()
          : undefined;
        if (!pet) return error(404, "Pet not found");

        const params = Object.fromEntries(new URL(req.url).searchParams);
        const query = reportQuery.safeParse(params);
        if (!query.success) {
          const fields: Record<string, string> = {};
          for (const issue of query.error.issues) fields[issue.path.join(".")] ??= issue.message;
          return error(400, "Some fields are invalid", fields);
        }
        if (!renderPdf) return error(503, "PDF reports need Chromium; set CHROMIUM_PATH");

        const model = reportModel(
          {
            pet: { ...pet.pet, registry: pet.registry },
            weights: db
              .select({ date: measurements.date, value: measurements.value })
              .from(measurements)
              .where(and(eq(measurements.petId, pet.pet.id), eq(measurements.kind, "weight")))
              .orderBy(asc(measurements.date), asc(measurements.id))
              .all(),
            labs: petLabReports(db, pet.pet.id),
            health: petHealth(db, pet.pet.id),
          },
          query.data,
        );
        const color = pet.pet.chartColor;
        const html = reportHtml(model, {
          weightChart: model.weights.length > 1 ? weightChart(model.weights, color, model.weightUnit) : null,
          trendCharts: model.trends.map((t) => trendChart(t, color)),
          photo: await photo(db, dataDir, pet.pet.photoFileId),
          fonts: await reportFonts(),
        });
        let pdf: Uint8Array<ArrayBuffer>;
        try {
          pdf = await renderPdf(html);
        } catch (err) {
          console.error(`Report for pet ${pet.pet.id} failed:`, err);
          return error(500, "The PDF couldn't be made. The server log says why.");
        }
        const name = `${slug(pet.pet.name)}-health-report-${query.data.today}.pdf`;
        return new Response(pdf, {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` },
        });
      }),
    },
  };
}
