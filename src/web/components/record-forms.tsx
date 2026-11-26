import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import type { Measurement } from "../../server/db/schema";
import type { EntryWithVitals } from "../../server/routes/records";
import type { CalendarAppointment } from "../../shared/calendar";
import { localToday } from "../../shared/dates";
import {
  editedValue,
  ENTRY_KIND_LABEL,
  entryInput,
  fromCelsius,
  fromGrams,
  measurementInput,
  parseNumber,
  toCelsius,
  toGrams,
  type Units,
  type Vital,
} from "../../shared/records";
import { api, ApiError } from "../lib/api";
import { FileChip, FilePicker, fileRef, storedRef, uploadOriginal, type FileRef } from "./attachments";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/field";
import { VetPicker } from "./vets";

export type Errors = Record<string, string>;

export function issuesToErrors(issues: { path: PropertyKey[]; message: string }[] = []): Errors {
  const errors: Errors = {};
  for (const issue of issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}

/** Refreshes everything that shows a pet's records after a change. */
function useRecordsChanged(petId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["pets", petId] });
    void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
    // A visit recorded from an appointment removes it.
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };
}

/** Delete with a second, explicit confirmation click. */
export function DeleteButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant="ghost"
      className={cn("text-danger", armed && "bg-danger/10")}
      disabled={pending}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirm delete" : "Delete"}
    </Button>
  );
}

