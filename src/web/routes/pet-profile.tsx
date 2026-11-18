import { ExternalLink, House, Pencil, Plus, Scale, Stethoscope } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import type { Pet } from "../../server/db/schema";
import { formatAge, formatDate, localToday } from "../../shared/dates";
import { CHIP_LOOKUP_URL, reproductiveLabel, SPECIES_LABEL } from "../../shared/pets";
import { Page } from "../components/page";
import { PetPhoto } from "../components/pet-photo";
import { EntryForm, WeightForm } from "../components/record-forms";
import { Timeline, type Editing } from "../components/timeline";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { WeightTab } from "../components/weight-tab";
import { Card } from "../components/ui/card";
import { usePet, useRecords, useRegistries, useWeights } from "../lib/queries";
import { useUnits } from "../lib/units";
import { cn } from "../lib/utils";

const SEX_LABEL = { female: "Female", male: "Male", unknown: "Unknown" } as const;

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
  if (!pet.microchip) return <span className="text-muted-foreground">None recorded</span>;
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="font-mono tabular-nums">{pet.microchip}</span>
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
      <a
        href={CHIP_LOOKUP_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Look up registry (AAHA)
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </span>
  );
}

export type ProfileTab = "timeline" | "weight";

const TABS: { tab: ProfileTab; label: string; path: string }[] = [
  { tab: "timeline", label: "Timeline", path: "" },
  { tab: "weight", label: "Weight", path: "/weight" },
];

type DialogState =
  | { mode: "choose" }
  | { mode: "entry"; kind: "vet" | "home"; entry?: Extract<Editing, { type: "entry" }>["entry"] }
  | { mode: "weight"; measurement?: Extract<Editing, { type: "weight" }>["measurement"] }
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
  { mode: "weight", kind: "vet", label: "Weight", hint: "A quick weigh-in", icon: Scale },
] as const;

function dialogTitle(state: Exclude<DialogState, null>): string {
  if (state.mode === "choose") return "Add record";
  if (state.mode === "weight") return state.measurement ? "Edit weight" : "Add weight";
  const what = state.kind === "vet" ? "vet visit" : "home exam";
  return state.entry ? `Edit ${what}` : `Add ${what}`;
}

/** The record tabs and the add/edit dialog for one pet. */
function Records({ petId, color, tab }: { petId: number; color: string; tab: ProfileTab }) {
  const records = useRecords(petId);
  const weights = useWeights(petId);
  const units = useUnits();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  const edit = (editing: Editing) =>
    setDialog(
      editing.type === "entry"
        ? { mode: "entry", kind: editing.entry.kind, entry: editing.entry }
        : { mode: "weight", measurement: editing.measurement },
    );

  const error = records.error ?? weights.error;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <nav aria-label="Records" className="flex gap-1 rounded-lg bg-background-secondary p-1">
          {TABS.map(({ tab: t, label, path }) => (
            <Link
              key={t}
              href={`/pets/${petId}${path}`}
              aria-current={t === tab ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-muted-foreground md:min-h-9",
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
      {records.data && tab === "timeline" && <Timeline records={records.data} units={units} onEdit={edit} />}
      {records.data && weights.data && tab === "weight" && (
        <WeightTab weights={weights.data} records={records.data} units={units} color={color} />
      )}

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={dialog ? dialogTitle(dialog) : ""}
        dismissible={dialog?.mode === "choose"}
      >
        {dialog?.mode === "choose" && (
          <div className="grid gap-2">
            {CHOICES.map(({ mode, kind, label, hint, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => setDialog(mode === "weight" ? { mode } : { mode, kind })}
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
          <EntryForm petId={petId} units={units} entry={dialog.entry} initialKind={dialog.kind} onDone={close} />
        )}
        {dialog?.mode === "weight" && (
          <WeightForm petId={petId} units={units} measurement={dialog.measurement} onDone={close} />
        )}
      </Dialog>
    </div>
  );
}

export function PetProfile({ id, tab = "timeline" }: { id: number; tab?: ProfileTab }) {
  const query = usePet(id);
  const today = localToday();

  if (query.error) {
    return (
      <Page title="Pet">
        <p className="text-danger">{query.error.message}</p>
      </Page>
    );
  }
  const pet = query.data;
  if (!pet) return null;

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
        <Link
          href={`/pets/${pet.id}/edit`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-elevated px-4 text-sm font-medium hover:bg-card-hover md:min-h-9"
        >
          <Pencil className="size-4" aria-hidden />
          Edit
        </Link>
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
          <Records petId={pet.id} color={pet.chartColor} tab={tab} />
        </div>
      </div>
    </Page>
  );
}
