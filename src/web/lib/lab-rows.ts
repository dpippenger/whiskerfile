import { parseLabValue } from "../../shared/labs";

/** One test's row on the lab entry form, as typed. */
export type Row = { key: number; analyteId: number; valueText: string; unit: string; refLow: string; refHigh: string };
export type Errors = Record<string, string>;

const SIGNED = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

/**
 * A typed range limit: "" is no limit. A plain number is that number,
 * including a negative one or the exponent form a stored limit can print as
 * ("-4", "1e-7"). Commas are read the same way as results ("0,5",
 * "1,500,000"). Anything else, including the ambiguous "150,000" or a "<"
 * limit, is NaN, which the form reports as an error rather than guess.
 */
export function parseLimit(text: string): number | null {
  const s = text
    .trim()
    .replace(/\s+/g, "")
    .replace(/\u2212/g, "-");
  if (s === "") return null;
  if (SIGNED.test(s)) return Number(s);
  if (!s.includes(",")) return Number.NaN;
  const { value, comparator } = parseLabValue(s);
  return value == null || comparator ? Number.NaN : value;
}

export const limitText = (n: number | null) => (n == null ? "" : String(n));

/** Rows with a result typed in; blank rows aren't saved. */
export const filledRows = (rows: Row[]) => rows.filter((r) => r.valueText.trim() !== "");

/** The `results` of a lab report request, from the rows that have a result. */
export function resultsBody(rows: Row[]) {
  return filledRows(rows).map((r) => ({
    analyteId: r.analyteId,
    valueText: r.valueText,
    unit: r.unit,
    refLow: parseLimit(r.refLow),
    refHigh: parseLimit(r.refHigh),
  }));
}

/** Errors for limits that aren't numbers, keyed like the request ("results.N.refLow"). */
export function limitErrors(results: ReturnType<typeof resultsBody>): Errors {
  const errors: Errors = {};
  results.forEach((r, i) => {
    if (Number.isNaN(r.refLow)) errors[`results.${i}.refLow`] = "Enter a number";
    if (Number.isNaN(r.refHigh)) errors[`results.${i}.refHigh`] = "Enter a number";
  });
  return errors;
}

/**
 * Moves errors about `results.N.field` onto the row they belong to
 * (`row.<key>.field`). N counts only rows with a result, since blank rows
 * aren't sent. Other errors keep their path.
 */
export function rowErrors(fields: Errors, rows: Row[]): Errors {
  const filled = filledRows(rows);
  const out: Errors = {};
  for (const [path, message] of Object.entries(fields)) {
    const m = /^results\.(\d+)\.(\w+)$/.exec(path);
    const row = m ? filled[Number(m[1])] : undefined;
    out[row ? `row.${row.key}.${m![2]}` : path] ??= message;
  }
  return out;
}
