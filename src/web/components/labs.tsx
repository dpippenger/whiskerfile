import { ArrowLeft, FlaskConical, Pencil, Plus } from "lucide-react";
import { Link } from "wouter";
import type { LabReportWithResults, LabResultRow } from "../../server/routes/labs";
import type { EntryWithVitals } from "../../server/routes/records";
import { formatDate } from "../../shared/dates";
import {
  ANALYTE_CATEGORIES,
  CATEGORY_LABEL,
  flagResult,
  formatRange,
  LAB_SOURCE_LABEL,
  previousResults,
  rangePosition,
  type Flag,
  type Previous,
} from "../../shared/labs";
import { cn } from "../lib/utils";
import { FileChip, fileRef } from "./attachments";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

const flagOf = (r: LabResultRow) => flagResult(r);

function FlagBadge({ flag }: { flag: Flag | null }) {
  if (flag === "high") return <Badge tone="danger">High</Badge>;
  if (flag === "low") return <Badge tone="warning">Low</Badge>;
  return null;
}

/**
 * Counts of high and low results on a report, and whether every result was
 * checked and found in range (a result without a range or a number can't be).
 */
function flagCounts(report: LabReportWithResults) {
  const flags = report.results.map(flagOf);
  return {
    high: flags.filter((f) => f === "high").length,
    low: flags.filter((f) => f === "low").length,
    allNormal: flags.length > 0 && flags.every((f) => f === "normal"),
  };
}

/**
 * Where the value sits against its printed range: the range is the middle
 * band, and the dot marks the result. Nothing for a result without a
 * two-sided range or a number.
 */
export function RangeBar({ result }: { result: LabResultRow }) {
  const position = rangePosition(result.value, result.refLow, result.refHigh);
  if (position == null) return null;
  const flag = flagOf(result);
  return (
    <div className="relative h-2 w-full min-w-20 rounded-full bg-white/5" aria-hidden>
      <div className="absolute inset-y-0 left-[20%] w-[60%] rounded-full bg-success/20" />
      <div
        className={cn(
          "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
          flag === "high"
            ? "bg-danger"
            : flag === "low"
              ? "bg-warning"
              : flag === "normal"
                ? "bg-success"
                : "bg-foreground-secondary",
          result.comparator && "opacity-60",
        )}
        style={{ left: `${position * 100}%` }}
      />
    </div>
  );
}

const formatChange = (change: number) => `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)}`;

