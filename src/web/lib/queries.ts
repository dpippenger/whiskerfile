import { useQuery } from "@tanstack/react-query";
import type { Analyte, ChipRegistry, Measurement, Pet, User } from "../../server/db/schema";
import type { LabReportWithResults } from "../../server/routes/labs";
import type { PetSummary } from "../../server/routes/pets";
import type { PetRecords } from "../../server/routes/records";
import { api } from "./api";

export const usePets = () => useQuery({ queryKey: ["pets"], queryFn: () => api<PetSummary[]>("/pets") });

export const usePet = (id: number) =>
  useQuery({ queryKey: ["pets", id], queryFn: () => api<Pet>(`/pets/${id}`), enabled: Number.isInteger(id) });

/** Visits, home exams and standalone readings for one pet, newest first. */
export const useRecords = (petId: number) =>
  useQuery({ queryKey: ["pets", petId, "records"], queryFn: () => api<PetRecords>(`/pets/${petId}/records`) });

/** Every weight for one pet, oldest first. */
export const useWeights = (petId: number) =>
  useQuery({
    queryKey: ["pets", petId, "weights"],
    queryFn: () => api<Measurement[]>(`/pets/${petId}/measurements?kind=weight`),
  });

export const useRegistries = () =>
  useQuery({ queryKey: ["chip-registries"], queryFn: () => api<ChipRegistry[]>("/chip-registries") });

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<User>("/me") });

/** A pet's lab reports, newest first. */
export const useLabs = (petId: number) =>
  useQuery({ queryKey: ["pets", petId, "labs"], queryFn: () => api<LabReportWithResults[]>(`/pets/${petId}/labs`) });

export const useAnalytes = () => useQuery({ queryKey: ["analytes"], queryFn: () => api<Analyte[]>("/analytes") });
