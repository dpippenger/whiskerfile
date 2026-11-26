import { expect, test } from "bun:test";
import { entries, labReports, pets, vaccinations, vets } from "../db/schema";
import { startApi } from "../test-support";
import type { VetWithRecords } from "./vets";

const pet = (fields: object = {}) => ({
  name: "Miso",
  species: "cat",
  breed: "",
  sex: "female",
  reproductive: "altered",
  dob: null,
  dobEstimated: false,
  coatColor: "",
  eyeColor: "",
  microchip: "",
  chipRegistryId: null,
  photoFileId: null,
  vetId: null,
  notes: "",
  deceasedOn: null,
  ...fields,
});
const vet = (fields: object = {}) => ({
  name: "Dr. Okafor",
  clinic: "Northside Animal Hospital",
  phone: "(555) 010-0142",
  email: "desk@northside.example",
  address: "1200 Northside Avenue",
  website: "https://northside.example",
  notes: "",
  ...fields,
});
const visit = (fields: object = {}) => ({
  kind: "vet",
  date: "2026-10-01",
  vetId: null,
  reason: "Annual",
  notes: "",
  vitals: {},
  ...fields,
});
const dose = (fields: object = {}) => ({
  vaccine: "Rabies",
  dateGiven: "2026-10-01",
  dueDate: null,
  lot: "",
  vetId: null,
  notes: "",
  ...fields,
});

type Id = { id: number; vetId: number | null };

async function setup() {
  const api = await startApi();
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const post = <T = Id>(path: string, body: object) => json<T>(api.call(path, { method: "POST", body }));
  const put = (path: string, body: object) => api.call(path, { method: "PUT", body });
  const fields = async (res: Promise<Response>) => {
    const response = await res;
    expect(response.status).toBe(400);
    return ((await response.json()) as { fields: Record<string, string> }).fields;
  };
  const miso = await post("/api/pets", pet());
  const analyteId = (await json<{ id: number }[]>(api.call("/api/analytes")))[0]!.id;
  const report = (fields: object = {}) => ({
    date: "2026-10-02",
    source: "reference_lab",
    lab: "IDEXX",
    accession: "",
    notes: "",
    entryId: null,
    vetId: null,
    results: [{ analyteId, valueText: "1.2", unit: "mg/dL", refLow: null, refHigh: null }],
    ...fields,
  });
  return { ...api, json, post, put, fields, petId: miso.id, report };
}

