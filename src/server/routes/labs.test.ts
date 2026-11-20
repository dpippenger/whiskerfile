import { expect, test } from "bun:test";
import { attachments, files, labReports, labResults } from "../db/schema";
import { startApi } from "../test-support";
import type { LabReportWithResults } from "./labs";
import type { PetSummary } from "./pets";
import type { PetRecords } from "./records";

const PET = {
  name: "Miso",
  species: "cat",
  breed: null,
  sex: "female",
  reproductive: "altered",
  dob: null,
  dobEstimated: false,
  coatColor: null,
  eyeColor: null,
  microchip: null,
  chipRegistryId: null,
  photoFileId: null,
  notes: null,
  deceasedOn: null,
};

async function setup() {
  const api = await startApi();
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const petId = (await json<{ id: number }>(api.call("/api/pets", { method: "POST", body: PET }))).id;
  const catalog = await json<{ id: number; code: string }[]>(api.call("/api/analytes"));
  const analyte = (code: string) => catalog.find((a) => a.code === code)!.id;
  const upload = async (text: string, name: string) => {
    const form = new FormData();
    form.append("file", new File([new TextEncoder().encode(`%PDF-1.7\n${text}`)], name));
    return (await json<{ id: number }>(api.call("/api/files", { method: "POST", body: form }))).id;
  };
  const labs = () => json<LabReportWithResults[]>(api.call(`/api/pets/${petId}/labs`));
  return { ...api, json, petId, analyte, upload, labs };
}

const report = (results: object[], fields: object = {}) => ({
  date: "2026-11-06",
  source: "reference_lab",
  lab: "IDEXX",
  accession: "A123",
  notes: "",
  entryId: null,
  results,
  ...fields,
});

test("a report is saved with its results as printed, in catalog order, with its document", async () => {
  const { call, analyte, upload, labs, petId } = await setup();
  const doc = await upload("chem", "Chem 17.pdf");
  const created = await call(`/api/pets/${petId}/labs`, {
    method: "POST",
    body: report(
      [
        { analyteId: analyte("FELV"), valueText: "Negative", unit: "", refLow: null, refHigh: null },
        { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 },
        { analyteId: analyte("SDMA"), valueText: "<0.5", unit: "µg/dL", refLow: null, refHigh: 14 },
      ],
      { fileIds: [doc] },
    ),
  });
  expect(created.status).toBe(201);

  const [saved] = await labs();
  expect(saved!.results.map((r) => [r.code, r.valueText, r.value, r.comparator, r.unit])).toEqual([
    ["SDMA", "<0.5", 0.5, "<", "µg/dL"],
    ["CREA", "2.6", 2.6, null, "mg/dL"],
    ["FELV", "Negative", null, null, null],
  ]);
  expect(saved!.attachments.map((a) => [a.file.originalName, a.date])).toEqual([["Chem 17.pdf", "2026-11-06"]]);
  expect(saved).toMatchObject({ lab: "IDEXX", accession: "A123", author: "a", entryId: null });
});

test("editing a report updates kept results in place and moves its documents to the new date", async () => {
  const { call, json, db, analyte, upload, labs, petId } = await setup();
  const doc = await upload("chem", "chem.pdf");
  const { id } = await json<{ id: number }>(
    call(`/api/pets/${petId}/labs`, {
      method: "POST",
      body: report(
        [
          { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 },
          { analyteId: analyte("BUN"), valueText: "34", unit: "mg/dL", refLow: 16, refHigh: 37 },
        ],
        { fileIds: [doc] },
      ),
    }),
  );
  const creaId = (await labs())[0]!.results.find((r) => r.code === "CREA")!.id;

  const edited = await call(`/api/labs/${id}`, {
    method: "PUT",
    body: report(
      [
        { analyteId: analyte("CREA"), valueText: "2.5", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 },
        { analyteId: analyte("PHOS"), valueText: "5.1", unit: "mg/dL", refLow: 3.1, refHigh: 7.5 },
      ],
      { date: "2026-11-07" },
    ),
  });
  expect(edited.status).toBe(200);
  const [saved] = await labs();
  expect(saved!.results.map((r) => [r.code, r.valueText])).toEqual([
    ["CREA", "2.5"],
    ["PHOS", "5.1"],
  ]);
  expect(saved!.results.find((r) => r.code === "CREA")!.id).toBe(creaId);
  expect(saved!.attachments.map((a) => a.date)).toEqual(["2026-11-07"]);
  expect(db.select().from(labResults).all()).toHaveLength(2);
});