export function FormActions({
  onCancel,
  saving,
  onDelete,
  deleting = false,
  error,
}: {
  onCancel: () => void;
  saving: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  error?: string;
}) {
  return (
    // Pinned to the bottom of the full-screen sheet on phones, so Save is always in reach.
    <div className="space-y-3 max-md:sticky max-md:-bottom-4 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-elevated max-md:px-4 max-md:py-3">
      {error && <p className="text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {onDelete && <DeleteButton onConfirm={onDelete} pending={deleting} />}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const unitLabel = (units: Units) => ({
  weight: units.weight,
  temperature: `°${units.temperature.toUpperCase()}`,
});

/** A vet visit or home exam with its vitals, typed in the user's units. */
export function EntryForm({
  petId,
  units: unitsAtOpen,
  entry,
  appointment,
  initialKind = "vet",
  onKindChange,
  onDone,
}: {
  petId: number;
  units: Units;
  entry?: EntryWithVitals;
  /** The appointment a new visit was booked as: it fills the form, and saving the visit removes it. */
  appointment?: CalendarAppointment;
  initialKind?: "vet" | "home";
  onKindChange?: (kind: "vet" | "home") => void;
  onDone: () => void;
}) {
  const id = useId();
  const changed = useRecordsChanged(petId);
  const [errors, setErrors] = useState<Errors>({});
  // Typed numbers are read in the units the form opened with, even if the preference changes meanwhile.
  const [units] = useState(unitsAtOpen);
  const v = entry?.vitals ?? {};
  const [shown] = useState(() => ({
    weight: v.weight != null ? String(fromGrams(v.weight, units.weight)) : "",
    temperature: v.temperature != null ? String(fromCelsius(v.temperature, units.temperature)) : "",
  }));
  const [attached, setAttached] = useState<FileRef[]>(() => (entry?.attachments ?? []).map(fileRef));
  // Picked files upload one after another; the visit can't be saved until all are stored.
  const upload = useMutation({
    mutationFn: async (picked: File[]) => {
      for (const file of picked) {
        const stored = await uploadOriginal(file);
        setAttached((list) => (list.some((f) => f.fileId === stored.id) ? list : [...list, storedRef(stored)]));
      }
    },
  });
  const [form, setForm] = useState({
    kind: entry?.kind ?? initialKind,
    date: entry?.date ?? appointment?.date ?? localToday(),
    vetId: String(entry?.vetId ?? appointment?.vetId ?? ""),
    reason: entry?.reason ?? appointment?.reason ?? "",
    notes: entry?.notes ?? appointment?.notes ?? "",
    weight: shown.weight,
    temperature: shown.temperature,
    heart_rate: v.heart_rate != null ? String(v.heart_rate) : "",
    respiratory_rate: v.respiratory_rate != null ? String(v.respiratory_rate) : "",
    body_condition: v.body_condition != null ? String(v.body_condition) : "",
  });

  const save = useMutation({
    mutationFn: (body: object) =>
      entry
        ? api(`/entries/${entry.id}`, { method: "PUT", body })
        : api(`/pets/${petId}/entries`, { method: "POST", body }),
    onSuccess: () => {
      changed();
      onDone();
    },
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/entries/${entry!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      changed();
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (upload.isPending) return;
    const body = {
      kind: form.kind,
      date: form.date,
      vetId: form.kind === "vet" && form.vetId ? Number(form.vetId) : null,
      reason: form.reason,
      notes: form.notes,
      vitals: {
        weight: editedValue(form.weight, shown.weight, v.weight, (n) => toGrams(n, units.weight)),
        temperature: editedValue(form.temperature, shown.temperature, v.temperature, (n) =>
          toCelsius(n, units.temperature),
        ),
        heart_rate: parseNumber(form.heart_rate),
        respiratory_rate: parseNumber(form.respiratory_rate),
        body_condition: parseNumber(form.body_condition),
      },
      fileIds: attached.map((f) => f.fileId),
      ...(appointment && { appointmentId: appointment.id }),
    };
    const found = issuesToErrors(entryInput.safeParse(body).error?.issues);
    for (const [kind, value] of Object.entries(body.vitals)) {
      if (Number.isNaN(value)) found[`vitals.${kind}`] = "Enter a number";
    }
    if (form.date > localToday()) found.date ??= "Can't be in the future";
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate(body);
  };

  const field = (name: keyof typeof form, errorKey: string = name) => ({
    id: `${id}-${name}`,
    value: form[name],
    invalid: !!errors[errorKey],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });
  const vital = (name: Vital) => ({ ...field(name, `vitals.${name}`), inputMode: "decimal" as const });

  const labels = unitLabel(units);

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div
        role="radiogroup"
        aria-label="Kind"
        className="grid grid-cols-2 gap-1 rounded-lg bg-background-secondary p-1"
      >
        {(["vet", "home"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={form.kind === kind}
            onClick={() => {
              setForm((f) => ({ ...f, kind }));
              onKindChange?.(kind);
            }}
            className={cn(
              "min-h-11 rounded-md text-sm font-medium text-muted-foreground transition md:min-h-9",
              form.kind === kind && "bg-elevated text-foreground shadow-sm",
            )}
          >
            {ENTRY_KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      {/* A home exam has no vet; warn before it is silently cleared on save. */}
      {form.kind === "home" && !!form.vetId && (
        <p className="text-sm text-warning">Saving as a home exam removes the vet.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor={`${id}-date`} error={errors.date}>
          <Input {...field("date")} type="date" max={localToday()} />
        </Field>
        <Field label="Reason" htmlFor={`${id}-reason`} error={errors.reason}>
          <Input {...field("reason")} placeholder={form.kind === "vet" ? "Annual check-up" : "Weekly check"} />
        </Field>
        {form.kind === "vet" && (
          <Field label="Vet" htmlFor={`${id}-vetId`} error={errors.vetId} className="sm:col-span-2">
            <VetPicker
              id={`${id}-vetId`}
              value={form.vetId}
              invalid={!!errors.vetId}
              onChange={(vetId) => setForm((f) => ({ ...f, vetId }))}
            />
          </Field>
        )}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground-secondary">Vitals</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={`Weight (${labels.weight})`} htmlFor={`${id}-weight`} error={errors["vitals.weight"]}>
            <Input {...vital("weight")} className="font-mono tabular-nums" />
          </Field>
          <Field
            label={`Temperature (${labels.temperature})`}
            htmlFor={`${id}-temperature`}
            error={errors["vitals.temperature"]}
          >
            <Input {...vital("temperature")} className="font-mono tabular-nums" />
          </Field>
          <Field label="Heart rate (bpm)" htmlFor={`${id}-heart_rate`} error={errors["vitals.heart_rate"]}>
            <Input {...vital("heart_rate")} inputMode="numeric" className="font-mono tabular-nums" />
          </Field>
          <Field
            label="Breaths per minute"
            htmlFor={`${id}-respiratory_rate`}
            error={errors["vitals.respiratory_rate"]}
          >
            <Input {...vital("respiratory_rate")} inputMode="numeric" className="font-mono tabular-nums" />
          </Field>
          <Field label="Body condition (1–9)" htmlFor={`${id}-body_condition`} error={errors["vitals.body_condition"]}>
            <Select {...field("body_condition", "vitals.body_condition")}>
              <option value="">Not scored</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === 5 ? " (ideal)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <Field label="Notes" htmlFor={`${id}-notes`} error={errors.notes}>
        <Textarea {...field("notes")} rows={5} placeholder="Findings, advice, follow-ups" />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground-secondary">Files</legend>
        {attached.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {attached.map((file) => (
              <li key={file.fileId} className="max-w-full">
                <FileChip
                  file={file}
                  onRemove={() => setAttached((list) => list.filter((f) => f.fileId !== file.fileId))}
                />
              </li>
            ))}
          </ul>
        )}
        <FilePicker onPick={(files) => upload.mutate(files)} busy={upload.isPending} multiple label="Attach files" />
        {(upload.error || errors.fileIds) && (
          <p className="text-xs text-danger">{upload.error?.message ?? errors.fileIds}</p>
        )}
      </fieldset>

      <FormActions
        onCancel={onDone}
        saving={save.isPending || upload.isPending}
        onDelete={entry ? () => remove.mutate() : undefined}
        deleting={remove.isPending}
        error={
          // No field shows this one: someone else recorded or deleted the appointment meanwhile.
          errors.appointmentId
            ? "This appointment has already been recorded or deleted. Cancel and check the pet's timeline."
            : Object.keys(errors).length
              ? "Check the highlighted fields."
              : ((save.error && !(save.error instanceof ApiError && Object.keys(save.error.fields).length)
                  ? save.error.message
                  : undefined) ?? remove.error?.message)
        }
      />
    </form>
  );
}

/** A weigh-in on its own, outside any visit. */
export function WeightForm({
  petId,
  units: unitsAtOpen,
  measurement,
  onDone,
}: {
  petId: number;
  units: Units;
  measurement?: Measurement;
  onDone: () => void;
}) {
  const id = useId();
  const changed = useRecordsChanged(petId);
  const [errors, setErrors] = useState<Errors>({});
  const [units] = useState(unitsAtOpen);
  const [shown] = useState(measurement ? String(fromGrams(measurement.value, units.weight)) : "");
  const [date, setDate] = useState(measurement?.date ?? localToday());
  const [weight, setWeight] = useState(shown);

  const save = useMutation({
    mutationFn: (body: object) =>
      measurement
        ? api(`/measurements/${measurement.id}`, { method: "PUT", body })
        : api(`/pets/${petId}/measurements`, { method: "POST", body }),
    onSuccess: () => {
      changed();
      onDone();
    },
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/measurements/${measurement!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      changed();
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = editedValue(weight, shown, measurement?.value, (n) => toGrams(n, units.weight));
    const body = { date, kind: "weight", value: value ?? Number.NaN };
    const found = issuesToErrors(measurementInput.safeParse(body).error?.issues);
    if (value == null) found.value = "Enter a weight";
    else if (Number.isNaN(value)) found.value = "Enter a number";
    if (date > localToday()) found.date ??= "Can't be in the future";
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate(body);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Weight (${units.weight})`} htmlFor={`${id}-weight`} error={errors.value}>
          <Input
            id={`${id}-weight`}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            invalid={!!errors.value}
            inputMode="decimal"
            autoFocus
            className="font-mono tabular-nums"
          />
        </Field>
        <Field label="Date" htmlFor={`${id}-date`} error={errors.date}>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            max={localToday()}
            onChange={(e) => setDate(e.target.value)}
            invalid={!!errors.date}
          />
        </Field>
      </div>
      <FormActions
        onCancel={onDone}
        saving={save.isPending}
        onDelete={measurement ? () => remove.mutate() : undefined}
        deleting={remove.isPending}
        error={save.error && !Object.keys(errors).length ? save.error.message : remove.error?.message}
      />
    </form>
  );
}
