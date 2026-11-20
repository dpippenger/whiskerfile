import { z } from "zod";
import { isIsoDate } from "./dates";
import { LAB_SOURCES } from "./labs";

/**
 * What the model is asked to return for a lab document: everything as printed,
 * nothing converted or filled in. Kept to plain strings, nulls, enums and
 * arrays so it maps onto the API's structured output schema without surprises.
 */
export const extractionSchema = z.object({
  date: z.string().nullable(),
  lab: z.string().nullable(),
  accession: z.string().nullable(),
  source: z.enum(LAB_SOURCES).nullable(),
  results: z.array(
    z.object({
      code: z.string().nullable(),
      printedName: z.string(),
      value: z.string(),
      unit: z.string().nullable(),
      rangeLow: z.string().nullable(),
      rangeHigh: z.string().nullable(),
    }),
  ),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** A result ready for the lab form: a test from the catalog and the cells as printed. */
export type DraftResult = { analyteId: number; valueText: string; unit: string; refLow: string; refHigh: string };
/** A result the form can't take as it is, with the reason, so the reader can enter it by hand. */
export type Unmatched = { printedName: string; valueText: string; unit: string | null; reason: string };

export type LabDraft = {
  date: string | null;
  lab: string | null;
  accession: string | null;
  source: (typeof LAB_SOURCES)[number] | null;
  results: DraftResult[];
  unmatched: Unmatched[];
};

const text = (value: string | null, max: number) => {
  const trimmed = value?.trim() ?? "";
  return trimmed && trimmed.length <= max ? trimmed : null;
};

/**
 * Turns the model's reading into a draft for the lab form. The model's output
 * is treated as untrusted: codes must be in the catalog, a test appears once,
 * and text must fit the form's limits. Nothing is dropped silently; whatever
 * can't be used is listed as unmatched, with the reason.
 */
export function draftFromExtraction(extraction: Extraction, catalog: { id: number; code: string }[]): LabDraft {
  const byCode = new Map(catalog.map((a) => [a.code.trim().toUpperCase(), a.id]));
  const seen = new Set<number>();
  const results: DraftResult[] = [];
  const unmatched: Unmatched[] = [];

  for (const r of extraction.results) {
    const valueText = r.value.trim();
    const unit = r.unit?.trim() || null;
    const refLow = r.rangeLow?.trim() ?? "";
    const refHigh = r.rangeHigh?.trim() ?? "";
    const miss = (reason: string) => unmatched.push({ printedName: r.printedName.trim(), valueText, unit, reason });
    const analyteId = r.code ? byCode.get(r.code.trim().toUpperCase()) : undefined;

    if (!valueText) miss("No result printed");
    else if (valueText.length > 40) miss("The result is longer than the form allows");
    else if (unit && unit.length > 20) miss("The unit is longer than the form allows");
    else if (refLow.length > 20 || refHigh.length > 20) miss("The range is longer than the form allows");
    else if (analyteId == null) miss("Not in your list of tests");
    else if (seen.has(analyteId)) miss("This test appears more than once");
    else {
      seen.add(analyteId);
      results.push({ analyteId, valueText, unit: unit ?? "", refLow, refHigh });
    }
  }

  const date = extraction.date?.trim() ?? "";
  return {
    date: isIsoDate(date) ? date : null,
    lab: text(extraction.lab, 80),
    accession: text(extraction.accession, 60),
    source: extraction.source,
    results,
    unmatched,
  };
}
