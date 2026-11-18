import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Plus, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation } from "wouter";
import type { Analyte, LabReport } from "../../server/db/schema";
import type { LabReportWithResults } from "../../server/routes/labs";
import { formatDate, localToday } from "../../shared/dates";
import {
  ANALYTE_CATEGORIES,
  CATEGORY_LABEL,
  flagResult,
  LAB_SOURCE_LABEL,
  LAB_SOURCES,
  labReportInput,
  parseLabValue,
  prefillFor,
} from "../../shared/labs";
import { FileChip, FilePicker, fileRef, storedRef, uploadOriginal, type FileRef } from "../components/attachments";
import { Page } from "../components/page";
import { DeleteButton } from "../components/record-forms";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { api, ApiError } from "../lib/api";
import { useAnalytes, useLabs, usePet, useRecords } from "../lib/queries";
import {
  filledRows,
  limitErrors,
  limitText,
  parseLimit,
  resultsBody,
  rowErrors,
  type Errors,
  type Row,
} from "../lib/lab-rows";
import { cn } from "../lib/utils";

const COLUMNS = ["valueText", "unit", "refLow", "refHigh"] as const;
type Column = (typeof COLUMNS)[number];

let nextKey = 1;

function FlagPreview({ row }: { row: Row }) {
  const refLow = parseLimit(row.refLow);
  const refHigh = parseLimit(row.refHigh);
  if (Number.isNaN(refLow) || Number.isNaN(refHigh)) return null;
  const flag = flagResult({ ...parseLabValue(row.valueText), refLow, refHigh });
  if (flag === "high") return <Badge tone="danger">High</Badge>;
  if (flag === "low") return <Badge tone="warning">Low</Badge>;
  return null;
}

