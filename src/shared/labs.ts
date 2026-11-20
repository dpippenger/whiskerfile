import { z } from "zod";
import { isFutureDate, isIsoDate } from "./dates";

// A lab result is kept exactly as printed ("1.20", "<0.5", "Negative"), with
// the number and comparator parsed from it for flags and trends. Reference
// ranges come from each document; nothing here supplies default numbers.

export const ANALYTE_CATEGORIES = ["chemistry", "electrolytes", "cbc", "endocrine", "urinalysis", "other"] as const;
export type AnalyteCategory = (typeof ANALYTE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<AnalyteCategory, string> = {
  chemistry: "Chemistry",
  electrolytes: "Electrolytes",
  cbc: "Complete blood count",
  endocrine: "Endocrine",
  urinalysis: "Urinalysis",
  other: "Other tests",
};

export const LAB_SOURCES = ["reference_lab", "in_house", "other"] as const;
export const LAB_SOURCE_LABEL = {
  reference_lab: "Reference lab",
  in_house: "In-clinic analyzer",
  other: "Other",
} as const;

/** "<" and ">" exclude the printed number; "<=" and ">=" include it. */
export const COMPARATORS = ["<", "<=", ">", ">="] as const;
export type Comparator = (typeof COMPARATORS)[number];
export type ParsedValue = { value: number | null; comparator: Comparator | null };

const NUMBER = /^(\d+(?:\.\d+)?|\.\d+)$/;
// "2,000,000" or "1,234.5": unambiguously grouped thousands.
const THOUSANDS = /^[1-9]\d{0,2}(?:(?:,\d{3}){2,}(?:\.\d+)?|,\d{3}\.\d+)$/;
// "4,5", "0,500", "12,25": a decimal comma. A single group of exactly three
// digits after a non-zero lead ("1,035") could be either and is not read.
const DECIMAL_COMMA = /^(?:0,\d+|\d+,(?:\d{1,2}|\d{4,}))$/;

const PREFIXES: [string, Comparator][] = [
  ["<=", "<="],
  ["≤", "<="],
  ["<", "<"],
  [">=", ">="],
  ["≥", ">="],
  [">", ">"],
];

/**
 * Reads a result as printed. "1.20" → 1.2; "<0.5" → < 0.5; "≤0.5" → <= 0.5;
 * ">2,000,000" → > 2000000; "4,5" → 4.5; "-1.5" or "−1.5" → -1.5 (base
 * excess can be negative). A space is allowed after a comparator ("< 0.5"),
 * but a space inside the number ("1 035", "2 5") is ambiguous and, like the
 * ambiguous "1,035" or "Negative", has no number, and so no flag.
 */
export function parseLabValue(text: string): ParsedValue {
  // The Unicode minus sign that reports and word processors use reads as a hyphen.
  let s = text.trim().replace(/\u2212/g, "-");
  let comparator: Comparator | null = null;
  for (const [prefix, c] of PREFIXES) {
    if (s.startsWith(prefix)) {
      comparator = c;
      s = s.slice(prefix.length).trimStart();
      break;
    }
  }
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (THOUSANDS.test(s)) s = s.replace(/,/g, "");
  else if (DECIMAL_COMMA.test(s)) s = s.replace(",", ".");
  if (!NUMBER.test(s)) return { value: null, comparator: null };
  return { value: negative ? -Number(s) : Number(s), comparator };
}

export type Flag = "high" | "low" | "normal";

/**
 * Where a result sits against its printed range, or null when that can't be
 * told: no range, no number, or a "<"/">" result whose possible values fall
 * on both sides of a limit (including "≤0.8" against a low limit of 0.8).
 */
export function flagResult(r: {
  value: number | null;
  comparator: Comparator | null;
  refLow: number | null;
  refHigh: number | null;
}): Flag | null {
  const { value, comparator, refLow, refHigh } = r;
  if (value == null || (refLow == null && refHigh == null)) return null;
  if (comparator === "<" || comparator === "<=") {
    // Somewhere below `value`, or at it when inclusive.
    const allBelowLow = comparator === "<" ? value <= refLow! : value < refLow!;
    if (refLow != null && allBelowLow) return "low";
    if (refLow == null && refHigh != null && value <= refHigh) return "normal";
    return null;
  }
  if (comparator === ">" || comparator === ">=") {
    // Somewhere above `value`, or at it when inclusive.
    const allAboveHigh = comparator === ">" ? value >= refHigh! : value > refHigh!;
    if (refHigh != null && allAboveHigh) return "high";
    if (refHigh == null && refLow != null && value >= refLow) return "normal";
    return null;
  }
  if (refLow != null && value < refLow) return "low";
  if (refHigh != null && value > refHigh) return "high";
  return "normal";
}

/** "0.8–2.4", "≤ 2.4" or "≥ 0.8"; null with no range. */
export function formatRange(refLow: number | null, refHigh: number | null): string | null {
  if (refLow != null && refHigh != null) return `${refLow}–${refHigh}`;
  if (refHigh != null) return `≤ ${refHigh}`;
  if (refLow != null) return `≥ ${refLow}`;
  return null;
}

/**
 * Position of a value on a bar where the range occupies the middle 60%, from
 * 0 (far left) to 1 (far right), clamped. Null without a two-sided range.
 */
export function rangePosition(value: number | null, refLow: number | null, refHigh: number | null): number | null {
  if (value == null || refLow == null || refHigh == null || refHigh <= refLow) return null;
  const position = 0.2 + ((value - refLow) / (refHigh - refLow)) * 0.6;
  return Math.min(1, Math.max(0, position));
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();

const refLimit = z.number().finite().nullable();

export const labResultInput = z
  .object({
    analyteId: z.number().int().positive(),
    // Exactly as printed on the report.
    valueText: z.string().trim().min(1, "Enter the result").max(40),
    unit: optionalText(20),
    refLow: refLimit,
    refHigh: refLimit,
  })
  .refine((r) => r.refLow == null || r.refHigh == null || r.refLow <= r.refHigh, {
    path: ["refHigh"],
    message: "Must be at least the low limit",
  });

export const labReportInput = z
  .object({
    // The sample was already taken; the form refuses after the user's local today first.
    date: z
      .string()
      .refine(isIsoDate, "Use a valid date")
      .refine((s) => !isIsoDate(s) || !isFutureDate(s), "Can't be in the future"),
    source: z.enum(LAB_SOURCES),
    lab: optionalText(80),
    accession: optionalText(60),
    notes: optionalText(4000),
    // The visit the sample was taken at, if any; it must be the same pet's.
    entryId: z.number().int().positive().nullable(),
    // The original report document(s). Omitted leaves them as they are.
    fileIds: z.array(z.number().int().positive()).max(20).optional(),
    results: z.array(labResultInput).min(1, "Add at least one result").max(200),
  })
  .superRefine((report, ctx) => {
    const seen = new Set<number>();
    report.results.forEach((r, i) => {
      if (seen.has(r.analyteId)) {
        ctx.addIssue({ code: "custom", path: ["results", i, "analyteId"], message: "Already in this report" });
      }
      seen.add(r.analyteId);
    });
  });

type ResultLike = {
  analyteId: number;
  valueText: string;
  value: number | null;
  comparator: Comparator | null;
  unit: string | null;
};
type ReportLike<R extends ResultLike> = { id: number; date: string; results: R[] };

export type Previous<R extends ResultLike> = {
  date: string;
  result: R;
  /** Current minus previous, only when both are plain numbers in the same unit. */
  change: number | null;
};

/**
 * For each result in `report`, the same test's result on the most recent
 * earlier report (by date, then by entry order), with the change when the two
 * can be compared.
 */
export function previousResults<R extends ResultLike>(
  reports: ReportLike<R>[],
  report: ReportLike<R>,
): Map<number, Previous<R>> {
  const earlier = reports
    .filter((r) => r.date < report.date || (r.date === report.date && r.id < report.id))
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  const found = new Map<number, Previous<R>>();
  for (const current of report.results) {
    for (const r of earlier) {
      const result = r.results.find((x) => x.analyteId === current.analyteId);
      if (!result) continue;
      const comparable =
        current.value != null &&
        result.value != null &&
        !current.comparator &&
        !result.comparator &&
        (current.unit ?? "") === (result.unit ?? "");
      const change = comparable ? Math.round((current.value! - result.value!) * 1e6) / 1e6 : null;
      found.set(current.analyteId, { date: r.date, result, change });
      break;
    }
  }
  return found;
}

export const analyteInput = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(16)
    .regex(/^[A-Za-z0-9/+-]+$/, "Letters, digits, / + and - only")
    .transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(80),
  category: z.enum(ANALYTE_CATEGORIES),
  defaultUnit: optionalText(20),
});

type PrefillSource = {
  lab: string | null;
  date: string;
  id: number;
  results: { analyteId: number; unit: string | null; refLow: number | null; refHigh: number | null }[];
};

/**
 * Unit and range to pre-fill for a test on a new report: from the pet's most
 * recent result for that test, preferring one from the same lab, else the
 * catalog's default unit and no range. The app never invents a range.
 */
export function prefillFor(
  analyte: { id: number; defaultUnit: string | null },
  reports: PrefillSource[],
  lab: string | null,
): { unit: string | null; refLow: number | null; refHigh: number | null } {
  const newestFirst = [...reports].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  const sameLab = (lab ?? "").trim().toLowerCase();
  const pick = (candidates: PrefillSource[]) =>
    candidates.flatMap((r) => r.results.filter((x) => x.analyteId === analyte.id))[0];
  const found =
    (sameLab ? pick(newestFirst.filter((r) => (r.lab ?? "").trim().toLowerCase() === sameLab)) : undefined) ??
    pick(newestFirst);
  if (!found) return { unit: analyte.defaultUnit, refLow: null, refHigh: null };
  return { unit: found.unit, refLow: found.refLow, refHigh: found.refHigh };
}
