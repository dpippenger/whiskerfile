import { expect, test } from "bun:test";
import { appointmentInput, calendarEvents, type CalendarData } from "./calendar";

const appointment = (fields: object = {}) => ({
  date: "2026-12-08",
  time: "14:30",
  vetId: null,
  reason: "Dental check",
  notes: "",
  ...fields,
});
const issue = (input: object) => {
  const result = appointmentInput.safeParse(input);
  return result.success ? null : `${result.error.issues[0]!.path.join(".")}: ${result.error.issues[0]!.message}`;
};

test("an appointment needs a real date, past or future, and nothing else", () => {
  expect(appointmentInput.parse(appointment())).toEqual({
    date: "2026-12-08",
    time: "14:30",
    vetId: null,
    reason: "Dental check",
    notes: null,
  });
  expect(issue(appointment({ date: "2999-01-01" }))).toBeNull();
  expect(issue(appointment({ date: "2001-01-01" }))).toBeNull();
  expect(issue(appointment({ date: "2026-02-30" }))).toBe("date: Use a valid date");
  expect(issue(appointment({ date: "" }))).toBe("date: Use a valid date");
  expect(appointmentInput.parse(appointment({ time: "", reason: "  " }))).toMatchObject({ time: null, reason: null });
  expect(appointmentInput.parse(appointment({ time: null, reason: null }))).toMatchObject({ time: null });
  expect(appointmentInput.parse(appointment({ reason: "  Booster " })).reason).toBe("Booster");
});

test("an appointment's time is HH:MM on the 24-hour clock", () => {
  for (const time of ["00:00", "09:05", "23:59"]) expect(issue(appointment({ time }))).toBeNull();
  for (const time of ["24:00", "9:05", "12:60", "2pm", "14:30:00"]) {
    expect(issue(appointment({ time }))).toBe("time: Use a valid time");
  }
});

test("an appointment's text has limits and its vet is an id or nothing", () => {
  expect(issue(appointment({ reason: "x".repeat(201) }))).toStartWith("reason:");
  expect(issue(appointment({ notes: "x".repeat(2001) }))).toStartWith("notes:");
  expect(issue(appointment({ vetId: 3 }))).toBeNull();
  expect(issue(appointment({ vetId: "3" }))).toStartWith("vetId:");
});

const TODAY = "2026-11-26";
const MISO = { id: 1, name: "Miso", chartColor: "#a855f7", deceasedOn: null };
const BISCUIT = { id: 2, name: "Biscuit", chartColor: "#60a5fa", deceasedOn: null };
const booked = (id: number, petId: number, date: string, time: string | null = null, reason: string | null = null) => ({
  id,
  petId,
  date,
  time,
  vetId: null,
  reason,
  notes: null,
});
const data = (fields: Partial<CalendarData>): CalendarData => ({
  pets: [MISO, BISCUIT],
  vaccinations: [],
  medications: [],
  appointments: [],
  ...fields,
});
const summary = (d: CalendarData, today = TODAY) =>
  calendarEvents(d, today).map((e) => `${e.date} ${e.pet.name} ${e.title} ${e.status}`);

test("a vaccine is on the calendar on its latest dose's due date only", () => {
  const events = calendarEvents(
    data({
      vaccinations: [
        // Superseded by the 2026 dose, however overdue its own due date.
        { id: 1, petId: 1, vaccine: "Rabies", dateGiven: "2023-12-01", dueDate: "2024-12-01" },
        { id: 2, petId: 1, vaccine: "rabies ", dateGiven: "2026-01-10", dueDate: "2027-01-10" },
        // The latest dose has no due date: nothing to show.
        { id: 3, petId: 1, vaccine: "FeLV", dateGiven: "2024-05-01", dueDate: "2025-05-01" },
        { id: 4, petId: 1, vaccine: "FeLV", dateGiven: "2025-05-01", dueDate: null },
        { id: 5, petId: 2, vaccine: "DHPP", dateGiven: "2025-11-01", dueDate: "2026-11-01" },
      ],
    }),
    TODAY,
  );
  expect(events.map(({ key, kind, date, time, title, status }) => ({ key, kind, date, time, title, status }))).toEqual([
    { key: "vaccine-5", kind: "vaccine", date: "2026-11-01", time: null, title: "DHPP due", status: "overdue" },
    { key: "vaccine-2", kind: "vaccine", date: "2027-01-10", time: null, title: "rabies  due", status: "upcoming" },
  ]);
  expect(events.map((e) => e.pet)).toEqual([BISCUIT, MISO]);
});