test("a report naming an unknown test, file or another pet's visit is refused and writes nothing", async () => {
  const { call, json, db, analyte, petId } = await setup();
  const otherPet = (await json<{ id: number }>(call("/api/pets", { method: "POST", body: { ...PET, name: "Other" } })))
    .id;
  const otherVisit = await json<{ id: number }>(
    call(`/api/pets/${otherPet}/entries`, {
      method: "POST",
      body: { kind: "vet", date: "2026-11-01", clinic: "", vet: "", reason: "", notes: "", vitals: {} },
    }),
  );
  const crea = { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 };
  const fields = async (body: object) => {
    const res = await call(`/api/pets/${petId}/labs`, { method: "POST", body });
    expect(res.status).toBe(400);
    return (await json<{ fields: object }>(res)).fields;
  };

  const homeExam = await json<{ id: number }>(
    call(`/api/pets/${petId}/entries`, {
      method: "POST",
      body: { kind: "home", date: "2026-11-01", clinic: "", vet: "", reason: "", notes: "", vitals: {} },
    }),
  );

  expect(await fields(report([crea, { ...crea, analyteId: 99999 }]))).toEqual({
    "results.1.analyteId": "Unknown test",
  });
  expect(await fields(report([crea], { entryId: otherVisit.id }))).toEqual({ entryId: "Not a visit of this pet" });
  // A home exam, even this pet's own, is not a visit a sample is taken at.
  expect(await fields(report([crea], { entryId: homeExam.id }))).toEqual({ entryId: "Not a visit of this pet" });
  expect(await fields(report([crea], { fileIds: [99999] }))).toEqual({ fileIds: "Unknown file" });
  // The sample was already taken.
  expect(await fields(report([crea], { date: "2999-01-01" }))).toEqual({ date: "Can't be in the future" });
  expect(await fields(report([crea, crea]))).toHaveProperty(["results.1.analyteId"]);
  expect(await fields(report([]))).toHaveProperty("results");
  expect(db.select().from(labReports).all()).toEqual([]);
  expect((await call("/api/pets/999/labs", { method: "POST", body: report([crea]) })).status).toBe(404);
  expect((await call("/api/labs/999", { method: "PUT", body: report([crea]) })).status).toBe(404);
});

test("a report can't attach another pet's file, but keeps its own across an edit", async () => {
  const { call, json, analyte, upload, labs, petId } = await setup();
  const otherPet = (await json<{ id: number }>(call("/api/pets", { method: "POST", body: { ...PET, name: "Other" } })))
    .id;
  const theirDoc = await upload("their chem", "their.pdf");
  const crea = { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 };
  await call(`/api/pets/${otherPet}/labs`, { method: "POST", body: report([crea], { fileIds: [theirDoc] }) });

  const refused = await call(`/api/pets/${petId}/labs`, {
    method: "POST",
    body: report([crea], { fileIds: [theirDoc] }),
  });
  expect(refused.status).toBe(400);
  expect((await json<{ fields: object }>(refused)).fields).toEqual({ fileIds: "Not this pet's file" });

  // A fresh upload is fine, and an edit may name the report's own document again.
  const myDoc = await upload("chem", "chem.pdf");
  const { id } = await json<{ id: number }>(
    call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea], { fileIds: [myDoc] }) }),
  );
  expect((await call(`/api/labs/${id}`, { method: "PUT", body: report([crea], { fileIds: [myDoc] }) })).status).toBe(
    200,
  );

  // The report's own document picked again on an edit is not attached twice.
  const repick = await upload("chem", "chem.pdf");
  expect(repick).not.toBe(myDoc);
  const resaved = await call(`/api/labs/${id}`, { method: "PUT", body: report([crea], { fileIds: [myDoc, repick] }) });
  expect(resaved.status).toBe(200);
  expect((await labs())[0]!.attachments.map((a) => a.fileId)).toEqual([myDoc]);

  // The same document uploaded again for this pet is a fresh upload, not the other pet's file.
  const again = await upload("their chem", "their.pdf");
  expect(again).not.toBe(theirDoc);
  const shared = await call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea], { fileIds: [again] }) });
  expect(shared.status).toBe(201);
});

