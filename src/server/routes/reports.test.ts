import { expect, spyOn, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { chromiumPdf, type RenderPdf } from "../report/pdf";
import { startApi } from "../test-support";
import { cacheOnSuccess } from "./reports";

const PET = {
  name: 'Tom & "Jerry" <b>',
  species: "cat",
  breed: null,
  sex: "male",
  reproductive: "altered",
  dob: "2014-03-15",
  dobEstimated: false,
  coatColor: null,
  eyeColor: null,
  microchip: null,
  chipRegistryId: null,
  photoFileId: null,
  notes: "Hates the carrier </p><script>alert(1)</script>",
  deceasedOn: null,
};

const PDF = new TextEncoder().encode("%PDF-1.7 fake");

/** Records the HTML it was asked to print and answers with a stand-in PDF. */
function fakePrinter() {
  const pages: string[] = [];
  const renderPdf: RenderPdf = async (html) => {
    pages.push(html);
    return PDF;
  };
  return { pages, renderPdf };
}

async function setup(renderPdf?: RenderPdf) {
  const api = await startApi({ renderPdf });
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const petId = (await json<{ id: number }>(api.call("/api/pets", { method: "POST", body: PET }))).id;
  return { ...api, json, petId };
}

const QUERY = "today=2026-11-18&weightUnit=lb";

test("a pet's report comes back as a PDF download named after the pet", async () => {
  const printer = fakePrinter();
  const { call, petId } = await setup(printer.renderPdf);
  await call(`/api/pets/${petId}/measurements`, {
    method: "POST",
    body: { date: "2026-10-01", kind: "weight", value: 4000 },
  });
  await call(`/api/pets/${petId}/measurements`, {
    method: "POST",
    body: { date: "2026-11-01", kind: "weight", value: 4100 },
  });
  const health = {
    vaccinations: {
      vaccine: "FVRCP",
      dateGiven: "2026-10-01",
      dueDate: null,
      lot: null,
      clinic: null,
      notes: "Sleepy for a day",
    },
    medications: {
      drug: "Methimazole",
      dose: "2.5 mg",
      frequency: null,
      startDate: "2026-11-06",
      endDate: null,
      reason: null,
      notes: "Give with food",
    },
    conditions: { kind: "allergy", title: "Chicken", date: "2022-10-10", resolvedOn: null, notes: "Itchy skin" },
  };
  for (const [path, body] of Object.entries(health)) {
    expect((await call(`/api/pets/${petId}/${path}`, { method: "POST", body })).status).toBe(201);
  }

  const res = await call(`/api/pets/${petId}/report.pdf?${QUERY}`);
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("application/pdf");
  expect(res.headers.get("Content-Disposition")).toBe(
    'attachment; filename="tom-jerry-b-health-report-2026-11-18.pdf"',
  );
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);

  const [html] = printer.pages;
  // Typed text is escaped, and the page may load nothing from outside itself.
  expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
  expect(html).toContain("&lt;/p&gt;&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain(`content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"`);
  // Weights in the reader's unit, and a chart drawn for them.
  expect(html).toContain("9.04</span> lb");
  expect(html).toContain("<svg");
  expect(html).toContain("12 yr 8 mo");
  // Each health record's notes travel with it.
  for (const note of ["Sleepy for a day", "Give with food", "Itchy skin"]) expect(html).toContain(note);
});

test("the reader's date and unit are required, and the period must make sense", async () => {
  const { call, json, petId } = await setup(fakePrinter().renderPdf);
  const fields = async (query: string) => {
    const res = await call(`/api/pets/${petId}/report.pdf?${query}`);
    expect(res.status).toBe(400);
    return Object.keys((await json<{ fields: object }>(res)).fields);
  };
  expect(await fields("")).toEqual(["today", "weightUnit"]);
  expect(await fields("today=2026-02-30&weightUnit=stone")).toEqual(["today", "weightUnit"]);
  expect(await fields(`${QUERY}&from=2026-06-01&to=2026-01-01`)).toEqual(["to"]);
  expect((await call(`/api/pets/${petId}/report.pdf?${QUERY}&from=2026-01-01&to=2026-06-01`)).status).toBe(200);
});

test("an unknown pet is 404, and without Chromium or when printing fails the reason is given", async () => {
  const { call, json, petId } = await setup();
  expect((await call(`/api/pets/999/report.pdf?${QUERY}`)).status).toBe(404);
  expect((await call(`/api/pets/abc/report.pdf?${QUERY}`)).status).toBe(404);
  const missing = await call(`/api/pets/${petId}/report.pdf?${QUERY}`);
  expect(missing.status).toBe(503);
  expect(await json(missing)).toEqual({ error: "PDF reports need Chromium; set CHROMIUM_PATH" });

  const failing = await setup(async () => {
    throw new Error("Chromium exited with 1");
  });
  const res = await failing.call(`/api/pets/${failing.petId}/report.pdf?${QUERY}`);
  expect(res.status).toBe(500);
});

test("a failed font read is retried on the next report instead of being cached", async () => {
  let calls = 0;
  const load = cacheOnSuccess(async () => {
    calls += 1;
    if (calls === 1) throw new Error("missing font file");
    return "fonts";
  });
  await expect(load()).rejects.toThrow("missing font file");
  expect(await load()).toBe("fonts");
  // A success stays cached; only the failure was forgotten.
  expect(await load()).toBe("fonts");
  expect(calls).toBe(2);
});

// chmod 000 doesn't stop root from reading the file.
test.skipIf(process.getuid?.() === 0)(
  "a failure while building the page answers and logs like a printing failure",
  async () => {
    const { call, json, petId, dataDir } = await setup(fakePrinter().renderPdf);
    // A pet photo whose stored file can't be read makes the build fail before printing.
    const body = new FormData();
    body.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "photo.png"));
    const stored = await json<{ id: number; sha256: string }>(call("/api/files", { method: "POST", body }));
    expect((await call(`/api/pets/${petId}`, { method: "PUT", body: { ...PET, photoFileId: stored.id } })).status).toBe(
      200,
    );
    await chmod(join(dataDir, "uploads", stored.sha256), 0o000);
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await call(`/api/pets/${petId}/report.pdf?${QUERY}`);
      expect(res.status).toBe(500);
      expect(await json(res)).toEqual({ error: "The PDF couldn't be made. The server log says why." });
      expect(logged.mock.calls[0]?.[0]).toBe(`Report for pet ${petId} failed:`);
    } finally {
      logged.mockRestore();
    }
  },
);

// Prints with a real Chromium only when one is configured (see README.md's Development section).
test.skipIf(!process.env.CHROMIUM_PATH)("Chromium prints the report to a real PDF", async () => {
  const { call, petId } = await setup(chromiumPdf(process.env.CHROMIUM_PATH!));
  const res = await call(`/api/pets/${petId}/report.pdf?${QUERY}`);
  expect(res.status).toBe(200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
});
