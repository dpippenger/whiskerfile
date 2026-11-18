import { PawPrint, Plus } from "lucide-react";
import { Link } from "wouter";
import type { Pet } from "../../server/db/schema";
import { formatAge, formatDate, localToday } from "../../shared/dates";
import { reproductiveLabel, SPECIES_LABEL } from "../../shared/pets";
import { Page } from "../components/page";
import { PetPhoto } from "../components/pet-photo";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { usePets } from "../lib/queries";

const ADD_PET =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition duration-200 hover:-translate-y-px hover:shadow-lg md:min-h-9";

function PetCard({ pet, today }: { pet: Pet; today: string }) {
  const age = pet.dob ? formatAge(pet.dob, pet.deceasedOn ?? today, pet.dobEstimated) : null;
  const kind = [SPECIES_LABEL[pet.species], pet.breed].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/pets/${pet.id}`}
      className="group flex gap-4 rounded-xl border border-border bg-card p-4 transition duration-200 hover:border-border-strong hover:bg-card-hover"
    >
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
      </div>
    </Link>
  );
}

export function Dashboard() {
  const pets = usePets();
  const today = localToday();
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {sorted.map((pet) => (
          <PetCard key={pet.id} pet={pet} today={today} />
        ))}
      </div>
    </Page>
  );
}
