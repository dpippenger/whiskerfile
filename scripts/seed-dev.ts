// Fills a local dev server (`bun run dev`) with sample pets for trying the UI.
// Usage: bun run seed:dev [base URL, default http://localhost:3000]

import { deflateSync } from "node:zlib";

const base = process.argv[2] ?? "http://localhost:3000";

async function call<T>(path: string, method: string, body: unknown): Promise<T> {
  const init: RequestInit =
    body instanceof FormData
      ? { method, body }
      : { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
  const res = await fetch(new URL(`/api${path}`, base), init);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** A small PNG with a diagonal gradient between two colours, encoded by hand. */
function gradientPng(size: number, from: [number, number, number], to: [number, number, number]): Uint8Array<ArrayBuffer> {
  const raw = new Uint8Array(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size - 2);
      for (let c = 0; c < 3; c++) raw[y * (size * 3 + 1) + 1 + x * 3 + c] = from[c]! + (to[c]! - from[c]!) * t;
    }
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, size);
  new DataView(header.buffer).setUint32(4, size);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

async function photo(name: string, from: [number, number, number], to: [number, number, number]) {
  const form = new FormData();
  form.append("file", new File([gradientPng(320, from, to)], `${name}.png`));
  return (await call<{ id: number }>("/files", "POST", form)).id;
}

const registries = (await (await fetch(new URL("/api/chip-registries", base))).json()) as { id: number; name: string }[];
const registry = (name: string) => registries.find((r) => r.name === name)?.id ?? null;

const blank = {
  breed: null,
  sex: "unknown",
  reproductive: "unknown",
  dob: null,
  dobEstimated: false,
  coatColor: null,
  eyeColor: null,
  microchip: null,
  chipRegistryId: null,
  photoFileId: null,
  notes: null,
  deceasedOn: null,
};

const pets = [
  {
    ...blank,
    name: "Miso",
    species: "cat",
    breed: "Domestic shorthair",
    sex: "female",
    reproductive: "altered",
    dob: "2014-03-15",
    coatColor: "Calico",
    eyeColor: "Green",
    microchip: "985112345678903",
    chipRegistryId: registry("HomeAgain"),
    photoFileId: await photo("miso", [217, 119, 6], [30, 27, 75]),
    notes: "Hyperthyroid since 2023. Eats a renal diet.\nHates the carrier; spray Feliway 15 minutes before vet trips.",
  },
  {
    ...blank,
    name: "Sir Reginald Fluffington the Third",
    species: "cat",
    breed: "Maine Coon",
    sex: "male",
    reproductive: "altered",
    dob: "2020-06-01",
    dobEstimated: true,
    coatColor: "Brown tabby",
    eyeColor: "Amber",
    photoFileId: await photo("reggie", [120, 72, 40], [12, 74, 110]),
  },
  {
    ...blank,
    name: "Biscuit",
    species: "dog",
    breed: "Beagle",
    sex: "male",
    reproductive: "intact",
    dob: "2025-09-20",
    microchip: "900215004123456",
    chipRegistryId: registry("AKC Reunite"),
    photoFileId: await photo("biscuit", [250, 204, 21], [190, 24, 93]),
  },
  {
    ...blank,
    name: "Pepper",
    species: "cat",
    sex: "female",
    reproductive: "altered",
    dob: "2005-05-05",
    deceasedOn: "2022-01-12",
    coatColor: "Black",
  },
];

for (const pet of pets) {
  const created = await call<{ id: number; name: string }>("/pets", "POST", pet);
  console.log(`Added ${created.name} (#${created.id})`);
}

// A year of history for the first two pets: monthly weigh-ins, a few vet
// visits and home exams. Dates are relative to today.
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ids = (await (await fetch(new URL("/api/pets", base))).json()) as { id: number; name: string }[];
const idOf = (name: string) => ids.find((p) => p.name === name)!.id;

const history: [string, number, number][] = [
  // name, starting grams, grams per month (Miso is slowly losing weight)
  ["Miso", 4300, -25],
  ["Sir Reginald Fluffington the Third", 7600, 15],
];
for (const [name, start, perMonth] of history) {
  const petId = idOf(name);
  for (let month = 12; month >= 1; month--) {
    const value = start + perMonth * (12 - month) + Math.round(Math.sin(month) * 40);
    await call(`/pets/${petId}/measurements`, "POST", { date: daysAgo(month * 30 + 3), kind: "weight", value });
  }
}

const misoId = idOf("Miso");
const visits = [
  {
    kind: "vet",
    date: daysAgo(200),
    clinic: "Northside Animal Hospital",
    vet: "Dr. Okafor",
    reason: "Senior wellness exam",
    notes: "Mild dental tartar. T4 at top of range; recheck in 6 months.\nBlood pressure 150 systolic.",
    vitals: { weight: 4120, temperature: 38.6, heart_rate: 196, respiratory_rate: 28, body_condition: 5 },
  },
  {
    kind: "home",
    date: daysAgo(45),
    clinic: "",
    vet: "",
    reason: "Weekly check",
    notes: "Eating well, drinking a little more than usual.",
    vitals: { weight: 4050, respiratory_rate: 24 },
  },
  {
    kind: "vet",
    date: daysAgo(12),
    clinic: "Northside Animal Hospital",
    vet: "Dr. Okafor",
    reason: "Thyroid recheck",
    notes: "Weight down 70 g since spring. Started methimazole 2.5 mg twice daily.",
    vitals: { weight: 3980, temperature: 38.9, heart_rate: 210, body_condition: 4 },
  },
];
/** A minimal one-page PDF showing a line of text. */
function pdf(text: string): Uint8Array<ArrayBuffer> {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

async function upload(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const form = new FormData();
  form.append("file", new File([bytes], name));
  return (await call<{ id: number }>("/files", "POST", form)).id;
}

const labReport = await upload(pdf("IDEXX Chem 17 + Total T4 (sample)"), "IDEXX results.pdf");
const receipt = await upload(gradientPng(480, [240, 240, 240], [200, 200, 200]), "Receipt.png");
for (const [i, visit] of visits.entries()) {
  // The latest visit comes with its lab report and receipt.
  await call(`/pets/${misoId}/entries`, "POST", i === 2 ? { ...visit, fileIds: [labReport, receipt] } : visit);
}
await call(`/pets/${misoId}/attachments`, "POST", {
  fileId: await upload(pdf("Adoption contract (sample)"), "adoption.pdf"),
  label: "Adoption papers",
  date: "2014-06-01",
});
await call(`/pets/${misoId}/measurements`, "POST", { date: daysAgo(2), kind: "weight", value: 3995 });
console.log("Added a year of weights and visits");
