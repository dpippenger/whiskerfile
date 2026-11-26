import { formatAge } from "../../shared/dates";
import { medicationState, vaccineStatus, type DueStatus, type MedicationState } from "../../shared/health";
import { flagResult, type Flag } from "../../shared/labs";
import { fromGrams, type WeightUnit } from "../../shared/records";
import { labSeries, type LabSeries } from "../../shared/series";
import { vetLabel } from "../../shared/vets";
import type { Pet, Vet } from "../db/schema";
import type { PetHealth } from "../routes/health";
import type { LabReportWithResults, LabResultRow } from "../routes/labs";

export type ReportOptions = {
  /** The reader's date: the server runs in UTC, so it can't tell. */
  today: string;
  /** Only records on or after this date, when set. */
  from: string | null;
  /** Only records on or before this date, when set. */
  to: string | null;
  weightUnit: WeightUnit;
};

export type ReportInput = {
  pet: Pet & { registry: string | null };
  /** Every weight, in grams. */
  weights: { date: string; value: number }[];
  /** Newest first, as the API returns them. */
  labs: LabReportWithResults[];
  health: PetHealth;
  /** Every saved vet, to name the one a dose links to. */
  vets: Vet[];
};

export type Trend = { code: string; name: string; series: LabSeries };

/**
 * What a printed report shows, worked out from a pet's records: everything in
 * the chosen period, statuses as of the reader's date, weights in the reader's
 * unit and a trend for every test with at least two results to draw.
 */
export function reportModel({ pet, weights, labs, health, vets }: ReportInput, opts: ReportOptions) {
  const { today, from, to } = opts;
  const inPeriod = (date: string) => (!from || date >= from) && (!to || date <= to);
  // A course or condition belongs to the period when any part of it falls inside.
  const overlaps = (start: string, end: string | null) => (!to || start <= to) && (!from || end == null || end >= from);

  const vetOf = (vetId: number | null) => {
    const vet = vets.find((v) => v.id === vetId);
    return vet ? vetLabel(vet) : null;
  };

  const reports = labs.filter((r) => inPeriod(r.date));
  const due = new Map(
    vaccineStatus(health.vaccinations, today, pet.deceasedOn).map(({ dose, status }) => [dose.id, status]),
  );

  return {
    pet,
    age: pet.dob ? formatAge(pet.dob, pet.deceasedOn ?? today, pet.dobEstimated) : null,
    today,
    from,
    to,
    weightUnit: opts.weightUnit,
    weights: weights
      .filter((w) => inPeriod(w.date))
      .map((w) => ({ date: w.date, value: fromGrams(w.value, opts.weightUnit) })),
    trends: trends(reports),
    // Newest first, like every other table in the report.
    reports: reports.map((r) => ({
      ...r,
      results: r.results.map((x) => ({ ...x, flag: flagResult(x) as Flag | null })),
    })),
    vaccinations: health.vaccinations
      .filter((v) => inPeriod(v.dateGiven))
      .map((v) => ({
        ...v,
        vet: vetOf(v.vetId),
        status: (due.get(v.id) ?? null) as DueStatus | null,
        latest: due.has(v.id),
      })),
    medications: health.medications
      .filter((m) => overlaps(m.startDate, m.endDate))
      .map((m) => ({ ...m, state: medicationState(m, today, pet.deceasedOn) as MedicationState })),
    conditions: health.conditions.filter((c) => overlaps(c.date, c.resolvedOn)),
  };
}

export type ReportModel = ReturnType<typeof reportModel>;

/** Each test with two or more results to draw, in catalog order. */
function trends(reports: LabReportWithResults[]): Trend[] {
  const byAnalyte = new Map<number, { first: LabResultRow; rows: Parameters<typeof labSeries>[0] }>();
  for (const report of reports) {
    for (const result of report.results) {
      const entry = byAnalyte.get(result.analyteId) ?? { first: result, rows: [] };
      entry.rows.push({ ...result, date: report.date, order: report.id });
      byAnalyte.set(result.analyteId, entry);
    }
  }
  return [...byAnalyte.values()]
    .map(({ first, rows }) => ({
      code: first.code,
      name: first.name,
      sortOrder: first.sortOrder,
      series: labSeries(rows),
    }))
    .filter((t) => t.series.points.length >= 2)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _, ...t }) => t);
}
