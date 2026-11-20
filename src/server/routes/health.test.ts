import { expect, test } from "bun:test";
import { conditions, medications, vaccinations } from "../db/schema";
import { startApi } from "../test-support";
import type { PetHealth } from "./health";
import type { PetSummary } from "./pets";

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

const vaccine = (fields: object = {}) => ({
  vaccine: "Rabies",
  dateGiven: "2025-12-01",
  dueDate: "2028-12-01",
  lot: "R123",
  clinic: "Northside",
  notes: "",
  ...fields,
});
const medication = (fields: object = {}) => ({
  drug: "Methimazole",
  dose: "2.5 mg",
  frequency: "Twice daily",
  startDate: "2026-11-06",
  endDate: null,
  reason: "Hyperthyroidism",
  notes: "",
  ...fields,
});
const condition = (fields: object = {}) => ({
  kind: "diagnosis",
  title: "Hyperthyroidism",
  date: "2023-04-01",
  resolvedOn: null,
  notes: "",
  ...fields,
});

async function setup() {
  const api = await startApi();
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const petId = (await json<{ id: number }>(api.call("/api/pets", { method: "POST", body: PET }))).id;
  const health = () => json<PetHealth>(api.call(`/api/pets/${petId}/health`));
  return { ...api, json, petId, health };
}

test("vaccinations, medications and conditions can be added, edited and removed", async () => {
  const { call, json, petId, health } = await setup();
  const kinds = [
    ["vaccinations", vaccine(), { vaccine: "Rabies (3 year)" }],
    ["medications", medication(), { dose: "5 mg" }],
    ["conditions", condition(), { title: "Hyperthyroid" }],
  ] as const;
  for (const [path, body, change] of kinds) {
    const created = await call(`/api/pets/${petId}/${path}`, { method: "POST", body });
    expect(created.status).toBe(201);
    const { id } = await json<{ id: number }>(created);
    const edited = await call(`/api/${path}/${id}`, { method: "PUT", body: { ...body, ...change } });
    expect(await json(edited)).toMatchObject(change);
    expect((await health())[path]).toMatchObject([{ id, author: "a", ...change }]);
    expect((await call(`/api/${path}/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await health())[path]).toEqual([]);
    expect((await call(`/api/${path}/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await call(`/api/${path}/${id}`, { method: "PUT", body })).status).toBe(404);
  }
});

test("records come back newest first, and invalid ones are refused", async () => {
  const { call, json, petId, health } = await setup();
  await call(`/api/pets/${petId}/vaccinations`, { method: "POST", body: vaccine({ dateGiven: "2023-01-10" }) });
  await call(`/api/pets/${petId}/vaccinations`, { method: "POST", body: vaccine() });
  expect((await health()).vaccinations.map((v) => v.dateGiven)).toEqual(["2025-12-01", "2023-01-10"]);

  const bad = await call(`/api/pets/${petId}/vaccinations`, {
    method: "POST",
    body: vaccine({ dueDate: "2020-01-01" }),
  });
  expect(bad.status).toBe(400);
  expect((await json<{ fields: object }>(bad)).fields).toHaveProperty("dueDate");
  expect((await call("/api/pets/999/medications", { method: "POST", body: medication() })).status).toBe(404);
  expect((await call("/api/pets/999/health")).status).toBe(404);
  expect(
    (await call(`/api/pets/${petId}/conditions`, { method: "POST", body: condition({ kind: "rash" }) })).status,
  ).toBe(400);

  // Doses and conditions have already happened; a course may be entered ahead of time.
  const futureDose = await call(`/api/pets/${petId}/vaccinations`, {
    method: "POST",
    body: vaccine({ dateGiven: "2999-01-01", dueDate: null }),
  });
  expect(futureDose.status).toBe(400);
  expect((await json<{ fields: object }>(futureDose)).fields).toEqual({ dateGiven: "Can't be in the future" });
  expect(
    (await call(`/api/pets/${petId}/conditions`, { method: "POST", body: condition({ date: "2999-01-01" }) })).status,
  ).toBe(400);
  expect(
    (await call(`/api/pets/${petId}/medications`, { method: "POST", body: medication({ startDate: "2999-01-01" }) }))
      .status,
  ).toBe(201);
});

test("deleting a pet removes its vaccinations, medications and conditions", async () => {
  const { call, db, petId } = await setup();
  await call(`/api/pets/${petId}/vaccinations`, { method: "POST", body: vaccine() });
  await call(`/api/pets/${petId}/medications`, { method: "POST", body: medication() });
  await call(`/api/pets/${petId}/conditions`, { method: "POST", body: condition() });
  expect((await call(`/api/pets/${petId}`, { method: "DELETE" })).status).toBe(204);
  expect(db.select().from(vaccinations).all()).toEqual([]);
  expect(db.select().from(medications).all()).toEqual([]);
  expect(db.select().from(conditions).all()).toEqual([]);
});

test("the pet list carries every vaccine dose, newest first, for the browser to judge what's due", async () => {
  const { call, json, petId } = await setup();
  const old = await json<{ id: number }>(
    call(`/api/pets/${petId}/vaccinations`, { method: "POST", body: vaccine({ dateGiven: "2024-12-01" }) }),
  );
  const recent = await json<{ id: number }>(
    call(`/api/pets/${petId}/vaccinations`, {
      method: "POST",
      body: vaccine({ vaccine: "FVRCP", dateGiven: "2025-12-01", dueDate: null }),
    }),
  );
  await call("/api/pets", { method: "POST", body: { ...PET, name: "Tofu" } });

  const [miso, tofu] = await json<PetSummary[]>(call("/api/pets"));
  expect(miso!.vaccinations).toEqual([
    { id: recent.id, vaccine: "FVRCP", dateGiven: "2025-12-01", dueDate: null },
    { id: old.id, vaccine: "Rabies", dateGiven: "2024-12-01", dueDate: "2028-12-01" },
  ]);
  expect(tofu!.vaccinations).toEqual([]);
});
