import { useQuery } from "@tanstack/react-query";
import type { ChipRegistry, Pet, User } from "../../server/db/schema";
import { api } from "./api";

export const usePets = () => useQuery({ queryKey: ["pets"], queryFn: () => api<Pet[]>("/pets") });

export const usePet = (id: number) =>
  useQuery({ queryKey: ["pets", id], queryFn: () => api<Pet>(`/pets/${id}`), enabled: Number.isInteger(id) });

export const useRegistries = () =>
  useQuery({ queryKey: ["chip-registries"], queryFn: () => api<ChipRegistry[]>("/chip-registries") });

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<User>("/me") });