test("turning a report's visit into a home exam unlinks the report, which can still be edited", async () => {
  const { call, json, analyte, labs, petId } = await setup();
  const entry = { date: "2026-11-06", clinic: "", vet: "", reason: "", notes: "", vitals: {} };
  const visit = await json<{ id: number }>(
    call(`/api/pets/${petId}/entries`, { method: "POST", body: { ...entry, kind: "vet" } }),
  );
  const crea = { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 };
  const { id } = await json<{ id: number }>(
    call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea], { entryId: visit.id }) }),
  );

  // Saving it as a vet visit again keeps the link.
  await call(`/api/entries/${visit.id}`, { method: "PUT", body: { ...entry, kind: "vet", reason: "Recheck" } });
  expect((await labs()).map((r) => r.entryId)).toEqual([visit.id]);

  expect((await call(`/api/entries/${visit.id}`, { method: "PUT", body: { ...entry, kind: "home" } })).status).toBe(
    200,
  );
  const [saved] = await labs();
  expect(saved!.entryId).toBeNull();
  const edit = await call(`/api/labs/${id}`, { method: "PUT", body: report([crea], { entryId: saved!.entryId }) });
  expect(edit.status).toBe(200);
});

test("deleting a visit unlinks its report; deleting the report keeps the stored files", async () => {
  const { call, json, db, analyte, upload, labs, petId } = await setup();
  const visit = await json<{ id: number }>(
    call(`/api/pets/${petId}/entries`, {
      method: "POST",
      body: { kind: "vet", date: "2026-11-06", clinic: "", vet: "", reason: "", notes: "", vitals: {} },
    }),
  );
  const doc = await upload("chem", "chem.pdf");
  const crea = { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 };
  const { id } = await json<{ id: number }>(
    call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea], { entryId: visit.id, fileIds: [doc] }) }),
  );

  await call(`/api/entries/${visit.id}`, { method: "DELETE" });
  expect((await labs()).map((r) => [r.id, r.entryId])).toEqual([[id, null]]);

  expect((await call(`/api/labs/${id}`, { method: "DELETE" })).status).toBe(204);
  expect(await labs()).toEqual([]);
  expect(db.select().from(labResults).all()).toEqual([]);
  expect(db.select().from(attachments).all()).toEqual([]);
  expect(db.select().from(files).all()).toHaveLength(1);
  expect((await call(`/api/labs/${id}`, { method: "DELETE" })).status).toBe(404);
});

test("a report's documents are not listed or editable as files filed on their own", async () => {
  const { call, json, analyte, upload, labs, petId } = await setup();
  const doc = await upload("chem", "chem.pdf");
  const crea = { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 };
  await call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea], { fileIds: [doc] }) });

  const records = await json<PetRecords>(call(`/api/pets/${petId}/records`));
  expect(records.attachments).toEqual([]);
  const attachmentId = (await labs())[0]!.attachments[0]!.id;
  expect(
    (await call(`/api/attachments/${attachmentId}`, { method: "PUT", body: { label: "x", date: "2026-01-01" } }))
      .status,
  ).toBe(404);
});

test("deleting a pet removes its lab reports", async () => {
  const { call, db, analyte, petId } = await setup();
  const crea = { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 };
  await call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea]) });
  await call(`/api/pets/${petId}`, { method: "DELETE" });
  expect(db.select().from(labReports).all()).toEqual([]);
  expect(db.select().from(labResults).all()).toEqual([]);
});

