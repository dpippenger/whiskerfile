import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatDate } from "../../shared/dates";
import { CONDITION_KIND_LABEL } from "../../shared/health";
import { formatRange, LAB_SOURCE_LABEL } from "../../shared/labs";
import { reproductiveLabel, SEX_LABEL, SPECIES_LABEL } from "../../shared/pets";
import type { ReportModel } from "./model";

/** What the page embeds besides the model: charts already drawn, fonts and the photo as data URLs. */
export type ReportAssets = {
  weightChart: string | null;
  trendCharts: string[];
  photo: string | null;
  fonts: { sans: string; mono: string };
};

const css = (fonts: ReportAssets["fonts"]) => `
@font-face { font-family: "Inter Variable"; font-weight: 100 900; src: url(${fonts.sans}) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; src: url(${fonts.mono}) format("woff2"); }
@page { margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10pt/1.45 "Inter Variable", sans-serif; color: #111827; }
h1 { margin: 0; font-size: 20pt; line-height: 1.2; }
h2 { margin: 18pt 0 6pt; font-size: 12pt; border-bottom: 1px solid #d1d5db; padding-bottom: 3pt; break-after: avoid; }
h3 { margin: 10pt 0 4pt; font-size: 10pt; break-after: avoid; }
p { margin: 0; }
.muted { color: #6b7280; }
.note { margin-top: 1pt; color: #4b5563; font-size: 8.5pt; white-space: pre-wrap; }
.mono { font-family: "JetBrains Mono", monospace; font-variant-numeric: tabular-nums; }
header { display: flex; gap: 14pt; align-items: flex-start; }
header img { width: 80pt; height: 80pt; object-fit: cover; border-radius: 8pt; }
header .who { flex: 1; }
dl.facts { display: grid; grid-template-columns: max-content 1fr max-content 1fr; gap: 2pt 10pt; margin: 8pt 0 0; }
dl.facts dt { color: #6b7280; }
dl.facts dd { margin: 0; }
.notes { margin-top: 8pt; white-space: pre-wrap; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; }
thead { display: table-header-group; }
th { text-align: left; font-weight: 600; color: #4b5563; border-bottom: 1px solid #d1d5db; padding: 3pt 6pt 3pt 0; }
td { border-bottom: 1px solid #f3f4f6; padding: 3pt 6pt 3pt 0; vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
.high { color: #b91c1c; font-weight: 600; }
.low { color: #b45309; font-weight: 600; }
.trends { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt 14pt; }
.trend, .report, .chart { break-inside: avoid; }
.trend svg, .chart svg { display: block; max-width: 100%; height: auto; }
.report { margin-bottom: 10pt; }
footer { margin-top: 18pt; font-size: 8pt; color: #9ca3af; }
`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const Chart = ({ svg, className }: { svg: string; className: string }) => (
  // Drawn by ECharts from our own data; nothing typed by a user reaches it unescaped.
  <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />
);

/** Fixed column widths, so every table of a kind lines up with the others. */
const Cols = ({ widths }: { widths: number[] }) => (
  <colgroup>
    {widths.map((w, i) => (
      <col key={i} style={{ width: `${w}%` }} />
    ))}
  </colgroup>
);

/** A record's notes, as typed, under its name. */
const Note = ({ text }: { text: string | null }) => (text ? <p className="note">{text}</p> : null);

const Flag = ({ flag }: { flag: string | null }) =>
  flag === "high" ? <span className="high">High</span> : flag === "low" ? <span className="low">Low</span> : null;

function period(m: ReportModel): string {
  if (m.from && m.to) return `${formatDate(m.from)} to ${formatDate(m.to)}`;
  if (m.from) return `Since ${formatDate(m.from)}`;
  if (m.to) return `Up to ${formatDate(m.to)}`;
  return "All records";
}

