import { z } from "zod";
import { isIsoDate } from "./dates";

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

export type Comparator = "<" | ">";
export type ParsedValue = { value: number | null; comparator: Comparator | null };

const NUMBER = /^(\d+(?:\.\d+)?|\.\d+)$/;
const THOUSANDS = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/**
 * Reads a result as printed. "1.20" → 1.2; "<0.5" or "≤0.5" → < 0.5;
 * ">2,000" → > 2000; "4,5" → 4.5. Anything else (e.g. "Negative", "2+")
 * has no number.
 */
export function parseLabValue(text: string): ParsedValue {
  let s = text.trim().replace(/\s+/g, "");
  let comparator: Comparator | null = null;
  const first = s[0];
  if (first === "<" || first === "≤") comparator = "<";
  else if (first === ">" || first === "≥") comparator = ">";
  if (comparator) s = s.slice(1).replace(/^=/, "");
  if (THOUSANDS.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!NUMBER.test(s)) return { value: null, comparator: null };
  return { value: Number(s), comparator };
}

export type Flag = "high" | "low" | "normal";

/**
 * Where a result sits against its printed range, or null when that can't be
 * told: no range, no number, or a "<"/">" result that straddles a limit.
 */
export function flagResult(r: {
  value: number | null;
  comparator: Comparator | null;
  refLow: number | null;
  refHigh: number | null;
}): Flag | null {
  const { value, comparator, refLow, refHigh } = r;
  if (value == null || (refLow == null && refHigh == null)) return null;
  if (comparator === "<") {
    // Somewhere below `value`.
    if (refLow != null && value <= refLow) return "low";
    if (refLow == null && refHigh != null && value <= refHigh) return "normal";
    return null;
  }
  if (comparator === ">") {
    // Somewhere above `value`.
    if (refHigh != null && value >= refHigh) return "high";
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
    date: z.string().refine(isIsoDate, "Use a valid date"),
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

export type LabReportInput = z.input<typeof labReportInput>;
