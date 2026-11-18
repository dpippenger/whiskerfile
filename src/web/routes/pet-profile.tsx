import { ExternalLink, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import type { Pet } from "../../server/db/schema";
import { formatAge, formatDate, localToday } from "../../shared/dates";
import { CHIP_LOOKUP_URL, reproductiveLabel, SPECIES_LABEL } from "../../shared/pets";
import { Page } from "../components/page";
import { PetPhoto } from "../components/pet-photo";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { usePet, useRegistries } from "../lib/queries";

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

export function PetProfile({ id }: { id: number }) {
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
        <Card className="space-y-4">
          <PetPhoto pet={pet} className="mx-auto aspect-square w-full max-w-56 lg:max-w-none" />
          <div className="flex flex-wrap gap-1.5">
            <Badge>{SPECIES_LABEL[pet.species]}</Badge>
            {age && <Badge className="tabular-nums">{age}</Badge>}
            {pet.deceasedOn && <Badge tone="info">In memory</Badge>}
          </div>
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

        <div className="space-y-4">
          {pet.notes && (
            <Card className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground-secondary">Notes</h2>
              <p className="whitespace-pre-wrap">{pet.notes}</p>
            </Card>
          )}
          <Card className="py-12 text-center text-muted-foreground">
            Visits, home exams, weights and files will appear here.
          </Card>
        </div>
      </div>
    </Page>
  );
}