test("a course is on the calendar on its last day, and an appointment on its own", () => {
  const visit = booked(7, 2, "2026-12-08", "14:30", "Dental check");
  const events = calendarEvents(
    data({
      medications: [
        { id: 1, petId: 1, drug: "Amoxicillin", endDate: "2026-12-03" },
        // Ongoing: no last day.
        { id: 2, petId: 1, drug: "Methimazole", endDate: null },
      ],
      appointments: [visit, booked(8, 1, "2026-12-08")],
    }),
    TODAY,
  );
  expect(events).toEqual([
    {
      kind: "medication",
      key: "medication-1",
      date: "2026-12-03",
      time: null,
      pet: MISO,
      title: "Amoxicillin: last day",
      status: "upcoming",
    },
    {
      kind: "appointment",
      key: "appointment-8",
      date: "2026-12-08",
      time: null,
      pet: MISO,
      title: "Appointment",
      status: "upcoming",
      appointment: booked(8, 1, "2026-12-08"),
    },
    {
      kind: "appointment",
      key: "appointment-7",
      date: "2026-12-08",
      time: "14:30",
      pet: BISCUIT,
      title: "Dental check",
      status: "upcoming",
      appointment: visit,
    },
  ]);
});

test("a pet that has passed away has no events, whatever the date of passing", () => {
  const records = {
    vaccinations: [{ id: 1, petId: 1, vaccine: "Rabies", dateGiven: "2026-01-10", dueDate: "2027-01-10" }],
    medications: [{ id: 1, petId: 1, drug: "Amoxicillin", endDate: "2026-12-03" }],
    appointments: [booked(1, 1, "2026-12-08")],
  };
  expect(calendarEvents(data(records), TODAY)).toHaveLength(3);
  for (const deceasedOn of ["2026-11-01", "2027-06-01"]) {
    expect(calendarEvents(data({ ...records, pets: [{ ...MISO, deceasedOn }, BISCUIT] }), TODAY)).toEqual([]);
  }
});

test("statuses follow the given date alone", () => {
  const d = data({
    vaccinations: [{ id: 1, petId: 1, vaccine: "Rabies", dateGiven: "2025-11-26", dueDate: "2026-11-26" }],
    medications: [{ id: 1, petId: 1, drug: "Amoxicillin", endDate: "2026-11-26" }],
    appointments: [booked(1, 1, "2026-11-26", null, "Recheck")],
  });
  // The same rows the day before, on the day and the day after: only the status moves.
  expect(summary(d, "2026-11-25")).toEqual([
    "2026-11-26 Miso Amoxicillin: last day upcoming",
    "2026-11-26 Miso Rabies due upcoming",
    "2026-11-26 Miso Recheck upcoming",
  ]);
  expect(summary(d, "2026-11-26")).toEqual([
    "2026-11-26 Miso Amoxicillin: last day today",
    "2026-11-26 Miso Rabies due today",
    "2026-11-26 Miso Recheck today",
  ]);
  // A vaccine and a visit left behind want something done; a finished course does not.
  expect(summary(d, "2026-11-27")).toEqual([
    "2026-11-26 Miso Amoxicillin: last day past",
    "2026-11-26 Miso Rabies due overdue",
    "2026-11-26 Miso Recheck overdue",
  ]);
  // Far from the server's clock in either direction, the answer is still the caller's.
  expect(summary(d, "1999-01-01").every((line) => line.endsWith("upcoming"))).toBe(true);
  expect(summary(d, "2999-01-01").some((line) => line.endsWith("upcoming"))).toBe(false);
});

test("events are in date order, untimed first, then by time, pet and title", () => {
  const d = data({
    appointments: [
      booked(1, 1, "2026-12-08", "14:30", "Zoomies consult"),
      booked(2, 1, "2026-12-08", "09:00", "Bloods"),
      booked(3, 1, "2026-12-08", null, "Drop off sample"),
      booked(4, 2, "2026-12-08", "09:00", "Booster"),
      booked(5, 2, "2026-12-08", "09:00", "Anal glands"),
      booked(6, 1, "2026-12-01", "17:00", "Nail trim"),
    ],
  });
  expect(calendarEvents(d, TODAY).map((e) => e.title)).toEqual([
    "Nail trim",
    "Drop off sample",
    "Anal glands",
    "Booster",
    "Bloods",
    "Zoomies consult",
  ]);
});
