import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { queries, within } from "@testing-library/react/pure";
import { afterAll, afterEach, beforeAll, expect, setSystemTime, test } from "bun:test";
import { eq } from "drizzle-orm";
import { appointments, entries } from "../../server/db/schema";
import { startApi } from "../../server/test-support";

// The Calendar screen rendered in a DOM and wired to the real API in process.
// The screen takes its `today` as a prop, so each test names the day it is.
// Without a stylesheet both layouts are in the document, so the tests read the
// agenda (the phone's list) and the "Needs attention" block by name.

let rtl: typeof import("@testing-library/react/pure");
let Calendar: typeof import("./calendar").Calendar;
let PetProfile: typeof import("./pet-profile").PetProfile;
let wouter: typeof import("wouter");
let memoryLocation: typeof import("wouter/memory-location").memoryLocation;
let page: ReturnType<typeof within<typeof queries>>;

const globals = globalThis as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  // Only the DOM comes from happy-dom; see lab-form.test.tsx.
  const native = {
    fetch,
    Request,
    Response,
    Headers,
    FormData,
    File,
    Blob,
    URL,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    queueMicrotask,
    MessageChannel,
  };
  GlobalRegistrator.register({ url: "http://whiskerfile.test/calendar" });
  Object.assign(globalThis, native);
  rtl = await import("@testing-library/react/pure");
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  ({ Calendar } = await import("./calendar"));
  ({ PetProfile } = await import("./pet-profile"));
  wouter = await import("wouter");
  ({ memoryLocation } = await import("wouter/memory-location"));
});

