import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { entryInput, measurementInput, VITALS, type Vital } from "../../shared/records";
import type { Db } from "../db";
import { entries, measurements, pets, users, type Entry, type Measurement } from "../db/schema";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";
import type { z } from "zod";

export type EntryWithVitals = Entry & { author: string; vitals: Partial<Record<Vital, number>> };
export type MeasurementWithAuthor = Measurement & { author: string };
export type PetRecords = { entries: EntryWithVitals[]; measurements: MeasurementWithAuthor[] };

const petExists = (db: Db, id: number) => !!db.select({ id: pets.id }).from(pets).where(eq(pets.id, id)).get();

/** Saves a visit and replaces its vitals in one transaction, so they always share its date. */
function saveEntry(
  db: Db,
  petId: number,
  userId: number,
  input: z.output<typeof entryInput>,
  existingId?: number,
): Entry | undefined {
  return db.transaction((tx) => {
    const { vitals, ...fields } = input;
    const now = Date.now();
    const entry = existingId
      ? tx
          .update(entries)
          .set({ ...fields, updatedAt: now })
          .where(eq(entries.id, existingId))
          .returning()
          .get()
      : tx
          .insert(entries)
          .values({ ...fields, petId, createdBy: userId, createdAt: now, updatedAt: now })
          .returning()
          .get();
    if (!entry) return undefined;

    // Update readings in place rather than replacing them: ids order same-day
    // readings, so a new id would change which reading counts as the latest.
    const existing = tx.select().from(measurements).where(eq(measurements.entryId, entry.id)).all();
    for (const kind of VITALS) {
      const value = vitals[kind];
      const current = existing.find((m) => m.kind === kind);
      if (value == null) {
        if (current) tx.delete(measurements).where(eq(measurements.id, current.id)).run();
      } else if (current) {
        tx.update(measurements).set({ value, date: entry.date }).where(eq(measurements.id, current.id)).run();
      } else {
        tx.insert(measurements)
          .values({
            petId: entry.petId,
            entryId: entry.id,
            kind,
            value,
            date: entry.date,
            createdBy: userId,
            createdAt: now,
          })
          .run();
      }
    }
    return entry;
  });
}

export function recordRoutes({ db }: AppContext, authed: Authed) {
  const authorName = users.name;

  function records(petId: number): PetRecords {
    const entryRows = db
      .select({ entry: entries, author: authorName })
      .from(entries)
      .innerJoin(users, eq(users.id, entries.createdBy))
      .where(eq(entries.petId, petId))
      .orderBy(desc(entries.date), desc(entries.id))
      .all();
    const readings = db
      .select({ m: measurements, author: authorName })
      .from(measurements)
      .innerJoin(users, eq(users.id, measurements.createdBy))
      .where(eq(measurements.petId, petId))
      .orderBy(desc(measurements.date), desc(measurements.id))
      .all();

    const vitalsByEntry = new Map<number, Partial<Record<Vital, number>>>();
    for (const { m } of readings) {
      if (m.entryId == null) continue;
      const vitals = vitalsByEntry.get(m.entryId) ?? {};
      vitals[m.kind] = m.value;
      vitalsByEntry.set(m.entryId, vitals);
    }
    return {
      entries: entryRows.map(({ entry, author }) => ({ ...entry, author, vitals: vitalsByEntry.get(entry.id) ?? {} })),
      measurements: readings.filter(({ m }) => m.entryId == null).map(({ m, author }) => ({ ...m, author })),
    };
  }

  const standalone = (id: number) =>
    db
      .select()
      .from(measurements)
      .where(and(eq(measurements.id, id), isNull(measurements.entryId)))
      .get();

  return {
    // Visits, home exams and standalone readings, newest first.
    "/api/pets/:id/records": {
      GET: authed<"/api/pets/:id/records">((req) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        return Response.json(records(petId));
      }),
    },

    // Every reading of one kind, oldest first, whether taken at a visit or on its own.
    "/api/pets/:id/measurements": {
      GET: authed<"/api/pets/:id/measurements">((req) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        const kind = new URL(req.url).searchParams.get("kind");
        if (!VITALS.includes(kind as Vital)) return error(400, `kind must be one of ${VITALS.join(", ")}`);
        return Response.json(
          db
            .select()
            .from(measurements)
            .where(and(eq(measurements.petId, petId), eq(measurements.kind, kind as Vital)))
            .orderBy(asc(measurements.date), asc(measurements.id))
            .all(),
        );
      }),
      POST: authed<"/api/pets/:id/measurements">(async (req, user) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        const parsed = await parseJson(req, measurementInput);
        if ("response" in parsed) return parsed.response;
        const row = db
          .insert(measurements)
          .values({ ...parsed.data, petId, entryId: null, createdBy: user.id, createdAt: Date.now() })
          .returning()
          .get();
        return Response.json(row, { status: 201 });
      }),
    },

    "/api/pets/:id/entries": {
      POST: authed<"/api/pets/:id/entries">(async (req, user) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        const parsed = await parseJson(req, entryInput);
        if ("response" in parsed) return parsed.response;
        return Response.json(saveEntry(db, petId, user.id, parsed.data), { status: 201 });
      }),
    },

    "/api/entries/:id": {
      PUT: authed<"/api/entries/:id">(async (req, user) => {
        const id = idParam(req.params.id);
        const existing = id ? db.select().from(entries).where(eq(entries.id, id)).get() : undefined;
        if (!existing) return error(404, "Entry not found");
        const parsed = await parseJson(req, entryInput);
        if ("response" in parsed) return parsed.response;
        return Response.json(saveEntry(db, existing.petId, user.id, parsed.data, existing.id));
      }),
      DELETE: authed<"/api/entries/:id">((req) => {
        const id = idParam(req.params.id);
        const row = id ? db.delete(entries).where(eq(entries.id, id)).returning().get() : undefined;
        return row ? new Response(null, { status: 204 }) : error(404, "Entry not found");
      }),
    },

    // Only readings taken on their own; a visit's vitals are edited with the visit.
    "/api/measurements/:id": {
      PUT: authed<"/api/measurements/:id">(async (req) => {
        const id = idParam(req.params.id);
        const existing = id ? standalone(id) : undefined;
        if (!existing) return error(404, "Measurement not found");
        const parsed = await parseJson(req, measurementInput);
        if ("response" in parsed) return parsed.response;
        return Response.json(
          db.update(measurements).set(parsed.data).where(eq(measurements.id, existing.id)).returning().get(),
        );
      }),
      DELETE: authed<"/api/measurements/:id">((req) => {
        const id = idParam(req.params.id);
        const existing = id ? standalone(id) : undefined;
        if (!existing) return error(404, "Measurement not found");
        db.delete(measurements).where(eq(measurements.id, existing.id)).run();
        return new Response(null, { status: 204 });
      }),
    },
  };
}
