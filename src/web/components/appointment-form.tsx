import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Stethoscope } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { appointmentInput, type CalendarAppointment, type CalendarPet } from "../../shared/calendar";
import { formatDate, formatTime } from "../../shared/dates";
import { api, ApiError } from "../lib/api";
import { useCalendar } from "../lib/queries";
import { FormActions, issuesToErrors, type Errors } from "./record-forms";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field, Input, Select, Textarea } from "./ui/field";
import { VetLink, VetPicker } from "./vets";

/**
 * Books a visit for one of `pets`, or edits and deletes a booked one. Once
 * its day has come (`today` is the browser's date), `onRecordVisit` gets the
 * appointment as the form now reads, to turn it into the visit's record.
 */
export function AppointmentForm({
  pets,
  appointment,
  defaultPetId,
  today,
  onDone,
  onRecordVisit,
}: {
  pets: CalendarPet[];
  appointment?: CalendarAppointment;
  defaultPetId?: number | null;
  today: string;
  onDone: () => void;
  onRecordVisit: (appointment: CalendarAppointment) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  // Refreshes the calendar and the pet's page, which both list appointments, then closes.
  const saved = () => {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    onDone();
  };
  const [form, setForm] = useState({
    petId: String(appointment?.petId ?? defaultPetId ?? pets[0]?.id ?? ""),
    date: appointment?.date ?? today,
    time: appointment?.time ?? "",
    vetId: String(appointment?.vetId ?? ""),
    reason: appointment?.reason ?? "",
    notes: appointment?.notes ?? "",
  });
  const body = () => ({
    date: form.date,
    time: form.time,
    vetId: form.vetId ? Number(form.vetId) : null,
    reason: form.reason,
    notes: form.notes,
  });

  const save = useMutation({
    mutationFn: () =>
      appointment
        ? api(`/appointments/${appointment.id}`, { method: "PUT", body: body() })
        : api(`/pets/${form.petId}/appointments`, { method: "POST", body: body() }),
    onSuccess: saved,
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/appointments/${appointment!.id}`, { method: "DELETE" }),
    onSuccess: saved,
  });

  /** The form as the schema reads it, or nothing (with each failing field marked) when it is invalid. */
  const valid = () => {
    const result = appointmentInput.safeParse(body());
    setErrors(issuesToErrors(result.error?.issues));
    return result.data;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid()) save.mutate();
  };
  // The visit is filled in from the form as it stands, not as last saved.
  const recordVisit = (booked: CalendarAppointment) => {
    const typed = valid();
    if (typed) onRecordVisit({ ...booked, ...typed });
  };
  const field = (name: keyof typeof form) => ({
    id: `${id}-${name}`,
    value: form[name],
    invalid: !!errors[name],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {appointment && form.date <= today && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background-secondary px-3 py-2">
          <p className="text-foreground-secondary">Has this visit happened?</p>
          <Button onClick={() => recordVisit(appointment)}>
            <Stethoscope className="size-4" aria-hidden />
            Record the visit
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Nothing to choose on a pet's own page, or with one pet. */}
        {pets.length > 1 && (
          <Field label="Pet" htmlFor={`${id}-petId`} className="sm:col-span-2">
            {/* An appointment stays on its pet. */}
            <Select {...field("petId")} disabled={!!appointment}>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Date" htmlFor={`${id}-date`} error={errors.date}>
          <Input {...field("date")} type="date" />
        </Field>
        <Field label="Time" htmlFor={`${id}-time`} error={errors.time} hint="Leave empty if it isn't set yet.">
          <Input {...field("time")} type="time" />
        </Field>
        <Field label="Vet" htmlFor={`${id}-vetId`} error={errors.vetId} className="sm:col-span-2">
          <VetPicker
            id={`${id}-vetId`}
            value={form.vetId}
            invalid={!!errors.vetId}
            onChange={(vetId) => setForm((f) => ({ ...f, vetId }))}
          />
        </Field>
        <Field label="Reason" htmlFor={`${id}-reason`} error={errors.reason} className="sm:col-span-2">
          <Input {...field("reason")} autoComplete="off" placeholder="Annual check-up" />
        </Field>
      </div>
      <Field label="Notes" htmlFor={`${id}-notes`} error={errors.notes}>
        <Textarea {...field("notes")} rows={3} placeholder="What to bring, questions to ask" />
      </Field>
      <FormActions
        onCancel={onDone}
        saving={save.isPending}
        onDelete={appointment ? () => remove.mutate() : undefined}
        deleting={remove.isPending}
        error={
          Object.keys(errors).length ? "Check the highlighted fields." : (save.error?.message ?? remove.error?.message)
        }
      />
    </form>
  );
}

/**
 * A pet's booked visits, soonest first, each opening its form; nothing when
 * there are none. One whose day has passed reads "Not recorded", except for a
 * pet that has passed away, for which nothing is ever late.
 */
export function PetAppointments({
  petId,
  deceasedOn,
  today,
  onOpen,
}: {
  petId: number;
  deceasedOn: string | null;
  today: string;
  onOpen: (appointment: CalendarAppointment) => void;
}) {
  const booked = (useCalendar().data?.appointments ?? [])
    .filter((a) => a.petId === petId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  if (booked.length === 0) return null;
  return (
    <Card className="p-2 md:p-3">
      <h2 className="px-2 pt-1 text-sm font-semibold text-foreground-secondary">Appointments</h2>
      <ul aria-label="Appointments" className="mt-1">
        {booked.map((appointment) => (
          <li key={appointment.id} className="rounded-lg hover:bg-white/5">
            <button
              type="button"
              onClick={() => onOpen(appointment)}
              className="flex min-h-14 w-full items-center gap-3 px-2 py-2 text-left"
            >
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{appointment.reason ?? "Appointment"}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatDate(appointment.date)}
                  {appointment.time && ` · ${formatTime(appointment.time)}`}
                </span>
              </span>
              {!deceasedOn && appointment.date < today && (
                <Badge tone="danger" className="shrink-0">
                  Not recorded
                </Badge>
              )}
              {!deceasedOn && appointment.date === today && (
                <Badge tone="info" className="shrink-0">
                  Today
                </Badge>
              )}
            </button>
            {/* The vet's link sits under the row's button, not inside it. */}
            <p className="truncate pr-2 pb-2 pl-9 text-xs empty:hidden">
              <VetLink vetId={appointment.vetId} />
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
