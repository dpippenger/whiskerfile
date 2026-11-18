import { useMemo, useState } from "react";
import { CATEGORY_LABEL, type AnalyteCategory } from "../../shared/labs";
import { fromGrams } from "../../shared/records";
import { compareSeries, type CompareAxis, type LeftOut } from "../../shared/series";
import { EChart } from "../components/charts/echart";
import { compareOption } from "../components/charts/trend-options";
import { Page } from "../components/page";
import { Card } from "../components/ui/card";
import { Field, Select } from "../components/ui/field";
import { useMetrics, usePets, useSeries } from "../lib/queries";
import { useUnits } from "../lib/units";
import { cn } from "../lib/utils";

const REASON: Record<LeftOut["reason"], string> = {
  "no-data": "no results",
  "other-unit": "results in another unit",
  "no-birth-date": "no birth date",
};

/** One metric for several pets on one chart, by date or by age. */
export function Compare() {
  const metrics = useMetrics();
  const pets = usePets();
  const units = useUnits();
  const [chosen, setChosen] = useState<string | null>(null);
  const [axis, setAxis] = useState<CompareAxis>("date");
  const [hidden, setHidden] = useState<number[]>([]);

  const metric = chosen ?? metrics.data?.[0]?.key ?? null;
  const option = metrics.data?.find((m) => m.key === metric);
  const series = useSeries(metric);
  const isWeight = metric === "weight";

  const result = useMemo(() => {
    if (!series.data) return null;
    const shown = series.data.filter((p) => option?.petIds.includes(p.petId) && !hidden.includes(p.petId));
    return compareSeries(shown, axis);
  }, [series.data, option, hidden, axis]);

  const chart = useMemo(() => {
    if (!result) return null;
    const colorOf = new Map(pets.data?.map((p) => [p.id, p.chartColor]));
    return compareOption(
      result.plotted.map((p) => ({
        name: p.name,
        color: colorOf.get(p.petId) ?? "#a855f7",
        points: p.points.map((pt) => {
          const value = isWeight ? fromGrams(pt.value, units.weight) : pt.value;
          return { x: pt.x, value, label: isWeight ? value.toFixed(2) : pt.valueText, date: pt.date };
        }),
      })),
      { axis, unit: isWeight ? units.weight : result.unit },
    );
  }, [result, pets.data, isWeight, units.weight, axis]);

  const error = metrics.error ?? pets.error ?? series.error;
  const withData = pets.data?.filter((p) => option?.petIds.includes(p.id)) ?? [];
  const categories = [...new Set(metrics.data?.map((m) => m.category).filter(Boolean))] as AnalyteCategory[];

  return (
    <Page title="Compare">
      {error && <p className="text-danger">{error.message}</p>}
      {metrics.data?.length === 0 && (
        <Card className="py-12 text-center text-muted-foreground">
          Nothing to compare yet. Record weights or lab results first.
        </Card>
      )}
      {metrics.data && metrics.data.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @5xl/main:grid-cols-[18rem_minmax(0,1fr)] @5xl/main:items-start">
          <Card className="space-y-4">
            <Field label="Compare" htmlFor="compare-metric">
              <Select
                id="compare-metric"
                value={metric ?? ""}
                onChange={(e) => {
                  setChosen(e.target.value);
                  setHidden([]);
                }}
              >
                {metrics.data.some((m) => m.key === "weight") && <option value="weight">Weight</option>}
                {categories.map((category) => (
                  <optgroup key={category} label={CATEGORY_LABEL[category]}>
                    {metrics.data
                      .filter((m) => m.category === category)
                      .map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.code} · {m.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-medium text-foreground-secondary">Along the bottom</legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-background-secondary p-1">
                {(["date", "age"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={axis === a}
                    onClick={() => setAxis(a)}
                    className={cn(
                      "min-h-11 rounded-md text-sm font-medium text-muted-foreground md:min-h-9",
                      axis === a && "bg-elevated text-foreground shadow-sm",
                    )}
                  >
                    {a === "date" ? "Date" : "Age"}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-medium text-foreground-secondary">Pets</legend>
              <div className="flex flex-wrap gap-1.5">
                {withData.map((p) => {
                  const on = !hidden.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setHidden((h) => (on ? [...h, p.id] : h.filter((id) => id !== p.id)))}
                      className={cn(
                        "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs text-muted-foreground transition hover:bg-white/5 md:min-h-7",
                        on && "border-primary/60 bg-primary/10 text-foreground",
                      )}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ background: p.chartColor }} aria-hidden />
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-semibold">
              {option?.label}{" "}
              <span className="font-normal text-muted-foreground">
                {option?.code && <span className="font-mono">{option.code}</span>}
                {(isWeight ? units.weight : result?.unit) && ` (${isWeight ? units.weight : result?.unit})`}
              </span>
            </h2>
            {chart && result && result.plotted.length > 0 ? (
              <EChart option={chart} label={`${option?.label ?? "Metric"} by pet`} className="h-72 w-full md:h-96" />
            ) : (
              <p className="py-12 text-center text-muted-foreground">No pet has results to show here.</p>
            )}
            {result && result.leftOut.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Not shown: {result.leftOut.map((l) => `${l.name} (${REASON[l.reason]})`).join(", ")}.
              </p>
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
