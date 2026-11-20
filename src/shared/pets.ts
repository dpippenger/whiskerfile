import { z } from "zod";
import { isFutureDate, isIsoDate } from "./dates";

export const SPECIES = ["cat", "dog", "rabbit", "ferret", "bird", "reptile", "other"] as const;
export const SEXES = ["female", "male", "unknown"] as const;
// "altered" is shown as spayed or neutered depending on sex.
export const REPRODUCTIVE = ["altered", "intact", "unknown"] as const;

export const SPECIES_LABEL: Record<(typeof SPECIES)[number], string> = {
  cat: "Cat",
  dog: "Dog",
  rabbit: "Rabbit",
  ferret: "Ferret",
  bird: "Bird",
  reptile: "Reptile",
  other: "Other",
};

export const SEX_LABEL = { female: "Female", male: "Male", unknown: "Unknown" } as const;

export function reproductiveLabel(status: (typeof REPRODUCTIVE)[number], sex: (typeof SEXES)[number]): string {
  if (status === "intact") return "Intact";
  if (status === "unknown") return "Unknown";
  return sex === "female" ? "Spayed" : sex === "male" ? "Neutered" : "Spayed / neutered";
}

/** Each pet gets one of these for its lines in every chart. */
export const CHART_COLORS = [
  "#a855f7",
  "#60a5fa",
  "#f59e0b",
  "#ec4899",
  "#10b981",
  "#f97316",
  "#06b6d4",
  "#eab308",
] as const;

/** The palette colour used by the fewest of the given pets, earliest first on ties. */
export function nextChartColor(inUse: string[]): (typeof CHART_COLORS)[number] {
  const counts = CHART_COLORS.map((color) => inUse.filter((c) => c === color).length);
  return CHART_COLORS[counts.indexOf(Math.min(...counts))]!;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();

// Birth and passing dates have already happened; the Pet_Form refuses anything
// after the user's local today first.
const optionalDate = z
  .string()
  .refine((s) => s === "" || isIsoDate(s), "Use a valid date")
  .refine((s) => !isIsoDate(s) || !isFutureDate(s), "Can't be in the future")
  .transform((s) => s || null)
  .nullable();

export const petInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    species: z.enum(SPECIES),
    breed: optionalText(80),
    sex: z.enum(SEXES),
    reproductive: z.enum(REPRODUCTIVE),
    dob: optionalDate,
    dobEstimated: z.boolean(),
    coatColor: optionalText(80),
    eyeColor: optionalText(40),
    // Assigned by the server when omitted on create; kept when omitted on update.
    chartColor: z.enum(CHART_COLORS).optional(),
    microchip: optionalText(32),
    chipRegistryId: z.number().int().positive().nullable(),
    photoFileId: z.number().int().positive().nullable(),
    notes: optionalText(4000),
    deceasedOn: optionalDate,
  })
  .refine((p) => !p.dob || !p.deceasedOn || p.deceasedOn >= p.dob, {
    path: ["deceasedOn"],
    message: "Must be on or after the birth date",
  });

export type PetInput = z.input<typeof petInput>;

/** An http(s) address the browser's URL parser accepts. */
export function isWebAddress(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "";
}

export const chipRegistryInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((s) => s === "" || isWebAddress(s), "Use a full https:// address")
    .transform((s) => s || null)
    .nullable(),
  phone: optionalText(40),
});

/** AAHA's tool searches the participating US registries for a chip number. */
export const CHIP_LOOKUP_URL = "https://www.aaha.org/petmicrochiplookup";
