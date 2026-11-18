import { expect, test } from "bun:test";
import { entries, measurements } from "../db/schema";
import { startApi } from "../test-support";
import type { PetSummary } from "./pets";
import type { EntryWithVitals, PetRecords } from "./records";

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

const visit = (fields: object = {}) => ({
  kind: "vet",
  date: "2026-10-01",
  clinic: "Northside Animal Hospital",
  vet: "Dr. Okafor",
  reason: "Senior wellness",
  notes: "Teeth look good.",
  vitals: { weight: 4649, temperature: 38.6, heart_rate: 180 },
  ...fields,
});

async function setup() {
  const api = await startApi();
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const pet = await json<{ id: number }>(api.call("/api/pets", { method: "POST", body: PET }));
  return { ...api, json, petId: pet.id };
}

test("a visit is saved with its vitals and its author", async () => {
  const { call, json, petId } = await setup();
  const created = await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit() });
  expect(created.status).toBe(201);

  const { entries: list } = await json<PetRecords>(call(`/api/pets/${petId}/records`));
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({
    kind: "vet",
    clinic: "Northside Animal Hospital",
    author: "a",
    vitals: { weight: 4649, temperature: 38.6, heart_rate: 180 },
  });
});

test("editing a visit moves its vitals to the new date and drops cleared ones", async () => {
  const { call, json, petId } = await setup();
  const entry = await json<{ id: number }>(call(`/api/pets/${petId}/entries`, { method: "POST", body: visit() }));

  const edited = await call(`/api/entries/${entry.id}`, {
    method: "PUT",
    body: visit({ date: "2026-10-03", vitals: { weight: 4700, temperature: null } }),
  });
  expect(edited.status).toBe(200);

  const weights = await json<{ date: string; value: number }[]>(call(`/api/pets/${petId}/measurements?kind=weight`));
  expect(weights.map(({ date, value }) => ({ date, value }))).toEqual([{ date: "2026-10-03", value: 4700 }]);
  const { entries: list } = await json<PetRecords>(call(`/api/pets/${petId}/records`));
  expect(list[0]!.vitals).toEqual({ weight: 4700 });
});

test("editing a visit keeps its readings, so the latest same-day weight stays the latest", async () => {
  const { call, json, petId } = await setup();
  const entry = await json<{ id: number }>(
    call(`/api/pets/${petId}/entries`, {
      method: "POST",
      body: visit({ date: "2026-11-01", vitals: { weight: 4000 } }),
    }),
  );
  await call(`/api/pets/${petId}/measurements`, {
    method: "POST",
    body: { date: "2026-11-01", kind: "weight", value: 4500 },
  });
  const before = await json<{ id: number }[]>(call(`/api/pets/${petId}/measurements?kind=weight`));

  await call(`/api/entries/${entry.id}`, {
    method: "PUT",
    body: visit({ date: "2026-11-01", notes: "Edited notes", vitals: { weight: 4000 } }),
  });
  const after = await json<{ id: number }[]>(call(`/api/pets/${petId}/measurements?kind=weight`));
  expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
  const [miso] = await json<PetSummary[]>(call("/api/pets"));
  expect(miso!.weights.at(-1)).toEqual({ date: "2026-11-01", value: 4500 });
});

test("an invalid visit is refused without leaving anything behind", async () => {
  const { call, json, db, petId } = await setup();
  const res = await call(`/api/pets/${petId}/entries`, {
    method: "POST",
    body: visit({ vitals: { weight: 4649, temperature: 101.5 } }),
  });
  expect(res.status).toBe(400);
  expect((await json<{ fields: object }>(res)).fields).toHaveProperty(["vitals.temperature"]);
  expect(db.select().from(entries).all()).toEqual([]);
  expect(db.select().from(measurements).all()).toEqual([]);

  expect((await call("/api/pets/999/entries", { method: "POST", body: visit() })).status).toBe(404);
  expect((await call("/api/entries/999", { method: "PUT", body: visit() })).status).toBe(404);
});

