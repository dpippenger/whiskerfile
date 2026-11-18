import { asc, eq, isNotNull } from "drizzle-orm";
import type { ComparePet } from "../../shared/series";
import { analytes, labReports, labResults, measurements, pets } from "../db/schema";
import { error, idParam, type AppContext, type Authed } from "../http";

/** Something every pet can be compared on: weight, or a test with numeric results. */
export type MetricOption = {
  key: string;
  label: string;
  code: string | null;
  category: string | null;
  petIds: number[];
};

export function seriesRoutes({ db }: AppContext, authed: Authed) {
  const allPets = () =>
    db.select({ id: pets.id, name: pets.name, dob: pets.dob }).from(pets).orderBy(asc(pets.name)).all();

  return {
    // What can be compared, and which pets have data for it.
    "/api/series/metrics": {
      GET: authed(() => {
        const weighed = db
          .selectDistinct({ petId: measurements.petId })
          .from(measurements)
          .where(eq(measurements.kind, "weight"))
          .all();
        const tested = db
          .selectDistinct({
            analyteId: analytes.id,
            code: analytes.code,
            name: analytes.name,
            category: analytes.category,
            sortOrder: analytes.sortOrder,
            petId: labReports.petId,
          })
          .from(labResults)
          .innerJoin(labReports, eq(labReports.id, labResults.reportId))
          .innerJoin(analytes, eq(analytes.id, labResults.analyteId))
          .where(isNotNull(labResults.value))
          .orderBy(asc(analytes.sortOrder), asc(analytes.id))
          .all();
        const options: MetricOption[] = [];
        if (weighed.length) {
          options.push({
            key: "weight",
            label: "Weight",
            code: null,
            category: null,
            petIds: weighed.map((w) => w.petId),
          });
        }
        for (const row of tested) {
          const key = String(row.analyteId);
          const existing = options.find((o) => o.key === key);
          if (existing) existing.petIds.push(row.petId);
          else options.push({ key, label: row.name, code: row.code, category: row.category, petIds: [row.petId] });
        }
        return Response.json(options);
      }),
    },

    // One metric for every pet: `?metric=weight` (grams) or `?metric=<test id>`.
    "/api/series": {
      GET: authed((req) => {
        const metric = new URL(req.url).searchParams.get("metric");
        const list = allPets();
        if (metric === "weight") {
          const rows = db.select().from(measurements).where(eq(measurements.kind, "weight")).all();
          const body: ComparePet[] = list.map((p) => ({
            petId: p.id,
            name: p.name,
            dob: p.dob,
            results: rows
              .filter((m) => m.petId === p.id)
              .map((m) => ({
                date: m.date,
                order: m.id,
                valueText: String(m.value),
                value: m.value,
                comparator: null,
                unit: "g",
                refLow: null,
                refHigh: null,
              })),
          }));
          return Response.json(body);
        }
        const analyteId = idParam(metric ?? undefined);
        if (!analyteId) return error(400, "metric must be weight or a test id");
        if (!db.select({ id: analytes.id }).from(analytes).where(eq(analytes.id, analyteId)).get()) {
          return error(404, "Test not found");
        }
        const rows = db
          .select({ result: labResults, date: labReports.date, petId: labReports.petId, order: labReports.id })
          .from(labResults)
          .innerJoin(labReports, eq(labReports.id, labResults.reportId))
          .where(eq(labResults.analyteId, analyteId))
          .all();
        const body: ComparePet[] = list.map((p) => ({
          petId: p.id,
          name: p.name,
          dob: p.dob,
          results: rows
            .filter((r) => r.petId === p.id)
            .map(({ result, date, order }) => ({
              date,
              order,
              valueText: result.valueText,
              value: result.value,
              comparator: result.comparator,
              unit: result.unit,
              refLow: result.refLow,
              refHigh: result.refHigh,
            })),
        }));
        return Response.json(body);
      }),
    },
  };
}
