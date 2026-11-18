import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { LegacyGridContainLabel } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";
import { PRINT_THEME, labTrendOption, weightTrendOption } from "../../web/components/charts/trend-options";
import type { Trend } from "./model";

// The options keep `grid.containLabel`, which ECharts 6 honours only with this feature.
// Tooltips are switched off for print, but the options still name them.
echarts.use([LineChart, GridComponent, TooltipComponent, LegacyGridContainLabel, SVGRenderer]);

/** Draws a chart option to an SVG string, without a browser. */
function svg(option: echarts.EChartsCoreOption, width: number, height: number): string {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
  try {
    chart.setOption(option);
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

export const weightChart = (points: { date: string; value: number }[], color: string, unit: string) =>
  svg(weightTrendOption(points, { color, unit, format: (v) => v.toFixed(2) }, PRINT_THEME), 680, 220);

export const trendChart = (trend: Trend, color: string) =>
  svg(labTrendOption(trend.series.points, { color, unit: trend.series.unit, name: trend.name }, PRINT_THEME), 330, 160);
