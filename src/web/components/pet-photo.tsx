import { Bird, Cat, Dog, PawPrint, Rabbit, Turtle } from "lucide-react";
import type { Pet } from "../../server/db/schema";
import { cn } from "../lib/utils";

const ICONS = { cat: Cat, dog: Dog, rabbit: Rabbit, bird: Bird, reptile: Turtle } as const;

/** The pet's photo, or its species icon when there is none. */
export function PetPhoto({ pet, className }: { pet: Pick<Pet, "name" | "species" | "photoFileId">; className?: string }) {
  if (pet.photoFileId) {
    return (
      <img
        src={`/api/files/${pet.photoFileId}`}
        alt={pet.name}
        className={cn("shrink-0 rounded-xl border border-border bg-elevated object-cover", className)}
      />
    );
  }
  const Icon = ICONS[pet.species as keyof typeof ICONS] ?? PawPrint;
  return (
    <div
      role="img"
      aria-label={pet.name}
      className={cn("flex shrink-0 items-center justify-center rounded-xl border border-border bg-elevated", className)}
    >
      <Icon className="size-1/2 max-h-16 max-w-16 text-muted-foreground" aria-hidden />
    </div>
  );
}