test("the household can add, rename and remove tests, but not one with results", async () => {
  const { call, json, analyte, petId } = await setup();
  const created = await call("/api/analytes", {
    method: "POST",
    body: { code: "symm", name: "Symmetric dimethylarginine", category: "chemistry", defaultUnit: "µg/dL" },
  });
  expect(created.status).toBe(201);
  const custom = await json<{ id: number; code: string; sortOrder: number }>(created);
  expect(custom.code).toBe("SYMM");
  const catalog = await json<{ id: number; sortOrder: number }[]>(call("/api/analytes"));
  expect(catalog.at(-1)!.id).toBe(custom.id);

  const dupe = await call("/api/analytes", {
    method: "POST",
    body: { code: "CREA", name: "x", category: "chemistry", defaultUnit: "" },
  });
  expect(dupe.status).toBe(400);
  expect((await json<{ fields: object }>(dupe)).fields).toEqual({ code: "Already in the catalog" });

  const renamed = await call(`/api/analytes/${custom.id}`, {
    method: "PUT",
    body: { code: "SYMM", name: "SDMA (in-house)", category: "chemistry", defaultUnit: "µg/dL" },
  });
  expect(await json(renamed)).toMatchObject({ name: "SDMA (in-house)" });
  // Renaming onto a code the catalog already has is refused like adding it twice.
  const clash = await call(`/api/analytes/${custom.id}`, {
    method: "PUT",
    body: { code: "crea", name: "SDMA (in-house)", category: "chemistry", defaultUnit: "µg/dL" },
  });
  expect(clash.status).toBe(400);
  expect((await json<{ fields: object }>(clash)).fields).toEqual({ code: "Already in the catalog" });
  expect(await json<{ code: string }[]>(call("/api/analytes"))).toContainEqual(
    expect.objectContaining({ id: custom.id, code: "SYMM" }),
  );

  await call(`/api/pets/${petId}/labs`, {
    method: "POST",
    body: report([{ analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 }]),
  });
  expect((await call(`/api/analytes/${analyte("CREA")}`, { method: "DELETE" })).status).toBe(409);
  expect((await call(`/api/analytes/${custom.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await call(`/api/analytes/${custom.id}`, { method: "DELETE" })).status).toBe(404);
  expect(
    (
      await call("/api/analytes/99999", {
        method: "PUT",
        body: { code: "Q", name: "q", category: "other", defaultUnit: "" },
      })
    ).status,
  ).toBe(404);
});

test("the pet list carries the results outside their range on each pet's latest report only", async () => {
  const { call, json, analyte, petId } = await setup();
  const crea = (valueText: string) => ({
    analyteId: analyte("CREA"),
    valueText,
    unit: "mg/dL",
    refLow: 0.6,
    refHigh: 2.4,
  });
  // Two reports on the same day: the one added last is the latest.
  await call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea("2.9")], { date: "2026-11-06" }) });
  const latest = await json<{ id: number }>(
    call(`/api/pets/${petId}/labs`, {
      method: "POST",
      body: report([
        crea("0.4"),
        { analyteId: analyte("SDMA"), valueText: "<0.5", unit: "µg/dL", refLow: null, refHigh: 14 },
        { analyteId: analyte("GLU"), valueText: "520", unit: "mg/dL", refLow: 71, refHigh: 159 },
        { analyteId: analyte("FELV"), valueText: "Negative", unit: "", refLow: null, refHigh: null },
        { analyteId: analyte("ALT"), valueText: "<10", unit: "U/L", refLow: 12, refHigh: 130 },
      ]),
    }),
  );
  // An older report entered afterwards, as when filling in past results, is not the latest.
  await call(`/api/pets/${petId}/labs`, { method: "POST", body: report([crea("3.1")], { date: "2026-05-01" }) });
  await call("/api/pets", { method: "POST", body: { ...PET, name: "Tofu" } });

  const [miso, tofu] = await json<PetSummary[]>(call("/api/pets"));
  expect(miso!.latestLab).toEqual({
    id: latest.id,
    date: "2026-11-06",
    // In catalog order; in-range, unranged and undecidable results are left out.
    flagged: [
      { code: "GLU", name: "Glucose", valueText: "520", unit: "mg/dL", flag: "high" },
      { code: "CREA", name: "Creatinine", valueText: "0.4", unit: "mg/dL", flag: "low" },
      { code: "ALT", name: "ALT", valueText: "<10", unit: "U/L", flag: "low" },
    ],
  });
  expect(tofu!.latestLab).toBeNull();
});
