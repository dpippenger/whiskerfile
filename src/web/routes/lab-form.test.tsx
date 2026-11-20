import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { files, labReports } from "../../server/db/schema";
import { ReadLabError, type LabDocument, type ReadLab } from "../../server/import/claude";
import type { LabReportWithResults } from "../../server/routes/labs";
import { startApi } from "../../server/test-support";
import { localToday } from "../../shared/dates";
import type { Extraction } from "../../shared/lab-import";

// The lab form rendered in a DOM and wired to the real API in process: the
// form's fetch goes through the route table, so only Claude's reading and the
// browser's image decoding are stand-ins.

let rtl: typeof import("@testing-library/react/pure");
let LabEntry: typeof import("./lab-form").LabEntry;
/** Queries over the page of the form `open` rendered last. */
let page: ReturnType<typeof rtl.within>;

const globals = globalThis as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  // Only the DOM comes from happy-dom. Bun's own request types stay in place,
  // so the server code under the form sees what it sees in production, and so
  // do its timers: React keeps the ones it was imported under, and happy-dom's
  // stop for good when its window is closed after the last test.
  const native = {
    fetch,
    Request,
    Response,
    Headers,
    FormData,
    File,
    Blob,
    URL,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    queueMicrotask,
    MessageChannel,
  };
  GlobalRegistrator.register({ url: "http://whiskerfile.test/pets/1/labs/new" });
  Object.assign(globalThis, native);
  // The "pure" entry registers no hooks of its own, which can't be done from inside one.
  rtl = await import("@testing-library/react/pure");
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  ({ LabEntry } = await import("./lab-form"));
});

