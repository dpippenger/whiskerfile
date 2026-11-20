import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ChipRegistry } from "../../server/db/schema";
import { chipRegistryInput } from "../../shared/pets";
import { api, ApiError } from "../lib/api";
import { useRegistries } from "../lib/queries";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog } from "./ui/dialog";
import { Field, Input } from "./ui/field";

type Editing = ChipRegistry | "new" | null;

function RegistryForm({ registry, onDone }: { registry: ChipRegistry | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: registry?.name ?? "",
    website: registry?.website ?? "",
    phone: registry?.phone ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["chip-registries"] });
    onDone();
  };
  const save = useMutation({
    mutationFn: () =>
      registry
        ? api(`/chip-registries/${registry.id}`, { method: "PUT", body: form })
        : api("/chip-registries", { method: "POST", body: form }),
    onSuccess: done,
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/chip-registries/${registry!.id}`, { method: "DELETE" }),
    onSuccess: done,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = chipRegistryInput.safeParse(form);
    const found: Record<string, string> = {};
    for (const issue of result.error?.issues ?? []) found[issue.path.join(".")] ??= issue.message;
    setErrors(found);
    if (result.success) save.mutate();
  };

  const field = (name: keyof typeof form) => ({
    id: `registry-${name}`,
    value: form[name],
    invalid: !!errors[name],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Name" htmlFor="registry-name" error={errors.name}>
        <Input {...field("name")} autoComplete="off" />
      </Field>
      <Field label="Website" htmlFor="registry-website" error={errors.website}>
        <Input {...field("website")} type="url" placeholder="https://" />
      </Field>
      <Field label="Phone" htmlFor="registry-phone" error={errors.phone}>
        <Input {...field("phone")} type="tel" />
      </Field>
      {(save.error || remove.error) && !Object.keys(errors).length && (
        <p className="text-danger">{(save.error ?? remove.error)!.message}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {registry && (
          <Button
            variant="ghost"
            className="text-danger"
            // Earlier field errors belong to the save; they must not hide the delete's error.
            onClick={() => {
              save.reset();
              setErrors({});
              remove.mutate();
            }}
            disabled={remove.isPending}
          >
            Delete
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

export function RegistriesSettings() {
  const registries = useRegistries();
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Microchip registries</h2>
          <p className="text-muted-foreground">Add the website and phone number from your registration paperwork.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add registry
        </Button>
      </div>
      {registries.error && <p className="text-danger">{registries.error.message}</p>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {registries.data?.map((registry) => (
          <li key={registry.id} className="flex min-h-12 items-center gap-3 px-3 py-1 md:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate">{registry.name}</p>
              {(registry.website || registry.phone) && (
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {registry.website && (
                    <a
                      href={registry.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {URL.canParse(registry.website) ? new URL(registry.website).host : registry.website}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                  {registry.phone && <span className="tabular-nums">{registry.phone}</span>}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(registry)}
              aria-label={`Edit ${registry.name}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground md:size-9"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add registry" : "Edit registry"}
      >
        {editing !== null && (
          <RegistryForm
            key={editing === "new" ? "new" : editing.id}
            registry={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </Card>
  );
}
