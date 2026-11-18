import { expect, test } from "bun:test";
import { formatDate } from "../../../shared/dates";
import { parseLabValue } from "../../../shared/labs";
import { dateToUtc, labSeries } from "../../../shared/series";
import { CHART_THEME, escapeHtml, labTrendOption, weightTrendOption } from "./trend-options";

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
