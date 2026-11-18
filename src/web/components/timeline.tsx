import { Pencil, Scale, Stethoscope, House } from "lucide-react";
import type { EntryWithVitals, MeasurementWithAuthor, PetRecords } from "../../server/routes/records";
import { formatDate } from "../../shared/dates";
import { ENTRY_KIND_LABEL, formatVital, VITAL_LABEL, VITALS, type Units } from "../../shared/records";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export type Editing =
  { type: "entry"; entry: EntryWithVitals } | { type: "weight"; measurement: MeasurementWithAuthor };

type Item =
  | { type: "entry"; date: string; createdAt: number; entry: EntryWithVitals }
  | { type: "measurement"; date: string; createdAt: number; measurement: MeasurementWithAuthor };

/** Visits and standalone readings in one list, newest day first, newest entry first within a day. */
export function timelineItems(records: PetRecords): Item[] {
  return [
    ...records.entries.map((entry) => ({
      type: "entry" as const,
      date: entry.date,
      createdAt: entry.createdAt,
      entry,
    })),
    ...records.measurements.map((measurement) => ({
      type: "measurement" as const,
      date: measurement.date,
      createdAt: measurement.createdAt,
      measurement,
    })),
  ].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground md:size-9"
    >
      <Pencil className="size-4" aria-hidden />
    </button>
  );
}

function EntryCard({ entry, units, onEdit }: { entry: EntryWithVitals; units: Units; onEdit: () => void }) {
  const Icon = entry.kind === "vet" ? Stethoscope : House;
  const where = [entry.clinic, entry.vet].filter(Boolean).join(" · ");
  const vitals = VITALS.filter((kind) => entry.vitals[kind] != null);
  return (
    <Card className="space-y-3 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-foreground-secondary">
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={entry.kind === "vet" ? "info" : "neutral"}>{ENTRY_KIND_LABEL[entry.kind]}</Badge>
            <span className="tabular-nums text-foreground-secondary">{formatDate(entry.date)}</span>
          </div>
          {entry.reason && <h3 className="mt-1 font-semibold">{entry.reason}</h3>}
          {where && <p className="text-muted-foreground">{where}</p>}
        </div>
        <EditButton
          label={`Edit ${ENTRY_KIND_LABEL[entry.kind].toLowerCase()} of ${formatDate(entry.date)}`}
          onClick={onEdit}
        />
      </div>
      {vitals.length > 0 && (
        <dl className="flex flex-wrap gap-2">
          {vitals.map((kind) => (
            <div key={kind} className="rounded-lg border border-border bg-background-secondary px-2.5 py-1">
              <dt className="text-[11px] text-muted-foreground">{VITAL_LABEL[kind]}</dt>
              <dd className="font-mono text-sm tabular-nums">{formatVital(kind, entry.vitals[kind]!, units)}</dd>
            </div>
          ))}
        </dl>
      )}
      {entry.notes && <p className="whitespace-pre-wrap text-foreground-secondary">{entry.notes}</p>}
      <p className="text-xs text-muted-foreground">Added by {entry.author}</p>
    </Card>
  );
}

function MeasurementRow({
  measurement,
  units,
  onEdit,
}: {
  measurement: MeasurementWithAuthor;
  units: Units;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2">
      <Scale className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p>
          {VITAL_LABEL[measurement.kind]}{" "}
          <span className="font-mono tabular-nums">{formatVital(measurement.kind, measurement.value, units)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(measurement.date)} · {measurement.author}
        </p>
      </div>
      {measurement.kind === "weight" && (
        <EditButton label={`Edit weight of ${formatDate(measurement.date)}`} onClick={onEdit} />
      )}
    </div>
  );
}

export function Timeline({
  records,
  units,
  onEdit,
}: {
  records: PetRecords;
  units: Units;
  onEdit: (editing: Editing) => void;
}) {
  const items = timelineItems(records);
  if (items.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground">
        No records yet. Use “Add record” to log a vet visit, a home exam or a weight.
      </Card>
    );
  }
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.type === "entry" ? `e${item.entry.id}` : `m${item.measurement.id}`}>
          {item.type === "entry" ? (
            <EntryCard entry={item.entry} units={units} onEdit={() => onEdit({ type: "entry", entry: item.entry })} />
          ) : (
            <MeasurementRow
              measurement={item.measurement}
              units={units}
              onEdit={() => onEdit({ type: "weight", measurement: item.measurement })}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