function PreviousCell({ previous, unit }: { previous: Previous<LabResultRow> | undefined; unit: string | null }) {
  if (!previous) return <span className="text-muted-foreground">—</span>;
  // The two numbers aren't comparable when the units differ, including one with no unit.
  const unitDiffers = (previous.result.unit ?? "") !== (unit ?? "");
  return (
    <span className="flex flex-col">
      <span className="font-mono tabular-nums">
        {previous.result.valueText}
        {(previous.result.unit || unitDiffers) && (
          <span
            className={cn("ml-1 font-sans text-xs text-muted-foreground", unitDiffers && "text-info")}
            title={unitDiffers ? "Different unit from this result" : undefined}
          >
            {previous.result.unit ?? "no unit"}
          </span>
        )}
        {previous.change != null && (
          <span className="ml-2 text-xs text-muted-foreground">{formatChange(previous.change)}</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">{formatDate(previous.date)}</span>
    </span>
  );
}

/** Every result on one report, grouped by category, against its printed range and the previous result. */
export function LabReportView({
  petId,
  report,
  reports,
  visit,
}: {
  petId: number;
  report: LabReportWithResults;
  reports: LabReportWithResults[];
  visit?: EntryWithVitals;
}) {
  const previous = previousResults(reports, report);
  const { high, low } = flagCounts(report);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/pets/${petId}/labs`}
          className="inline-flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground md:min-h-9"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All lab reports
        </Link>
        <Link
          href={`/pets/${petId}/labs/${report.id}/edit`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-elevated px-4 text-sm font-medium hover:bg-card-hover md:min-h-9"
        >
          <Pencil className="size-4" aria-hidden />
          Edit
        </Link>
      </div>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{formatDate(report.date)}</h2>
          <Badge>{LAB_SOURCE_LABEL[report.source]}</Badge>
          {high > 0 && <Badge tone="danger">{high} high</Badge>}
          {low > 0 && <Badge tone="warning">{low} low</Badge>}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
          {report.lab && (
            <div className="flex gap-1.5">
              <dt>Lab</dt>
              <dd className="text-foreground">{report.lab}</dd>
            </div>
          )}
          {report.accession && (
            <div className="flex gap-1.5">
              <dt>Accession</dt>
              <dd className="font-mono text-foreground">{report.accession}</dd>
            </div>
          )}
          {visit && (
            <div className="flex gap-1.5">
              <dt>Visit</dt>
              <dd className="text-foreground">
                {formatDate(visit.date)}
                {visit.reason && ` · ${visit.reason}`}
              </dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt>Added by</dt>
            <dd className="text-foreground">{report.author}</dd>
          </div>
        </dl>
        {report.notes && <p className="whitespace-pre-wrap text-foreground-secondary">{report.notes}</p>}
        {report.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {report.attachments.map((a) => (
              <li key={a.id} className="max-w-full">
                <FileChip file={fileRef(a)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {ANALYTE_CATEGORIES.map((category) => {
        const rows = report.results.filter((r) => r.category === category);
        if (rows.length === 0) return null;
        return (
          <Card key={category} className="p-0 md:p-0">
            <h3 className="px-4 pt-4 text-sm font-semibold text-foreground-secondary md:px-5">
              {CATEGORY_LABEL[category]}
            </h3>
            <table className="mt-2 w-full text-left">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium md:px-5">Test</th>
                  <th className="px-2 py-2 text-right font-medium">Result</th>
                  <th className="hidden px-2 py-2 font-medium md:table-cell">Unit</th>
                  <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Reference</th>
                  <th className="w-[18%] px-2 py-2 font-medium max-sm:hidden">
                    <span className="sr-only">Position in range</span>
                  </th>
                  <th className="hidden px-4 py-2 font-medium lg:table-cell">Previous</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const flag = flagOf(r);
                  const range = formatRange(r.refLow, r.refHigh);
                  return (
                    <tr key={r.id} className={cn(flag && flag !== "normal" && "bg-white/[0.02]")}>
                      <td className="px-4 py-2.5 md:px-5">
                        <span className="block">{r.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{r.code}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="inline-flex items-center gap-2">
                          <FlagBadge flag={flag} />
                          <span className="font-mono font-semibold tabular-nums">{r.valueText}</span>
                        </span>
                        {/* Phones: unit and range under the value. */}
                        <span className="block text-xs text-muted-foreground md:hidden">
                          {[r.unit, range && `ref ${range}`].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="hidden px-2 py-2.5 text-muted-foreground md:table-cell">{r.unit}</td>
                      <td className="hidden px-2 py-2.5 text-right font-mono text-muted-foreground tabular-nums md:table-cell">
                        {range ?? "—"}
                      </td>
                      <td className="px-2 py-2.5 max-sm:hidden">
                        <RangeBar result={r} />
                      </td>
                      <td className="hidden px-4 py-2.5 lg:table-cell">
                        <PreviousCell previous={previous.get(r.analyteId)} unit={r.unit} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}

/** A pet's lab reports, newest first, with how many results fall outside their ranges. */
export function LabsTab({ petId, reports }: { petId: number; reports: LabReportWithResults[] }) {
  const add = (
    <Link
      href={`/pets/${petId}/labs/new`}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-elevated px-4 text-sm font-medium hover:bg-card-hover md:min-h-9"
    >
      <Plus className="size-4" aria-hidden />
      Add lab results
    </Link>
  );
  if (reports.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <FlaskConical className="size-6" aria-hidden />
        No lab results yet.
        {add}
      </Card>
    );
  }
  return (
    <ul className="space-y-3">
      <li className="flex justify-end">{add}</li>
      {reports.map((report) => (
        <li key={report.id}>
          <LabReportRow report={report} />
        </li>
      ))}
    </ul>
  );
}

/** One report as a link to it: date, lab, the tests on it and how many came back high or low. */
export function LabReportRow({ report }: { report: LabReportWithResults }) {
  const { high, low, allNormal } = flagCounts(report);
  return (
    <Link
      href={`/pets/${report.petId}/labs/${report.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition hover:border-border-strong hover:bg-card-hover"
    >
      <FlaskConical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {formatDate(report.date)}
          <span className="font-normal text-muted-foreground"> · {report.lab ?? LAB_SOURCE_LABEL[report.source]}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {report.results.length} {report.results.length === 1 ? "result" : "results"}:{" "}
          {report.results.map((r) => r.code).join(", ")}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {high > 0 && <Badge tone="danger">{high} high</Badge>}
        {low > 0 && <Badge tone="warning">{low} low</Badge>}
        {allNormal && <Badge tone="success">In range</Badge>}
      </div>
    </Link>
  );
}
