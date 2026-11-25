import { FileText, HeartPulse, House, Pencil, Pill, Scale, Stethoscope, Syringe } from "lucide-react";
import type { ReactNode } from "react";
import type { PetHealth } from "../../server/routes/health";
import type { LabReportWithResults } from "../../server/routes/labs";
import type {
  AttachmentWithFile,
  EntryWithVitals,
  MeasurementWithAuthor,
  PetRecords,
} from "../../server/routes/records";
import { formatDate, localToday } from "../../shared/dates";
import { CONDITION_KIND_LABEL } from "../../shared/health";
import { ENTRY_KIND_LABEL, formatVital, VITAL_LABEL, VITALS, type Units } from "../../shared/records";
import { FileChip, fileRef } from "./attachments";
import type { HealthEditing } from "./health-tab";
import { LabReportRow } from "./labs";
import { medicationDates, timelineItems, type TimelineItem } from "../lib/timeline-items";
import { Badge } from "./ui/badge";
import { VetLink } from "./vets";
import { Card } from "./ui/card";

export type Editing =
  | { type: "entry"; entry: EntryWithVitals }
  | { type: "weight"; measurement: MeasurementWithAuthor }
  | { type: "file"; attachment: AttachmentWithFile }
  | HealthEditing;

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
          <p className="text-muted-foreground empty:hidden">
            <VetLink vetId={entry.vetId} />
          </p>
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
      {entry.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {entry.attachments.map((a) => (
            <li key={a.id} className="max-w-full">
              <FileChip file={fileRef(a)} />
            </li>
          ))}
        </ul>
      )}
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

function FileRow({ attachment, onEdit }: { attachment: AttachmentWithFile; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <FileChip file={fileRef(attachment)} />
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(attachment.date)} · {attachment.author}
        </p>
      </div>
      <EditButton label={`Edit ${attachment.label ?? attachment.file.originalName}`} onClick={onEdit} />
    </div>
  );
}

/** A vaccine dose, medication or condition: an icon, what it was, then when and by whom. */
function HealthRow({
  icon: Icon,
  title,
  detail,
  author,
  label,
  onEdit,
}: {
  icon: typeof Syringe;
  title: ReactNode;
  detail: ReactNode;
  author: string;
  label: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">{title}</p>
        <p className="text-xs text-muted-foreground">
          {detail} · {author}
        </p>
      </div>
      <EditButton label={label} onClick={onEdit} />
    </div>
  );
}

// Each row is returned with its key; the caller sets it on the wrapper it renders.
/* oxlint-disable react/jsx-key */
function itemRow(
  item: TimelineItem,
  units: Units,
  deceasedOn: string | null,
  onEdit: (editing: Editing) => void,
): [string, ReactNode] {
  switch (item.type) {
    case "entry":
      return [
        `e${item.entry.id}`,
        <EntryCard entry={item.entry} units={units} onEdit={() => onEdit({ type: "entry", entry: item.entry })} />,
      ];
    case "measurement":
      return [
        `m${item.measurement.id}`,
        <MeasurementRow
          measurement={item.measurement}
          units={units}
          onEdit={() => onEdit({ type: "weight", measurement: item.measurement })}
        />,
      ];
    case "file":
      return [
        `f${item.attachment.id}`,
        <FileRow attachment={item.attachment} onEdit={() => onEdit({ type: "file", attachment: item.attachment })} />,
      ];
    case "lab":
      return [`l${item.report.id}`, <LabReportRow report={item.report} />];
    case "vaccination": {
      const v = item.record;
      return [
        `v${v.id}`,
        <HealthRow
          icon={Syringe}
          title={<span className="font-medium">{v.vaccine}</span>}
          detail={
            <>
              Vaccinated {formatDate(v.dateGiven)}
              <VetLink vetId={v.vetId} prefix=" · " />
            </>
          }
          author={v.author}
          label={`Edit ${v.vaccine} of ${formatDate(v.dateGiven)}`}
          onEdit={() => onEdit({ type: "vaccination", record: v })}
        />,
      ];
    }
    case "medication": {
      const m = item.record;
      return [
        `d${m.id}`,
        <HealthRow
          icon={Pill}
          title={
            <>
              <span className="font-medium">{m.drug}</span>
              {m.dose && <span className="text-foreground-secondary">{m.dose}</span>}
            </>
          }
          detail={medicationDates(m, localToday(), deceasedOn)}
          author={m.author}
          label={`Edit ${m.drug}`}
          onEdit={() => onEdit({ type: "medication", record: m })}
        />,
      ];
    }
    case "condition": {
      const c = item.record;
      return [
        `c${c.id}`,
        <HealthRow
          icon={HeartPulse}
          title={
            <>
              <span className="font-medium">{c.title}</span>
              <Badge>{CONDITION_KIND_LABEL[c.kind]}</Badge>
            </>
          }
          detail={`${formatDate(c.date)}${c.resolvedOn ? `, resolved ${formatDate(c.resolvedOn)}` : ""}`}
          author={c.author}
          label={`Edit ${c.title}`}
          onEdit={() => onEdit({ type: "condition", record: c })}
        />,
      ];
    }
  }
}
/* oxlint-enable react/jsx-key */

export function Timeline({
  records,
  labs,
  health,
  units,
  deceasedOn,
  onEdit,
}: {
  records: PetRecords;
  labs: LabReportWithResults[];
  health: PetHealth;
  units: Units;
  deceasedOn: string | null;
  onEdit: (editing: Editing) => void;
}) {
  const items = timelineItems(records, labs, health);
  if (items.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground">
        No records yet. Use “Add record” to log a vet visit, a weight, lab results, a vaccination and more.
      </Card>
    );
  }
  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const [key, row] = itemRow(item, units, deceasedOn, onEdit);
        return <li key={key}>{row}</li>;
      })}
    </ol>
  );
}