test("standalone weigh-ins can be added, corrected and removed; a visit's readings cannot", async () => {
  const { call, json, petId } = await setup();
  const weighIn = await call(`/api/pets/${petId}/measurements`, {
    method: "POST",
    body: { date: "2026-11-01", kind: "weight", value: 4600 },
  });
  expect(weighIn.status).toBe(201);
  const { id } = await json<{ id: number }>(weighIn);

  const fixed = await call(`/api/measurements/${id}`, {
    method: "PUT",
    body: { date: "2026-11-02", kind: "weight", value: 4610 },
  });
  expect(await json(fixed)).toMatchObject({ date: "2026-11-02", value: 4610 });
  expect(
    (
      await call(`/api/pets/${petId}/measurements`, {
        method: "POST",
        body: { date: "2026-11-01", kind: "weight", value: 0 },
      })
    ).status,
  ).toBe(400);

  await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit() });
  const all = await json<{ id: number; entryId: number | null; date: string }[]>(
    call(`/api/pets/${petId}/measurements?kind=weight`),
  );
  expect(all.map((m) => m.date)).toEqual(["2026-10-01", "2026-11-02"]);
  const fromVisit = all.find((m) => m.entryId !== null)!;
  expect((await call(`/api/measurements/${fromVisit.id}`, { method: "DELETE" })).status).toBe(404);
  const moved = await call(`/api/measurements/${fromVisit.id}`, {
    method: "PUT",
    body: { date: "2026-11-05", kind: "weight", value: 1234 },
  });
  expect(moved.status).toBe(404);
  const after = await json<{ id: number; date: string; value: number }[]>(
    call(`/api/pets/${petId}/measurements?kind=weight`),
  );
  expect(after.find((m) => m.id === fromVisit.id)).toMatchObject({ date: "2026-10-01", value: 4649 });

  expect((await call(`/api/measurements/${id}`, { method: "DELETE" })).status).toBe(204);
  const { measurements: standalone } = await json<PetRecords>(call(`/api/pets/${petId}/records`));
  expect(standalone).toEqual([]);
  expect((await call(`/api/pets/${petId}/measurements?kind=height`)).status).toBe(400);
});

test("deleting a visit removes its vitals; deleting a pet removes all its records", async () => {
  const { call, json, db, petId } = await setup();
  const entry = await json<EntryWithVitals>(call(`/api/pets/${petId}/entries`, { method: "POST", body: visit() }));
  await call(`/api/entries/${entry.id}`, { method: "DELETE" });
  expect(db.select().from(measurements).all()).toEqual([]);

  await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit() });
  await call(`/api/pets/${petId}/measurements`, {
    method: "POST",
    body: { date: "2026-11-01", kind: "weight", value: 4600 },
  });
  expect((await call(`/api/pets/${petId}`, { method: "DELETE" })).status).toBe(204);
  expect(db.select().from(entries).all()).toEqual([]);
  expect(db.select().from(measurements).all()).toEqual([]);
});

test("the pet list carries each pet's last twelve weights and last vet visit", async () => {
  const { call, json, petId } = await setup();
  for (let day = 1; day <= 14; day++) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    await call(`/api/pets/${petId}/measurements`, {
      method: "POST",
      body: { date, kind: "weight", value: 4000 + day },
    });
  }
  await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ kind: "home", date: "2026-10-20" }) });
  await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ date: "2026-10-05" }) });

  const [miso] = await json<PetSummary[]>(call("/api/pets"));
  expect(miso!.weights).toHaveLength(12);
  // 14 weigh-ins plus one weight from each visit: the newest twelve start on Sep 5.
  expect(miso!.weights[0]).toEqual({ date: "2026-09-05", value: 4005 });
  expect(miso!.weights.at(-1)).toEqual({ date: "2026-10-20", value: 4649 });
  expect(miso!.lastVetVisit).toBe("2026-10-05");
});

test("display units can be chosen or left to the browser", async () => {
  const { call, json } = await setup();
  expect(await json(call("/api/me"))).toMatchObject({ weightUnit: null, temperatureUnit: null });
  const set = await call("/api/me", { method: "PATCH", body: { weightUnit: "kg", temperatureUnit: "f" } });
  expect(await json(set)).toMatchObject({ weightUnit: "kg", temperatureUnit: "f" });
  expect(
    (await call("/api/me", { method: "PATCH", body: { weightUnit: "stone", temperatureUnit: null } })).status,
  ).toBe(400);
});