function Report({ m, assets }: { m: ReportModel; assets: ReportAssets }) {
  const { pet } = m;
  const kind = [SPECIES_LABEL[pet.species], pet.breed].filter(Boolean).join(" · ");
  const latestWeight = m.weights.at(-1);
  return (
    <>
      <header>
        {assets.photo && <img src={assets.photo} alt="" />}
        <div className="who">
          <h1>{pet.name}</h1>
          <p className="muted">
            {kind}
            {m.age && ` · ${m.age}`}
          </p>
          <dl className="facts">
            <dt>Sex</dt>
            <dd>
              {SEX_LABEL[pet.sex]}, {reproductiveLabel(pet.reproductive, pet.sex).toLowerCase()}
            </dd>
            <dt>Born</dt>
            <dd>{pet.dob ? `${pet.dobEstimated ? "About " : ""}${formatDate(pet.dob)}` : "Unknown"}</dd>
            {pet.coatColor && (
              <>
                <dt>Coat</dt>
                <dd>{pet.coatColor}</dd>
              </>
            )}
            {pet.eyeColor && (
              <>
                <dt>Eyes</dt>
                <dd>{pet.eyeColor}</dd>
              </>
            )}
            {pet.microchip && (
              <>
                <dt>Microchip</dt>
                <dd>
                  <span className="mono">{pet.microchip}</span>
                  {pet.registry && ` (${pet.registry})`}
                </dd>
              </>
            )}
            {pet.deceasedOn && (
              <>
                <dt>Passed away</dt>
                <dd>{formatDate(pet.deceasedOn)}</dd>
              </>
            )}
            <dt>Records</dt>
            <dd>{period(m)}</dd>
          </dl>
        </div>
      </header>
      {pet.notes && <p className="notes">{pet.notes}</p>}

      <Section title="Weight">
        {m.weights.length === 0 ? (
          <p className="muted">No weights recorded.</p>
        ) : (
          <>
            <p>
              Latest <span className="mono">{latestWeight!.value.toFixed(2)}</span> {m.weightUnit} on{" "}
              {formatDate(latestWeight!.date)}
              {m.weights.length > 1 && (
                <span className="muted">
                  {" "}
                  · {m.weights.length} weigh-ins since {formatDate(m.weights[0]!.date)}
                </span>
              )}
            </p>
            {assets.weightChart && <Chart svg={assets.weightChart} className="chart" />}
          </>
        )}
      </Section>

      {m.trends.length > 0 && (
        <Section title="Lab trends">
          <p className="muted" style={{ marginBottom: "6pt" }}>
            Each test with two or more results. The shaded band is the reference range printed on each report.
          </p>
          <div className="trends">
            {m.trends.map((t, i) => (
              <div key={t.code} className="trend">
                <h3>
                  {t.name}{" "}
                  <span className="muted">
                    {[t.code !== t.name && t.code, t.series.unit].filter(Boolean).join(" · ")}
                  </span>
                </h3>
                <Chart svg={assets.trendCharts[i]!} className="chart" />
                {t.series.otherUnits > 0 && (
                  <p className="muted">
                    {t.series.otherUnits} {t.series.otherUnits === 1 ? "result" : "results"} in another unit not drawn.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Lab results">
        {m.reports.length === 0 && <p className="muted">No lab reports.</p>}
        {m.reports.map((r) => (
          <div key={r.id} className="report">
            <h3>
              {formatDate(r.date)} <span className="muted">· {r.lab ?? LAB_SOURCE_LABEL[r.source]}</span>
              {r.accession && <span className="muted"> · {r.accession}</span>}
            </h3>
            <table>
              <Cols widths={[38, 16, 14, 20, 12]} />
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Result</th>
                  <th>Unit</th>
                  <th>Range</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.results.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {x.name}
                      {x.code !== x.name && <span className="muted"> · {x.code}</span>}
                    </td>
                    <td className={`mono ${x.flag === "high" || x.flag === "low" ? x.flag : ""}`}>{x.valueText}</td>
                    <td>{x.unit}</td>
                    <td className="mono">{formatRange(x.refLow, x.refHigh)}</td>
                    <td>
                      <Flag flag={x.flag} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.notes && <p className="notes">{r.notes}</p>}
          </div>
        ))}
      </Section>

      <Section title="Vaccinations">
        {m.vaccinations.length === 0 ? (
          <p className="muted">None recorded.</p>
        ) : (
          <table>
            <Cols widths={[26, 16, 24, 22, 12]} />
            <thead>
              <tr>
                <th>Vaccine</th>
                <th>Given</th>
                <th>Next due</th>
                <th>Vet</th>
                <th>Lot</th>
              </tr>
            </thead>
            <tbody>
              {m.vaccinations.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.vaccine}
                    <Note text={v.notes} />
                  </td>
                  <td>{formatDate(v.dateGiven)}</td>
                  <td>
                    {v.dueDate && v.latest ? (
                      formatDate(v.dueDate)
                    ) : v.dueDate ? (
                      <span className="muted">Superseded</span>
                    ) : null}
                    {v.status === "overdue" && <span className="high"> · Overdue</span>}
                    {v.status === "due-soon" && <span className="low"> · Due soon</span>}
                  </td>
                  <td>{v.vet}</td>
                  <td className="mono">{v.lot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Medications">
        {m.medications.length === 0 ? (
          <p className="muted">None recorded.</p>
        ) : (
          <table>
            <Cols widths={[30, 22, 28, 20]} />
            <thead>
              <tr>
                <th>Medication</th>
                <th>Dose</th>
                <th>Dates</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {m.medications.map((med) => (
                <tr key={med.id}>
                  <td>
                    {med.drug}
                    {med.state === "current" && <span className="muted"> · current</span>}
                    {med.state === "upcoming" && <span className="muted"> · not started</span>}
                    <Note text={med.notes} />
                  </td>
                  <td>{[med.dose, med.frequency].filter(Boolean).join(", ")}</td>
                  <td>
                    {formatDate(med.startDate)}
                    {med.endDate ? ` to ${formatDate(med.endDate)}` : " onwards"}
                  </td>
                  <td>{med.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Conditions">
        {m.conditions.length === 0 ? (
          <p className="muted">None recorded.</p>
        ) : (
          <table>
            <Cols widths={[30, 14, 26, 30]} />
            <thead>
              <tr>
                <th>Condition</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {m.conditions.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>{CONDITION_KIND_LABEL[c.kind]}</td>
                  <td>
                    {formatDate(c.date)}
                    {c.resolvedOn ? ` to ${formatDate(c.resolvedOn)}` : " · ongoing"}
                  </td>
                  <td className="notes" style={{ marginTop: 0 }}>
                    {c.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <footer>
        Prepared {formatDate(m.today)} from Whiskerfile. Reference ranges are those printed by each lab; flags compare
        each result with its own range.
      </footer>
    </>
  );
}

/** The whole report as one self-contained HTML document, ready to print. */
export function reportHtml(m: ReportModel, assets: ReportAssets): string {
  const body = renderToStaticMarkup(<Report m={m} assets={assets} />);
  const title = `${m.pet.name}: health report`;
  // Everything is inline; the policy stops the page from loading anything else, file or network.
  const policy = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>${escape(title)}</title><style>${css(assets.fonts)}</style></head><body>${body}</body></html>`;
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
