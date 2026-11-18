import { elapsed } from "./dates";
import { flagResult, type Comparator, type Flag } from "./labs";

// Rules for turning stored readings into chart series. Dates stay calendar
// dates: each becomes midnight UTC, and charts display in UTC, so a point
// never moves a day whatever the viewer's time zone.

/** Midnight UTC of a "YYYY-MM-DD" date, as milliseconds. */
export function dateToUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Age on `date` in years (with fractions), counted from the birth date; null if born later or invalid. */
export function ageInYears(dob: string, date: string): number | null {
  const age = elapsed(dob, date);
  if (!age) return null;
  return age.years + age.months / 12 + age.days / 365.25;
}

/** A plotted lab result. `value` is the number read from `valueText`. */
export type LabPoint = {
  date: string;
  /** Report id: orders results taken on the same day. */
  order: number;
  value: number;
  comparator: Comparator | null;
  valueText: string;
  refLow: number | null;
  refHigh: number | null;
  flag: Flag | null;
};

export type LabSeries = {
  /** The unit every plotted point shares, or null when results carry no unit. */
  unit: string | null;
  points: LabPoint[];
  /** Results left out because they were in another unit. */
  otherUnits: number;
  /** Results left out because they have no number ("Negative", "1,035"). */
  unread: number;
};

export type LabResultInput = {
  date: string;
  order: number;
  valueText: string;
  value: number | null;
  comparator: Comparator | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
};

const byDate = <T extends { date: string; order: number }>(a: T, b: T) =>
  a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1;

/**
 * One test's results for a chart, oldest first. Only one unit is plotted: the
 * unit of the most recent result with a number. Results in other units or
 * without a number are counted, not drawn.
 */
export function labSeries(results: LabResultInput[]): LabSeries {
  const sorted = [...results].sort(byDate);
  const numeric = sorted.filter((r) => r.value != null);
  const unit = numeric.at(-1)?.unit ?? null;
  const same = (u: string | null) => (u ?? "") === (unit ?? "");
  return {
    unit,
    points: numeric
      .filter((r) => same(r.unit))
      .map((r) => ({
        date: r.date,
        order: r.order,
        value: r.value!,
        comparator: r.comparator,
        valueText: r.valueText,
        refLow: r.refLow,
        refHigh: r.refHigh,
        flag: flagResult(r),
      })),
    otherUnits: numeric.filter((r) => !same(r.unit)).length,
    unread: sorted.length - numeric.length,
  };
}

/**
 * The reference range under a series, as [lower, height] pairs per point for
 * a stacked band. A point without a two-sided range breaks the band, and the
 * band never extends past the first or last result.
 */
export function rangeBand(points: Pick<LabPoint, "date" | "refLow" | "refHigh">[]) {
  return points.map((p) => {
    const x = dateToUtc(p.date);
    const both = p.refLow != null && p.refHigh != null && p.refHigh >= p.refLow;
    return {
      x,
      low: both ? p.refLow! : null,
      height: both ? p.refHigh! - p.refLow! : null,
    };
  });
}

export type ComparePet = { petId: number; name: string; dob: string | null; results: LabResultInput[] };
export type CompareAxis = "date" | "age";

/** Why a pet is missing from a comparison. */
export type LeftOut = {
  petId: number;
  name: string;
  reason: "no-data" | "other-unit" | "no-birth-date" | "before-birth";
};

/**
 * Several pets' results for one test on one chart. Only one unit is plotted:
 * the unit of the most recent numeric result across all pets; a pet with no
 * result in that unit is left out and named. Against age, a pet without a
 * birth date is left out too. Points are [x, value] with x a UTC date or an
 * age in years.
 */
export function compareSeries(pets: ComparePet[], axis: CompareAxis) {
  const plotted: { petId: number; name: string; points: (LabPoint & { x: number })[] }[] = [];
  const leftOut: LeftOut[] = [];
  const leave = (pet: ComparePet, reason: LeftOut["reason"]) =>
    leftOut.push({ petId: pet.petId, name: pet.name, reason });

  // Pets that could be drawn at all on this axis; only they choose the unit.
  const eligible: ComparePet[] = [];
  for (const pet of pets) {
    if (!pet.results.some((r) => r.value != null)) leave(pet, "no-data");
    else if (axis === "age" && !pet.dob) leave(pet, "no-birth-date");
    else eligible.push(pet);
  }
  const latest = eligible
    .flatMap((p) => p.results.filter((r) => r.value != null))
    .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1))
    .at(-1);
  const unit = latest?.unit ?? null;

  for (const pet of eligible) {
    const inUnit = labSeries(pet.results.filter((r) => r.value != null && (r.unit ?? "") === (unit ?? ""))).points;
    if (inUnit.length === 0) {
      leave(pet, "other-unit");
      continue;
    }
    const points = inUnit
      .map((p) => ({ ...p, x: axis === "date" ? dateToUtc(p.date) : ageInYears(pet.dob!, p.date) }))
      .filter((p): p is LabPoint & { x: number } => p.x != null);
    // Against age, results dated before the birth date can't be placed.
    if (points.length === 0) leave(pet, "before-birth");
    else plotted.push({ petId: pet.petId, name: pet.name, points });
  }
  leftOut.sort((a, b) => a.name.localeCompare(b.name));
  return { unit, plotted, leftOut };
}
