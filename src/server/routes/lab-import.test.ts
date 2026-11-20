import { expect, spyOn, test } from "bun:test";
import type { Extraction, LabDraft } from "../../shared/lab-import";
import { files, labReports } from "../db/schema";
import { READ_TIMEOUT_SECONDS, ReadLabError, type ReadLab } from "../import/claude";
import { startApi } from "../test-support";

const EXTRACTION: Extraction = {
  date: "2026-11-06",
  lab: "IDEXX",
  accession: "A-1",
  source: "reference_lab",
  results: [
    { code: "CREA", printedName: "Creatinine", value: "2.9", unit: "mg/dL", rangeLow: "0.6", rangeHigh: "2.4" },
    { code: null, printedName: "Cystatin B", value: "0.4", unit: "µg/L", rangeLow: null, rangeHigh: null },
  ],
};

const form = (bytes: Uint8Array<ArrayBuffer> | string, name = "report.pdf") => {
  const body = new FormData();
  body.append("file", new File([bytes], name));
  return body;
};
const PDF = "%PDF-1.7\nCreatinine 2.9 mg/dL";
const json = async (res: Response) => (await res.json()) as unknown;

test("a document is read into a draft for the form, with the catalog offered to the reader", async () => {
  const seen: { mime: string; codes: string[]; signal: unknown }[] = [];
  const readLab: ReadLab = async (doc, catalog, signal) => {
    seen.push({ mime: doc.mime, codes: catalog.map((a) => a.code), signal });
    return EXTRACTION;
  };
  const { call, db, timeouts } = await startApi({ readLab });
  const res = await call("/api/labs/import", { method: "POST", body: form(PDF) });
  expect(res.status).toBe(200);
  const draft = (await res.json()) as LabDraft;
  expect(draft.date).toBe("2026-11-06");
  expect(draft.results).toHaveLength(1);
  expect(draft.results[0]).toMatchObject({ valueText: "2.9", unit: "mg/dL", refLow: "0.6", refHigh: "2.4" });
  expect(draft.unmatched).toEqual([
    { printedName: "Cystatin B", valueText: "0.4", unit: "µg/L", reason: "Not in your list of tests" },
  ]);
  expect(seen[0]!.mime).toBe("application/pdf");
  expect(seen[0]!.codes).toContain("CREA");
  // The reading stops if the request goes away, and the request may wait for the whole reading.
  expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
  expect(timeouts).toEqual([READ_TIMEOUT_SECONDS + 15]);
  // Nothing is saved: not a report, not the document.
  expect(db.select().from(labReports).all()).toEqual([]);
  expect(db.select().from(files).all()).toEqual([]);
});

test("an unexpected failure answers 500 and logs only its kind, never what was read", async () => {
  const { call } = await startApi({
    readLab: async () => {
      throw new SyntaxError("Unexpected token in CREA 2.9 mg/dL for Miso");
    },
  });
  const logged = spyOn(console, "error").mockImplementation(() => {});
  try {
    const res = await call("/api/labs/import", { method: "POST", body: form(PDF) });
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ error: "Reading the document failed" });
    expect(logged.mock.calls).toEqual([["Reading a lab document failed:", "SyntaxError"]]);
  } finally {
    logged.mockRestore();
  }
});

test("only PDFs and images are read, and the reader's failures are passed on", async () => {
  const { call } = await startApi({
    readLab: async () => {
      throw new ReadLabError("Claude declined to read this document. Enter the results by hand.", 422);
    },
  });
  const text = await call("/api/labs/import", { method: "POST", body: form("hello", "notes.txt") });
  expect(text.status).toBe(400);
  // The name says PDF; the bytes don't.
  expect((await call("/api/labs/import", { method: "POST", body: form("<html>", "x.pdf") })).status).toBe(400);
  const declined = await call("/api/labs/import", { method: "POST", body: form(PDF) });
  expect(declined.status).toBe(422);
  expect(await json(declined)).toEqual({ error: "Claude declined to read this document. Enter the results by hand." });
});

test("a photo too large for the API is refused before anything is sent", async () => {
  let called = false;
  const { call } = await startApi({
    readLab: async () => {
      called = true;
      return EXTRACTION;
    },
  });
  const jpeg = new Uint8Array(8 * 1024 * 1024);
  jpeg.set([0xff, 0xd8, 0xff]);
  expect((await call("/api/labs/import", { method: "POST", body: form(jpeg, "photo.jpg") })).status).toBe(413);
  expect(called).toBe(false);
});

test("without an API key, importing says what to set", async () => {
  const { call } = await startApi();
  const res = await call("/api/labs/import", { method: "POST", body: form(PDF) });
  expect(res.status).toBe(501);
  expect(await json(res)).toEqual({
    error: "Reading documents needs an Anthropic API key; set ANTHROPIC_API_KEY",
  });
});

test("the missing key is reported before the upload is looked at", async () => {
  const { call } = await startApi();
  // Each of these is a 400 or 413 once a key is set; without one, none is read that far.
  const empty = new FormData();
  empty.append("note", "no file field");
  const jpeg = new Uint8Array(8 * 1024 * 1024);
  jpeg.set([0xff, 0xd8, 0xff]);
  for (const body of [form("hello", "notes.txt"), form("", "empty.pdf"), empty, form(jpeg, "photo.jpg")]) {
    expect((await call("/api/labs/import", { method: "POST", body })).status).toBe(501);
  }
});
