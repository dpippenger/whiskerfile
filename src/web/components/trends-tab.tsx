import { useMemo, useState } from "react";
import type { Measurement } from "../../server/db/schema";
import type { LabReportWithResults } from "../../server/routes/labs";
import { ANALYTE_CATEGORIES, CATEGORY_LABEL, flagResult, type AnalyteCategory } from "../../shared/labs";
import { fromGrams, type Units } from "../../shared/records";
import { labSeries, type LabSeries } from "../../shared/series";
import { cn } from "../lib/utils";
import { EChart } from "./charts/echart";
import { labTrendOption, weightTrendOption } from "../../shared/trend-options";
import { Card } from "./ui/card";

type Metric = { key: string; label: string; code?: string; category?: AnalyteCategory };

const WEIGHT = "weight";

/** Every test with at least one numeric result, with its results across reports. */
function labMetrics(reports: LabReportWithResults[]) {
  const byAnalyte = new Map<number, { metric: Metric; series: LabSeries; sortOrder: number }>();
  const ids = new Set(reports.flatMap((r) => r.results.filter((x) => x.value != null).map((x) => x.analyteId)));
  for (const analyteId of ids) {
    const rows = reports.flatMap((report) =>
      report.results
        .filter((x) => x.analyteId === analyteId)
        .map((x) => ({ ...x, date: report.date, order: report.id })),
    );
    const first = rows[0]!;
    byAnalyte.set(analyteId, {
      metric: { key: `a${analyteId}`, label: first.name, code: first.code, category: first.category },
      series: labSeries(rows),
      sortOrder: first.sortOrder,
    });
  }
  return [...byAnalyte.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Weight, plus up to three tests the latest report flagged (or its first three with a number). */
function defaultSelection(reports: LabReportWithResults[], hasWeight: boolean): string[] {
  const latest = reports[0];
  const flagged = (latest?.results ?? []).filter((r) => {
    const flag = flagResult(r);
    return r.value != null && (flag === "high" || flag === "low");
  });
  const picks = (flagged.length ? flagged : (latest?.results ?? []).filter((r) => r.value != null))
    .slice(0, 3)
    .map((r) => `a${r.analyteId}`);
  return [...(hasWeight ? [WEIGHT] : []), ...picks];
}

function MetricChip({ metric, selected, onToggle }: { metric: Metric; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs text-foreground-secondary transition hover:bg-white/5 md:min-h-7",
        selected && "border-primary/60 bg-primary/10 text-foreground",
      )}
    >
      {metric.code && <span className="font-mono">{metric.code}</span>}
      <span className={cn(metric.code && "text-muted-foreground")}>{metric.label}</span>
    </button>
  );
}

/** Charts of a pet's weight and lab results over time, one per chosen metric. */
export function TrendsTab({
  reports,
  weights,
  units,
  color,
}: {
  reports: LabReportWithResults[];
  weights: Measurement[];
  units: Units;
  color: string;
}) {
  const labs = useMemo(() => labMetrics(reports), [reports]);
  const [selected, setSelected] = useState(() => defaultSelection(reports, weights.length > 0));
  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const weightOption = useMemo(
    () =>
      weightTrendOption(
        weights.map((w) => ({ date: w.date, value: fromGrams(w.value, units.weight) })),
        { color, unit: units.weight, format: (v) => v.toFixed(2) },
      ),
    [weights, units.weight, color],
  );
  const labOptions = useMemo(
    () =>
      new Map(
        labs.map((l) => [
          l.metric.key,
          labTrendOption(l.series.points, { color, unit: l.series.unit, name: l.metric.label }),
        ]),
      ),
    [labs, color],
  );

  if (weights.length === 0 && labs.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground">
        Nothing to chart yet. Weights and lab results with numbers appear here.
      </Card>
    );
  }

  const charts = [
    ...(weights.length > 0 && selected.includes(WEIGHT) ? [WEIGHT] : []),
    ...labs.filter((l) => selected.includes(l.metric.key)).map((l) => l.metric.key),
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @5xl/main:grid-cols-[18rem_minmax(0,1fr)] @5xl/main:items-start">
      <Card className="space-y-3 @5xl/main:sticky @5xl/main:top-4">
        <h2 className="text-sm font-semibold text-foreground-secondary">Show</h2>
        <div className="flex flex-wrap gap-1.5">
          {weights.length > 0 && (
            <MetricChip
              metric={{ key: WEIGHT, label: "Weight" }}
              selected={selected.includes(WEIGHT)}
              onToggle={() => toggle(WEIGHT)}
            />
          )}
        </div>
        {ANALYTE_CATEGORIES.map((category) => {
          const list = labs.filter((l) => l.metric.category === category);
          if (list.length === 0) return null;
          return (
            <div key={category} className="space-y-1.5">
              <h3 className="text-xs text-muted-foreground">{CATEGORY_LABEL[category]}</h3>
              <div className="flex flex-wrap gap-1.5">
                {list.map((l) => (
                  <MetricChip
                    key={l.metric.key}
                    metric={l.metric}
                    selected={selected.includes(l.metric.key)}
                    onToggle={() => toggle(l.metric.key)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </Card>

      <div className="space-y-4">
        {charts.length === 0 && <Card className="py-12 text-center text-muted-foreground">Choose what to chart.</Card>}
        {charts.map((key) => {
          if (key === WEIGHT) {
            return (
              <Card key={key} className="space-y-2">
                <h3 className="font-semibold">
                  Weight <span className="font-normal text-muted-foreground">({units.weight})</span>
                </h3>
                <EChart option={weightOption} label="Weight over time" className="h-56 w-full md:h-64" />
              </Card>
            );
          }
          const lab = labs.find((l) => l.metric.key === key)!;
          const left = [
            lab.series.otherUnits && `${lab.series.otherUnits} in another unit`,
            lab.series.unread && `${lab.series.unread} without a number`,
          ].filter(Boolean);
          return (
            <Card key={key} className="space-y-2">
              <h3 className="font-semibold">
                {lab.metric.label}{" "}
                <span className="font-normal text-muted-foreground">
                  <span className="font-mono">{lab.metric.code}</span>
                  {lab.series.unit && ` (${lab.series.unit})`}
                </span>
              </h3>
              <EChart
                option={labOptions.get(key)!}
                label={`${lab.metric.label} over time`}
                className="h-56 w-full md:h-64"
              />
              <p className="text-xs text-muted-foreground">
                Shaded: the reference range printed on each report. Hollow points are results given as a limit, such as
                &lt;0.5.
                {left.length > 0 && ` Not shown: ${left.join(", ")}.`}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
