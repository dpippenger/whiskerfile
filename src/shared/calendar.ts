import { z } from "zod";
import { isIsoDate } from "./dates";
import { vaccineStatus } from "./health";
import { vetIdInput } from "./vets";

// The calendar lists dates the household typed: a vaccine's due date, a
// course's last day, an appointment. Nothing here derives a schedule, and
// every status comes from the `today` the caller passes (the browser's own).

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();

/** A visit that is booked but has not happened; its day may be past or future. */
export const appointmentInput = z.object({
  date: z.string().refine(isIsoDate, "Use a valid date"),
  // Clock time at the clinic, "HH:MM"; empty when only the day is known.
  time: z
    .string()
    .refine((s) => s === "" || TIME.test(s), "Use a valid time")
    .transform((s) => s || null)
    .nullable(),
  vetId: vetIdInput,
  reason: optionalText(200),
  notes: optionalText(2000),
});

export type CalendarPet = { id: number; name: string; chartColor: string; deceasedOn: string | null };
export type CalendarAppointment = {
  id: number;
  petId: number;
  date: string;
  time: string | null;
  vetId: number | null;
  reason: string | null;
  notes: string | null;
};

/** What `GET /api/calendar` returns: stored rows for every pet, with no status. */
export type CalendarData = {
  pets: CalendarPet[];
  vaccinations: { id: number; petId: number; vaccine: string; dateGiven: string; dueDate: string | null }[];
  /** Courses that have an end date. */
  medications: { id: number; petId: number; drug: string; endDate: string | null }[];
  appointments: CalendarAppointment[];
};

/** `overdue` wants something done (a vaccine to book, a visit to record); `past` does not. */
export type EventStatus = "overdue" | "past" | "today" | "upcoming";

export type CalendarEvent = {
  /** Unique across kinds, e.g. "vaccine-12". */
  key: string;
  date: string;
  time: string | null;
  pet: CalendarPet;
  title: string;
  status: EventStatus;
} & ({ kind: "vaccine" } | { kind: "medication" } | { kind: "appointment"; appointment: CalendarAppointment });

/**
 * Every dated thing coming up or just gone for the living pets, in date order:
 * the due date of each vaccine's latest dose (the dashboard's rule), the last
 * day of each course, and each appointment. A pet with a date of passing has
 * no events.
 */
export function calendarEvents(data: CalendarData, today: string): CalendarEvent[] {
  const status = (date: string, late: EventStatus): EventStatus =>
    date < today ? late : date === today ? "today" : "upcoming";
  const events: CalendarEvent[] = [];
  for (const pet of data.pets) {
    if (pet.deceasedOn) continue;
    const doses = data.vaccinations.filter((v) => v.petId === pet.id);
    for (const { dose } of vaccineStatus(doses, today)) {
      if (!dose.dueDate) continue;
      events.push({
        kind: "vaccine",
        key: `vaccine-${dose.id}`,
        date: dose.dueDate,
        time: null,
        pet,
        title: `${dose.vaccine} due`,
        status: status(dose.dueDate, "overdue"),
      });
    }
    for (const course of data.medications) {
      if (course.petId !== pet.id || !course.endDate) continue;
      events.push({
        kind: "medication",
        key: `medication-${course.id}`,
        date: course.endDate,
        time: null,
        pet,
        title: `${course.drug}: last day`,
        status: status(course.endDate, "past"),
      });
    }
    for (const appointment of data.appointments) {
      if (appointment.petId !== pet.id) continue;
      events.push({
        kind: "appointment",
        key: `appointment-${appointment.id}`,
        date: appointment.date,
        time: appointment.time,
        pet,
        title: appointment.reason ?? "Appointment",
        status: status(appointment.date, "overdue"),
        appointment,
      });
    }
  }
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.pet.name.localeCompare(b.pet.name) ||
      a.title.localeCompare(b.title),
  );
}
