import { useMutation } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { appointmentInput, type CalendarAppointment, type CalendarPet } from "../../shared/calendar";
import { api, ApiError } from "../lib/api";
import { FormActions, issuesToErrors, type Errors } from "./record-forms";
import { Button } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/field";
import { VetPicker } from "./vets";

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
  const [errors, setErrors] = useState<Errors>({});
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
    onSuccess: onDone,
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/appointments/${appointment!.id}`, { method: "DELETE" }),
    onSuccess: onDone,
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
