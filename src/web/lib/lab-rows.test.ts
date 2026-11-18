import { expect, test } from "bun:test";
import {
  applyDraftResults,
  filledRows,
  limitErrors,
  limitText,
  parseLimit,
  resultsBody,
  rowErrors,
  type Row,
} from "./lab-rows";

const row = (key: number, valueText: string, refLow = "", refHigh = ""): Row => ({
  key,
  analyteId: key * 10,
  valueText,
  unit: "mg/dL",
  refLow,
  refHigh,
});

test("range limits are read like results, and ambiguous ones are refused", () => {
  expect(parseLimit("")).toBeNull();
  expect(parseLimit(" 2.4 ")).toBe(2.4);
  expect(parseLimit("0,8")).toBe(0.8);
  expect(parseLimit("1,500,000")).toBe(1500000);
  expect(parseLimit("150000")).toBe(150000);
  expect(parseLimit("-4")).toBe(-4);
  expect(parseLimit("-0,5")).toBe(-0.5);
  expect(parseLimit("\u22122")).toBe(-2);
  for (const bad of ["150,000", "-150,000", "<14", "abc", "1.2.3", "--1", "1e"]) expect(parseLimit(bad)).toBeNaN();
});

test("every stored limit survives being shown and read back", () => {
  for (const n of [-4, -0.25, 0, 1e-7, 2.4, 1.035, 150000, 1500000, 1e21]) expect(parseLimit(limitText(n))).toBe(n);
});

test("blank rows are not sent, and limits are parsed", () => {
  const rows = [row(1, "2.6", "0.6", "2.4"), row(2, "  "), row(3, "<0.5", "", "14")];
  expect(filledRows(rows).map((r) => r.key)).toEqual([1, 3]);
  expect(resultsBody(rows)).toEqual([
    { analyteId: 10, valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 },
    { analyteId: 30, valueText: "<0.5", unit: "mg/dL", refLow: null, refHigh: 14 },
  ]);
});

test("limit errors and server errors land on the row they belong to, skipping blank rows", () => {
  const rows = [row(1, ""), row(2, "2.6", "150,000"), row(3, ""), row(4, "4", "", "x")];
  const local = limitErrors(resultsBody(rows));
  expect(local).toEqual({ "results.0.refLow": "Enter a number", "results.1.refHigh": "Enter a number" });
  expect(rowErrors(local, rows)).toEqual({ "row.2.refLow": "Enter a number", "row.4.refHigh": "Enter a number" });
  expect(
    rowErrors({ "results.1.analyteId": "Unknown test", date: "Use a valid date", "results.9.unit": "x" }, rows),
  ).toEqual({ "row.4.analyteId": "Unknown test", date: "Use a valid date", "results.9.unit": "x" });
});

test("results read from a document fill the form without replacing anything typed", () => {
  let key = 100;
  const rows: Row[] = [
    // Typed by hand: kept, and the difference reported.
    { key: 1, analyteId: 10, valueText: "2.1", unit: "mg/dL", refLow: "0.6", refHigh: "2.4" },
    // Added with a range carried over from an earlier report, value still empty.
    { key: 2, analyteId: 20, valueText: "", unit: "µg/dL", refLow: "0", refHigh: "14" },
    // Typed and the same as the document: nothing to report.
    { key: 3, analyteId: 30, valueText: "27", unit: "mg/dL", refLow: "", refHigh: "" },
  ];
  const { rows: next, kept } = applyDraftResults(
    rows,
    [
      { analyteId: 10, valueText: "2.9", unit: "mg/dL", refLow: "0.6", refHigh: "2.4" },
      { analyteId: 20, valueText: "<0.5", unit: "µg/dL", refLow: "", refHigh: "" },
      { analyteId: 30, valueText: "27", unit: "mg/dL", refLow: "16", refHigh: "36" },
      { analyteId: 40, valueText: "Negative", unit: "", refLow: "", refHigh: "" },
    ],
    () => key++,
  );
  expect(next).toEqual([
    rows[0]!,
    // The document printed no range here, so none is shown: the carried-over one is gone.
    { key: 2, analyteId: 20, valueText: "<0.5", unit: "µg/dL", refLow: "", refHigh: "" },
    rows[2]!,
    { key: 100, analyteId: 40, valueText: "Negative", unit: "", refLow: "", refHigh: "" },
  ]);
  expect(kept).toEqual([{ analyteId: 10, typed: "2.1", read: "2.9" }]);
});
