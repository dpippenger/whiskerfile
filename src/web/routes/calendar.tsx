import { CalendarClock, ChevronLeft, ChevronRight, Pill, Plus, Syringe, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "wouter";
import { calendarEvents, type CalendarAppointment, type CalendarEvent } from "../../shared/calendar";
import { addMonths, formatDate, formatTime, isIsoMonth, localToday, monthOf, monthWeeks } from "../../shared/dates";
import { ENTRY_KIND_LABEL } from "../../shared/records";
import { AppointmentForm } from "../components/appointment-form";
import { Page } from "../components/page";
import { EntryForm } from "../components/record-forms";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Select } from "../components/ui/field";
import { useCalendar } from "../lib/queries";
import { useUnits } from "../lib/units";
import { cn } from "../lib/utils";

const ICON = { vaccine: Syringe, medication: Pill, appointment: CalendarClock };

/** The first day of the week where the reader lives (0 is Sunday); Monday when the browser doesn't say. */
function weekStart(): number {
  type WeekInfo = { firstDay?: number };
  const locale: { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo } & Intl.Locale = new Intl.Locale(
    navigator.language,
  );
  // 1 (Monday) to 7 (Sunday).
  return ((locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1) % 7;
}

/**
 * The browser's date, kept current while the page stays open: checked each
 * minute and whenever the tab is shown again, so midnight moves "today".
 */
function useLocalToday(): string {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const check = () => setToday(localToday());
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}

type Open = (appointment: CalendarAppointment) => void;

/** What opens an event's record: an appointment's form here, anything else on the pet's Health tab. */
function EventLink({
  event,
  onOpen,
  className,
  children,
}: {
  event: CalendarEvent;
  onOpen: Open;
  className: string;
  children: ReactNode;
}) {
  return event.kind === "appointment" ? (
    <button type="button" onClick={() => onOpen(event.appointment)} className={className}>
      {children}
    </button>
  ) : (
    <Link href={`/pets/${event.pet.id}/health`} className={className}>
      {children}
    </Link>
  );
}

function PetDot({ event }: { event: CalendarEvent }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ background: event.pet.chartColor }} aria-hidden />;
}

/** A full-width row, for the agenda and the overdue list (which shows each event's date). */
function EventRow({ event, showDate = false, onOpen }: { event: CalendarEvent; showDate?: boolean; onOpen: Open }) {
  const Icon = ICON[event.kind];
  return (
    <EventLink
      event={event}
      onOpen={onOpen}
      className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", event.status === "past" && "text-muted-foreground")}>
          {event.title}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PetDot event={event} />
          <span className="truncate">{event.pet.name}</span>
          {showDate && <span className="shrink-0 tabular-nums">· {formatDate(event.date)}</span>}
          {event.time && <span className="shrink-0 tabular-nums">· {formatTime(event.time)}</span>}
        </span>
      </span>
      {event.status === "overdue" && (
        <Badge tone="danger" className="shrink-0">
          {event.kind === "appointment" ? "Not recorded" : "Overdue"}
        </Badge>
      )}
      {event.status === "today" && (
        <Badge tone="info" className="shrink-0">
          Today
        </Badge>
      )}
    </EventLink>
  );
}

/** One line in a day's cell of the month grid. */
function EventChip({ event, onOpen }: { event: CalendarEvent; onOpen: Open }) {
  return (
    <EventLink
      event={event}
      onOpen={onOpen}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition hover:bg-white/10",
        event.status === "overdue" && "bg-danger/10 text-danger",
        event.status === "past" && "text-muted-foreground",
        (event.status === "today" || event.status === "upcoming") && "bg-white/5",
      )}
    >
      <PetDot event={event} />
      <span className="sr-only">{event.pet.name}:</span>
      {event.time && <span className="shrink-0 text-muted-foreground tabular-nums">{formatTime(event.time)}</span>}
      <span className="truncate" title={`${event.pet.name} · ${event.title}`}>
        {event.title}
      </span>
    </EventLink>
  );
}

type DialogState =
  | { mode: "appointment"; appointment?: CalendarAppointment }
  | { mode: "visit"; appointment: CalendarAppointment; kind: "vet" | "home" }
  | null;

function dialogTitle(state: Exclude<DialogState, null>): string {
  if (state.mode === "visit") return `Add ${ENTRY_KIND_LABEL[state.kind].toLowerCase()}`;
  return state.appointment ? "Edit appointment" : "Add appointment";
}

/**
 * What is due, ending and booked for every living pet, a month at a time: a
 * grid on wide screens, an agenda on phones. Every status on the page is
 * judged from the browser's date; `today` fixes that date instead (for tests).
 */
