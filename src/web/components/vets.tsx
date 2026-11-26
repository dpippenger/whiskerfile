import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import type { Vet } from "../../server/db/schema";
import { vetInput, vetLabel } from "../../shared/vets";
import { api, ApiError } from "../lib/api";
import { useVets } from "../lib/queries";
import { FormActions, issuesToErrors, type Errors } from "./record-forms";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Field, Input, Select, Textarea } from "./ui/field";

/** A record's vet, named and leading to their contact details; nothing when there is none. */
export function VetLink({ vetId, prefix }: { vetId: number | null; prefix?: string }) {
  const vets = useVets();
  const vet = vets.data?.find((v) => v.id === vetId);
  if (!vet) return null;
  return (
    <>
      {prefix}
      <Link href={`/vets/${vet.id}`} className="text-primary hover:underline">
        {vetLabel(vet)}
      </Link>
    </>
  );
}

/** Adds a vet, or edits and deletes one. `onDone` gets the saved vet, or nothing on cancel or delete. */
export function VetForm({
  vet,
  onDone,
  onDeleted,
}: {
  vet?: Vet;
  onDone: (saved?: Vet) => void;
  onDeleted?: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const [form, setForm] = useState({
    name: vet?.name ?? "",
    clinic: vet?.clinic ?? "",
    phone: vet?.phone ?? "",
    email: vet?.email ?? "",
    address: vet?.address ?? "",
    website: vet?.website ?? "",
    notes: vet?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: () =>
      vet
        ? api<Vet>(`/vets/${vet.id}`, { method: "PUT", body: form })
        : api<Vet>("/vets", { method: "POST", body: form }),
    onSuccess: async (saved) => {
      // The list is fresh before the caller selects or shows the saved vet.
      await queryClient.invalidateQueries({ queryKey: ["vets"] });
      onDone(saved);
    },
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/vets/${vet!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vets"] });
      // Every record that named the vet has lost its link.
      void queryClient.invalidateQueries({ queryKey: ["pets"] });
      (onDeleted ?? onDone)();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Opened over another form by the picker: saving a vet must not submit that form.
    e.stopPropagation();
    const found = issuesToErrors(vetInput.safeParse(form).error?.issues);
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };
  const field = (name: keyof typeof form) => ({
    id: `${id}-${name}`,
    value: form[name],
    invalid: !!errors[name],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${id}-name`} error={errors.name}>
          <Input {...field("name")} autoComplete="off" placeholder="Dr. Okafor" />
        </Field>
        <Field label="Clinic or practice" htmlFor={`${id}-clinic`} error={errors.clinic}>
          <Input {...field("clinic")} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor={`${id}-phone`} error={errors.phone}>
          <Input {...field("phone")} type="tel" autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor={`${id}-email`} error={errors.email}>
          <Input {...field("email")} type="email" autoComplete="off" />
        </Field>
        <Field label="Website" htmlFor={`${id}-website`} error={errors.website} className="sm:col-span-2">
          <Input {...field("website")} type="url" placeholder="https://" autoComplete="off" />
        </Field>
      </div>
      <Field label="Address" htmlFor={`${id}-address`} error={errors.address}>
        <Textarea {...field("address")} rows={2} className="min-h-16" />
      </Field>
      <Field label="Notes" htmlFor={`${id}-notes`} error={errors.notes}>
        <Textarea {...field("notes")} rows={3} placeholder="Opening hours, out-of-hours number" />
      </Field>
      <FormActions
        onCancel={() => onDone()}
        saving={save.isPending}
        onDelete={vet ? () => remove.mutate() : undefined}
        deleting={remove.isPending}
        error={
          Object.keys(errors).length ? "Check the highlighted fields." : (save.error?.message ?? remove.error?.message)
        }
      />
    </form>
  );
}

/**
 * Chooses a saved vet, or none; `value` is the vet's id as text, "" for none.
 * "New vet" adds one in a dialog over the form and selects it.
 */
export function VetPicker({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const vets = useVets();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex gap-2">
      <Select id={id} value={value} invalid={invalid} onChange={(e) => onChange(e.target.value)} className="min-w-0">
        <option value="">No vet</option>
        {vets.data?.map((vet) => (
          <option key={vet.id} value={vet.id}>
            {vetLabel(vet)}
          </option>
        ))}
      </Select>
      <Button onClick={() => setAdding(true)} className="shrink-0 px-3">
        <Plus className="size-4" aria-hidden />
        New vet
      </Button>
      {/* Outside the surrounding form's element, so the two forms are not nested. */}
      {createPortal(
        <Dialog open={adding} onClose={() => setAdding(false)} title="New vet">
          {adding && (
            <VetForm
              onDone={(saved) => {
                if (saved) onChange(String(saved.id));
                setAdding(false);
              }}
            />
          )}
        </Dialog>,
        document.body,
      )}
    </div>
  );
}
