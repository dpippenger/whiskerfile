import { useQuery } from "@tanstack/react-query";
import type { Analyte, ChipRegistry, Measurement, Pet, User, Vet } from "../../server/db/schema";
import type { LabReportWithResults } from "../../server/routes/labs";
import type { PetSummary } from "../../server/routes/pets";
import type { PetHealth } from "../../server/routes/health";
import type { PetRecords } from "../../server/routes/records";
import type { MetricOption } from "../../server/routes/series";
import type { VetWithRecords } from "../../server/routes/vets";
import type { CalendarData } from "../../shared/calendar";
import type { ComparePet } from "../../shared/series";
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

/** Every saved vet, by name. */
export const useVets = () => useQuery({ queryKey: ["vets"], queryFn: () => api<Vet[]>("/vets") });

/** One vet with the records linked to it. */
export const useVet = (id: number) =>
  useQuery({
    queryKey: ["vets", id],
    queryFn: () => api<VetWithRecords>(`/vets/${id}`),
    enabled: Number.isInteger(id),
  });

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<User>("/me") });

/** A pet's lab reports, newest first. */
export const useLabs = (petId: number) =>
  useQuery({ queryKey: ["pets", petId, "labs"], queryFn: () => api<LabReportWithResults[]>(`/pets/${petId}/labs`) });

export const useAnalytes = () => useQuery({ queryKey: ["analytes"], queryFn: () => api<Analyte[]>("/analytes") });

/** What pets can be compared on. */
export const useMetrics = () =>
  useQuery({ queryKey: ["series", "metrics"], queryFn: () => api<MetricOption[]>("/series/metrics") });

/** Every pet's weights (grams) or results for one test. */
export const useSeries = (metric: string | null) =>
  useQuery({
    queryKey: ["series", metric],
    queryFn: () => api<ComparePet[]>(`/series?metric=${encodeURIComponent(metric!)}`),
    enabled: metric != null,
  });

/** A pet's vaccinations, medications and conditions. */
export const useHealth = (petId: number) =>
  useQuery({ queryKey: ["pets", petId, "health"], queryFn: () => api<PetHealth>(`/pets/${petId}/health`) });

/** Every pet's dated records; the calendar works out what is due from the browser's date. */
export const useCalendar = () => useQuery({ queryKey: ["calendar"], queryFn: () => api<CalendarData>("/calendar") });
