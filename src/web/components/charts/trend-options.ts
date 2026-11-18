import { formatDate } from "../../../shared/dates";
import { formatRange, type Flag } from "../../../shared/labs";
import { dateToUtc, rangeBand, type LabPoint } from "../../../shared/series";

// Chart options are built here as plain data, so they can be tested without a
// browser. Styling follows the app's dark theme (see src/web/index.css).

export const CHART_THEME = {
  text: "#8a8f98",
  grid: "rgba(255, 255, 255, 0.06)",
  tooltipBg: "#191a1d",
  tooltipBorder: "rgba(255, 255, 255, 0.11)",
  band: "rgba(74, 222, 128, 0.12)",
  flag: { high: "#fb7185", low: "#fbbf24", normal: "#4ade80" } as Record<Flag, string>,
};

/** Escapes text for the tooltip, which ECharts renders as HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const DAY = 86_400_000;

/**
 * A time axis that spans at least a few weeks: with every point on one day,
 * ECharts would zoom to hours and repeat that day's date across the axis.
 */
export function timePadding(xs: number[]): { min?: number; max?: number } {
  if (xs.length === 0) return {};
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return hi - lo < DAY ? { min: lo - 30 * DAY, max: hi + 30 * DAY } : {};
}

const base = (zoom: boolean, xs: number[]) => ({
  // Dates are midnight UTC; showing them in UTC keeps each point on its own day.
  useUTC: true,
  animation: true,
  textStyle: { fontFamily: "Inter Variable, system-ui, sans-serif", color: CHART_THEME.text },
  grid: { top: 12, right: 12, bottom: zoom ? 56 : 24, left: 8, containLabel: true },
  xAxis: {
    type: "time",
    ...timePadding(xs),
    axisLine: { lineStyle: { color: CHART_THEME.grid } },
    axisTick: { show: false },
    axisLabel: {
      color: CHART_THEME.text,
      fontSize: 11,
      hideOverlap: true,
      // Name the month on day ticks, so a short span doesn't read as bare numbers.
      formatter: { year: "{yyyy}", month: "{MMM}", day: "{MMM} {d}", hour: "{MMM} {d}", minute: "{MMM} {d}" },
    },
    splitLine: { show: false },
  },
  yAxis: {
    type: "value",
    scale: true,
    axisLabel: { color: CHART_THEME.text, fontSize: 11 },
    splitLine: { lineStyle: { color: CHART_THEME.grid, type: "dashed" } },
  },
  tooltip: {
    trigger: "item",
    backgroundColor: CHART_THEME.tooltipBg,
    borderColor: CHART_THEME.tooltipBorder,
    textStyle: { color: "#f7f8f8", fontSize: 12 },
    confine: true,
  },
  // A slider rather than drag-to-zoom, so a swipe over the chart still scrolls the page on a phone.
  dataZoom: zoom ? [{ type: "slider", height: 20, bottom: 8, borderColor: "transparent", filterMode: "none" }] : [],
});

/** Enough points that zooming helps. */
const ZOOM_FROM = 8;

/**
 * One test's results over time: a line in the pet's colour, each point
 * coloured by its flag, hollow for a "<" or ">" result, over a band of each
 * result's own printed range.
 */
export function labTrendOption(points: LabPoint[], opts: { color: string; unit: string | null; name: string }) {
  const band = rangeBand(points);
  const unit = opts.unit ? ` ${escapeHtml(opts.unit)}` : "";
  return {
    ...base(
      points.length >= ZOOM_FROM,
      points.map((p) => dateToUtc(p.date)),
    ),
    series: [
      {
        id: "range-low",
        type: "line",
        stack: "range",
        // Stack whatever the signs: a range like -2 to 2 has a negative base.
        stackStrategy: "all",
        step: "end",
        silent: true,
        symbol: "none",
        lineStyle: { opacity: 0 },
        connectNulls: false,
        data: band.map((b) => [b.x, b.low]),
      },
      {
        id: "range",
        type: "line",
        stack: "range",
        // Stack whatever the signs: a range like -2 to 2 has a negative base.
        stackStrategy: "all",
        step: "end",
        silent: true,
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: { color: CHART_THEME.band },
        connectNulls: false,
        data: band.map((b) => [b.x, b.height]),
      },
      {
        id: "values",
        name: opts.name,
        type: "line",
        lineStyle: { color: opts.color, width: 2 },
        symbolSize: 8,
        data: points.map((p) => ({
          value: [dateToUtc(p.date), p.value],
          symbol: p.comparator ? "emptyCircle" : "circle",
          itemStyle: { color: p.flag && p.flag !== "normal" ? CHART_THEME.flag[p.flag] : opts.color },
          tooltip: {
            formatter: () => {
              const range = formatRange(p.refLow, p.refHigh);
              const flag = p.flag === "high" ? " · High" : p.flag === "low" ? " · Low" : "";
              return [
                `<div style="color:${CHART_THEME.text}">${escapeHtml(formatDate(p.date))}</div>`,
                `<b>${escapeHtml(p.valueText)}</b>${unit}${flag}`,
                range ? `<div style="color:${CHART_THEME.text}">Range ${escapeHtml(range)}</div>` : "",
              ].join("");
            },
          },
        })),
      },
    ],
  };
}

/** Weights over time in the reader's unit. */
export function weightTrendOption(
  points: { date: string; value: number }[],
  opts: { color: string; unit: string; format: (value: number) => string },
) {
  return {
    ...base(
      points.length >= ZOOM_FROM,
      points.map((p) => dateToUtc(p.date)),
    ),
    series: [
      {
        id: "weight",
        type: "line",
        lineStyle: { color: opts.color, width: 2 },
        itemStyle: { color: opts.color },
        symbolSize: 7,
        data: points.map((p) => ({
          value: [dateToUtc(p.date), p.value],
          tooltip: {
            formatter: () =>
              `<div style="color:${CHART_THEME.text}">${escapeHtml(formatDate(p.date))}</div><b>${escapeHtml(opts.format(p.value))}</b> ${escapeHtml(opts.unit)}`,
          },
        })),
      },
    ],
  };
}
