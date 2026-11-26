import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import type { ZodType } from "zod";
import type { Condition, Medication, Vaccination } from "../../server/db/schema";
import { localToday } from "../../shared/dates";
import {
  CONDITION_KIND_LABEL,
  CONDITION_KINDS,
  conditionInput,
  medicationInput,
  vaccinationInput,
  VACCINE_SUGGESTIONS,
} from "../../shared/health";
import { api, ApiError } from "../lib/api";
import { Field, Input, Select, Textarea } from "./ui/field";
import { FormActions, issuesToErrors, type Errors } from "./record-forms";
import { VetPicker } from "./vets";

type Kind = "vaccinations" | "medications" | "conditions";

/**
 * State, validation and saving shared by the three health forms. `path` is the
 * API collection; a record being edited is saved in place, otherwise added to
 * the pet.
 */
function useHealthForm<F extends Record<string, string>>(
  petId: number,
  path: Kind,
  schema: ZodType,
  initial: F,
  existingId: number | undefined,
  onDone: () => void,
  /** Fields for something that has already happened, so they can't be in the future. */
  pastOnly: (keyof F & string)[] = [],
  /** The request body for a form whose fields are not all sent as typed. */
  toBody: (form: F) => object = (form) => form,
) {
  const id = useId();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["pets", petId] });
    void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
    onDone();
  };
  const save = useMutation({
    mutationFn: () =>
      existingId
        ? api(`/${path}/${existingId}`, { method: "PUT", body: toBody(form) })
        : api(`/pets/${petId}/${path}`, { method: "POST", body: toBody(form) }),
    onSuccess: done,
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/${path}/${existingId}`, { method: "DELETE" }),
    onSuccess: done,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = issuesToErrors(schema.safeParse(toBody(form)).error?.issues);
    for (const name of pastOnly) if (form[name] && form[name]! > localToday()) found[name] ??= "Can't be in the future";
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };
  const field = (name: keyof F & string) => ({
    id: `${id}-${name}`,
    value: form[name],
    invalid: !!errors[name],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
    ...(pastOnly.includes(name) && { max: localToday() }),
  });
  const actions = (
    <FormActions
      onCancel={onDone}
      saving={save.isPending}
      onDelete={existingId ? () => remove.mutate() : undefined}
      deleting={remove.isPending}
      error={
        Object.keys(errors).length ? "Check the highlighted fields." : (save.error?.message ?? remove.error?.message)
      }
    />
  );
  return { id, form, setForm, errors, field, submit, actions };
}

export function VaccinationForm({
  petId,
  record,
  onDone,
}: {
  petId: number;
  record?: Vaccination;
  onDone: () => void;
}) {
  const { id, form, setForm, errors, field, submit, actions } = useHealthForm(
    petId,
    "vaccinations",
    vaccinationInput,
    {
      vaccine: record?.vaccine ?? "",
      dateGiven: record?.dateGiven ?? localToday(),
      dueDate: record?.dueDate ?? "",
      lot: record?.lot ?? "",
      vetId: record?.vetId ? String(record.vetId) : "",
      notes: record?.notes ?? "",
    },
    record?.id,
    onDone,
    ["dateGiven"],
    (f) => ({ ...f, vetId: f.vetId ? Number(f.vetId) : null }),
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vaccine" htmlFor={`${id}-vaccine`} error={errors.vaccine} className="sm:col-span-2">
          <Input {...field("vaccine")} list={`${id}-vaccines`} autoComplete="off" />
          <datalist id={`${id}-vaccines`}>
            {VACCINE_SUGGESTIONS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Date given" htmlFor={`${id}-dateGiven`} error={errors.dateGiven}>
          <Input {...field("dateGiven")} type="date" />
        </Field>
        <Field
          label="Next due"
          htmlFor={`${id}-dueDate`}
          error={errors.dueDate}
          hint="From the certificate or the clinic's reminder."
        >
          <Input {...field("dueDate")} type="date" />
        </Field>
        <Field label="Lot number" htmlFor={`${id}-lot`} error={errors.lot}>
          <Input {...field("lot")} autoComplete="off" className="font-mono" />
        </Field>
        <Field label="Vet" htmlFor={`${id}-vetId`} error={errors.vetId} className="sm:col-span-2">
          <VetPicker
            id={`${id}-vetId`}
            value={form.vetId}
            invalid={!!errors.vetId}
            onChange={(vetId) => setForm((f) => ({ ...f, vetId }))}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor={`${id}-notes`} error={errors.notes}>
        <Textarea {...field("notes")} rows={3} />
      </Field>
      {actions}
    </form>
  );
}

export function MedicationForm({ petId, record, onDone }: { petId: number; record?: Medication; onDone: () => void }) {
  const { id, errors, field, submit, actions } = useHealthForm(
    petId,
    "medications",
    medicationInput,
    {
      drug: record?.drug ?? "",
      dose: record?.dose ?? "",
      frequency: record?.frequency ?? "",
      startDate: record?.startDate ?? localToday(),
      endDate: record?.endDate ?? "",
      reason: record?.reason ?? "",
      notes: record?.notes ?? "",
    },
    record?.id,
    onDone,
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Medication" htmlFor={`${id}-drug`} error={errors.drug} className="sm:col-span-2">
          <Input {...field("drug")} autoComplete="off" />
        </Field>
        <Field label="Dose" htmlFor={`${id}-dose`} error={errors.dose} hint="As on the label, e.g. 2.5 mg">
          <Input {...field("dose")} autoComplete="off" />
        </Field>
        <Field label="How often" htmlFor={`${id}-frequency`} error={errors.frequency} hint="e.g. twice daily">
          <Input {...field("frequency")} autoComplete="off" />
        </Field>
        <Field label="Started" htmlFor={`${id}-startDate`} error={errors.startDate}>
          <Input {...field("startDate")} type="date" />
        </Field>
        <Field label="Stopped" htmlFor={`${id}-endDate`} error={errors.endDate} hint="Leave empty while ongoing.">
          <Input {...field("endDate")} type="date" />
        </Field>
        <Field label="Reason" htmlFor={`${id}-reason`} error={errors.reason} className="sm:col-span-2">
          <Input {...field("reason")} autoComplete="off" />
        </Field>
      </div>
      <Field label="Notes" htmlFor={`${id}-notes`} error={errors.notes}>
        <Textarea {...field("notes")} rows={3} />
      </Field>
      {actions}
    </form>
  );
}

export function ConditionForm({ petId, record, onDone }: { petId: number; record?: Condition; onDone: () => void }) {
  const { id, errors, field, submit, actions } = useHealthForm(
    petId,
    "conditions",
    conditionInput,
    {
      kind: record?.kind ?? "diagnosis",
      title: record?.title ?? "",
      date: record?.date ?? localToday(),
      resolvedOn: record?.resolvedOn ?? "",
      notes: record?.notes ?? "",
    },
    record?.id,
    onDone,
    ["date", "resolvedOn"],
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${id}-kind`}>
          <Select {...field("kind")}>
            {CONDITION_KINDS.map((k) => (
              <option key={k} value={k}>
                {CONDITION_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor={`${id}-date`} error={errors.date}>
          <Input {...field("date")} type="date" />
        </Field>
        <Field label="What" htmlFor={`${id}-title`} error={errors.title} className="sm:col-span-2">
          <Input {...field("title")} autoComplete="off" placeholder="Chronic kidney disease, chicken allergy…" />
        </Field>
        <Field
          label="Resolved"
          htmlFor={`${id}-resolvedOn`}
          error={errors.resolvedOn}
          hint="Leave empty while it's ongoing."
        >
          <Input {...field("resolvedOn")} type="date" />
        </Field>
      </div>
      <Field label="Notes" htmlFor={`${id}-notes`} error={errors.notes}>
        <Textarea {...field("notes")} rows={3} />
      </Field>
      {actions}
    </form>
  );
}
