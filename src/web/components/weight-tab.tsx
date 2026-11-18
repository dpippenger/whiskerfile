import type { Measurement } from "../../server/db/schema";
import type { PetRecords } from "../../server/routes/records";
import { formatDate } from "../../shared/dates";
import { ENTRY_KIND_LABEL, fromGrams, type Units } from "../../shared/records";
import { cn } from "../lib/utils";
import { Sparkline } from "./sparkline";
import { Card } from "./ui/card";

/** Signed change in display units, e.g. "+0.12" or "−0.30"; null for the first weight. */
function change(current: number, previous: number | undefined, units: Units): string | null {
  if (previous === undefined) return null;
  const diff = fromGrams(current, units.weight) - fromGrams(previous, units.weight);
  if (Math.abs(diff) < 0.005) return "0.00";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)}`;
}

/** Every weight on record: a trend line and a table, newest first. */
export function WeightTab({
  weights,
  records,
  units,
  color,
}: {
  weights: Measurement[];
  records: PetRecords;
  units: Units;
  color: string;
}) {
  if (weights.length === 0) {
    return <Card className="py-12 text-center text-muted-foreground">No weights recorded yet.</Card>;
  }
  const kindOf = new Map(records.entries.map((e) => [e.id, e.kind]));
  const values = weights.map((w) => fromGrams(w.value, units.weight));
  const latest = weights.at(-1)!;
  const rows = weights.map((w, i) => ({ ...w, change: change(w.value, weights[i - 1]?.value, units) })).reverse();

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p>
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {fromGrams(latest.value, units.weight).toFixed(2)}
            </span>{" "}
            <span className="text-muted-foreground">
              {units.weight} on {formatDate(latest.date)}
            </span>
          </p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {Math.min(...values).toFixed(2)}–{Math.max(...values).toFixed(2)} {units.weight}
          </p>
        </div>
        {weights.length > 1 && <Sparkline values={values} color={color} dots className="h-28 w-full md:h-36" />}
        {weights.length > 1 && (
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{formatDate(weights[0]!.date)}</span>
            <span>{formatDate(latest.date)}</span>
          </div>
        )}
      </Card>

      <Card className="p-0 md:p-0">
        <table className="w-full text-left">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Weight ({units.weight})</th>
              <th className="px-4 py-3 text-right font-medium">Change</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Recorded at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2.5 tabular-nums">{formatDate(row.date)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {fromGrams(row.value, units.weight).toFixed(2)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono tabular-nums",
                    !row.change && "text-muted-foreground",
                  )}
                >
                  {row.change ?? "—"}
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                  {row.entryId ? ENTRY_KIND_LABEL[kindOf.get(row.entryId) ?? "vet"] : "Weigh-in"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
