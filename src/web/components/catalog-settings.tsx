import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Analyte } from "../../server/db/schema";
import { ANALYTE_CATEGORIES, analyteInput, CATEGORY_LABEL } from "../../shared/labs";
import { api, ApiError } from "../lib/api";
import { useAnalytes } from "../lib/queries";
import { DeleteButton } from "./record-forms";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog } from "./ui/dialog";
import { Field, Input, Select } from "./ui/field";

function AnalyteForm({ analyte, onDone }: { analyte: Analyte | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: analyte?.code ?? "",
    name: analyte?.name ?? "",
    category: analyte?.category ?? "chemistry",
    defaultUnit: analyte?.defaultUnit ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["analytes"] });
    onDone();
  };
  const save = useMutation({
    mutationFn: () =>
      analyte
        ? api(`/analytes/${analyte.id}`, { method: "PUT", body: form })
        : api("/analytes", { method: "POST", body: form }),
    onSuccess: done,
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/analytes/${analyte!.id}`, { method: "DELETE" }),
    onSuccess: done,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    for (const issue of analyteInput.safeParse(form).error?.issues ?? []) found[issue.path.join(".")] ??= issue.message;
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };
  const field = (name: keyof typeof form) => ({
    id: `analyte-${name}`,
    value: form[name],
    invalid: !!errors[name],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" htmlFor="analyte-code" error={errors.code} hint="As printed on reports, e.g. CREA">
          <Input {...field("code")} autoComplete="off" className="font-mono uppercase" />
        </Field>
        <Field label="Default unit" htmlFor="analyte-defaultUnit" error={errors.defaultUnit}>
          <Input {...field("defaultUnit")} autoComplete="off" placeholder="mg/dL" />
        </Field>
      </div>
      <Field label="Name" htmlFor="analyte-name" error={errors.name}>
        <Input {...field("name")} autoComplete="off" />
      </Field>
      <Field label="Category" htmlFor="analyte-category">
        <Select {...field("category")}>
          {ANALYTE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>
      {(save.error || remove.error) && !Object.keys(errors).length && (
        <p className="text-danger">{(save.error ?? remove.error)!.message}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {analyte && <DeleteButton onConfirm={() => remove.mutate()} pending={remove.isPending} />}
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

/** The tests lab results can be entered for; the household can add its own. */
export function CatalogSettings() {
  const analytes = useAnalytes();
  const [editing, setEditing] = useState<Analyte | "new" | null>(null);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lab tests</h2>
          <p className="text-muted-foreground">The tests you can enter results for. Ranges come from each report.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add test
        </Button>
      </div>
      {analytes.error && <p className="text-danger">{analytes.error.message}</p>}
      {ANALYTE_CATEGORIES.map((category) => {
        const list = analytes.data?.filter((a) => a.category === category) ?? [];
        if (list.length === 0) return null;
        return (
          <details key={category} className="group rounded-lg border border-border">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 md:min-h-9 md:px-4">
              <span>{CATEGORY_LABEL[category]}</span>
              <span className="text-xs text-muted-foreground">{list.length} tests</span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {list.map((a) => (
                <li key={a.id} className="flex min-h-11 items-center gap-3 px-3 md:px-4">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{a.code}</span>
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{a.defaultUnit}</span>
                  <button
                    type="button"
                    onClick={() => setEditing(a)}
                    aria-label={`Edit ${a.name}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground md:size-9"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add test" : "Edit test"}
      >
        {editing !== null && (
          <AnalyteForm
            key={editing === "new" ? "new" : editing.id}
            analyte={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </Card>
  );
}
