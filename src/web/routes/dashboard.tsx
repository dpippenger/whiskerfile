import { PawPrint, Plus } from "lucide-react";
import { Link } from "wouter";
import type { PetSummary } from "../../server/routes/pets";
import { formatAge, formatDate, localToday } from "../../shared/dates";
import { reproductiveLabel, SPECIES_LABEL } from "../../shared/pets";
import { fromGrams, type Units } from "../../shared/records";
import { Page } from "../components/page";
import { PetPhoto } from "../components/pet-photo";
import { Sparkline } from "../components/sparkline";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { usePets } from "../lib/queries";
import { useUnits } from "../lib/units";

const ADD_PET =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition duration-200 hover:-translate-y-px hover:shadow-lg md:min-h-9";

function WeightLine({ pet, units }: { pet: PetSummary; units: Units }) {
  const values = pet.weights.map((w) => fromGrams(w.value, units.weight));
  const latest = values.at(-1);
  if (latest === undefined) return null;
  const previous = values.at(-2);
  const diff = previous === undefined ? null : latest - previous;
  return (
    <div className="flex items-center gap-3 border-t border-border pt-3">
      <div className="min-w-0 flex-1">
        <p>
          <span className="font-mono font-semibold tabular-nums">{latest.toFixed(2)}</span>{" "}
          <span className="text-muted-foreground">{units.weight}</span>
          {diff !== null && Math.abs(diff) >= 0.005 && (
            <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
              {diff > 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(2)}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(pet.weights.at(-1)!.date)}</p>
      </div>
      <Sparkline values={values} color={pet.chartColor} className="h-8 w-24 shrink-0" />
    </div>
  );
}

function PetCard({ pet, today, units }: { pet: PetSummary; today: string; units: Units }) {
  const age = pet.dob ? formatAge(pet.dob, pet.deceasedOn ?? today, pet.dobEstimated) : null;
  const kind = [SPECIES_LABEL[pet.species], pet.breed].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/pets/${pet.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition duration-200 hover:border-border-strong hover:bg-card-hover"
    >
      <div className="flex gap-4">
        <PetPhoto pet={pet} className="size-20 md:size-24" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: pet.chartColor }} aria-hidden />
            <h2 className="truncate text-base font-semibold">{pet.name}</h2>
          </div>
          <p className="truncate text-muted-foreground">{kind}</p>
          <div className="flex flex-wrap gap-1.5">
            {age && <Badge className="tabular-nums">{age}</Badge>}
            {pet.sex !== "unknown" && <Badge>{pet.sex === "female" ? "Female" : "Male"}</Badge>}
            {pet.reproductive !== "unknown" && <Badge>{reproductiveLabel(pet.reproductive, pet.sex)}</Badge>}
            {pet.deceasedOn && <Badge tone="info">In memory · {formatDate(pet.deceasedOn)}</Badge>}
          </div>
          {pet.lastVetVisit && (
            <p className="text-xs text-muted-foreground">Last vet visit {formatDate(pet.lastVetVisit)}</p>
          )}
        </div>
      </div>
      <WeightLine pet={pet} units={units} />
    </Link>
  );
}

export function Dashboard() {
  const pets = usePets();
  const today = localToday();
  const units = useUnits();
  // Living pets first; each group stays in name order from the API.
  const sorted = [...(pets.data ?? [])].sort((a, b) => Number(!!a.deceasedOn) - Number(!!b.deceasedOn));

  return (
    <Page
      title="Pets"
      actions={
        !!pets.data?.length && (
          <Link href="/pets/new" className={ADD_PET}>
            <Plus className="size-4" aria-hidden />
            Add pet
          </Link>
        )
      }
    >
      {pets.error && <p className="text-danger">{pets.error.message}</p>}
      {pets.data?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <PawPrint className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-base font-semibold">No pets yet</p>
          <p className="max-w-sm text-muted-foreground">Add your first pet to start keeping their records.</p>
          <Link href="/pets/new" className={ADD_PET}>
            <Plus className="size-4" aria-hidden />
            Add pet
          </Link>
        </Card>
      )}
      {/* Columns follow the content width, not the viewport, so the sidebar can't squeeze them. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl/main:grid-cols-2 @6xl/main:grid-cols-3">
        {sorted.map((pet) => (
          <PetCard key={pet.id} pet={pet} today={today} units={units} />
        ))}
      </div>
    </Page>
  );
}
