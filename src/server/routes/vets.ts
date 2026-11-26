import { asc, desc, eq, sql } from "drizzle-orm";
import { vetInput } from "../../shared/vets";
import type { Db } from "../db";
import { entries, labReports, pets, vaccinations, vets, type LabReport, type Vet } from "../db/schema";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";

/** A vet with everything linked to it, across pets, newest first. */
export type VetWithRecords = Vet & {
  /** The pets it is the usual vet for. */
  pets: { id: number; name: string }[];
  entries: { id: number; petId: number; pet: string; date: string; reason: string | null }[];
  labReports: {
    id: number;
    petId: number;
    pet: string;
    date: string;
    source: LabReport["source"];
    lab: string | null;
  }[];
  vaccinations: { id: number; petId: number; pet: string; vaccine: string; dateGiven: string }[];
};

/** A 400 response when a record names a vet that isn't saved, otherwise null. */
export function unknownVet(db: Pick<Db, "select">, vetId: number | null): Response | null {
  if (vetId == null || db.select({ id: vets.id }).from(vets).where(eq(vets.id, vetId)).get()) return null;
  return error(400, "Some fields are invalid", { vetId: "Unknown vet" });
}

export function vetRoutes({ db }: AppContext, authed: Authed) {
  const petName = { petId: pets.id, pet: pets.name };

  function withRecords(vet: Vet): VetWithRecords {
    return {
      ...vet,
      pets: db
        .select({ id: pets.id, name: pets.name })
        .from(pets)
        .where(eq(pets.vetId, vet.id))
        .orderBy(asc(sql`${pets.name} collate nocase`))
        .all(),
      entries: db
        .select({ id: entries.id, ...petName, date: entries.date, reason: entries.reason })
        .from(entries)
        .innerJoin(pets, eq(pets.id, entries.petId))
        .where(eq(entries.vetId, vet.id))
        .orderBy(desc(entries.date), desc(entries.id))
        .all(),
      labReports: db
        .select({
          id: labReports.id,
          ...petName,
          date: labReports.date,
          source: labReports.source,
          lab: labReports.lab,
        })
        .from(labReports)
        .innerJoin(pets, eq(pets.id, labReports.petId))
        .where(eq(labReports.vetId, vet.id))
        .orderBy(desc(labReports.date), desc(labReports.id))
        .all(),
      vaccinations: db
        .select({ id: vaccinations.id, ...petName, vaccine: vaccinations.vaccine, dateGiven: vaccinations.dateGiven })
        .from(vaccinations)
        .innerJoin(pets, eq(pets.id, vaccinations.petId))
        .where(eq(vaccinations.vetId, vet.id))
        .orderBy(desc(vaccinations.dateGiven), desc(vaccinations.id))
        .all(),
    };
  }

  return {
    "/api/vets": {
      // NOCASE, so "dr. lee" sorts before "Dr. Okafor".
      GET: authed(() =>
        Response.json(
          db
            .select()
            .from(vets)
            .orderBy(asc(sql`${vets.name} collate nocase`), asc(vets.id))
            .all(),
        ),
      ),
      POST: authed(async (req) => {
        const parsed = await parseJson(req, vetInput);
        if ("response" in parsed) return parsed.response;
        const now = Date.now();
        return Response.json(
          db
            .insert(vets)
            .values({ ...parsed.data, createdAt: now, updatedAt: now })
            .returning()
            .get(),
          { status: 201 },
        );
      }),
    },

    "/api/vets/:id": {
      GET: authed<"/api/vets/:id">((req) => {
        const id = idParam(req.params.id);
        const vet = id ? db.select().from(vets).where(eq(vets.id, id)).get() : undefined;
        return vet ? Response.json(withRecords(vet)) : error(404, "Vet not found");
      }),
      PUT: authed<"/api/vets/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Vet not found");
        const parsed = await parseJson(req, vetInput);
        if ("response" in parsed) return parsed.response;
        const vet = db
          .update(vets)
          .set({ ...parsed.data, updatedAt: Date.now() })
          .where(eq(vets.id, id))
          .returning()
          .get();
        return vet ? Response.json(vet) : error(404, "Vet not found");
      }),
      // The records that named the vet stay; their link is cleared (on delete set null).
      DELETE: authed<"/api/vets/:id">((req) => {
        const id = idParam(req.params.id);
        const vet = id ? db.delete(vets).where(eq(vets.id, id)).returning().get() : undefined;
        return vet ? new Response(null, { status: 204 }) : error(404, "Vet not found");
      }),
    },
  };
}
