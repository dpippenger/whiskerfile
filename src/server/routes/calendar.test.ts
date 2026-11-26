import { expect, test } from "bun:test";
import type { CalendarData } from "../../shared/calendar";
import { appointments, entries } from "../db/schema";
import { startApi } from "../test-support";

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
const appointment = (fields: object = {}) => ({
  date: "2026-12-08",
  time: "14:30",
  vetId: null,
  reason: "Dental check",
  notes: "",
  ...fields,
});
const VET = { name: "Dr. Okafor", clinic: "", phone: "", email: "", address: "", website: "", notes: "" };
const visit = (fields: object = {}) => ({
  kind: "vet",
  date: "2026-10-01",
  vetId: null,
  reason: "Dental check",
  notes: "",
  vitals: {},
  ...fields,
});

type Saved = { id: number; petId: number; createdBy: number; createdAt: number; updatedAt: number };

async function setup() {
  const api = await startApi();
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const post = <T = Saved>(path: string, body: object) => json<T>(api.call(path, { method: "POST", body }));
  const fields = async (res: Promise<Response>) => {
    const response = await res;
    expect(response.status).toBe(400);
    return ((await response.json()) as { fields: Record<string, string> }).fields;
  };
  const petId = (await post("/api/pets", pet())).id;
  const calendar = () => json<CalendarData>(api.call("/api/calendar"));
  return { ...api, json, post, fields, petId, calendar };
}

test("an appointment can be added, edited and deleted", async () => {
  const { call, post, petId, calendar, db } = await setup();
  const vetId = (await post("/api/vets", VET)).id;

  const created = await call(`/api/pets/${petId}/appointments`, {
    method: "POST",
    body: appointment({ vetId, notes: " Bring the carrier " }),
  });
  expect(created.status).toBe(201);
  const saved = (await created.json()) as Saved;
  expect(saved).toMatchObject({
    petId,
    date: "2026-12-08",
    time: "14:30",
    vetId,
    reason: "Dental check",
    notes: "Bring the carrier",
  });
  expect(saved.createdBy).toBeGreaterThan(0);
  expect(saved.updatedAt).toBe(saved.createdAt);

  // Every editable field is replaced; the pet is not one of them.
  const edited = await call(`/api/appointments/${saved.id}`, {
    method: "PUT",
    body: { ...appointment({ date: "2026-12-10", time: "", reason: "" }), petId: 999 },
  });
  expect(edited.status).toBe(200);
  expect(await edited.json()).toMatchObject({
    id: saved.id,
    petId,
    date: "2026-12-10",
    time: null,
    vetId: null,
    reason: null,
    notes: null,
    createdAt: saved.createdAt,
  });
  expect((await calendar()).appointments).toEqual([
    { id: saved.id, petId, date: "2026-12-10", time: null, vetId: null, reason: null, notes: null },
  ]);

  expect((await call(`/api/appointments/${saved.id}`, { method: "DELETE" })).status).toBe(204);
  expect(db.select().from(appointments).all()).toEqual([]);
});

test("an appointment may be on any day, past or future", async () => {
  const { call, petId } = await setup();
  for (const date of ["2001-01-01", "2999-12-31"]) {
    const res = await call(`/api/pets/${petId}/appointments`, { method: "POST", body: appointment({ date }) });
    expect(res.status).toBe(201);
  }
});

test("an invalid appointment is refused, naming each bad field, and nothing is written", async () => {
  const { call, post, fields, petId, db } = await setup();
  const path = `/api/pets/${petId}/appointments`;
  const bad = appointment({ date: "2026-02-30", time: "2pm" });
  expect(await fields(call(path, { method: "POST", body: bad }))).toEqual({
    date: "Use a valid date",
    time: "Use a valid time",
  });
  expect(await fields(call(path, { method: "POST", body: appointment({ vetId: 42 }) }))).toEqual({
    vetId: "Unknown vet",
  });
  expect((await call(path, { method: "POST", raw: "not json" })).status).toBe(400);
  expect(db.select().from(appointments).all()).toEqual([]);

  const saved = await post(path, appointment());
  const put = (body: object) => call(`/api/appointments/${saved.id}`, { method: "PUT", body });
  expect(await fields(put(appointment({ time: "25:00" })))).toEqual({ time: "Use a valid time" });
  expect(await fields(put(appointment({ vetId: 42 })))).toEqual({ vetId: "Unknown vet" });
  expect(db.select().from(appointments).all()).toMatchObject([{ time: "14:30", vetId: null }]);
});

test("a pet or appointment that doesn't exist gives 404", async () => {
  const { call, json } = await setup();
  for (const id of ["999", "0", "abc", "1.5"]) {
    const added = await call(`/api/pets/${id}/appointments`, { method: "POST", body: appointment() });
    expect(added.status).toBe(404);
    expect(await json(added)).toEqual({ error: "Pet not found" });
    for (const method of ["PUT", "DELETE"]) {
      const res = await call(`/api/appointments/${id}`, { method, body: appointment() });
      expect(res.status).toBe(404);
      expect(await json(res)).toEqual({ error: "Appointment not found" });
    }
  }
});

