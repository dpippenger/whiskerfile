import { expect, test } from "bun:test";
import { formatDate } from "../../../shared/dates";
import { parseLabValue } from "../../../shared/labs";
import { dateToUtc, labSeries } from "../../../shared/series";
import {
  CHART_THEME,
  compareOption,
  escapeHtml,
  labTrendOption,
  timePadding,
  weightTrendOption,
} from "./trend-options";

type Item = {
  value: [number, number];
  symbol?: string;
  itemStyle: { color: string };
  tooltip: { formatter: () => string };
};
type Series = { id: string; data: unknown[]; stack?: string };

const series = labSeries([
  { date: "2026-05-02", order: 1, valueText: "1.9", ...parseLabValue("1.9"), unit: "mg/dL", refLow: 0.6, refHigh: 2.4 },
  {
    date: "2026-11-06",
    order: 2,
    valueText: "<0.5",
    ...parseLabValue("<0.5"),
    unit: "mg/dL",
    refLow: 0.8,
    refHigh: 2.4,
  },
  {
    date: "2026-12-01",
    order: 3,
    valueText: "2.9",
    ...parseLabValue("2.9"),
    unit: "mg/dL",
    refLow: null,
    refHigh: 2.4,
  },
]);
const option = labTrendOption(series.points, { color: "#a855f7", unit: "mg/<b>dL", name: "Creatinine" });
const byId = (id: string) => (option.series as Series[]).find((s) => s.id === id)!;

test("charts show dates in UTC on a time axis", () => {
  expect(option.useUTC).toBe(true);
  expect(option.xAxis.type).toBe("time");
});

test("results are drawn over a band of each result's own range, broken where one-sided", () => {
  expect(byId("range-low").data).toEqual([
    [dateToUtc("2026-05-02"), 0.6],
    [dateToUtc("2026-11-06"), 0.8],
    [dateToUtc("2026-12-01"), null],
  ]);
  expect(byId("range").stack).toBe("range");
  expect((byId("range").data[2] as [number, number | null])[1]).toBeNull();
});

test("points are coloured by flag and hollow for limit values", () => {
  const items = byId("values").data as Item[];
  expect(items.map((i) => i.value)).toEqual([
    [dateToUtc("2026-05-02"), 1.9],
    [dateToUtc("2026-11-06"), 0.5],
    [dateToUtc("2026-12-01"), 2.9],
  ]);
  expect(items.map((i) => i.symbol)).toEqual(["circle", "emptyCircle", "circle"]);
  expect(items[0]!.itemStyle.color).toBe("#a855f7");
  expect(items[1]!.itemStyle.color).toBe(CHART_THEME.flag.low);
  expect(items[2]!.itemStyle.color).toBe(CHART_THEME.flag.high);
});

test("tooltips show the printed text, the date as formatted elsewhere, and escape HTML", () => {
  const tip = (byId("values").data as Item[])[1]!.tooltip.formatter();
  expect(tip).toContain("&lt;0.5");
  expect(tip).toContain(escapeHtml(formatDate("2026-11-06")));
  expect(tip).toContain("mg/&lt;b&gt;dL");
  expect(tip).not.toContain("<b>dL");
  expect(tip).toContain("Low");
});

test("weight charts use the reader's unit", () => {
  const weights = weightTrendOption([{ date: "2026-01-01", value: 8.81 }], {
    color: "#60a5fa",
    unit: "lb",
    format: (v) => v.toFixed(2),
  });
  const item = (weights.series[0]!.data as Item[])[0]!;
  expect(item.value).toEqual([dateToUtc("2026-01-01"), 8.81]);
  expect(item.tooltip.formatter()).toContain("<b>8.81</b> lb");
  expect(weights.dataZoom).toEqual([]);
});

test("a range with a negative lower limit is stacked from that limit, not from zero", () => {
  const negative = labSeries([
    {
      date: "2026-01-01",
      order: 1,
      valueText: "-1",
      value: -1,
      comparator: null,
      unit: "mmol/L",
      refLow: -2,
      refHigh: 2,
    },
  ]);
  const opt = labTrendOption(negative.points, { color: "#a855f7", unit: "mmol/L", name: "Base excess" });
  const band = (opt.series as (Series & { stackStrategy?: string })[]).filter((s) => s.stack === "range");
  expect(band.map((s) => s.stackStrategy)).toEqual(["all", "all"]);
  // Lower limit, then the height that sits on it: -2 + 4 = 2.
  expect(band.map((s) => (s.data[0] as [number, number])[1])).toEqual([-2, 4]);
});

test("a chart whose points share one day still spans weeks", () => {
  const day = dateToUtc("2026-06-01");
  expect(timePadding([day])).toEqual({ min: day - 30 * 86_400_000, max: day + 30 * 86_400_000 });
  expect(timePadding([day, day])).toEqual({ min: day - 30 * 86_400_000, max: day + 30 * 86_400_000 });
  expect(timePadding([day, dateToUtc("2026-06-02")])).toEqual({});
  expect(timePadding([])).toEqual({});
  const single = weightTrendOption([{ date: "2026-06-01", value: 9 }], { color: "#fff", unit: "lb", format: String });
  expect(single.xAxis).toMatchObject({ min: day - 30 * 86_400_000, max: day + 30 * 86_400_000 });
});

test("comparisons draw a line per pet in its colour, with names escaped", () => {
  const pets = [
    {
      name: "Miso <3",
      color: "#a855f7",
      points: [{ x: 10.5, value: 2.6, label: "2.6", date: "2026-11-06", limit: false }],
    },
    {
      name: "Reggie",
      color: "#60a5fa",
      points: [{ x: 5.4, value: 0.5, label: "<0.5", date: "2026-09-01", limit: true }],
    },
  ];
  const byAge = compareOption(pets, { axis: "age", unit: "mg/dL" });
  expect(byAge.xAxis).toMatchObject({ type: "value", name: "Age (years)" });
  const lines = byAge.series as unknown as {
    name: string;
    lineStyle: { color: string };
    data: { tooltip: { formatter: () => string } }[];
  }[];
  expect(lines.map((l) => [l.name, l.lineStyle.color])).toEqual([
    ["Miso <3", "#a855f7"],
    ["Reggie", "#60a5fa"],
  ]);
  expect(lines[0]!.data[0]!.tooltip.formatter()).toContain("Miso &lt;3");
  expect(lines[0]!.data[0]!.tooltip.formatter()).toContain("<b>2.6</b> mg/dL");
  expect(lines.map((l) => (l.data[0] as unknown as { symbol: string }).symbol)).toEqual(["circle", "emptyCircle"]);
  expect(lines[1]!.data[0]!.tooltip.formatter()).toContain("<b>&lt;0.5</b>");
  expect(compareOption(pets, { axis: "date", unit: null }).xAxis).toMatchObject({ type: "time" });
});
