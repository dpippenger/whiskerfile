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