test("the calendar returns every pet's dated records as stored, with no status", async () => {
  const { call, post, petId } = await setup();
  const zeus = (await post("/api/pets", pet({ name: "Zeus", species: "dog" }))).id;
  const bella = (await post("/api/pets", pet({ name: "bella", deceasedOn: "2026-01-12" }))).id;
  const dose = (fields: object) => ({ vaccine: "Rabies", lot: "", vetId: null, notes: "", ...fields });
  const old = await post(`/api/pets/${petId}/vaccinations`, dose({ dateGiven: "2023-12-01", dueDate: "2024-12-01" }));
  const latest = await post(`/api/pets/${petId}/vaccinations`, dose({ dateGiven: "2025-12-01", dueDate: null }));
  const course = (fields: object) => ({
    drug: "Amoxicillin",
    dose: "",
    frequency: "",
    startDate: "2026-11-20",
    endDate: null,
    reason: "",
    notes: "",
    ...fields,
  });
  const short = await post(`/api/pets/${zeus}/medications`, course({ endDate: "2026-11-30" }));
  await post(`/api/pets/${zeus}/medications`, course({ drug: "Methimazole" }));
  const booked = await post(`/api/pets/${bella}/appointments`, appointment({ time: "" }));

  const res = await call("/api/calendar");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    // Name order without regard to case; pets that have passed away are still listed, flagged by their date.
    pets: [
      { id: bella, name: "bella", chartColor: expect.any(String), deceasedOn: "2026-01-12" },
      { id: petId, name: "Miso", chartColor: expect.any(String), deceasedOn: null },
      { id: zeus, name: "Zeus", chartColor: expect.any(String), deceasedOn: null },
    ],
    // Every dose, so the browser can tell which is the latest.
    vaccinations: [
      { id: old.id, petId, vaccine: "Rabies", dateGiven: "2023-12-01", dueDate: "2024-12-01" },
      { id: latest.id, petId, vaccine: "Rabies", dateGiven: "2025-12-01", dueDate: null },
    ],
    // Only courses with a last day.
    medications: [{ id: short.id, petId: zeus, drug: "Amoxicillin", endDate: "2026-11-30" }],
    appointments: [
      { id: booked.id, petId: bella, date: "2026-12-08", time: null, vetId: null, reason: "Dental check", notes: null },
    ],
  });
});

test("deleting a pet removes its appointments; deleting a vet only clears the link", async () => {
  const { call, post, petId, db } = await setup();
  const other = (await post("/api/pets", pet({ name: "Zeus" }))).id;
  const vetId = (await post("/api/vets", VET)).id;
  await post(`/api/pets/${petId}/appointments`, appointment({ vetId }));
  const kept = await post(`/api/pets/${other}/appointments`, appointment({ vetId }));

  expect((await call(`/api/pets/${petId}`, { method: "DELETE" })).status).toBe(204);
  expect(db.select().from(appointments).all()).toMatchObject([{ id: kept.id, vetId }]);
  expect((await call(`/api/vets/${vetId}`, { method: "DELETE" })).status).toBe(204);
  expect(db.select().from(appointments).all()).toMatchObject([{ id: kept.id, petId: other, vetId: null }]);
});

test("a visit recorded from an appointment replaces it", async () => {
  const { call, post, petId, db } = await setup();
  const booked = await post(`/api/pets/${petId}/appointments`, appointment({ date: "2026-10-01" }));
  const untouched = await post(`/api/pets/${petId}/appointments`, appointment({ date: "2026-12-20" }));

  const res = await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ appointmentId: booked.id }) });
  expect(res.status).toBe(201);
  const entry = (await res.json()) as { id: number };
  expect(entry).toMatchObject({ petId, kind: "vet", date: "2026-10-01", reason: "Dental check" });
  expect(entry).not.toHaveProperty("appointmentId");
  expect(db.select().from(appointments).all()).toMatchObject([{ id: untouched.id }]);

  // An edit of the visit can name one too.
  const edited = await call(`/api/entries/${entry.id}`, {
    method: "PUT",
    body: visit({ appointmentId: untouched.id }),
  });
  expect(edited.status).toBe(200);
  expect(db.select().from(appointments).all()).toEqual([]);
  expect(db.select().from(entries).all()).toHaveLength(1);
});

test("a visit naming an appointment that isn't this pet's is refused and nothing is written", async () => {
  const { call, post, fields, petId, db } = await setup();
  const other = (await post("/api/pets", pet({ name: "Zeus" }))).id;
  const theirs = await post(`/api/pets/${other}/appointments`, appointment());
  const entry = await post(`/api/pets/${petId}/entries`, visit());

  for (const appointmentId of [theirs.id, 999]) {
    const body = visit({ reason: "Changed", appointmentId });
    expect(await fields(call(`/api/pets/${petId}/entries`, { method: "POST", body }))).toEqual({
      appointmentId: "Unknown appointment",
    });
    expect(await fields(call(`/api/entries/${entry.id}`, { method: "PUT", body }))).toEqual({
      appointmentId: "Unknown appointment",
    });
  }
  expect(
    await fields(call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ appointmentId: 0 }) })),
  ).toHaveProperty("appointmentId");
  expect(db.select().from(appointments).all()).toMatchObject([{ id: theirs.id }]);
  expect(db.select().from(entries).all()).toMatchObject([{ id: entry.id, reason: "Dental check" }]);
});
