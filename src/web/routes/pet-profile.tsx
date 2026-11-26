import {
  CalendarClock,
  ExternalLink,
  FileText,
  FlaskConical,
  HeartPulse,
  House,
  Pencil,
  Pill,
  Plus,
  Scale,
  Stethoscope,
  Syringe,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { Condition, Medication, Pet, Vaccination } from "../../server/db/schema";
import type { CalendarAppointment } from "../../shared/calendar";
import { formatAge, formatDate, localToday } from "../../shared/dates";
import { CHIP_LOOKUP_URL, reproductiveLabel, SEX_LABEL, SPECIES_LABEL } from "../../shared/pets";
import { telHref } from "../../shared/vets";
import { Page } from "../components/page";
import { PetPhoto } from "../components/pet-photo";
import { AppointmentForm, PetAppointments } from "../components/appointment-form";
import { FileForm, FilesTab } from "../components/attachments";
import { ConditionForm, MedicationForm, VaccinationForm } from "../components/health-forms";
import { HealthTab } from "../components/health-tab";
import { ReportButton } from "../components/report-dialog";
import { LabReportView, LabsTab } from "../components/labs";
import { TrendsTab } from "../components/trends-tab";
import { EntryForm, WeightForm } from "../components/record-forms";
import { Timeline, type Editing } from "../components/timeline";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { WeightTab } from "../components/weight-tab";
import { Card } from "../components/ui/card";
import { VetLink } from "../components/vets";
import { useHealth, useLabs, usePet, useRecords, useRegistries, useVets, useWeights } from "../lib/queries";
import { useUnits } from "../lib/units";
import { cn } from "../lib/utils";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function Microchip({ pet }: { pet: Pet }) {
  const registries = useRegistries();
  const registry = registries.data?.find((r) => r.id === pet.chipRegistryId);
  // A registry saved without a chip number still shows.
  if (!pet.microchip && !pet.chipRegistryId) return <span className="text-muted-foreground">None recorded</span>;
  return (
    <span className="flex flex-col items-end gap-1">
      {pet.microchip && <span className="font-mono tabular-nums">{pet.microchip}</span>}
      {registry &&
        (registry.website ? (
          <a
            href={registry.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {registry.name}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <span className="text-foreground-secondary">{registry.name}</span>
        ))}
      {registry?.phone && <span className="text-foreground-secondary tabular-nums">{registry.phone}</span>}
      {pet.microchip && (
        <a
          href={CHIP_LOOKUP_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Look up registry (AAHA)
          <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </span>
  );
}

export type ProfileTab = "timeline" | "weight" | "labs" | "health" | "trends" | "files";

const TABS: { tab: ProfileTab; label: string; path: string }[] = [
  { tab: "timeline", label: "Timeline", path: "" },
  { tab: "weight", label: "Weight", path: "/weight" },
  { tab: "labs", label: "Labs", path: "/labs" },
  { tab: "health", label: "Health", path: "/health" },
  { tab: "trends", label: "Trends", path: "/trends" },
  { tab: "files", label: "Files", path: "/files" },
];

type DialogState =
  | { mode: "choose" }
  | {
      mode: "entry";
      kind: "vet" | "home";
      entry?: Extract<Editing, { type: "entry" }>["entry"];
      /** The appointment a new visit is being recorded from. */
      appointment?: CalendarAppointment;
    }
  | { mode: "appointment"; appointment?: CalendarAppointment }
  | { mode: "weight"; measurement?: Extract<Editing, { type: "weight" }>["measurement"] }
  | { mode: "file"; attachment?: Extract<Editing, { type: "file" }>["attachment"] }
  | { mode: "vaccination"; record?: Vaccination }
  | { mode: "medication"; record?: Medication }
  | { mode: "condition"; record?: Condition }
  | null;

const CHOICES = [
  {
    mode: "entry",
    kind: "vet",
    label: "Vet visit",
    hint: "Findings, vitals and notes from the clinic",
    icon: Stethoscope,
  },
  { mode: "entry", kind: "home", label: "Home exam", hint: "Your own check at home", icon: House },
  { mode: "appointment", kind: "vet", label: "Appointment", hint: "A visit that is booked", icon: CalendarClock },
  { mode: "weight", kind: "vet", label: "Weight", hint: "A quick weigh-in", icon: Scale },
  {
    mode: "labs",
    kind: "vet",
    label: "Lab results",
    hint: "Blood work or urinalysis from a report",
    icon: FlaskConical,
  },
  { mode: "vaccination", kind: "vet", label: "Vaccination", hint: "A dose and when the next is due", icon: Syringe },
  { mode: "medication", kind: "vet", label: "Medication", hint: "A drug, its dose and how often", icon: Pill },
  { mode: "condition", kind: "vet", label: "Condition", hint: "A diagnosis, allergy or procedure", icon: HeartPulse },
  { mode: "file", kind: "vet", label: "File", hint: "A document on its own, such as adoption papers", icon: FileText },
] as const;

function dialogTitle(state: Exclude<DialogState, null>): string {
  if (state.mode === "choose") return "Add record";
  if (state.mode === "appointment") return state.appointment ? "Edit appointment" : "Add appointment";
  if (state.mode === "weight") return state.measurement ? "Edit weight" : "Add weight";
  if (state.mode === "file") return state.attachment ? "Edit file" : "Add file";
  if (state.mode === "vaccination") return state.record ? "Edit vaccination" : "Add vaccination";
  if (state.mode === "medication") return state.record ? "Edit medication" : "Add medication";
  if (state.mode === "condition") return state.record ? "Edit condition" : "Add condition";
  const what = state.kind === "vet" ? "vet visit" : "home exam";
  return state.entry ? `Edit ${what}` : `Add ${what}`;
}

/** The record tabs and the add/edit dialog for one pet. */
function Records({
  petId,
  name,
  color,
  tab,
  reportId,
  deceasedOn,
}: {
  petId: number;
  name: string;
  color: string;
  tab: ProfileTab;
  reportId?: number;
  deceasedOn: string | null;
}) {
  const records = useRecords(petId);
  const health = useHealth(petId);
  const labs = useLabs(petId);
  const weights = useWeights(petId);
  const units = useUnits();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [, navigate] = useLocation();
  const close = () => setDialog(null);

  const edit = (editing: Editing) =>
    setDialog(
      editing.type === "entry"
        ? { mode: "entry", kind: editing.entry.kind, entry: editing.entry }
        : editing.type === "weight"
          ? { mode: "weight", measurement: editing.measurement }
          : editing.type === "file"
            ? { mode: "file", attachment: editing.attachment }
            : ({ mode: editing.type, record: editing.record } as DialogState),
    );

  const error = records.error ?? weights.error ?? labs.error ?? health.error;
  const report = reportId ? labs.data?.find((r) => r.id === reportId) : undefined;
  return (
    <div className="space-y-4">
      {/* Phones: the button gets its own full-width row above tabs that share the width. */}
      <div className="flex flex-col-reverse gap-3 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
        <nav aria-label="Records" className="flex gap-1 overflow-x-auto rounded-lg bg-background-secondary p-1">
          {TABS.map(({ tab: t, label, path }) => (
            <Link
              key={t}
              href={`/pets/${petId}${path}`}
              aria-current={t === tab ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 grow items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground @2xl/main:grow-0 @2xl/main:px-4 md:min-h-9",
                t === tab && "bg-elevated text-foreground shadow-sm",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Button variant="primary" onClick={() => setDialog({ mode: "choose" })}>
          <Plus className="size-4" aria-hidden />
          Add record
        </Button>
      </div>

      {error && <p className="text-danger">{error.message}</p>}
      {/* What is booked sits above what has happened. */}
      {tab === "timeline" && (
        <PetAppointments
          petId={petId}
          deceasedOn={deceasedOn}
          today={localToday()}
          onOpen={(appointment) => setDialog({ mode: "appointment", appointment })}
        />
      )}
      {records.data && labs.data && health.data && tab === "timeline" && (
        <Timeline
          records={records.data}
          labs={labs.data}
          health={health.data}
          units={units}
          deceasedOn={deceasedOn}
          onEdit={edit}
        />
      )}
      {records.data && weights.data && tab === "weight" && (
        <WeightTab weights={weights.data} records={records.data} units={units} color={color} />
      )}
      {labs.data && tab === "labs" && !reportId && <LabsTab petId={petId} reports={labs.data} />}
      {health.data && tab === "health" && <HealthTab health={health.data} deceasedOn={deceasedOn} onEdit={edit} />}
      {labs.data && weights.data && tab === "trends" && (
        <TrendsTab reports={labs.data} weights={weights.data} units={units} color={color} />
      )}
      {labs.data &&
        records.data &&
        tab === "labs" &&
        reportId &&
        (report ? (
          <LabReportView
            petId={petId}
            report={report}
            reports={labs.data}
            visit={records.data.entries.find((e) => e.id === report.entryId)}
          />
        ) : (
          <p className="text-danger">This lab report doesn't exist.</p>
        ))}
      {records.data && tab === "files" && (
        <FilesTab
          records={records.data}
          labs={labs.data ?? []}
          onEdit={(attachment) => edit({ type: "file", attachment })}
        />
      )}

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={dialog ? dialogTitle(dialog) : ""}
        dismissible={dialog?.mode === "choose"}
      >
        {dialog?.mode === "choose" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {CHOICES.map(({ mode, kind, label, hint, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  mode === "labs"
                    ? navigate(`/pets/${petId}/labs/new`)
                    : setDialog(mode === "entry" ? { mode, kind } : { mode })
                }
                className="flex min-h-16 items-center gap-4 rounded-xl border border-border bg-card px-4 text-left transition hover:border-border-strong hover:bg-card-hover"
              >
                <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {dialog?.mode === "entry" && (
          <EntryForm
            petId={petId}
            units={units}
            entry={dialog.entry}
            appointment={dialog.appointment}
            initialKind={dialog.kind}
            // Keeps the title in step when the form switches between vet visit and home exam.
            onKindChange={(kind) => setDialog((d) => (d?.mode === "entry" ? { ...d, kind } : d))}
            onDone={close}
          />
        )}
        {dialog?.mode === "appointment" && (
          <AppointmentForm
            pets={[{ id: petId, name, chartColor: color, deceasedOn }]}
            appointment={dialog.appointment}
            today={localToday()}
            onDone={close}
            onRecordVisit={(appointment) => setDialog({ mode: "entry", kind: "vet", appointment })}
          />
        )}
        {dialog?.mode === "weight" && (
          <WeightForm petId={petId} units={units} measurement={dialog.measurement} onDone={close} />
        )}
        {dialog?.mode === "file" && <FileForm petId={petId} attachment={dialog.attachment} onDone={close} />}
        {dialog?.mode === "vaccination" && <VaccinationForm petId={petId} record={dialog.record} onDone={close} />}
        {dialog?.mode === "medication" && <MedicationForm petId={petId} record={dialog.record} onDone={close} />}
        {dialog?.mode === "condition" && <ConditionForm petId={petId} record={dialog.record} onDone={close} />}
      </Dialog>
    </div>
  );
}

export function PetProfile({ id, tab = "timeline", reportId }: { id: number; tab?: ProfileTab; reportId?: number }) {
  const query = usePet(id);
  const vets = useVets();
  const today = localToday();

  // A non-integer address ("/pets/abc") never loads, so it would render nothing.
  if (query.error || !Number.isInteger(id)) {
    return (
      <Page title="Pet">
        <p className="text-danger">{query.error?.message ?? "Pet not found"}</p>
      </Page>
    );
  }
  const pet = query.data;
  if (!pet) return null;
  const usualVet = vets.data?.find((v) => v.id === pet.vetId);

  const age = pet.dob ? formatAge(pet.dob, pet.deceasedOn ?? today, pet.dobEstimated) : null;
  const badges = (
    <>
      <Badge>{SPECIES_LABEL[pet.species]}</Badge>
      {age && <Badge className="tabular-nums">{age}</Badge>}
      {pet.deceasedOn && <Badge tone="info">In memory</Badge>}
    </>
  );

  return (
    <Page
      title={pet.name}
      actions={
        <div className="flex gap-2">
          <ReportButton petId={pet.id} />
          <Link
            href={`/pets/${pet.id}/edit`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-elevated px-4 text-sm font-medium hover:bg-card-hover md:min-h-9"
          >
            <Pencil className="size-4" aria-hidden />
            Edit
          </Link>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
        {/* Phones: details move below the records, so logging a weight needs no scrolling. */}
        <Card className="space-y-4 max-lg:order-last">
          <PetPhoto pet={pet} className="aspect-square w-full max-lg:hidden" />
          <div className="flex flex-wrap gap-1.5 max-lg:hidden">{badges}</div>
          <h2 className="text-sm font-semibold text-foreground-secondary lg:hidden">Details</h2>
          <dl className="divide-y divide-border">
            {pet.breed && <Detail label="Breed">{pet.breed}</Detail>}
            <Detail label="Sex">{SEX_LABEL[pet.sex]}</Detail>
            <Detail label="Spayed / neutered">{reproductiveLabel(pet.reproductive, pet.sex)}</Detail>
            {pet.dob && (
              <Detail label="Born">
                {pet.dobEstimated && "About "}
                {formatDate(pet.dob)}
              </Detail>
            )}
            {pet.deceasedOn && <Detail label="Passed away">{formatDate(pet.deceasedOn)}</Detail>}
            {pet.coatColor && <Detail label="Coat">{pet.coatColor}</Detail>}
            {pet.eyeColor && <Detail label="Eyes">{pet.eyeColor}</Detail>}
            <Detail label="Microchip">
              <Microchip pet={pet} />
            </Detail>
            {usualVet && (
              <Detail label="Usual vet">
                <span className="flex flex-col items-end gap-1">
                  <VetLink vetId={usualVet.id} />
                  {usualVet.phone && (
                    <a
                      href={telHref(usualVet.phone)}
                      className="text-foreground-secondary tabular-nums hover:underline"
                    >
                      {usualVet.phone}
                    </a>
                  )}
                </span>
              </Detail>
            )}
          </dl>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-4 lg:hidden">
            <PetPhoto pet={pet} className="size-20" />
            <div className="flex flex-wrap gap-1.5">{badges}</div>
          </div>
          {pet.notes && (
            <Card className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground-secondary">Notes</h2>
              <p className="whitespace-pre-wrap">{pet.notes}</p>
            </Card>
          )}
          <Records
            petId={pet.id}
            name={pet.name}
            color={pet.chartColor}
            tab={tab}
            reportId={reportId}
            deceasedOn={pet.deceasedOn}
          />
        </div>
      </div>
    </Page>
  );
}