afterEach(() => {
  rtl.cleanup();
  globalThis.fetch = realFetch;
  delete globals.createImageBitmap;
  delete globals.OffscreenCanvas;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

const CREATININE = {
  code: "CREA",
  printedName: "Creatinine",
  value: "2.9",
  unit: "mg/dL",
  rangeLow: "0.6",
  rangeHigh: "2.4",
};
const EXTRACTION: Extraction = {
  date: "2026-11-06",
  lab: "IDEXX",
  accession: "A-1",
  source: "in_house",
  results: [
    CREATININE,
    { code: "SDMA", printedName: "SDMA", value: "18", unit: "µg/dL", rangeLow: null, rangeHigh: "14" },
    { code: null, printedName: "Cystatin B", value: "0.4", unit: "µg/L", rangeLow: null, rangeHigh: null },
  ],
};

const PET = {
  name: "Miso",
  species: "cat",
  breed: null,
  sex: "female",
  reproductive: "altered",
  dob: "2014-03-15",
  dobEstimated: false,
  coatColor: null,
  eyeColor: null,
  microchip: null,
  chipRegistryId: null,
  photoFileId: null,
  notes: null,
  deceasedOn: null,
};

const pdf = (name = "idexx.pdf") => new File(["%PDF-1.7\nCreatinine 2.9 mg/dL"], name, { type: "application/pdf" });
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
// What the stand-in canvas "encodes": the first bytes of a WebP file.
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const image = (magic: readonly number[], name: string, type: string) =>
  new File([new Uint8Array(magic)], name, { type });

/** Stands in for the browser's image decoding: every image is `width` x `height`. */
function decodeImagesAs(width: number, height: number) {
  const drawn: { width: number; height: number }[] = [];
  globals.createImageBitmap = async () => ({ width, height, close: () => {} });
  globals.OffscreenCanvas = class {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      drawn.push({ width, height });
    }
    getContext() {
      return { drawImage: () => {} };
    }
    async convertToBlob({ type }: { type: string }) {
      return new Blob([WEBP], { type });
    }
  };
  return drawn;
}

/**
 * The form for a pet, served by the API with `readLab` as its reader (none:
 * no API key). `report` opens an existing report for editing.
 */
async function open(readLab?: ReadLab, report?: { lab: string; value: string }) {
  const api = await startApi({ readLab });
  const { call, db } = api;
  const json = async <T,>(res: Promise<Response>) => (await (await res).json()) as T;
  // The form's API client only ever fetches a path.
  globalThis.fetch = ((path: string, init?: RequestInit) =>
    call(path, {
      method: init?.method,
      ...(typeof init?.body === "string" ? { raw: init.body } : { body: init?.body ?? undefined }),
    })) as unknown as typeof fetch;

  const petId = (await json<{ id: number }>(call("/api/pets", { method: "POST", body: PET }))).id;
  const catalog = await json<{ id: number; code: string }[]>(call("/api/analytes"));
  const analyteId = (code: string) => catalog.find((a) => a.code === code)!.id;
  const labs = () => json<LabReportWithResults[]>(call(`/api/pets/${petId}/labs`));
  let reportId: number | undefined;
  if (report) {
    const body = {
      date: "2026-10-01",
      source: "reference_lab",
      lab: report.lab,
      accession: "",
      notes: "",
      entryId: null,
      results: [{ analyteId: analyteId("CREA"), valueText: report.value, unit: "mg/dL", refLow: 0.8, refHigh: 2.4 }],
    };
    reportId = (await json<{ id: number }>(call(`/api/pets/${petId}/labs`, { method: "POST", body }))).id;
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Bound here, not testing-library's `screen`: that keeps the document it was imported under.
  page = rtl.within(document.body);
  const { container } = rtl.render(
    <QueryClientProvider client={client}>
      <LabEntry petId={petId} reportId={reportId} />
    </QueryClientProvider>,
  );
  // The picker's own button; while a document is read, Save is labelled "Reading…" too.
  const readButton = () =>
    page
      .getAllByRole<HTMLButtonElement>("button", { name: /Read results from a document|Reading…/ })
      .find((b) => b.type === "button")!;
  await rtl.waitFor(readButton);
  const field = (label: string) => page.getByLabelText(label) as HTMLInputElement;
  const pick = (file: File) =>
    rtl.fireEvent.change(container.querySelector('input[accept="application/pdf,image/*"]')!, {
      target: { files: [file] },
    });
  const type = (label: string, value: string) => rtl.fireEvent.change(field(label), { target: { value } });
  const notice = () => page.findByRole("status");
  const stored = () => db.select().from(files).all();
  return { ...api, container, field, pick, type, notice, stored, labs, analyteId, readButton };
}

/** A reader that answers with `extraction` and records each document it was given. */
function reader(extraction: Extraction = EXTRACTION) {
  const seen: LabDocument[] = [];
  const readLab: ReadLab = async (doc) => {
    seen.push(doc);
    return extraction;
  };
  return { seen, readLab };
}

test("a picked document is attached and read into the form, and nothing is saved until Save", async () => {
  const { seen, readLab } = reader();
  const form = await open(readLab);
  const original = pdf();
  form.pick(original);

  const notice = await form.notice();
  expect(notice.textContent).toContain("Read 2 results from idexx.pdf.");
  expect(notice.textContent).toContain("Check every value and range against the document before saving.");
  expect(notice.textContent).toContain("Not filled in; add these by hand if you need them:");
  expect(notice.textContent).toContain("Cystatin B 0.4 µg/L · Not in your list of tests");
  expect(notice.textContent).not.toContain("Kept as you typed them");

  // The original went up unchanged and is attached; the same bytes were read.
  expect(page.getByLabelText("Remove idexx.pdf")).toBeTruthy();
  expect(form.stored()).toMatchObject([{ originalName: "idexx.pdf", mime: "application/pdf" }]);
  expect(seen).toHaveLength(1);
  expect(seen[0]!.mime).toBe("application/pdf");
  expect(seen[0]!.bytes).toEqual(new Uint8Array(await original.arrayBuffer()));

  // The untouched defaults give way to what the document prints.
  expect(form.field("Sample date").value).toBe("2026-11-06");
  expect(form.field("Tested by").value).toBe("in_house");
  expect(form.field("Lab").value).toBe("IDEXX");
  expect(form.field("Accession number").value).toBe("A-1");
  expect(form.field("Notes").value).toBe("");
  expect(form.field("Visit").value).toBe("");
  expect(form.field("Creatinine result").value).toBe("2.9");
  expect(form.field("Creatinine unit").value).toBe("mg/dL");
  expect(form.field("Creatinine ref. low").value).toBe("0.6");
  expect(form.field("Creatinine ref. high").value).toBe("2.4");
  expect(form.field("SDMA result").value).toBe("18");
  expect(form.field("SDMA ref. low").value).toBe("");
  expect(form.field("SDMA ref. high").value).toBe("14");

  // Reading saved no report; Save does, with the original attached.
  expect(form.db.select().from(labReports).all()).toEqual([]);
  rtl.fireEvent.click(page.getByRole("button", { name: "Save results" }));
  await rtl.waitFor(() => expect(form.db.select().from(labReports).all()).toHaveLength(1));
  const [saved] = await form.labs();
  expect(saved).toMatchObject({ date: "2026-11-06", source: "in_house", lab: "IDEXX", accession: "A-1" });
  const results = saved!.results.map((r) => [r.valueText, r.refLow, r.refHigh]);
  expect(results).toHaveLength(2);
  expect(results).toContainEqual(["2.9", 0.6, 2.4]);
  expect(results).toContainEqual(["18", null, 14]);
  expect(saved!.attachments.map((a) => a.file.originalName)).toEqual(["idexx.pdf"]);

  rtl.fireEvent.click(page.getByLabelText("Dismiss"));
  expect(page.queryByRole("status")).toBeNull();
});

test("details the reader edited and values already typed are kept and reported", async () => {
  const form = await open(reader({ ...EXTRACTION, date: "2999-01-01" }).readLab);
  form.type("Lab", "Antech");
  rtl.fireEvent.change(page.getByLabelText("Add a test"), {
    target: { value: String(form.analyteId("CREA")) },
  });
  form.type("Creatinine result", " 3.1 ");
  form.type("Creatinine ref. high", "2.0");
  form.pick(pdf());

  const notice = await form.notice();
  // Only SDMA was filled in; creatinine stays as typed, range and all.
  expect(notice.textContent).toContain("Read 1 result from idexx.pdf.");
  expect(notice.textContent).toContain("Kept as you typed them:");
  expect(notice.textContent).toContain("CREA: you typed 3.1, the document says 2.9");
  expect(form.field("Creatinine result").value).toBe(" 3.1 ");
  expect(form.field("Creatinine ref. high").value).toBe("2.0");
  expect(form.field("SDMA result").value).toBe("18");
  expect(form.field("Lab").value).toBe("Antech");
  expect(form.field("Accession number").value).toBe("A-1");
  // A date after today can't be the sample's: the default stays.
  expect(form.field("Sample date").value).toBe(localToday());
});

test("on a saved report a reading fills only details that are empty", async () => {
  const form = await open(reader().readLab, { lab: "Antech", value: "2.9" });
  form.pick(pdf());

  const notice = await form.notice();
  // The saved creatinine matches the document: neither filled in nor reported.
  expect(notice.textContent).toContain("Read 1 result from idexx.pdf.");
  expect(notice.textContent).not.toContain("Kept as you typed them");
  expect(form.field("Sample date").value).toBe("2026-10-01");
  expect(form.field("Tested by").value).toBe("reference_lab");
  expect(form.field("Lab").value).toBe("Antech");
  expect(form.field("Accession number").value).toBe("A-1");
  expect(form.field("Creatinine ref. low").value).toBe("0.8");
});

test("while a document is being read, reading and saving wait for it", async () => {
  let finish!: (extraction: Extraction) => void;
  const form = await open(() => new Promise<Extraction>((resolve) => (finish = resolve)));
  form.pick(pdf());

  await rtl.waitFor(() => expect(form.readButton().textContent).toBe("Reading…"));
  const save = form.container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(save.textContent).toBe("Reading…");
  expect(form.readButton().disabled).toBe(true);
  expect(save.disabled).toBe(true);
  // Submitting some other way (Enter in a field) does nothing either.
  rtl.fireEvent.submit(form.container.querySelector("form")!);
  expect(page.queryByText("Check the highlighted fields.")).toBeNull();
  expect(form.db.select().from(labReports).all()).toEqual([]);

  await rtl.waitFor(() => expect(finish).toBeDefined());
  finish(EXTRACTION);
  await form.notice();
  expect(page.getByRole<HTMLButtonElement>("button", { name: "Save results" }).disabled).toBe(false);
  expect(form.readButton().disabled).toBe(false);
});

test("a failed reading says why under the picker and keeps the original attached", async () => {
  const form = await open(async () => {
    throw new ReadLabError("Claude declined to read this document. Enter the results by hand.", 422);
  });
  form.pick(pdf());
  expect(await page.findByText("Claude declined to read this document. Enter the results by hand.")).toBeTruthy();
  expect(page.getByLabelText("Remove idexx.pdf")).toBeTruthy();
  expect(page.queryByRole("status")).toBeNull();
});

test("a busy API keeps the original attached, since the reading did start", async () => {
  const form = await open(async () => {
    throw new ReadLabError("The Anthropic API is busy. Try again in a minute.", 503);
  });
  form.pick(pdf());
  expect(await page.findByText("The Anthropic API is busy. Try again in a minute.")).toBeTruthy();
  expect(page.getByLabelText("Remove idexx.pdf")).toBeTruthy();
});

test("without an API key the form says what to set and detaches the document that was never read", async () => {
  const form = await open();
  form.pick(pdf());
  expect(await page.findByText("Reading documents needs an Anthropic API key; set ANTHROPIC_API_KEY")).toBeTruthy();
  expect(page.queryByLabelText("Remove idexx.pdf")).toBeNull();
  expect(page.queryByRole("status")).toBeNull();
});

test("the read picker offers only PDFs and images", async () => {
  const form = await open(reader().readLab);
  const inputs = [...form.container.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  expect(inputs.map((i) => i.accept)).toEqual(["", "application/pdf,image/*"]);
});

test("a PNG or GIF small enough for the API is read as it is", async () => {
  const drawn = decodeImagesAs(1200, 2576);
  for (const [magic, name, mime] of [
    [PNG, "screenshot.png", "image/png"],
    [GIF, "screenshot.gif", "image/gif"],
  ] as const) {
    const { seen, readLab } = reader();
    const form = await open(readLab);
    form.pick(image(magic, name, mime));
    await form.notice();
    expect(seen[0]!.mime).toBe(mime);
    expect([...seen[0]!.bytes]).toEqual(magic);
    rtl.cleanup();
  }
  expect(drawn).toEqual([]);
});

test("a PNG too large for the API is re-encoded whatever its dimensions", async () => {
  const drawn = decodeImagesAs(800, 600);
  const { seen, readLab } = reader();
  const form = await open(readLab);
  // 8 MB is over the API's 10 MB once base64 encoded.
  const bytes = new Uint8Array(8 * 1024 * 1024);
  bytes.set(PNG);
  form.pick(new File([bytes], "scan.png", { type: "image/png" }));
  await form.notice();
  // Once for reading at full size, once for the attachment's list preview.
  expect(drawn).toEqual([
    { width: 800, height: 600 },
    { width: 640, height: 480 },
  ]);
  expect(seen[0]!.mime).toBe("image/webp");
  expect(form.stored().map((f) => [f.originalName, f.sizeBytes])).toContainEqual(["scan.png", bytes.length]);
});

test("a photo is scaled down for reading while the original is attached unchanged", async () => {
  const drawn = decodeImagesAs(5152, 2576);
  const { seen, readLab } = reader();
  const form = await open(readLab);
  // The name and declared type lie; the bytes say JPEG, so it is re-encoded.
  form.pick(image(JPEG, "receipt.png", "image/png"));
  const notice = await form.notice();
  expect(notice.textContent).toContain("from receipt.png.");
  expect(drawn).toEqual([{ width: 2576, height: 1288 }]);
  expect(seen[0]!.mime).toBe("image/webp");
  expect(seen[0]!.bytes).toEqual(WEBP);
  expect(form.stored()).toMatchObject([{ originalName: "receipt.png", mime: "image/jpeg", sizeBytes: JPEG.length }]);
});

test("a screenshot wider than the API reads is scaled down too", async () => {
  const drawn = decodeImagesAs(2577, 100);
  const { seen, readLab } = reader();
  const form = await open(readLab);
  form.pick(image(PNG, "wide.png", "image/png"));
  await form.notice();
  expect(drawn).toEqual([{ width: 2576, height: 100 }]);
  expect(seen[0]!.mime).toBe("image/webp");
});

test("an image the browser can't decode is refused before anything is uploaded", async () => {
  globals.createImageBitmap = async () => {
    throw new DOMException("The source image could not be decoded.", "InvalidStateError");
  };
  const { seen, readLab } = reader();
  const form = await open(readLab);
  // A PNG takes the keep-as-is check first and a HEIC photo goes straight to scaling: both end the same way.
  for (const file of [image(PNG, "broken.png", "image/png"), image([0, 0, 0, 0x18], "photo.heic", "image/heic")]) {
    form.pick(file);
    expect(await page.findByText("This image format can't be used here. Try a JPEG or PNG.")).toBeTruthy();
    await rtl.waitFor(() => expect(form.readButton().disabled).toBe(false));
  }
  expect(form.stored()).toEqual([]);
  expect(seen).toEqual([]);
  expect(form.container.querySelector('[aria-label^="Remove "]')).toBeNull();
});
