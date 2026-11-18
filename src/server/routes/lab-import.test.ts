import Anthropic from "@anthropic-ai/sdk";
import { expect, test } from "bun:test";
import type { Extraction, LabDraft } from "../../shared/lab-import";
import { claudeLabReader, ReadLabError, type ReadLab } from "../import/claude";
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
  const seen: { mime: string; codes: string[] }[] = [];
  const readLab: ReadLab = async (doc, catalog) => {
    seen.push({ mime: doc.mime, codes: catalog.map((a) => a.code) });
    return EXTRACTION;
  };
  const { call } = await startApi({ readLab });
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
  expect(res.status).toBe(503);
  expect(await json(res)).toEqual({
    error: "Reading documents needs an Anthropic API key; set ANTHROPIC_API_KEY",
  });
});

/** A one-page PDF printing the given lines, small enough to write by hand. */
function tinyPdf(lines: string[]): Uint8Array<ArrayBuffer> {
  const text = lines.map((l, i) => `BT /F1 12 Tf 50 ${750 - i * 18} Td (${l}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

// Calls the real API (and costs a little) only when a key is set.
test.skipIf(!process.env.ANTHROPIC_API_KEY)(
  "Claude reads a receipt-style report as printed",
  async () => {
    const { call } = await startApi({ readLab: claudeLabReader(new Anthropic()) });
    const receipt = tinyPdf([
      "NORTHSIDE ANIMAL HOSPITAL  CATALYST ONE",
      "PATIENT: TEST CAT    06-NOV-2026",
      "CREA     2.9 mg/dL   0.8 - 2.4   H",
      "BUN      27  mg/dL   16 - 36",
      "SDMA     <0.5 ug/dL  0 - 14",
      "WOMBAT   12  U/L     5 - 50",
    ]);
    const res = await call("/api/labs/import", { method: "POST", body: form(receipt) });
    expect(res.status).toBe(200);
    const draft = (await res.json()) as LabDraft;
    expect(draft.date).toBe("2026-11-06");
    const values = draft.results.map((r) => [r.valueText, r.refLow, r.refHigh]);
    expect(values).toContainEqual(["2.9", "0.8", "2.4"]);
    expect(values).toContainEqual(["<0.5", "0", "14"]);
    expect(draft.unmatched.map((u) => u.printedName)).toContain("WOMBAT");
  },
  // A live model call; see READ_TIMEOUT_SECONDS.
  200_000,
);
