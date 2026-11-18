import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { Pet, StoredFile } from "../../server/db/schema";
import { localToday } from "../../shared/dates";
import {
  CHART_COLORS,
  petInput,
  REPRODUCTIVE,
  reproductiveLabel,
  SEXES,
  SPECIES,
  SPECIES_LABEL,
  type PetInput,
} from "../../shared/pets";
import { Page } from "../components/page";
import { PetPhoto } from "../components/pet-photo";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Dialog } from "../components/ui/dialog";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { api, ApiError } from "../lib/api";
import { downsizeImage } from "../lib/image";
import { usePet, useRegistries } from "../lib/queries";
import { cn } from "../lib/utils";

type FormState = Omit<PetInput, "chipRegistryId" | "photoFileId" | "chartColor"> & {
  chipRegistryId: string;
  photoFileId: number | null;
  chartColor: string;
};

const SEX_LABEL = { female: "Female", male: "Male", unknown: "Unknown" } as const;

function initialState(pet?: Pet): FormState {
  return {
    name: pet?.name ?? "",
    species: pet?.species ?? "cat",
    breed: pet?.breed ?? "",
    sex: pet?.sex ?? "unknown",
    reproductive: pet?.reproductive ?? "unknown",
    dob: pet?.dob ?? "",
    dobEstimated: pet?.dobEstimated ?? false,
    coatColor: pet?.coatColor ?? "",
    eyeColor: pet?.eyeColor ?? "",
    chartColor: pet?.chartColor ?? "",
    microchip: pet?.microchip ?? "",
    chipRegistryId: pet?.chipRegistryId ? String(pet.chipRegistryId) : "",
    photoFileId: pet?.photoFileId ?? null,
    notes: pet?.notes ?? "",
    deceasedOn: pet?.deceasedOn ?? "",
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground-secondary">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

async function uploadPhoto(file: File) {
  const form = new FormData();
  form.append("file", await downsizeImage(file, 1024));
  return api<StoredFile>("/files", { method: "POST", body: form });
}

/**
 * Picks a photo by button or drag and drop. The upload itself belongs to the
 * form, which must not save while one is in flight.
 */
function PhotoPicker({
  name,
  species,
  fileId,
  uploading,
  error,
  onPick,
  onRemove,
}: {
  name: string;
  species: Pet["species"];
  fileId: number | null;
  uploading: boolean;
  error: Error | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // One upload at a time, so a slower earlier upload can never win.
  const pick = (file: File | undefined) => file && !uploading && onPick(file);

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
        pick(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed border-transparent p-2 sm:flex-row",
        dragging && "border-primary/60 bg-primary/5",
      )}
    >
      <PetPhoto pet={{ name: name || "New pet", species, photoFileId: fileId }} className="size-32" />
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => input.current?.click()} disabled={uploading}>
            <ImagePlus className="size-4" aria-hidden />
            {uploading ? "Uploading…" : fileId ? "Change photo" : "Add photo"}
          </Button>
          {fileId && (
            <Button variant="ghost" onClick={onRemove} disabled={uploading}>
              Remove
            </Button>
          )}
        </div>
        <p className="hidden text-xs text-muted-foreground md:block">Or drop an image here.</p>
        {error && <p className="text-xs text-danger">{error.message}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function DeletePet({ pet }: { pet: Pet }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api(`/pets/${pet.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["pets", pet.id] });
      void queryClient.invalidateQueries({ queryKey: ["pets"] });
      navigate("/");
    },
  });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-danger/20">
      <div>
        <h2 className="text-sm font-semibold">Delete {pet.name}</h2>
        <p className="text-muted-foreground">Removes the profile and every record kept for {pet.name}.</p>
      </div>
      <Button className="text-danger" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden />
        Delete pet
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${pet.name}?`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            remove.mutate();
          }}
        >
          <p className="text-foreground-secondary">
            This permanently removes {pet.name}'s profile and records. Existing backups still contain them.
          </p>
          <Field label={`Type ${pet.name} to confirm`} htmlFor="confirm-name">
            <Input id="confirm-name" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          {remove.error && <p className="text-danger">{remove.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-danger text-background hover:bg-danger/90"
              disabled={typed.trim() !== pet.name || remove.isPending}
            >
              Delete
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

function PetForm({ pet }: { pet?: Pet }) {
  const [form, setForm] = useState(() => initialState(pet));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const registries = useRegistries();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const id = useId();
  const today = localToday();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const upload = useMutation({ mutationFn: uploadPhoto, onSuccess: (file) => set("photoFileId", file.id) });
  const fid = (name: string) => `${id}-${name}`;

  const save = useMutation({
    mutationFn: (body: object) =>
      pet ? api<Pet>(`/pets/${pet.id}`, { method: "PUT", body }) : api<Pet>("/pets", { method: "POST", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["pets", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
      navigate(`/pets/${saved.id}`);
    },
    onError: (err) => err instanceof ApiError && setErrors(err.fields),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (upload.isPending) return;
    const body = {
      ...form,
      chartColor: form.chartColor || undefined,
      chipRegistryId: form.chipRegistryId ? Number(form.chipRegistryId) : null,
    };
    const result = petInput.safeParse(body);
    const found: Record<string, string> = {};
    for (const issue of result.error?.issues ?? []) found[issue.path.join(".")] ??= issue.message;
    if (form.dob && form.dob > today) found.dob ??= "Can't be in the future";
    if (form.deceasedOn && form.deceasedOn > today) found.deceasedOn ??= "Can't be in the future";
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate(body);
  };

  const text = (name: keyof FormState) => ({
    id: fid(name),
    value: String(form[name] ?? ""),
    invalid: !!errors[name],
    onChange: (e: { target: { value: string } }) => set(name, e.target.value as never),
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <Card>
          <PhotoPicker
            name={form.name}
            species={form.species}
            fileId={form.photoFileId}
            uploading={upload.isPending}
            error={upload.error}
            onPick={(file) => upload.mutate(file)}
            onRemove={() => set("photoFileId", null)}
          />
          {errors.photoFileId && <p className="mt-2 text-xs text-danger">{errors.photoFileId}</p>}
        </Card>

        <Section title="About">
          <Field label="Name" htmlFor={fid("name")} error={errors.name} className="sm:col-span-2">
            <Input {...text("name")} autoComplete="off" required />
          </Field>
          <Field label="Species" htmlFor={fid("species")}>
            <Select {...text("species")}>
              {SPECIES.map((s) => (
                <option key={s} value={s}>
                  {SPECIES_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Breed" htmlFor={fid("breed")} error={errors.breed}>
            <Input {...text("breed")} placeholder="Domestic shorthair" />
          </Field>
          <Field label="Sex" htmlFor={fid("sex")}>
            <Select {...text("sex")}>
              {SEXES.map((s) => (
                <option key={s} value={s}>
                  {SEX_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Spayed / neutered" htmlFor={fid("reproductive")}>
            <Select {...text("reproductive")}>
              {REPRODUCTIVE.map((s) => (
                <option key={s} value={s}>
                  {reproductiveLabel(s, form.sex)}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section title="Birth">
          <Field label="Date of birth" htmlFor={fid("dob")} error={errors.dob}>
            <Input {...text("dob")} type="date" max={today} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm sm:min-h-9">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.dobEstimated}
              onChange={(e) => set("dobEstimated", e.target.checked)}
            />
            The date is an estimate
          </label>
          <Field
            label="Date of passing"
            htmlFor={fid("deceasedOn")}
            error={errors.deceasedOn}
            hint="Leave empty while they're with you."
          >
            <Input {...text("deceasedOn")} type="date" max={today} />
          </Field>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Appearance">
          <Field label="Coat colour" htmlFor={fid("coatColor")} error={errors.coatColor}>
            <Input {...text("coatColor")} placeholder="Tabby" />
          </Field>
          <Field label="Eye colour" htmlFor={fid("eyeColor")} error={errors.eyeColor}>
            <Input {...text("eyeColor")} placeholder="Green" />
          </Field>
          <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
            <legend className="mb-1.5 text-xs font-medium text-foreground-secondary">Colour in charts</legend>
            <div className="flex flex-wrap gap-2">
              {CHART_COLORS.map((color) => (
                <label key={color} className="relative">
                  <input
                    type="radio"
                    name={fid("chartColor")}
                    value={color}
                    checked={form.chartColor === color}
                    onChange={() => set("chartColor", color)}
                    className="peer sr-only"
                  />
                  <span
                    className="block size-11 cursor-pointer rounded-full border-2 border-transparent ring-offset-2 ring-offset-card peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-primary md:size-8"
                    style={{ background: color }}
                  />
                  <span className="sr-only">{color}</span>
                </label>
              ))}
            </div>
            {!form.chartColor && <p className="text-xs text-muted-foreground">Chosen automatically if left unset.</p>}
          </fieldset>
        </Section>

        <Section title="Microchip">
          <Field label="Chip number" htmlFor={fid("microchip")} error={errors.microchip}>
            <Input {...text("microchip")} inputMode="numeric" className="font-mono" autoComplete="off" />
          </Field>
          <Field label="Registry" htmlFor={fid("chipRegistryId")} error={errors.chipRegistryId}>
            <Select {...text("chipRegistryId")}>
              <option value="">Not registered / unknown</option>
              {registries.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <Card className="space-y-4">
          <Field
            label="Notes"
            htmlFor={fid("notes")}
            error={errors.notes}
            hint="Temperament, diet, anything worth remembering."
          >
            <Textarea {...text("notes")} rows={4} />
          </Field>
        </Card>

        {save.error && !(save.error instanceof ApiError && Object.keys(save.error.fields).length) && (
          <p className="text-danger">{save.error.message}</p>
        )}
        {Object.keys(errors).length > 0 && <p className="text-danger">Check the highlighted fields.</p>}
        <div className="flex justify-end gap-2">
          <Link
            href={pet ? `/pets/${pet.id}` : "/"}
            className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground md:min-h-9"
          >
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={save.isPending || upload.isPending}>
            {save.isPending ? "Saving…" : upload.isPending ? "Uploading photo…" : pet ? "Save changes" : "Add pet"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function NewPet() {
  return (
    <Page title="Add pet">
      <PetForm />
    </Page>
  );
}

export function EditPet({ id }: { id: number }) {
  const pet = usePet(id);
  if (pet.error) return <Page title="Edit pet">{<p className="text-danger">{pet.error.message}</p>}</Page>;
  if (!pet.data) return null;
  return (
    <Page title={`Edit ${pet.data.name}`}>
      <div className="space-y-4">
        <PetForm pet={pet.data} />
        <DeletePet pet={pet.data} />
      </div>
    </Page>
  );
}
