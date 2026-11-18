// Reads one lab document with Claude, as the lab form's "Read results from a
// document" does, and prints the draft. For trying the reading on real reports
// without a running server. It calls the Anthropic API, which is billed.
// Usage: ANTHROPIC_API_KEY=... bun run read:lab <report.pdf | photo.jpg>

import Anthropic from "@anthropic-ai/sdk";
import { asc } from "drizzle-orm";
import { openDb } from "../src/server/db";
import { analytes } from "../src/server/db/schema";
import { IMAGE_TYPES, sniffMime } from "../src/server/files";
import { claudeLabReader, ReadLabError } from "../src/server/import/claude";
import { draftFromExtraction } from "../src/shared/lab-import";

const path = process.argv[2];
if (!path) {
  console.error("Usage: bun run read:lab <report.pdf | photo.jpg>");
  process.exit(2);
}
const bytes = await Bun.file(path).bytes();
const mime = sniffMime(bytes);
if (mime !== "application/pdf" && !IMAGE_TYPES.includes(mime)) {
  console.error("Only PDFs and JPEG, PNG, WebP or GIF images can be read.");
  process.exit(2);
}

// The catalog as a fresh database seeds it.
const { db } = openDb(":memory:");
const catalog = db
  .select({ id: analytes.id, code: analytes.code, name: analytes.name })
  .from(analytes)
  .orderBy(asc(analytes.sortOrder))
  .all();

const started = performance.now();
try {
  const extraction = await claudeLabReader(new Anthropic())({ bytes, mime }, catalog);
  const draft = draftFromExtraction(extraction, catalog);
  const code = new Map(catalog.map((a) => [a.id, a.code]));
  console.log(
    JSON.stringify({ ...draft, results: draft.results.map((r) => ({ code: code.get(r.analyteId), ...r })) }, null, 2),
  );
  console.error(`Read in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
} catch (err) {
  console.error(err instanceof ReadLabError ? `${err.status}: ${err.message}` : err);
  process.exit(1);
}
