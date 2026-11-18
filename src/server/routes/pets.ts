import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { flagResult, type Flag } from "../../shared/labs";
import { nextChartColor, petInput } from "../../shared/pets";
import {
  analytes,
  chipRegistries,
  files,
  labResults,
  pets,
  vaccinations,
  type Pet,
  type Vaccination,
} from "../db/schema";
import { IMAGE_TYPES } from "../files";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";
import type { z } from "zod";

export type FlaggedResult = { code: string; name: string; valueText: string; unit: string | null; flag: Flag };

/**
 * A pet with what the dashboard shows: its last 12 weights (oldest first),
 * last vet visit, every vaccine dose (the browser works out what is due from
 * its own date), and the results outside their printed range on its latest
 * lab report.
 */
export type PetSummary = Pet & {
  weights: { date: string; value: number }[];
  lastVetVisit: string | null;
  vaccinations: Pick<Vaccination, "id" | "vaccine" | "dateGiven" | "dueDate">[];
  latestLab: { id: number; date: string; flagged: FlaggedResult[] } | null;
};

const RECENT_WEIGHTS = 12;

export function petRoutes({ db }: AppContext, authed: Authed) {
  function summaries(): PetSummary[] {
    const weights = db.all<{ petId: number; date: string; value: number }>(sql`
      select pet_id as petId, date, value from (
        select pet_id, date, value, row_number() over (partition by pet_id order by date desc, id desc) as n
        from measurements where kind = 'weight'
      ) where n <= ${RECENT_WEIGHTS} order by date, n desc`);
    const visits = db.all<{ petId: number; date: string }>(
      sql`select pet_id as petId, max(date) as date from entries where kind = 'vet' group by pet_id`,
    );
    const doses = db
      .select({
        petId: vaccinations.petId,
        id: vaccinations.id,
        vaccine: vaccinations.vaccine,
        dateGiven: vaccinations.dateGiven,
        dueDate: vaccinations.dueDate,
      })
      .from(vaccinations)
      .orderBy(desc(vaccinations.dateGiven), desc(vaccinations.id))
      .all();
    const latestLabs = db.all<{ petId: number; id: number; date: string }>(sql`
      select pet_id as petId, id, date from (
        select pet_id, id, date, row_number() over (partition by pet_id order by date desc, id desc) as n
        from lab_reports
      ) where n = 1`);
    const results = latestLabs.length
      ? db
          .select({
            reportId: labResults.reportId,
            code: analytes.code,
            name: analytes.name,
            valueText: labResults.valueText,
            value: labResults.value,
            comparator: labResults.comparator,
            unit: labResults.unit,
            refLow: labResults.refLow,
            refHigh: labResults.refHigh,
          })
          .from(labResults)
          .innerJoin(analytes, eq(analytes.id, labResults.analyteId))
          .where(
            inArray(
              labResults.reportId,
              latestLabs.map((l) => l.id),
            ),
          )
          .orderBy(asc(analytes.sortOrder))
          .all()
      : [];
    const flagged = (reportId: number): FlaggedResult[] =>
      results
        .filter((r) => r.reportId === reportId)
        .flatMap(({ code, name, valueText, unit, ...r }) => {
          const flag = flagResult(r);
          return flag === "high" || flag === "low" ? [{ code, name, valueText, unit, flag }] : [];
        });
    return db
      .select()
      .from(pets)
      .orderBy(asc(pets.name))
      .all()
      .map((pet) => {
        const lab = latestLabs.find((l) => l.petId === pet.id);
        return {
          ...pet,
          weights: weights.filter((w) => w.petId === pet.id).map(({ date, value }) => ({ date, value })),
          lastVetVisit: visits.find((v) => v.petId === pet.id)?.date ?? null,
          vaccinations: doses.filter((d) => d.petId === pet.id).map(({ petId: _, ...dose }) => dose),
          latestLab: lab ? { id: lab.id, date: lab.date, flagged: flagged(lab.id) } : null,
        };
      });
  }

  /** Checks the ids a pet refers to; returns a 400 response when one is wrong. */
  function checkReferences(input: z.output<typeof petInput>): Response | null {
    if (input.chipRegistryId) {
      const registry = db.select().from(chipRegistries).where(eq(chipRegistries.id, input.chipRegistryId)).get();
      if (!registry) return error(400, "Some fields are invalid", { chipRegistryId: "Unknown registry" });
    }
    if (input.photoFileId) {
      const file = db.select().from(files).where(eq(files.id, input.photoFileId)).get();
      if (!file || !IMAGE_TYPES.includes(file.mime)) {
        return error(400, "Some fields are invalid", {
          photoFileId: "The photo must be a JPEG, PNG, WebP or GIF image",
        });
      }
    }
    return null;
  }

  return {
    "/api/pets": {
      GET: authed(() => Response.json(summaries())),
      POST: authed(async (req, user) => {
        const parsed = await parseJson(req, petInput);
        if ("response" in parsed) return parsed.response;
        const invalid = checkReferences(parsed.data);
        if (invalid) return invalid;
        const inUse = db
          .select({ color: pets.chartColor })
          .from(pets)
          .all()
          .map((p) => p.color);
        const now = Date.now();
        const pet = db
          .insert(pets)
          .values({
            ...parsed.data,
            chartColor: parsed.data.chartColor ?? nextChartColor(inUse),
            createdBy: user.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        return Response.json(pet, { status: 201 });
      }),
    },

    "/api/pets/:id": {
      GET: authed<"/api/pets/:id">((req) => {
        const id = idParam(req.params.id);
        const pet = id ? db.select().from(pets).where(eq(pets.id, id)).get() : undefined;
        return pet ? Response.json(pet) : error(404, "Pet not found");
      }),
      // Replaces every editable field.
      PUT: authed<"/api/pets/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Pet not found");
        const parsed = await parseJson(req, petInput);
        if ("response" in parsed) return parsed.response;
        const invalid = checkReferences(parsed.data);
        if (invalid) return invalid;
        const { chartColor, ...rest } = parsed.data;
        const pet = db
          .update(pets)
          .set({ ...rest, ...(chartColor && { chartColor }), updatedAt: Date.now() })
          .where(eq(pets.id, id))
          .returning()
          .get();
        return pet ? Response.json(pet) : error(404, "Pet not found");
      }),
      DELETE: authed<"/api/pets/:id">((req) => {
        const id = idParam(req.params.id);
        const pet = id ? db.delete(pets).where(eq(pets.id, id)).returning().get() : undefined;
        return pet ? new Response(null, { status: 204 }) : error(404, "Pet not found");
      }),
    },
  };
}
