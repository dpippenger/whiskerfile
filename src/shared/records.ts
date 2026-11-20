import { z } from "zod";
import { isIsoDate } from "./dates";

// Measurements are stored in one canonical unit each and converted only for
// display and input: weight in grams, temperature in °C.

export const VITALS = ["weight", "temperature", "heart_rate", "respiratory_rate", "body_condition"] as const;
export type Vital = (typeof VITALS)[number];

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export const TEMPERATURE_UNITS = ["c", "f"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];
export type Units = { weight: WeightUnit; temperature: TemperatureUnit };

const GRAMS_PER_LB = 453.59237;

/** Grams from a weight typed in the given unit, rounded to the gram. */
export function toGrams(value: number, unit: WeightUnit): number {
  return Math.round(unit === "kg" ? value * 1000 : value * GRAMS_PER_LB);
}

/** A stored weight in the given unit, rounded to two decimals. */
export function fromGrams(grams: number, unit: WeightUnit): number {
  return Math.round((unit === "kg" ? grams / 1000 : grams / GRAMS_PER_LB) * 100) / 100;
}

/** °C from a temperature typed in the given unit, rounded to 0.01 °C. */
export function toCelsius(value: number, unit: TemperatureUnit): number {
  return Math.round((unit === "c" ? value : ((value - 32) * 5) / 9) * 100) / 100;
}

/** A stored temperature in the given unit, rounded to one decimal. */
export function fromCelsius(celsius: number, unit: TemperatureUnit): number {
  return Math.round((unit === "c" ? celsius : (celsius * 9) / 5 + 32) * 10) / 10;
}

/** Parses a typed number; "" is null and anything unparseable is NaN, which validation rejects. */
export const parseNumber = (text: string) => (text.trim() === "" ? null : Number(text.replace(",", ".")));

/**
 * The stored value for a field typed in display units. Display text is
 * rounded, so turning it back into a stored value can shift a reading by a few
 * grams or a tenth of a degree; a field the user left exactly as `shown` keeps
 * its `original` stored value. Empty text is null, unparseable text NaN.
 */
export function editedValue(
  text: string,
  shown: string,
  original: number | undefined,
  convert: (n: number) => number,
): number | null {
  if (original !== undefined && text === shown) return original;
  const typed = parseNumber(text);
  return typed == null || Number.isNaN(typed) ? typed : convert(typed);
}

/** Valid range of each vital in its stored unit; outside it is a typo, not a reading. */
export const VITAL_LIMITS: Record<Vital, { min: number; max: number; integer: boolean }> = {
  weight: { min: 1, max: 200_000, integer: true },
  temperature: { min: 25, max: 45, integer: false },
  heart_rate: { min: 10, max: 400, integer: true },
  respiratory_rate: { min: 2, max: 200, integer: true },
  body_condition: { min: 1, max: 9, integer: true },
};

export const VITAL_LABEL: Record<Vital, string> = {
  weight: "Weight",
  temperature: "Temperature",
  heart_rate: "Heart rate",
  respiratory_rate: "Respiratory rate",
  body_condition: "Body condition",
};

/** A stored vital as text in the user's units, e.g. "10.25 lb", "101.5 °F", "180 bpm", "5/9". */
export function formatVital(kind: Vital, value: number, units: Units): string {
  switch (kind) {
    case "weight":
      return `${fromGrams(value, units.weight).toFixed(2)} ${units.weight}`;
    case "temperature":
      return `${fromCelsius(value, units.temperature).toFixed(1)} °${units.temperature.toUpperCase()}`;
    case "heart_rate":
      return `${value} bpm`;
    case "respiratory_rate":
      return `${value} /min`;
    case "body_condition":
      return `${value}/9`;
  }
}

const vitalValue = (kind: Vital) => {
  const { min, max, integer } = VITAL_LIMITS[kind];
  const number = z.number().min(min, "Too low").max(max, "Too high");
  return integer ? number.int() : number;
};

const date = z.string().refine(isIsoDate, "Use a valid date");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();

/** Vitals recorded at a visit or home exam, in stored units. Omitted means not measured. */
export const vitalsInput = z.object({
  weight: vitalValue("weight").nullable().optional(),
  temperature: vitalValue("temperature").nullable().optional(),
  heart_rate: vitalValue("heart_rate").nullable().optional(),
  respiratory_rate: vitalValue("respiratory_rate").nullable().optional(),
  body_condition: vitalValue("body_condition").nullable().optional(),
});

export const ENTRY_KINDS = ["vet", "home"] as const;
export const ENTRY_KIND_LABEL = { vet: "Vet visit", home: "Home exam" } as const;

export const entryInput = z.object({
  kind: z.enum(ENTRY_KINDS),
  date,
  clinic: optionalText(120),
  vet: optionalText(120),
  reason: optionalText(200),
  notes: optionalText(8000),
  vitals: vitalsInput,
  // The visit's attached files. Omitted leaves them as they are; a list replaces them.
  fileIds: z.array(z.number().int().positive()).max(50).optional(),
});

/** A measurement taken on its own, such as a weigh-in at home. */
export const measurementInput = z.object({ date, kind: z.enum(VITALS), value: z.number() }).superRefine((m, ctx) => {
  const result = vitalValue(m.kind).safeParse(m.value);
  if (!result.success) ctx.addIssue({ code: "custom", path: ["value"], message: result.error.issues[0]!.message });
});

/** A file filed under a pet on its own, outside any visit. */
export const attachmentInput = z.object({
  fileId: z.number().int().positive(),
  label: optionalText(120),
  date,
});

export const unitsInput = z.object({
  weightUnit: z.enum(WEIGHT_UNITS).nullable(),
  temperatureUnit: z.enum(TEMPERATURE_UNITS).nullable(),
});
