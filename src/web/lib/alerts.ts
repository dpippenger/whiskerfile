import type { PetSummary } from "../../server/routes/pets";
import { vaccineStatus } from "../../shared/health";

/**
 * What a pet's dashboard card warns about: vaccines overdue (first) or due
 * soon, and its latest lab report when results on it are out of range.
 * Nothing for a pet that has passed away.
 */
export function petAlerts(pet: Pick<PetSummary, "deceasedOn" | "vaccinations" | "latestLab">, today: string) {
  if (pet.deceasedOn) return { due: [], lab: null };
  const due = vaccineStatus(pet.vaccinations, today)
    .filter((v) => v.status)
    .sort((a, b) => Number(b.status === "overdue") - Number(a.status === "overdue"));
  const lab = pet.latestLab?.flagged.length ? pet.latestLab : null;
  return { due, lab };
}
