import { expect, test } from "bun:test";
import { draftFromExtraction, type Extraction } from "./lab-import";

const catalog = [
  { id: 1, code: "CREA" },
  { id: 2, code: "SDMA" },
  { id: 3, code: "FeLV" },
];

const result = (fields: Partial<Extraction["results"][number]>): Extraction["results"][number] => ({
  code: "CREA",
  printedName: "Creatinine",
  value: "2.9",
  unit: "mg/dL",
  rangeLow: "0.6",
  rangeHigh: "2.4",
  ...fields,
});

const extraction = (results: Extraction["results"], fields: Partial<Extraction> = {}): Extraction => ({
  date: "2026-11-06",
  lab: "IDEXX",
  accession: "A-123",
  source: "reference_lab",
  results,
  ...fields,
});

test("results are matched to the catalog by code, whatever the case, with cells as printed", () => {
  const draft = draftFromExtraction(
    extraction([
      result({ code: " crea " }),
      result({ code: "SDMA", printedName: "SDMA", value: "<0.5", unit: "µg/dL", rangeLow: null, rangeHigh: "14" }),
      result({ code: "FELV", printedName: "FeLV Ag", value: "Negative", unit: null, rangeLow: null, rangeHigh: null }),
    ]),
    catalog,
  );
  expect(draft).toEqual({
    date: "2026-11-06",
    lab: "IDEXX",
    accession: "A-123",
    source: "reference_lab",
    results: [
      { analyteId: 1, valueText: "2.9", unit: "mg/dL", refLow: "0.6", refHigh: "2.4" },
      { analyteId: 2, valueText: "<0.5", unit: "µg/dL", refLow: "", refHigh: "14" },
      { analyteId: 3, valueText: "Negative", unit: "", refLow: "", refHigh: "" },
    ],
    unmatched: [],
  });
});

test("anything the form can't take is listed with the reason, never dropped", () => {
  const draft = draftFromExtraction(
    extraction([
      result({ code: null, printedName: "Cystatin B", value: "0.4" }),
      result({ code: "XYZ", printedName: "Mystery", value: "7" }),
      result({}),
      result({ value: "3.0" }),
      result({ code: "SDMA", printedName: "SDMA", value: "  " }),
      result({ code: "SDMA", printedName: "SDMA", value: "x".repeat(41) }),
      result({ code: "SDMA", printedName: "SDMA", unit: "u".repeat(21) }),
    ]),
    catalog,
  );
  expect(draft.results.map((r) => [r.analyteId, r.valueText])).toEqual([[1, "2.9"]]);
  expect(draft.unmatched.map((u) => [u.printedName, u.reason])).toEqual([
    ["Cystatin B", "Not in your list of tests"],
    ["Mystery", "Not in your list of tests"],
    ["Creatinine", "This test appears more than once"],
    ["SDMA", "No result printed"],
    ["SDMA", "The result is longer than the form allows"],
    ["SDMA", "The unit is longer than the form allows"],
  ]);
});

test("a date that isn't a real date, and text too long for the form, are left for the reader", () => {
  const draft = draftFromExtraction(
    extraction([], { date: "06/11/2026", lab: "L".repeat(81), accession: "  ", source: null }),
    catalog,
  );
  expect(draft).toMatchObject({ date: null, lab: null, accession: null, source: null });
  expect(draftFromExtraction(extraction([], { date: "2026-02-30" }), catalog).date).toBeNull();
});