function LabForm({
  petId,
  report,
  analytes,
  reports,
}: {
  petId: number;
  report?: LabReportWithResults;
  analytes: Analyte[];
  reports: LabReportWithResults[];
}) {
  const id = useId();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const records = useRecords(petId);
  const grid = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [meta, setMeta] = useState({
    date: report?.date ?? localToday(),
    source: report?.source ?? ("reference_lab" as LabReport["source"]),
    lab: report?.lab ?? "",
    accession: report?.accession ?? "",
    notes: report?.notes ?? "",
    entryId: report?.entryId ? String(report.entryId) : "",
  });
  const [rows, setRows] = useState<Row[]>(() =>
    (report?.results ?? []).map((r) => ({
      key: nextKey++,
      analyteId: r.analyteId,
      valueText: r.valueText,
      unit: r.unit ?? "",
      refLow: limitText(r.refLow),
      refHigh: limitText(r.refHigh),
    })),
  );
  const [files, setFiles] = useState<FileRef[]>(() => (report?.attachments ?? []).map(fileRef));
  const others = reports.filter((r) => r.id !== report?.id);
  const byId = new Map(analytes.map((a) => [a.id, a]));

  const upload = useMutation({
    mutationFn: async (picked: File[]) => {
      for (const file of picked) {
        const stored = await uploadOriginal(file);
        setFiles((list) => (list.some((f) => f.fileId === stored.id) ? list : [...list, storedRef(stored)]));
      }
    },
  });

  /** Adds tests not already on the report, pre-filled from earlier results. */
  const addTests = (ids: number[]) => {
    setRows((current) => {
      const present = new Set(current.map((r) => r.analyteId));
      const added = ids
        .filter((analyteId) => !present.has(analyteId) && byId.has(analyteId))
        .map((analyteId) => {
          const fill = prefillFor(byId.get(analyteId)!, others, meta.lab || null);
          return {
            key: nextKey++,
            analyteId,
            valueText: "",
            unit: fill.unit ?? "",
            refLow: limitText(fill.refLow),
            refHigh: limitText(fill.refHigh),
          };
        });
      return [...current, ...added];
    });
  };

  const latest = [...others].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))[0];

  const setCell = (key: number, column: Column, value: string) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, [column]: value } : r)));

  /** Enter moves down the column, like a spreadsheet, instead of submitting the form. */
  const onCellKey = (e: KeyboardEvent<HTMLInputElement>, index: number, column: Column) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const target = grid.current?.querySelector<HTMLInputElement>(
      `[data-row="${index + (e.shiftKey ? -1 : 1)}"][data-col="${column}"]`,
    );
    target?.focus();
    target?.select();
  };

  // Waits for the pet's data to refetch before leaving, so the next page never shows the
  // report as missing or with its old values; the button stays in its saving state meanwhile.
  const done = async (saved?: { id: number }) => {
    await queryClient.invalidateQueries({ queryKey: ["pets", petId] });
    navigate(saved ? `/pets/${petId}/labs/${saved.id}` : `/pets/${petId}/labs`);
  };
  const save = useMutation({
    mutationFn: (body: object) =>
      report
        ? api<LabReport>(`/labs/${report.id}`, { method: "PUT", body })
        : api<LabReport>(`/pets/${petId}/labs`, { method: "POST", body }),
    onSuccess: (saved) => done(saved),
    onError: (err) => err instanceof ApiError && setErrors(rowErrors(err.fields, rows)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/labs/${report!.id}`, { method: "DELETE" }),
    onSuccess: () => done(),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (upload.isPending) return;
    const body = {
      ...meta,
      entryId: meta.entryId ? Number(meta.entryId) : null,
      fileIds: files.map((f) => f.fileId),
      results: resultsBody(rows),
    };
    const found: Errors = limitErrors(body.results);
    for (const issue of labReportInput.safeParse(body).error?.issues ?? [])
      found[issue.path.join(".")] ??= issue.message;
    if (meta.date > localToday()) found.date ??= "Can't be in the future";
    const mapped = rowErrors(found, rows);
    setErrors(mapped);
    if (Object.keys(mapped).length === 0) save.mutate(body);
  };

  const visits = (records.data?.entries ?? []).filter((e) => e.kind === "vet");
  const metaField = (name: keyof typeof meta) => ({
    id: `${id}-${name}`,
    value: meta[name],
    invalid: !!errors[name],
    onChange: (e: { target: { value: string } }) => setMeta((m) => ({ ...m, [name]: e.target.value })),
  });
  const rowError = (row: Row) =>
    COLUMNS.map((c) => errors[`row.${row.key}.${c}`]).find(Boolean) ?? errors[`row.${row.key}.analyteId`];
  const unused = analytes.filter((a) => !rows.some((r) => r.analyteId === a.id));

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Sample date" htmlFor={`${id}-date`} error={errors.date}>
          <Input {...metaField("date")} type="date" max={localToday()} />
        </Field>
        <Field label="Tested by" htmlFor={`${id}-source`}>
          <Select {...metaField("source")}>
            {LAB_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LAB_SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lab" htmlFor={`${id}-lab`} error={errors.lab}>
          <Input {...metaField("lab")} list={`${id}-labs`} placeholder="IDEXX" autoComplete="off" />
          <datalist id={`${id}-labs`}>
            {[...new Set(others.map((r) => r.lab).filter(Boolean))].map((l) => (
              <option key={l} value={l!} />
            ))}
          </datalist>
        </Field>
        <Field label="Accession number" htmlFor={`${id}-accession`} error={errors.accession}>
          <Input {...metaField("accession")} autoComplete="off" className="font-mono" />
        </Field>
        <Field label="Visit" htmlFor={`${id}-entryId`} error={errors.entryId} className="sm:col-span-2">
          <Select {...metaField("entryId")}>
            <option value="">Not linked to a visit</option>
            {visits.map((v) => (
              <option key={v.id} value={v.id}>
                {formatDate(v.date)}
                {v.reason ? ` · ${v.reason}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-foreground-secondary">Original report</span>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f) => (
                <li key={f.fileId} className="max-w-full">
                  <FileChip file={f} onRemove={() => setFiles((list) => list.filter((x) => x.fileId !== f.fileId))} />
                </li>
              ))}
            </ul>
          )}
          <FilePicker
            onPick={(picked) => upload.mutate(picked)}
            busy={upload.isPending}
            multiple
            label="Attach report"
          />
          {(upload.error || errors.fileIds) && (
            <p className="text-xs text-danger">{upload.error?.message ?? errors.fileIds}</p>
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold text-foreground-secondary">Results</h2>
          {latest && (
            <Button onClick={() => addTests(latest.results.map((r) => r.analyteId))}>
              <Copy className="size-4" aria-hidden />
              Same tests as {formatDate(latest.date)}
            </Button>
          )}
          <Select
            aria-label="Add a test"
            value=""
            onChange={(e) => e.target.value && addTests([Number(e.target.value)])}
            className="w-auto md:min-w-56"
          >
            <option value="">Add a test…</option>
            {ANALYTE_CATEGORIES.map((category) => (
              <optgroup key={category} label={CATEGORY_LABEL[category]}>
                {unused
                  .filter((a) => a.category === category)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ANALYTE_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => addTests(analytes.filter((a) => a.category === category).map((a) => a.id))}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border-strong px-3 text-xs text-foreground-secondary hover:bg-white/5 md:min-h-7"
            >
              <Plus className="size-3" aria-hidden />
              {CATEGORY_LABEL[category]}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">Add the tests on the report to enter their results.</p>
        ) : (
          <div ref={grid} role="table" aria-label="Results" className="space-y-2 md:space-y-0">
            <div
              role="row"
              className="hidden gap-2 px-1 pb-1 text-xs text-muted-foreground md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_4rem_2.25rem]"
            >
              <span role="columnheader">Test</span>
              <span role="columnheader">Result as printed</span>
              <span role="columnheader">Unit</span>
              <span role="columnheader">Ref. low</span>
              <span role="columnheader">Ref. high</span>
              <span role="columnheader">
                <span className="sr-only">Flag</span>
              </span>
              <span role="columnheader">
                <span className="sr-only">Remove</span>
              </span>
            </div>
            {rows.map((row, index) => {
              const analyte = byId.get(row.analyteId);
              const error = rowError(row);
              // Last in the row's Tab order, so a row added by mistake can be removed by keyboard.
              const removeButton = (
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  aria-label={`Remove ${analyte?.name ?? "test"}`}
                  className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground md:size-9"
                >
                  <X className="size-4" aria-hidden />
                </button>
              );
              const cell = (column: Column, label: string, extra: string) => (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground md:sr-only">{label}</span>
                  <Input
                    data-row={index}
                    data-col={column}
                    aria-label={`${analyte?.name ?? "Test"} ${label.toLowerCase()}`}
                    value={row[column]}
                    invalid={!!errors[`row.${row.key}.${column}`]}
                    onChange={(e) => setCell(row.key, column, e.target.value)}
                    onKeyDown={(e) => onCellKey(e, index, column)}
                    enterKeyHint="next"
                    autoComplete="off"
                    className={extra}
                  />
                </label>
              );
              return (
                <div
                  key={row.key}
                  role="row"
                  className="rounded-lg border border-border p-3 md:rounded-none md:border-0 md:border-t md:px-1 md:py-1.5"
                >
                  <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_4rem_2.25rem] md:items-center">
                    <div
                      role="cell"
                      className="col-span-2 flex min-w-0 items-center justify-between gap-2 md:col-span-1"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{analyte?.name ?? "Unknown test"}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{analyte?.code}</span>
                      </span>
                      {/* Phones: flag and remove sit beside the test name. */}
                      <span className="flex items-center gap-1 md:hidden">
                        <FlagPreview row={row} />
                        {removeButton}
                      </span>
                    </div>
                    <div role="cell" className="col-span-2 md:col-span-1">
                      {cell("valueText", "Result", "font-mono tabular-nums")}
                    </div>
                    <div role="cell" className="col-span-2 md:col-span-1">
                      {cell("unit", "Unit", "")}
                    </div>
                    <div role="cell">{cell("refLow", "Ref. low", "font-mono tabular-nums")}</div>
                    <div role="cell">{cell("refHigh", "Ref. high", "font-mono tabular-nums")}</div>
                    <div role="cell" className="hidden md:block">
                      <FlagPreview row={row} />
                    </div>
                    <div role="cell" className="hidden justify-end md:flex">
                      {removeButton}
                    </div>
                  </div>
                  {error && <p className="mt-1 text-xs text-danger">{error}</p>}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Type each result exactly as printed, such as 1.20, &lt;0.5 or Negative. Rows left blank aren't saved. Press
          Enter to move down a column.
        </p>
        {errors.results && <p className="text-danger">{errors.results}</p>}
      </Card>

      <Card>
        <Field label="Notes" htmlFor={`${id}-notes`} error={errors.notes}>
          <Textarea {...metaField("notes")} rows={3} />
        </Field>
      </Card>

      <div className="flex flex-wrap items-center gap-2 max-md:sticky max-md:bottom-16 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background max-md:px-4 max-md:py-3">
        {report && <DeleteButton onConfirm={() => remove.mutate()} pending={remove.isPending} />}
        {(save.error || remove.error) && !Object.keys(errors).length && (
          <p className="text-danger">{(save.error ?? remove.error)!.message}</p>
        )}
        {Object.keys(errors).length > 0 && <p className="text-danger">Check the highlighted fields.</p>}
        <div className="ml-auto flex gap-2">
          <Link
            href={report ? `/pets/${petId}/labs/${report.id}` : `/pets/${petId}/labs`}
            className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground md:min-h-9"
          >
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={save.isPending || upload.isPending}>
            {save.isPending ? "Saving…" : upload.isPending ? "Uploading…" : "Save results"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Add or edit a lab report for a pet. */
export function LabEntry({ petId, reportId }: { petId: number; reportId?: number }) {
  const pet = usePet(petId);
  const analytes = useAnalytes();
  const labs = useLabs(petId);
  const error = pet.error ?? analytes.error ?? labs.error;
  const report = reportId ? labs.data?.find((r) => r.id === reportId) : undefined;
  const title = `${reportId ? "Edit" : "Add"} lab results${pet.data ? ` · ${pet.data.name}` : ""}`;

  return (
    <Page
      title={title}
      actions={
        <Link
          href={`/pets/${petId}/labs`}
          className="inline-flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground md:min-h-9"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Lab reports
        </Link>
      }
    >
      {error && <p className="text-danger">{error.message}</p>}
      {reportId && labs.data && !report && <p className="text-danger">This lab report doesn't exist.</p>}
      {analytes.data && labs.data && (!reportId || report) && (
        <LabForm petId={petId} report={report} analytes={analytes.data} reports={labs.data} />
      )}
    </Page>
  );
}
