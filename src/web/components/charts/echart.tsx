import { LineChart } from "echarts/charts";
import { DataZoomSliderComponent, GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomSliderComponent, SVGRenderer]);

/**
 * Draws an ECharts option. The chart follows its container's size, is
 * replaced (not merged) when the option changes, and is disposed on unmount.
 * SVG output keeps text crisp and can be printed.
 */
export function EChart({
  option,
  className,
  animation = true,
  label,
}: {
  option: object;
  className?: string;
  animation?: boolean;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = container.current!;
    const instance = echarts.init(el, null, { renderer: "svg" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption({ ...option, animation }, { notMerge: true });
  }, [option, animation]);

  return <div ref={container} role="img" aria-label={label} className={className} />;
}