test("a vet can be added, read, edited and deleted", async () => {
  const { call, json } = await setup();

  const created = await call("/api/vets", { method: "POST", body: vet({ notes: " Closed Sundays " }) });
  expect(created.status).toBe(201);
  const saved = (await created.json()) as { id: number; createdAt: number; updatedAt: number };
  expect(saved).toMatchObject({ ...vet(), notes: "Closed Sundays" });
  expect(saved.updatedAt).toBe(saved.createdAt);

  const onlyName = vet({ name: "Dr. Lee", clinic: "", phone: "", email: "", address: "", website: "" });
  const edited = await call(`/api/vets/${saved.id}`, { method: "PUT", body: onlyName });
  expect(edited.status).toBe(200);
  expect(await edited.json()).toMatchObject({
    id: saved.id,
    name: "Dr. Lee",
    clinic: null,
    phone: null,
    email: null,
    address: null,
    website: null,
    notes: null,
    createdAt: saved.createdAt,
  });
  expect(await json(call(`/api/vets/${saved.id}`))).toMatchObject({
    name: "Dr. Lee",
    pets: [],
    entries: [],
    labReports: [],
    vaccinations: [],
  });

  expect((await call(`/api/vets/${saved.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await call(`/api/vets/${saved.id}`)).status).toBe(404);
  expect(await json(call("/api/vets"))).toEqual([]);
});

test("vets are listed by name without regard to case, and two may share a name", async () => {
  const { call, json, post } = await setup();
  for (const name of ["Dr. Okafor", "dr. lee", "Dr. Adams", "dr. lee"]) await post("/api/vets", vet({ name }));
  const list = await json<{ name: string }[]>(call("/api/vets"));
  expect(list.map((v) => v.name)).toEqual(["Dr. Adams", "dr. lee", "dr. lee", "Dr. Okafor"]);
});

test("an invalid vet is refused, naming each bad field, and nothing is written", async () => {
  const { call, post, put, fields, db } = await setup();
  const bad = vet({ name: " ", phone: "ask at the desk", email: "desk@northside", website: "northside.example" });
  expect(Object.keys(await fields(call("/api/vets", { method: "POST", body: bad }))).sort()).toEqual([
    "email",
    "name",
    "phone",
    "website",
  ]);
  expect(db.select().from(vets).all()).toEqual([]);

  const saved = await post("/api/vets", vet());
  expect(await fields(put(`/api/vets/${saved.id}`, vet({ email: "nope" })))).toHaveProperty("email");
  expect(db.select().from(vets).all()).toMatchObject([{ email: "desk@northside.example" }]);
});

test("ids that are not positive integers, or not found, give 404", async () => {
  const { call, put } = await setup();
  for (const id of ["999", "abc", "0", "1.5"]) {
    expect((await call(`/api/vets/${id}`)).status).toBe(404);
    expect((await put(`/api/vets/${id}`, vet())).status).toBe(404);
    expect((await call(`/api/vets/${id}`, { method: "DELETE" })).status).toBe(404);
  }
});

test("a visit, lab report, vaccination and pet can each be linked to a vet, relinked and unlinked", async () => {
  const { post, put, json, petId, report } = await setup();
  const okafor = await post("/api/vets", vet());
  const lee = await post("/api/vets", vet({ name: "Dr. Lee" }));

  const records: [string, string, (fields: object) => object][] = [
    [`/api/pets/${petId}/entries`, "/api/entries", visit],
    [`/api/pets/${petId}/labs`, "/api/labs", report],
    [`/api/pets/${petId}/vaccinations`, "/api/vaccinations", dose],
  ];
  for (const [collection, item, body] of records) {
    const created = await post(collection, body({ vetId: okafor.id }));
    expect(created.vetId).toBe(okafor.id);
    expect((await json<Id>(put(`${item}/${created.id}`, body({ vetId: lee.id })))).vetId).toBe(lee.id);
    expect((await json<Id>(put(`${item}/${created.id}`, body({ vetId: null })))).vetId).toBeNull();
  }

  expect((await json<Id>(put(`/api/pets/${petId}`, pet({ vetId: okafor.id })))).vetId).toBe(okafor.id);
  expect((await json<Id>(put(`/api/pets/${petId}`, pet({ vetId: lee.id })))).vetId).toBe(lee.id);
  expect((await json<Id>(put(`/api/pets/${petId}`, pet({ vetId: null })))).vetId).toBeNull();
  expect((await post("/api/pets", pet({ name: "Reggie", vetId: lee.id }))).vetId).toBe(lee.id);
});

test("a home exam is saved without a vet, whatever the body names", async () => {
  const { post, put, json, petId } = await setup();
  const okafor = await post("/api/vets", vet());
  const exam = await post(`/api/pets/${petId}/entries`, visit({ kind: "home", vetId: okafor.id }));
  expect(exam.vetId).toBeNull();

  const seen = await post(`/api/pets/${petId}/entries`, visit({ vetId: okafor.id }));
  const switched = await json<Id>(put(`/api/entries/${seen.id}`, visit({ kind: "home", vetId: okafor.id })));
  expect(switched.vetId).toBeNull();
});

test("a record naming a vet that isn't saved is refused and nothing is written", async () => {
  const { call, post, put, fields, db, petId, report } = await setup();
  const unknown = { vetId: "Unknown vet" };
  const create = (path: string, body: object) => call(path, { method: "POST", body });

  expect(await fields(create(`/api/pets/${petId}/entries`, visit({ vetId: 999 })))).toEqual(unknown);
  expect(await fields(create(`/api/pets/${petId}/labs`, report({ vetId: 999 })))).toEqual(unknown);
  expect(await fields(create(`/api/pets/${petId}/vaccinations`, dose({ vetId: 999 })))).toEqual(unknown);
  expect(await fields(create("/api/pets", pet({ name: "Reggie", vetId: 999 })))).toEqual(unknown);
  expect(db.select().from(entries).all()).toEqual([]);
  expect(db.select().from(labReports).all()).toEqual([]);
  expect(db.select().from(vaccinations).all()).toEqual([]);
  expect(db.select().from(pets).all()).toHaveLength(1);

  // An edit is refused the same way and keeps what was saved.
  const okafor = await post("/api/vets", vet());
  const seen = await post(`/api/pets/${petId}/entries`, visit({ vetId: okafor.id }));
  const lab = await post(`/api/pets/${petId}/labs`, report({ vetId: okafor.id }));
  const shot = await post(`/api/pets/${petId}/vaccinations`, dose({ vetId: okafor.id }));
  expect(await fields(put(`/api/entries/${seen.id}`, visit({ vetId: 999, reason: "Changed" })))).toEqual(unknown);
  expect(await fields(put(`/api/labs/${lab.id}`, report({ vetId: 999, lab: "Changed" })))).toEqual(unknown);
  expect(await fields(put(`/api/vaccinations/${shot.id}`, dose({ vetId: 999, vaccine: "Changed" })))).toEqual(unknown);
  expect(await fields(put(`/api/pets/${petId}`, pet({ vetId: 999, name: "Changed" })))).toEqual(unknown);
  expect(db.select().from(entries).all()).toMatchObject([{ vetId: okafor.id, reason: "Annual" }]);
  expect(db.select().from(labReports).all()).toMatchObject([{ vetId: okafor.id, lab: "IDEXX" }]);
  expect(db.select().from(vaccinations).all()).toMatchObject([{ vetId: okafor.id, vaccine: "Rabies" }]);
  expect(db.select().from(pets).all()).toMatchObject([{ vetId: null, name: "Miso" }]);

  // A vetId that is not a positive integer never reaches the lookup.
  expect(await fields(create(`/api/pets/${petId}/entries`, visit({ vetId: "1" })))).toHaveProperty("vetId");
  expect(await fields(create(`/api/pets/${petId}/entries`, visit({ vetId: undefined })))).toHaveProperty("vetId");
});

test("a vet's page lists what is linked to them across pets, newest first", async () => {
  const { call, post, json, petId, report } = await setup();
  const okafor = await post("/api/vets", vet());
  const lee = await post("/api/vets", vet({ name: "Dr. Lee" }));
  const reggie = await post("/api/pets", pet({ name: "Reggie", vetId: okafor.id }));
  const zeus = await post("/api/pets", pet({ name: "zeus", vetId: okafor.id }));
  await post("/api/pets", pet({ name: "Pepper", vetId: lee.id }));

  const old = await post(`/api/pets/${petId}/entries`, visit({ vetId: okafor.id, date: "2025-01-05" }));
  const recent = await post(`/api/pets/${reggie.id}/entries`, visit({ vetId: okafor.id, reason: "" }));
  await post(`/api/pets/${petId}/entries`, visit({ vetId: lee.id }));
  await post(`/api/pets/${petId}/entries`, visit());
  const lab = await post(`/api/pets/${petId}/labs`, report({ vetId: okafor.id }));
  const inHouse = await post(
    `/api/pets/${reggie.id}/labs`,
    report({ vetId: okafor.id, date: "2026-11-01", source: "in_house", lab: "" }),
  );
  await post(`/api/pets/${petId}/labs`, report({ vetId: lee.id, date: "2026-09-01" }));
  const shot = await post(`/api/pets/${reggie.id}/vaccinations`, dose({ vetId: okafor.id }));
  await post(`/api/pets/${petId}/vaccinations`, dose());

  const page = await json<VetWithRecords>(call(`/api/vets/${okafor.id}`));
  expect(page).toMatchObject({ id: okafor.id, name: "Dr. Okafor", phone: "(555) 010-0142" });
  expect(page.pets).toEqual([
    { id: reggie.id, name: "Reggie" },
    { id: zeus.id, name: "zeus" },
  ]);
  expect(page.entries).toEqual([
    { id: recent.id, petId: reggie.id, pet: "Reggie", date: "2026-10-01", reason: null },
    { id: old.id, petId, pet: "Miso", date: "2025-01-05", reason: "Annual" },
  ]);
  expect(page.labReports).toEqual([
    { id: inHouse.id, petId: reggie.id, pet: "Reggie", date: "2026-11-01", source: "in_house", lab: null },
    { id: lab.id, petId, pet: "Miso", date: "2026-10-02", source: "reference_lab", lab: "IDEXX" },
  ]);
  expect(page.vaccinations).toEqual([
    { id: shot.id, petId: reggie.id, pet: "Reggie", vaccine: "Rabies", dateGiven: "2026-10-01" },
  ]);
});

test("deleting a vet keeps every record that named them and clears the link", async () => {
  const { call, post, db, petId, report } = await setup();
  const okafor = await post("/api/vets", vet());
  const lee = await post("/api/vets", vet({ name: "Dr. Lee" }));
  await post("/api/pets", pet({ name: "Reggie", vetId: okafor.id }));
  await post(`/api/pets/${petId}/entries`, visit({ vetId: okafor.id }));
  await post(`/api/pets/${petId}/entries`, visit({ vetId: lee.id }));
  await post(`/api/pets/${petId}/labs`, report({ vetId: okafor.id }));
  await post(`/api/pets/${petId}/vaccinations`, dose({ vetId: okafor.id }));

  expect((await call(`/api/vets/${okafor.id}`, { method: "DELETE" })).status).toBe(204);

  expect(db.select({ vetId: pets.vetId }).from(pets).all()).toEqual([{ vetId: null }, { vetId: null }]);
  // The other vet's visit is untouched.
  expect(db.select({ vetId: entries.vetId }).from(entries).all()).toEqual([{ vetId: null }, { vetId: lee.id }]);
  expect(db.select({ vetId: labReports.vetId, lab: labReports.lab }).from(labReports).all()).toEqual([
    { vetId: null, lab: "IDEXX" },
  ]);
  expect(db.select({ vetId: vaccinations.vetId }).from(vaccinations).all()).toEqual([{ vetId: null }]);
});

test("deleting a pet or a record leaves its vet in place", async () => {
  const { call, post, db, petId } = await setup();
  const okafor = await post("/api/vets", vet());
  const seen = await post(`/api/pets/${petId}/entries`, visit({ vetId: okafor.id }));
  expect((await call(`/api/entries/${seen.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await call(`/api/pets/${petId}`, { method: "DELETE" })).status).toBe(204);
  expect(db.select().from(vets).all()).toHaveLength(1);
});
