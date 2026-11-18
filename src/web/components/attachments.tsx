import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Upload, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import type { StoredFile } from "../../server/db/schema";
import type { LabReportWithResults } from "../../server/routes/labs";
import type { AttachmentWithFile, PetRecords } from "../../server/routes/records";
import { formatDate, localToday } from "../../shared/dates";
import { attachmentInput } from "../../shared/records";
import { api, ApiError } from "../lib/api";
import { downsizeImage } from "../lib/image";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field, Input } from "./ui/field";

/** A file as shown in a list: enough to link to it and show what it is. */
export type FileRef = { fileId: number; name: string; mime: string; sizeBytes: number; previewId: number | null };

export const fileRef = (a: AttachmentWithFile): FileRef => ({
  fileId: a.fileId,
  name: a.label ?? a.file.originalName,
  mime: a.file.mime,
  sizeBytes: a.file.sizeBytes,
  previewId: a.file.previewId,
});

export const storedRef = (f: StoredFile): FileRef => ({
  fileId: f.id,
  name: f.originalName,
  mime: f.mime,
  sizeBytes: f.sizeBytes,
  previewId: f.previewId,
});

const IMAGE = /^image\/(jpeg|png|webp|gif)$/;
/** Matches the server's PREVIEW_MAX_BYTES: smaller images serve as their own preview. */
const PREVIEW_MAX_BYTES = 512 * 1024;

