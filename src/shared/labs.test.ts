import { expect, test } from "bun:test";
import { flagResult, formatRange, labReportInput, parseLabValue, rangePosition } from "./labs";

test("results are read as printed", () => {
  expect(parseLabValue("1.20")).toEqual({ value: 1.2, comparator: null });
  expect(parseLabValue(" 245 ")).toEqual({ value: 245, comparator: null });
  expect(parseLabValue(".5")).toEqual({ value: 0.5, comparator: null });
  expect(parseLabValue("<0.5")).toEqual({ value: 0.5, comparator: "<" });
  expect(parseLabValue("≤ 0.5")).toEqual({ value: 0.5, comparator: "<" });
  expect(parseLabValue("<=0.5")).toEqual({ value: 0.5, comparator: "<" });
  expect(parseLabValue(">2,000")).toEqual({ value: 2000, comparator: ">" });
  expect(parseLabValue("1,234.5")).toEqual({ value: 1234.5, comparator: null });
  expect(parseLabValue("4,5")).toEqual({ value: 4.5, comparator: null });
  for (const qualitative of ["Negative", "2+", "Trace", "1.2.3", "", "-1", "1e3"]) {
    expect(parseLabValue(qualitative)).toEqual({ value: null, comparator: null });
  }
});

const flag = (text: string, refLow: number | null, refHigh: number | null) =>
  flagResult({ ...parseLabValue(text), refLow, refHigh });

test("plain values are flagged against one- or two-sided ranges", () => {
  expect(flag("1.9", 0.8, 2.4)).toBe("normal");
  expect(flag("0.8", 0.8, 2.4)).toBe("normal");
  expect(flag("2.4", 0.8, 2.4)).toBe("normal");
  expect(flag("2.5", 0.8, 2.4)).toBe("high");
  expect(flag("0.7", 0.8, 2.4)).toBe("low");
  expect(flag("16", null, 14)).toBe("high");
  expect(flag("10", null, 14)).toBe("normal");
  expect(flag("0.5", 1, null)).toBe("low");
  expect(flag("1.9", null, null)).toBeNull();
  expect(flag("Negative", 0, 1)).toBeNull();
});

test("a result beyond a limit is flagged only when every value it allows is", () => {
  expect(flag("<0.5", 0.8, 2.4)).toBe("low");
  expect(flag("<0.5", 0.3, 2.4)).toBeNull();
  expect(flag("<5", null, 14)).toBe("normal");
  expect(flag("<20", null, 14)).toBeNull();
  expect(flag(">2000", 100, 1500)).toBe("high");
  expect(flag(">1000", 100, 1500)).toBeNull();
  expect(flag(">1.050", 1.035, null)).toBe("normal");
});

test("ranges and bar positions", () => {
  expect(formatRange(0.8, 2.4)).toBe("0.8–2.4");
  expect(formatRange(null, 14)).toBe("≤ 14");
  expect(formatRange(1.035, null)).toBe("≥ 1.035");
  expect(formatRange(null, null)).toBeNull();
  expect(rangePosition(0.8, 0.8, 2.4)).toBeCloseTo(0.2);
  expect(rangePosition(2.4, 0.8, 2.4)).toBeCloseTo(0.8);
  expect(rangePosition(1.6, 0.8, 2.4)).toBeCloseTo(0.5);
  expect(rangePosition(100, 0.8, 2.4)).toBe(1);
  expect(rangePosition(-5, 0.8, 2.4)).toBe(0);
  expect(rangePosition(1, null, 2.4)).toBeNull();
  expect(rangePosition(1, 2, 2)).toBeNull();
});

test("a report needs results, valid ranges and no analyte twice", () => {
  const report = (results: object[]) => ({
    date: "2026-11-06",
    source: "reference_lab",
    lab: "",
    accession: "",
    notes: "",
    entryId: null,
    results,
  });
  const result = (fields: object = {}) => ({
    analyteId: 1,
    valueText: "1.9",
    unit: "mg/dL",
    refLow: 0.8,
    refHigh: 2.4,
    ...fields,
  });
  const paths = (input: object) => labReportInput.safeParse(input).error?.issues.map((i) => i.path.join("."));

  expect(paths(report([result()]))).toBeUndefined();
  expect(paths(report([]))).toEqual(["results"]);
  expect(paths(report([result({ valueText: " " })]))).toEqual(["results.0.valueText"]);
  expect(paths(report([result({ refLow: 3 })]))).toEqual(["results.0.refHigh"]);
  expect(paths(report([result(), result({ analyteId: 2 }), result()]))).toEqual(["results.2.analyteId"]);
});
