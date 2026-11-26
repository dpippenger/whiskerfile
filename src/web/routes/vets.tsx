import { ExternalLink, Mail, MapPin, Pencil, Phone, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { formatDate } from "../../shared/dates";
import { LAB_SOURCE_LABEL } from "../../shared/labs";
import { telHref, vetLabel } from "../../shared/vets";
import { Page } from "../components/page";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Dialog } from "../components/ui/dialog";
import { VetForm } from "../components/vets";
import { useVet, useVets } from "../lib/queries";

const contact = "inline-flex items-center gap-1.5 text-primary hover:underline";

/** Every saved vet, each leading to its page. */
export function Vets() {
  const vets = useVets();
  const [, navigate] = useLocation();
  const [adding, setAdding] = useState(false);

  return (
    <Page
      title="Vets"
      actions={
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          Add vet
        </Button>
      }
    >
      {vets.error && <p className="text-danger">{vets.error.message}</p>}
      {vets.data?.length === 0 && (
        <p className="text-muted-foreground">
          No vets yet. Add one to link visits, test results and vaccinations to them.
        </p>
      )}
      <ul className="grid gap-3 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
        {vets.data?.map((vet) => (
          <li key={vet.id}>
            <Link
              href={`/vets/${vet.id}`}
              className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-4 transition duration-200 hover:border-border-strong hover:bg-card-hover"
            >
              <h2 className="truncate text-base font-semibold">{vet.name}</h2>
              {vet.clinic && <p className="truncate text-muted-foreground">{vet.clinic}</p>}
              {(vet.phone || vet.email) && (
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {vet.phone && <span className="tabular-nums">{vet.phone}</span>}
                  {vet.email && <span className="break-all">{vet.email}</span>}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add vet">
        {adding && (
          <VetForm
            onDone={(saved) => {
              setAdding(false);
              if (saved) navigate(`/vets/${saved.id}`);
            }}
          />
        )}
      </Dialog>
    </Page>
  );
}

/** One kind of linked record: a heading and its rows, or nothing when there are none. */
function Linked<T extends { id: number }>({
  title,
  rows,
  href,
  children,
}: {
  title: string;
  rows: T[];
  href: (row: T) => string;
  children: (row: T) => ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={href(row)}
              className="flex min-h-12 flex-wrap items-center gap-x-3 px-3 py-2 hover:bg-white/5 md:px-4"
            >
              {children(row)}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const when = (date: string) => <span className="tabular-nums text-foreground-secondary">{formatDate(date)}</span>;
const what = (text: string) => <span className="min-w-0 flex-1 truncate text-muted-foreground">{text}</span>;

/** A vet's contact details and everything linked to them, across pets. */
export function VetPage({ id }: { id: number }) {
  const query = useVet(id);
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);

  // A non-integer address ("/vets/abc") never loads, so it would render nothing.
  if (query.error || !Number.isInteger(id)) {
    return (
      <Page title="Vet">
        <p className="text-danger">{query.error?.message ?? "Vet not found"}</p>
      </Page>
    );
  }
  const vet = query.data;
  if (!vet) return null;
  const linked = vet.pets.length + vet.labReports.length + vet.entries.length + vet.vaccinations.length;

  return (
    <Page
      title={vet.name}
      actions={
        <Button onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden />
          Edit
        </Button>
      }
    >
      <Card className="space-y-3">
        {vet.clinic && <p className="text-lg font-semibold">{vet.clinic}</p>}
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
          {vet.phone && (
            <li>
              <a href={telHref(vet.phone)} className={`${contact} min-h-11 tabular-nums md:min-h-0`}>
                <Phone className="size-4 shrink-0" aria-hidden />
                {vet.phone}
              </a>
            </li>
          )}
          {vet.email && (
            <li>
              <a href={`mailto:${vet.email}`} className={`${contact} min-h-11 break-all md:min-h-0`}>
                <Mail className="size-4 shrink-0" aria-hidden />
                {vet.email}
              </a>
            </li>
          )}
          {vet.website && (
            <li>
              <a href={vet.website} target="_blank" rel="noreferrer" className={`${contact} min-h-11 md:min-h-0`}>
                <ExternalLink className="size-4 shrink-0" aria-hidden />
                {URL.canParse(vet.website) ? new URL(vet.website).host : vet.website}
              </a>
            </li>
          )}
        </ul>
        {vet.address && (
          <p className="flex gap-1.5 whitespace-pre-wrap text-foreground-secondary">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            {vet.address}
          </p>
        )}
        {vet.notes && <p className="whitespace-pre-wrap text-foreground-secondary">{vet.notes}</p>}
        {!(vet.clinic || vet.phone || vet.email || vet.website || vet.address || vet.notes) && (
          <p className="text-muted-foreground">No contact details yet. Use Edit to add them.</p>
        )}
      </Card>

      {linked === 0 && <p className="text-muted-foreground">No records are linked to {vetLabel(vet)} yet.</p>}
      <Linked title="Usual vet for" rows={vet.pets} href={(pet) => `/pets/${pet.id}`}>
        {(pet) => <span className="font-medium">{pet.name}</span>}
      </Linked>
      <Linked title="Test results" rows={vet.labReports} href={(r) => `/pets/${r.petId}/labs/${r.id}`}>
        {(r) => (
          <>
            <span className="font-medium">{r.pet}</span>
            {when(r.date)}
            {what(r.lab ?? LAB_SOURCE_LABEL[r.source])}
          </>
        )}
      </Linked>
      <Linked title="Visits" rows={vet.entries} href={(e) => `/pets/${e.petId}`}>
        {(e) => (
          <>
            <span className="font-medium">{e.pet}</span>
            {when(e.date)}
            {what(e.reason ?? "Vet visit")}
          </>
        )}
      </Linked>
      <Linked title="Vaccinations" rows={vet.vaccinations} href={(v) => `/pets/${v.petId}/health`}>
        {(v) => (
          <>
            <span className="font-medium">{v.pet}</span>
            {when(v.dateGiven)}
            {what(v.vaccine)}
          </>
        )}
      </Linked>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit vet">
        {editing && <VetForm vet={vet} onDone={() => setEditing(false)} onDeleted={() => navigate("/vets")} />}
      </Dialog>
    </Page>
  );
}