/** The image to show in a list for a file, or null to show an icon. Never the original of a large image. */
function previewSrc(file: Pick<FileRef, "fileId" | "mime" | "sizeBytes" | "previewId">): string | null {
  if (file.previewId) return `/api/files/${file.previewId}`;
  return IMAGE.test(file.mime) && file.sizeBytes <= PREVIEW_MAX_BYTES ? `/api/files/${file.fileId}` : null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Uploads a file exactly as picked: records keep the original document. For a
 * large image it also uploads a small preview for lists to show; if that
 * fails, lists show an icon instead.
 */
export async function uploadOriginal(file: File): Promise<StoredFile> {
  const form = new FormData();
  form.append("file", file);
  const stored = await api<StoredFile>("/files", { method: "POST", body: form });
  if (!IMAGE.test(stored.mime) || stored.sizeBytes <= PREVIEW_MAX_BYTES || stored.previewId) return stored;
  try {
    const preview = new FormData();
    preview.append("file", await downsizeImage(file, 640));
    return await api<StoredFile>(`/files/${stored.id}/preview`, { method: "PUT", body: preview });
  } catch {
    return stored;
  }
}

/** A button and drop zone that hands picked files to `onPick`; ignores picks while `busy`. */
export function FilePicker({
  onPick,
  busy,
  multiple = false,
  label = "Add files",
}: {
  onPick: (files: File[]) => void;
  busy: boolean;
  multiple?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const pick = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (picked.length && !busy) onPick(multiple ? picked : picked.slice(0, 1));
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border-strong p-3",
        dragging && "border-primary/60 bg-primary/5",
      )}
    >
      <Button onClick={() => input.current?.click()} disabled={busy}>
        <Upload className="size-4" aria-hidden />
        {busy ? "Uploading…" : label}
      </Button>
      <span className="hidden text-xs text-muted-foreground md:inline">
        or drop {multiple ? "files" : "a file"} here
      </span>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** A small link to a file: thumbnail for images, an icon otherwise. Opens in a new tab. */
export function FileChip({ file, onRemove }: { file: FileRef; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-background-secondary py-1 pr-1 pl-1.5">
      <a
        href={`/api/files/${file.fileId}`}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center gap-2 hover:text-primary"
      >
        {previewSrc(file) ? (
          <img src={previewSrc(file)!} alt="" loading="lazy" className="size-7 shrink-0 rounded object-cover" />
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="truncate text-sm">{file.name}</span>
      </a>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatSize(file.sizeBytes)}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );
}

/** Every file kept for a pet, from visits and on its own, newest first. */
export function FilesTab({
  records,
  labs,
  onEdit,
}: {
  records: PetRecords;
  labs: LabReportWithResults[];
  onEdit: (a: AttachmentWithFile) => void;
}) {
  const kindOf = new Map(records.entries.map((e) => [e.id, e]));
  const all = [
    ...records.attachments,
    ...records.entries.flatMap((e) => e.attachments),
    ...labs.flatMap((r) => r.attachments),
  ].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  if (all.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground">
        No files yet. Attach lab reports or receipts to a visit, or file a document with “Add record”.
      </Card>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {all.map((a) => {
        const visit = a.entryId ? kindOf.get(a.entryId) : undefined;
        return (
          <li key={a.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <a
              href={`/api/files/${a.fileId}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${a.label ?? a.file.originalName}`}
              className="flex aspect-[4/3] items-center justify-center bg-background-secondary"
            >
              {previewSrc(fileRef(a)) ? (
                <img src={previewSrc(fileRef(a))!} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <FileText className="size-10 text-muted-foreground" aria-hidden />
              )}
            </a>
            <div className="flex min-w-0 items-start gap-1 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.label ?? a.file.originalName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(a.date)} · {visit ? (visit.reason ?? "Visit") : a.labReportId ? "Lab report" : "Filed"} ·{" "}
                  {formatSize(a.file.sizeBytes)}
                </p>
              </div>
              {!a.entryId && !a.labReportId && (
                <button
                  type="button"
                  onClick={() => onEdit(a)}
                  aria-label={`Edit ${a.label ?? a.file.originalName}`}
                  className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Files a document under the pet on its own, or edits the label and date of one already filed. */
export function FileForm({
  petId,
  attachment,
  onDone,
}: {
  petId: number;
  attachment?: AttachmentWithFile;
  onDone: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<FileRef | null>(attachment ? fileRef({ ...attachment, label: null }) : null);
  const [label, setLabel] = useState(attachment?.label ?? "");
  const [date, setDate] = useState(attachment?.date ?? localToday());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["pets", petId] });
    onDone();
  };
  const upload = useMutation({
    mutationFn: uploadOriginal,
    onSuccess: (stored) => {
      setFile(storedRef(stored));
      setLabel((l) => l || stored.originalName.replace(/\.[^.]*$/, ""));
    },
  });
  const save = useMutation({
    mutationFn: (body: object) =>
      attachment
        ? api(`/attachments/${attachment.id}`, { method: "PUT", body })
        : api(`/pets/${petId}/attachments`, { method: "POST", body }),
    onSuccess: done,
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });
  const remove = useMutation({
    mutationFn: () => api(`/attachments/${attachment!.id}`, { method: "DELETE" }),
    onSuccess: done,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (upload.isPending) return;
    const body = { fileId: file?.fileId ?? 0, label, date };
    const found: Record<string, string> = {};
    for (const issue of attachmentInput.safeParse(body).error?.issues ?? [])
      found[issue.path.join(".")] ??= issue.message;
    if (!file) found.fileId = "Choose a file";
    if (date > localToday()) found.date ??= "Can't be in the future";
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate(attachment ? { label, date } : body);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {file ? (
        <FileChip file={file} onRemove={attachment ? undefined : () => setFile(null)} />
      ) : (
        <FilePicker onPick={([f]) => f && upload.mutate(f)} busy={upload.isPending} label="Choose file" />
      )}
      {(errors.fileId || upload.error) && (
        <p className="text-xs text-danger">{errors.fileId ?? upload.error?.message}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" htmlFor={`${id}-label`} error={errors.label}>
          <Input
            id={`${id}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Adoption papers"
          />
        </Field>
        <Field label="Date" htmlFor={`${id}-date`} error={errors.date}>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            max={localToday()}
            invalid={!!errors.date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      {(save.error || remove.error) && !Object.keys(errors).length && (
        <p className="text-danger">{(save.error ?? remove.error)!.message}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 max-md:sticky max-md:-bottom-4 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-elevated max-md:px-4 max-md:py-3">
        {attachment && (
          <Button variant="ghost" className="text-danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending || upload.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
