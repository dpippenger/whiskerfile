import { useMutation } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { localToday } from "../../shared/dates";
import { ApiError } from "../lib/api";
import { useUnits } from "../lib/units";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Field, Input } from "./ui/field";

/** Fetches the PDF and hands it to the browser as a download, keeping the server's file name. */
async function download(petId: number, query: URLSearchParams, signal: AbortSignal) {
  const res = await fetch(`/api/pets/${petId}/report.pdf?${query}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; fields?: Record<string, string> } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.fields);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "health-report.pdf";
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the blob goes away.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A button that opens a dialog for downloading the pet's health report as a
 * PDF, for all records or a chosen period.
 */
export function ReportButton({ petId, className }: { petId: number; className?: string }) {
  const id = useId();
  const units = useUnits();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const abort = useRef<AbortController | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const query = new URLSearchParams({ today: localToday(), weightUnit: units.weight });
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      abort.current = new AbortController();
      return download(petId, query, abort.current.signal);
    },
    onSuccess: () => setOpen(false),
  });
  // Closing while the PDF is being prepared cancels it, so nothing downloads unseen.
  const close = () => {
    abort.current?.abort();
    setOpen(false);
  };
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <>
      <Button
        onClick={() => {
          save.reset();
          setOpen(true);
        }}
        className={className}
      >
        <FileDown className="size-4" aria-hidden />
        Report
      </Button>
      <Dialog open={open} onClose={close} title="Health report" dismissible={!save.isPending}>
        <form onSubmit={submit} noValidate className="space-y-5">
          <p className="text-muted-foreground">
            A PDF of this pet's details, weight, lab results with trend charts, vaccinations, medications and
            conditions. Leave the dates empty to include everything.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor={`${id}-from`} error={fields.from}>
              <Input
                id={`${id}-from`}
                type="date"
                value={from}
                max={to || undefined}
                invalid={!!fields.from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor={`${id}-to`} error={fields.to}>
              <Input
                id={`${id}-to`}
                type="date"
                value={to}
                min={from || undefined}
                invalid={!!fields.to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
          {save.error && (
            <p className="text-danger">
              {/* Only From and To are on screen; an error naming other fields shows its own message. */}
              {fields.from || fields.to ? "Check the highlighted fields." : save.error.message}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" onClick={close} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? "Preparing…" : "Download PDF"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