afterEach(() => {
  rtl.cleanup();
  globalThis.fetch = realFetch;
  setSystemTime();
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

const TODAY = "2026-11-26";

const pet = (name: string, deceasedOn: string | null = null) => ({
  name,
  species: "cat",
  breed: null,
  sex: "female",
  reproductive: "altered",
  dob: null,
  dobEstimated: false,
  coatColor: null,
  eyeColor: null,
  microchip: null,
  chipRegistryId: null,
  photoFileId: null,
  vetId: null,
  notes: null,
  deceasedOn,
});
const booked = (date: string, time: string, reason: string) => ({ date, time, vetId: null, reason, notes: "" });

/**
 * The Calendar on `today` (null: whatever the clock says) at `address`, or
 * Miso's page (`view` "pet", always on the clock's day), for a household with Miso (a vaccine
 * overdue since October, a visit on Nov 20 and one on Dec 8), Zeus (a course
 * ending Nov 30) and Pepper, who has passed away but still has rows.
 */
async function open(today: string | null = TODAY, address = "/calendar", view: "calendar" | "pet" = "calendar") {
  const api = await startApi();
  const { call } = api;
  const post = async (path: string, body: object) =>
    ((await (await call(path, { method: "POST", body })).json()) as { id: number }).id;
  globalThis.fetch = ((path: string, init?: RequestInit) =>
    call(path, {
      method: init?.method,
      ...(typeof init?.body === "string" ? { raw: init.body } : { body: init?.body ?? undefined }),
    })) as unknown as typeof fetch;

  const miso = await post("/api/pets", pet("Miso"));
  const zeus = await post("/api/pets", pet("Zeus"));
  const pepper = await post("/api/pets", pet("Pepper", "2022-01-12"));
  const dose = { vaccine: "Rabies", dateGiven: "2025-10-22", dueDate: "2026-10-22", lot: "", vetId: null, notes: "" };
  await post(`/api/pets/${miso}/vaccinations`, dose);
  await post(`/api/pets/${pepper}/vaccinations`, { ...dose, dateGiven: "2019-06-01", dueDate: "2020-06-01" });
  await post(`/api/pets/${zeus}/medications`, {
    drug: "Amoxicillin",
    dose: "",
    frequency: "",
    startDate: "2026-11-20",
    endDate: "2026-11-30",
    reason: "",
    notes: "",
  });
  const recheck = await post(`/api/pets/${miso}/appointments`, booked("2026-11-20", "", "Blood pressure recheck"));
  await post(`/api/pets/${miso}/appointments`, booked("2026-12-08", "14:30", "Thyroid recheck"));
  await post(`/api/pets/${pepper}/appointments`, booked("2026-11-27", "", "Pepper's check-up"));

  // An address held in memory: the router's own listens to the window it was
  // first imported under, which is another test file's.
  const route = memoryLocation({ path: address, record: true });
  page = rtl.within(document.body);
  rtl.render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <wouter.Router hook={route.hook} searchHook={route.searchHook}>
        {view === "calendar" ? <Calendar today={today ?? undefined} /> : <PetProfile id={miso} />}
      </wouter.Router>
    </QueryClientProvider>,
  );
  /** Every address visited, oldest first. */
  const visited = route.history!;
  // The pet filter fills in once the calendar has loaded; a pet's page lists its appointments.
  if (view === "calendar") await page.findByRole("option", { name: "Miso" });
  else await page.findByRole("list", { name: "Appointments" });

  const texts = (list: HTMLElement) => rtl.within(list).queryAllByRole("listitem");
  /** The agenda as text: each day's heading followed by its events. */
  const agenda = () =>
    [...page.getByRole("list", { name: "Agenda" }).children].map((day) => day.textContent!.replace(/\s+/g, " "));
  const attention = () => page.queryByRole("region", { name: "Needs attention" });
  const inAgenda = () => rtl.within(page.getByRole("list", { name: "Agenda" }));
  const dialog = (name: string) => rtl.within(page.getByRole("dialog", { name }));
  return { ...api, miso, zeus, recheck, visited, texts, agenda, attention, inAgenda, dialog };
}

test("the month lists living pets' events, and what is late is called out", async () => {
  const screen = await open();

  expect(page.getByRole("heading", { level: 2, name: /November 2026/ })).toBeTruthy();
  const agenda = screen.agenda();
  expect(agenda).toHaveLength(2);
  expect(agenda[0]).toMatch(/Nov(ember)? 20.*Blood pressure recheck.*Miso.*Not recorded/);
  expect(agenda[1]).toMatch(/Nov(ember)? 30.*Amoxicillin: last day.*Zeus/);
  // Nothing for Pepper, who has passed away, in the list or the filter.
  expect(document.body.textContent).not.toContain("Pepper");

  // Late across every month, oldest first: October's vaccine is listed while November is shown.
  const late = screen.texts(screen.attention()!).map((item) => item.textContent);
  expect(late).toHaveLength(2);
  expect(late[0]).toMatch(/Rabies due.*Miso.*Oct.*22.*Overdue/);
  expect(late[1]).toMatch(/Blood pressure recheck.*Miso.*Nov.*20.*Not recorded/);
});

test("what is late depends only on the day the browser says it is", async () => {
  // The same records a month and a half earlier: nothing is late yet.
  const screen = await open("2026-10-10");
  expect(page.getByRole("heading", { level: 2, name: /October 2026/ })).toBeTruthy();
  expect(screen.attention()).toBeNull();
  expect(screen.agenda()).toHaveLength(1);
  expect(screen.agenda()[0]).toMatch(/Oct(ober)? 22.*Rabies due.*Miso$/);
});

test("the month comes from the address and steps with the buttons", async () => {
  const screen = await open(TODAY, "/calendar?month=2026-12");
  expect(page.getByRole("heading", { level: 2, name: /December 2026/ })).toBeTruthy();
  expect(screen.agenda()).toHaveLength(1);
  expect(screen.agenda()[0]).toMatch(/Dec(ember)? 8.*Thyroid recheck.*Miso.*(2:30|14:30)/);
  // What is late stays in view whatever month is shown.
  expect(screen.texts(screen.attention()!)).toHaveLength(2);

  rtl.fireEvent.click(page.getByRole("button", { name: "Next month" }));
  expect(page.getByRole("heading", { level: 2, name: /January 2027/ })).toBeTruthy();
  expect(screen.visited).toEqual(["/calendar?month=2026-12", "/calendar?month=2027-01"]);
  expect(screen.agenda()).toEqual([]);
  expect(page.getByText("Nothing this month.")).toBeTruthy();

  rtl.fireEvent.click(page.getByRole("button", { name: "Today" }));
  expect(page.getByRole("heading", { level: 2, name: /November 2026/ })).toBeTruthy();
  expect(screen.visited.at(-1)).toBe("/calendar");
  rtl.fireEvent.click(page.getByRole("button", { name: "Previous month" }));
  expect(screen.visited.at(-1)).toBe("/calendar?month=2026-10");
  // Each step is its own entry, so Back returns to the month before.
  expect(screen.visited).toHaveLength(4);
});

test("an address that names no month shows the current one", async () => {
  await open(TODAY, "/calendar?month=2026-13");
  expect(page.getByRole("heading", { level: 2, name: /November 2026/ })).toBeTruthy();
});

test("the pet filter narrows the month and the late list, and stays in the address", async () => {
  const screen = await open();
  const filter = page.getByRole<HTMLSelectElement>("combobox", { name: "Pet" });
  expect([...filter.options].map((o) => o.textContent)).toEqual(["All pets", "Miso", "Zeus"]);

  rtl.fireEvent.change(filter, { target: { value: String(screen.zeus) } });
  // The choice replaces the address rather than adding a step to go back through.
  expect(screen.visited).toEqual([`/calendar?pet=${screen.zeus}`]);
  expect(screen.agenda()).toHaveLength(1);
  expect(screen.agenda()[0]).toContain("Amoxicillin: last day");
  // Zeus has nothing late.
  expect(screen.attention()).toBeNull();

  rtl.fireEvent.change(filter, { target: { value: String(screen.miso) } });
  expect(screen.agenda()).toHaveLength(1);
  expect(screen.agenda()[0]).toContain("Blood pressure recheck");
  expect(screen.texts(screen.attention()!)).toHaveLength(2);

  rtl.fireEvent.change(filter, { target: { value: "" } });
  expect(screen.visited).toEqual(["/calendar"]);
  expect(screen.agenda()).toHaveLength(2);
});

test("an event opens the record it came from", async () => {
  const screen = await open();
  const health = `/pets/${screen.miso}/health`;
  const vaccine = rtl.within(screen.attention()!).getByRole("link", { name: /Rabies due/ });
  expect(vaccine.getAttribute("href")).toBe(health);
  const course = screen.inAgenda().getByRole("link", { name: /Amoxicillin: last day/ });
  expect(course.getAttribute("href")).toBe(`/pets/${screen.zeus}/health`);

  rtl.fireEvent.click(screen.inAgenda().getByRole("button", { name: /Blood pressure recheck/ }));
  const form = screen.dialog("Edit appointment");
  expect((form.getByLabelText("Reason") as HTMLInputElement).value).toBe("Blood pressure recheck");
  expect((form.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-11-20");
  // An appointment stays on its pet.
  expect((form.getByLabelText("Pet") as HTMLSelectElement).disabled).toBe(true);
});

test("an appointment can be added and deleted from the calendar", async () => {
  const screen = await open();
  rtl.fireEvent.change(page.getByRole("combobox", { name: "Pet" }), { target: { value: String(screen.zeus) } });
  rtl.fireEvent.click(page.getByRole("button", { name: "Add appointment" }));
  const form = screen.dialog("Add appointment");
  // Pre-filled with the filtered pet and the browser's date.
  expect((form.getByLabelText("Pet") as HTMLSelectElement).value).toBe(String(screen.zeus));
  expect((form.getByLabelText("Date") as HTMLInputElement).value).toBe(TODAY);

  // A date the schema refuses is marked and nothing is sent.
  rtl.fireEvent.change(form.getByLabelText("Date"), { target: { value: "" } });
  rtl.fireEvent.click(form.getByRole("button", { name: "Save" }));
  expect(form.getByText("Use a valid date")).toBeTruthy();
  expect(form.getByText("Check the highlighted fields.")).toBeTruthy();

  rtl.fireEvent.change(form.getByLabelText("Date"), { target: { value: "2026-11-28" } });
  rtl.fireEvent.change(form.getByLabelText("Time"), { target: { value: "09:15" } });
  rtl.fireEvent.change(form.getByLabelText("Reason"), { target: { value: "Nail trim" } });
  rtl.fireEvent.click(form.getByRole("button", { name: "Save" }));

  // Saved, the dialog closes and the refetched month shows it.
  const added = await screen.inAgenda().findByRole("button", { name: /Nail trim/ });
  expect(page.queryByRole("dialog", { name: "Add appointment" })).toBeNull();
  expect(screen.db.select().from(appointments).all()).toContainEqual(
    expect.objectContaining({ petId: screen.zeus, date: "2026-11-28", time: "09:15", reason: "Nail trim" }),
  );

  rtl.fireEvent.click(added);
  const edit = screen.dialog("Edit appointment");
  rtl.fireEvent.click(edit.getByRole("button", { name: "Delete" }));
  rtl.fireEvent.click(edit.getByRole("button", { name: "Confirm delete" }));
  await rtl.waitFor(() => expect(screen.db.select().from(appointments).all()).toHaveLength(3));
  await rtl.waitFor(() => expect(screen.agenda().join()).not.toContain("Nail trim"));
});

test("an appointment whose day has come is recorded as a vet visit and leaves the calendar", async () => {
  const screen = await open(TODAY, "/calendar?month=2026-12");
  // Not yet for one that is still ahead.
  rtl.fireEvent.click(screen.inAgenda().getByRole("button", { name: /Thyroid recheck/ }));
  expect(screen.dialog("Edit appointment").queryByRole("button", { name: "Record the visit" })).toBeNull();
  rtl.fireEvent.click(screen.dialog("Edit appointment").getByRole("button", { name: "Cancel" }));

  rtl.fireEvent.click(rtl.within(screen.attention()!).getByRole("button", { name: /Blood pressure recheck/ }));
  const booked = screen.dialog("Edit appointment");
  // What is typed into the appointment, saved or not, is what the visit starts from; it must be valid first.
  rtl.fireEvent.change(booked.getByLabelText("Date"), { target: { value: "" } });
  rtl.fireEvent.click(booked.getByRole("button", { name: "Record the visit" }));
  expect(booked.getByText("Use a valid date")).toBeTruthy();
  rtl.fireEvent.change(booked.getByLabelText("Date"), { target: { value: "2026-11-21" } });
  rtl.fireEvent.change(booked.getByLabelText("Reason"), { target: { value: "Blood pressure" } });
  rtl.fireEvent.click(booked.getByRole("button", { name: "Record the visit" }));
  const visit = screen.dialog("Add vet visit");
  expect((visit.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-11-21");
  expect((visit.getByLabelText("Reason") as HTMLInputElement).value).toBe("Blood pressure");
  rtl.fireEvent.change(visit.getByLabelText("Notes"), { target: { value: "150 systolic" } });
  rtl.fireEvent.click(visit.getByRole("button", { name: "Save" }));

  await rtl.waitFor(() => expect(screen.texts(screen.attention()!)).toHaveLength(1));
  expect(page.queryByRole("dialog", { name: "Add vet visit" })).toBeNull();
  expect(screen.db.select().from(entries).all()).toMatchObject([
    { petId: screen.miso, kind: "vet", date: "2026-11-21", reason: "Blood pressure", notes: "150 systolic" },
  ]);
  expect(
    screen.db
      .select()
      .from(appointments)
      .all()
      .map((a) => a.id),
  ).not.toContain(screen.recheck);
});

test("a visit for an appointment someone else already dealt with says so and saves nothing", async () => {
  const screen = await open();
  rtl.fireEvent.click(rtl.within(screen.attention()!).getByRole("button", { name: /Blood pressure recheck/ }));
  rtl.fireEvent.click(screen.dialog("Edit appointment").getByRole("button", { name: "Record the visit" }));
  // Deleted from another device while the visit form is open.
  screen.db.delete(appointments).where(eq(appointments.id, screen.recheck)).run();

  const visit = screen.dialog("Add vet visit");
  rtl.fireEvent.click(visit.getByRole("button", { name: "Save" }));
  expect(await visit.findByText(/This appointment has already been recorded or deleted\./)).toBeTruthy();
  expect(visit.queryByText("Check the highlighted fields.")).toBeNull();
  expect(screen.db.select().from(entries).all()).toEqual([]);
});

test("midnight moves today while the calendar stays open", async () => {
  // The clock, not a prop, says what day it is: the evening of the Dec 8 visit.
  setSystemTime(new Date(2026, 11, 8, 23, 59));
  const screen = await open(null);
  expect(page.getByRole("heading", { level: 2, name: /December 2026/ })).toBeTruthy();
  expect(screen.agenda()[0]).toMatch(/Thyroid recheck.*Today$/);
  expect(screen.texts(screen.attention()!)).toHaveLength(2);

  // Two minutes later it is Dec 9, and the tab is looked at again.
  setSystemTime(new Date(2026, 11, 9, 0, 1));
  rtl.act(() => void document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.agenda()[0]).toMatch(/Thyroid recheck.*Not recorded$/);
  expect(screen.texts(screen.attention()!)).toHaveLength(3);
});

test("a pet's page lists its appointments, soonest first, and edits them in place", async () => {
  // The pet's page reads the clock: the day between Miso's two appointments.
  setSystemTime(new Date(2026, 10, 26, 12));
  const screen = await open(null, "/pets/1", "pet");
  const booked = () =>
    rtl
      .within(page.getByRole("list", { name: "Appointments" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent!.replace(/\s+/g, " "));
  expect(booked()).toHaveLength(2);
  expect(booked()[0]).toMatch(/Blood pressure recheck.*Nov.*20.*Not recorded$/);
  expect(booked()[1]).toMatch(/Thyroid recheck.*Dec.*8.*(2:30|14:30)/);
  expect(booked()[1]).not.toContain("Not recorded");

  // Add record offers an appointment, for this pet without asking which.
  rtl.fireEvent.click(page.getByRole("button", { name: "Add record" }));
  rtl.fireEvent.click(
    rtl.within(page.getByRole("dialog", { name: "Add record" })).getByRole("button", { name: /Appointment/ }),
  );
  const form = screen.dialog("Add appointment");
  expect(form.queryByLabelText("Pet")).toBeNull();
  rtl.fireEvent.change(form.getByLabelText("Date"), { target: { value: "2026-11-30" } });
  rtl.fireEvent.change(form.getByLabelText("Reason"), { target: { value: "Nail trim" } });
  rtl.fireEvent.click(form.getByRole("button", { name: "Save" }));
  await rtl.waitFor(() => expect(booked()).toHaveLength(3));
  expect(booked()[1]).toContain("Nail trim");
  expect(screen.db.select().from(appointments).all()).toContainEqual(
    expect.objectContaining({ petId: screen.miso, date: "2026-11-30", reason: "Nail trim" }),
  );

  // One whose day has come is recorded as a visit from here too, and leaves the list.
  rtl.fireEvent.click(page.getByRole("button", { name: /Blood pressure recheck/ }));
  rtl.fireEvent.click(screen.dialog("Edit appointment").getByRole("button", { name: "Record the visit" }));
  rtl.fireEvent.click(screen.dialog("Add vet visit").getByRole("button", { name: "Save" }));
  await rtl.waitFor(() => expect(booked()).toHaveLength(2));
  expect(booked().join()).not.toContain("Blood pressure recheck");
  expect(screen.db.select().from(entries).all()).toMatchObject([
    { petId: screen.miso, kind: "vet", date: "2026-11-20", reason: "Blood pressure recheck" },
  ]);
});
