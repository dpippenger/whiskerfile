import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { Condition, Medication, Vaccination } from "../../server/db/schema";
import type { PetHealth } from "../../server/routes/health";
import { formatDate, localToday } from "../../shared/dates";
import {
  CONDITION_KIND_LABEL,
  isActiveCondition,
  medicationState,
  vaccineKey,
  vaccineStatus,
  type DueStatus,
} from "../../shared/health";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { VetLink } from "./vets";

export type HealthEditing =
  | { type: "vaccination"; record: Vaccination }
  | { type: "medication"; record: Medication }
  | { type: "condition"; record: Condition };

function DueBadge({ status, dueDate }: { status: DueStatus | null; dueDate: string | null }) {
  if (status === "overdue") return <Badge tone="danger">Overdue since {formatDate(dueDate!)}</Badge>;
  if (status === "due-soon") return <Badge tone="warning">Due {formatDate(dueDate!)}</Badge>;
  if (dueDate) return <span className="text-xs text-muted-foreground">Next due {formatDate(dueDate)}</span>;
  return null;
}

function Row({
  children,
  label,
  onEdit,
  muted = false,
}: {
  children: ReactNode;
  label: string;
  onEdit: () => void;
  muted?: boolean;
}) {
  return (
    <li className={muted ? "flex items-center gap-3 py-2 text-muted-foreground" : "flex items-center gap-3 py-2"}>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground md:size-9"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
    </li>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground-secondary">{title}</h2>
      {children.length === 0 ? (
        <p className="py-2 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </Card>
  );
}

const sub = "text-xs text-muted-foreground";

/** A record's notes, kept as typed, and who added it. */
function Footnote({ notes, author }: { notes: string | null; author: string }) {
  return (
    <>
      {notes && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground-secondary">{notes}</p>}
      <p className={sub}>Added by {author}</p>
    </>
  );
}

/** A pet's vaccinations (latest dose of each first), medications and conditions. */
export function HealthTab({
  health,
  deceasedOn,
  onEdit,
}: {
  health: PetHealth;
  deceasedOn: string | null;
  onEdit: (editing: HealthEditing) => void;
}) {
  const today = localToday();
  const latest = vaccineStatus(health.vaccinations, today, deceasedOn);
  const latestIds = new Set(latest.map((l) => l.dose.id));
  const stateOf = (m: Medication) => medicationState(m, today, deceasedOn);
  // Courses not yet started are listed with the current ones, marked with their start date.
  const current = health.medications.filter((m) => stateOf(m) !== "past");
  const past = health.medications.filter((m) => stateOf(m) === "past");
  const active = health.conditions.filter((c) => isActiveCondition(c, today));
  const resolved = health.conditions.filter((c) => !isActiveCondition(c, today));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @5xl/main:grid-cols-2 @5xl/main:items-start">
      <Section title="Vaccinations" empty="No vaccinations recorded.">
        {latest.flatMap(({ dose, status }) => [
          <Row
            key={dose.id}
            label={`${dose.vaccine} of ${formatDate(dose.dateGiven)}`}
            onEdit={() => onEdit({ type: "vaccination", record: dose })}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{dose.vaccine}</span>
              {/* Nothing is due for a pet that has passed away, not even as plain text. */}
              <DueBadge status={status} dueDate={deceasedOn ? null : dose.dueDate} />
            </div>
            <p className={sub}>
              Given {formatDate(dose.dateGiven)}
              <VetLink vetId={dose.vetId} prefix=" · " />
              {dose.lot && ` · lot ${dose.lot}`}
            </p>
            <Footnote notes={dose.notes} author={dose.author} />
          </Row>,
          // Earlier doses of the same vaccine, quietly beneath it.
          ...health.vaccinations
            .filter((v) => !latestIds.has(v.id) && vaccineKey(v.vaccine) === vaccineKey(dose.vaccine))
            .map((v) => (
              <Row
                key={v.id}
                muted
                label={`${v.vaccine} of ${formatDate(v.dateGiven)}`}
                onEdit={() => onEdit({ type: "vaccination", record: v })}
              >
                <p className="text-xs">
                  Earlier dose · {formatDate(v.dateGiven)}
                  <VetLink vetId={v.vetId} prefix=" · " />
                </p>
              </Row>
            )),
        ])}
      </Section>

      <div className="space-y-4">
        <Section title="Medications" empty="None current.">
          {current.map((m) => (
            <Row key={m.id} label={m.drug} onEdit={() => onEdit({ type: "medication", record: m })}>
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{m.drug}</span>
                {stateOf(m) === "upcoming" && <Badge tone="info">Starts {formatDate(m.startDate)}</Badge>}
                {(m.dose || m.frequency) && (
                  <span className="text-foreground-secondary">
                    {" "}
                    · {[m.dose, m.frequency].filter(Boolean).join(", ")}
                  </span>
                )}
              </p>
              <p className={sub}>
                {stateOf(m) === "upcoming" ? "From" : "Since"} {formatDate(m.startDate)}
                {m.endDate && ` until ${formatDate(m.endDate)}`}
                {m.reason && ` · ${m.reason}`}
              </p>
              <Footnote notes={m.notes} author={m.author} />
            </Row>
          ))}
        </Section>

        <Section title="Conditions" empty="None recorded.">
          {active.map((c) => (
            <Row key={c.id} label={c.title} onEdit={() => onEdit({ type: "condition", record: c })}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{c.title}</span>
                <Badge>{CONDITION_KIND_LABEL[c.kind]}</Badge>
              </div>
              <p className={sub}>Since {formatDate(c.date)}</p>
              <Footnote notes={c.notes} author={c.author} />
            </Row>
          ))}
        </Section>

        {(past.length > 0 || resolved.length > 0) && (
          <Section title="History" empty="">
            {[
              ...past.map((m) => (
                <Row key={`m${m.id}`} muted label={m.drug} onEdit={() => onEdit({ type: "medication", record: m })}>
                  <p className="text-sm">
                    {m.drug}
                    {m.dose && ` · ${m.dose}`}
                  </p>
                  <p className="text-xs">
                    Medication · {formatDate(m.startDate)}
                    {m.endDate && ` to ${formatDate(m.endDate)}`}
                  </p>
                </Row>
              )),
              ...resolved.map((c) => (
                <Row key={`c${c.id}`} muted label={c.title} onEdit={() => onEdit({ type: "condition", record: c })}>
                  <p className="text-sm">{c.title}</p>
                  <p className="text-xs">
                    {CONDITION_KIND_LABEL[c.kind]} · {formatDate(c.date)}
                    {c.resolvedOn && ` to ${formatDate(c.resolvedOn)}`}
                  </p>
                </Row>
              )),
            ]}
          </Section>
        )}
      </div>
    </div>
  );
}
