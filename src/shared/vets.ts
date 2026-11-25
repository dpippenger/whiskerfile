import { z } from "zod";
import { isWebAddress } from "./pets";

// A vet and their practice are one record. Contact details are typed by the
// household; nothing here looks one up or fills one in.

// Digits and the punctuation phone numbers are written with, then an optional extension.
const PHONE = /^(\+?[\d\s().\-/]+?)(?:\s*(?:x|ext\.?)\s*(\d+))?$/i;
const MIN_PHONE_DIGITS = 3;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>.]+$/;

const digits = (s: string) => s.replace(/\D/g, "");

/** A phone number as typed: at least three digits, with spaces, + ( ) - . / and an "x" or "ext" extension. */
export function isPhone(value: string): boolean {
  const number = PHONE.exec(value)?.[1];
  return number != null && digits(number).length >= MIN_PHONE_DIGITS;
}

/** One address of the form name@domain.tld. */
export const isEmail = (value: string) => EMAIL.test(value);

/** The `tel:` address for a stored phone: its digits, a leading "+", and an extension as ";ext=". */
export function telHref(phone: string): string {
  const [, number = phone, ext] = PHONE.exec(phone.trim()) ?? [];
  return `tel:${number.startsWith("+") ? "+" : ""}${digits(number)}${ext ? `;ext=${ext}` : ""}`;
}

const optionalText = (max: number, valid?: [(s: string) => boolean, string]) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => s === "" || !valid || valid[0](s), valid?.[1])
    .transform((s) => s || null)
    .nullable();

export const vetInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  clinic: optionalText(120),
  phone: optionalText(40, [isPhone, "Use a phone number, such as 555 010 0199"]),
  email: optionalText(254, [isEmail, "Use an address like name@example.com"]),
  address: optionalText(300),
  website: optionalText(200, [isWebAddress, "Use a full https:// address"]),
  notes: optionalText(2000),
});

/** A record's link to a saved vet, or null for none. */
export const vetIdInput = z.number().int().positive().nullable();

/** How a vet is named in lists and on records: "Dr. Okafor · Northside Animal Hospital". */
export const vetLabel = (vet: { name: string; clinic: string | null }) =>
  vet.clinic ? `${vet.name} · ${vet.clinic}` : vet.name;
