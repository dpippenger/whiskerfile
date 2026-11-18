import { z } from "zod";
import { addDays, isIsoDate } from "./dates";

// Vaccinations, medications and conditions. Due dates are typed from the
// certificate or the vet's reminder; nothing here derives a schedule or dose.

const date = z.string().refine(isIsoDate, "Use a valid date");
const optionalDate = z
  .string()
  .refine((s) => s === "" || isIsoDate(s), "Use a valid date")
  .transform((s) => s || null)
  .nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();
const required = (max: number, message: string) => z.string().trim().min(1, message).max(max);

export const vaccinationInput = z
  .object({
    vaccine: required(80, "Enter the vaccine"),
    dateGiven: date,
    dueDate: optionalDate,
    lot: optionalText(40),
    clinic: optionalText(120),
    notes: optionalText(2000),
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.dateGiven, {
    path: ["dueDate"],
    message: "Must be on or after the date given",
  });

export const medicationInput = z
  .object({
    drug: required(80, "Enter the medication"),
    dose: optionalText(60),
    frequency: optionalText(60),
    startDate: date,
    endDate: optionalDate,
    reason: optionalText(120),
    notes: optionalText(2000),
  })
  .refine((m) => !m.endDate || m.endDate >= m.startDate, {
    path: ["endDate"],
    message: "Must be on or after the start date",
  });

export const CONDITION_KINDS = ["diagnosis", "allergy", "surgery", "dental", "other"] as const;
export const CONDITION_KIND_LABEL = {
  diagnosis: "Diagnosis",
  allergy: "Allergy",
  surgery: "Surgery",
  dental: "Dental",
  other: "Other",
} as const;

export const conditionInput = z
  .object({
    kind: z.enum(CONDITION_KINDS),
    title: required(120, "Enter a title"),
    date,
    resolvedOn: optionalDate,
    notes: optionalText(2000),
  })
  .refine((c) => !c.resolvedOn || c.resolvedOn >= c.date, {
    path: ["resolvedOn"],
    message: "Must be on or after the date",
  });

/** Common vaccine names, offered as suggestions only. */
export const VACCINE_SUGGESTIONS = [
  "FVRCP",
  "Rabies",
  "FeLV",
  "DHPP",
  "Bordetella",
  "Leptospirosis",
  "Lyme",
  "Canine influenza",
];

/** How a vaccine's name is matched across doses: case, spaces and punctuation ignored. */
export const vaccineKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** How close a due date counts as "due soon". */
export const DUE_SOON_DAYS = 30;

export type DueStatus = "overdue" | "due-soon";

type Dose = { id: number; vaccine: string; dateGiven: string; dueDate: string | null };

/**
 * For each vaccine, its most recent dose and whether that dose's due date has
 * passed or is near. Earlier doses never raise an alert once a newer dose of
 * the same vaccine exists, and nothing is due for a pet that has died.
 */
export function vaccineStatus<D extends Dose>(doses: D[], today: string, deceasedOn: string | null = null) {
  const latest = new Map<string, D>();
  for (const dose of doses) {
    const key = vaccineKey(dose.vaccine);
    const current = latest.get(key);
    const newer =
      !current || dose.dateGiven > current.dateGiven || (dose.dateGiven === current.dateGiven && dose.id > current.id);
    if (newer) latest.set(key, dose);
  }
  return [...latest.values()]
    .map((dose) => {
      let status: DueStatus | null = null;
      if (!deceasedOn && dose.dueDate) {
        if (dose.dueDate < today) status = "overdue";
        else if (dose.dueDate <= addDays(today, DUE_SOON_DAYS)) status = "due-soon";
      }
      return { dose, status };
    })
    .sort((a, b) => a.dose.vaccine.localeCompare(b.dose.vaccine));
}

/** Whether a medication is being given today; none are once the pet has died. */
export function isCurrentMedication(
  m: { startDate: string; endDate: string | null },
  today: string,
  deceasedOn: string | null = null,
): boolean {
  if (deceasedOn && deceasedOn <= today) return false;
  return m.startDate <= today && (m.endDate == null || m.endDate >= today);
}

/** Whether a condition is still active: not yet resolved as of today. */
export const isActiveCondition = (c: { resolvedOn: string | null }, today: string) =>
  c.resolvedOn == null || c.resolvedOn > today;
