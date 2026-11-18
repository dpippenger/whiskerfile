import { expect, test } from "bun:test";
import { filledRows, limitErrors, limitText, parseLimit, resultsBody, rowErrors, type Row } from "./lab-rows";

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