export function Calendar({ today: fixedToday }: { today?: string }) {
  const localDay = useLocalToday();
  const today = fixedToday ?? localDay;
  const calendar = useCalendar();
  const units = useUnits();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<DialogState>(null);

  const thisMonth = monthOf(today);
  const monthParam = params.get("month") ?? "";
  const month = isIsoMonth(monthParam) ? monthParam : thisMonth;
  const pets = (calendar.data?.pets ?? []).filter((pet) => !pet.deceasedOn);
  const petId = pets.find((pet) => String(pet.id) === params.get("pet"))?.id ?? null;

  const events = (calendar.data ? calendarEvents(calendar.data, today) : []).filter(
    (event) => petId == null || event.pet.id === petId,
  );
  const overdue = events.filter((event) => event.status === "overdue");
  const byDay = Map.groupBy(
    events.filter((event) => monthOf(event.date) === month),
    (event) => event.date,
  );

  /** Changes the month or pet in the address; the current month and "all pets" are the bare address. */
  const show = (key: "month" | "pet", value: string, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== thisMonth) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace },
    );
  const close = () => setDialog(null);
  const open: Open = (appointment) => setDialog({ mode: "appointment", appointment });

  const weeks = monthWeeks(month, weekStart());
  return (
    <Page
      title="Calendar"
      actions={
        pets.length > 0 && (
          <Button variant="primary" onClick={() => setDialog({ mode: "appointment" })}>
            <Plus className="size-4" aria-hidden />
            Add appointment
          </Button>
        )
      }
    >
      {calendar.error && <p className="text-danger">{calendar.error.message}</p>}
      {calendar.data && pets.length === 0 && (
        <p className="text-muted-foreground">Add a pet to see its vaccines, medications and appointments here.</p>
      )}

      {overdue.length > 0 && (
        <section aria-label="Needs attention" className="rounded-xl border border-danger/30 bg-danger/5 p-2 md:p-3">
          <h2 className="flex items-center gap-2 px-2 pt-1 text-sm font-semibold text-danger">
            <TriangleAlert className="size-4" aria-hidden />
            Needs attention
          </h2>
          <ul className="mt-1">
            {overdue.map((event) => (
              <li key={event.key}>
                <EventRow event={event} showDate onOpen={open} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button aria-label="Previous month" className="px-3" onClick={() => show("month", addMonths(month, -1))}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button aria-label="Next month" className="px-3" onClick={() => show("month", addMonths(month, 1))}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <h2 aria-live="polite" className="mr-auto px-1 text-lg font-semibold">
          {formatDate(`${month}-01`, { month: "long", year: "numeric" })}
        </h2>
        <Button variant="ghost" onClick={() => show("month", thisMonth)}>
          Today
        </Button>
        <Select
          aria-label="Pet"
          value={petId ?? ""}
          onChange={(e) => show("pet", e.target.value, true)}
          className="w-full @md/main:w-auto @md/main:max-w-56"
        >
          <option value="">All pets</option>
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Wide screens: the month as a grid of weeks. */}
      <table
        aria-label="Month"
        className="hidden w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border border-border bg-card @3xl/main:table"
      >
        <thead>
          <tr>
            {weeks[0]!.map((day) => (
              <th
                key={day}
                scope="col"
                abbr={formatDate(day, { weekday: "long" })}
                className="border-b border-border px-2 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                {formatDate(day, { weekday: "short" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const inMonth = monthOf(day) === month;
                return (
                  <td
                    key={day}
                    className={cn(
                      "h-28 border-t border-l border-border p-1.5 align-top first:border-l-0",
                      !inMonth && "bg-background-secondary text-muted-foreground/40",
                    )}
                  >
                    <time
                      dateTime={day}
                      aria-current={day === today ? "date" : undefined}
                      className={cn(
                        "mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        day === today && "bg-primary font-semibold text-white",
                      )}
                    >
                      {Number(day.slice(8))}
                    </time>
                    {inMonth && (
                      <ul className="space-y-1">
                        {byDay.get(day)?.map((event) => (
                          <li key={event.key}>
                            <EventChip event={event} onOpen={open} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phones: only the days that have something, as a list. */}
      <div className="@3xl/main:hidden">
        {byDay.size === 0 && <p className="py-8 text-center text-muted-foreground">Nothing this month.</p>}
        <ol aria-label="Agenda" className="space-y-4">
          {[...byDay].map(([day, dayEvents]) => (
            <li key={day}>
              <h3
                className={cn(
                  "border-b border-border px-2 pb-1 text-xs font-medium text-muted-foreground",
                  day === today && "text-primary",
                )}
              >
                {formatDate(day, { weekday: "short", month: "short", day: "numeric" })}
              </h3>
              <ul>
                {dayEvents.map((event) => (
                  <li key={event.key}>
                    <EventRow event={event} onOpen={open} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>

      <Dialog open={dialog !== null} onClose={close} title={dialog ? dialogTitle(dialog) : ""}>
        {dialog?.mode === "appointment" && (
          <AppointmentForm
            pets={pets}
            appointment={dialog.appointment}
            defaultPetId={petId}
            today={today}
            onDone={close}
            onRecordVisit={(appointment) => setDialog({ mode: "visit", appointment, kind: "vet" })}
          />
        )}
        {dialog?.mode === "visit" && (
          <EntryForm
            petId={dialog.appointment.petId}
            units={units}
            appointment={dialog.appointment}
            onKindChange={(kind) => setDialog((d) => (d?.mode === "visit" ? { ...d, kind } : d))}
            onDone={close}
          />
        )}
      </Dialog>
    </Page>
  );
}
