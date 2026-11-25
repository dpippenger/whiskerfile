import { expect, test } from "bun:test";
import type { ComparePet } from "../../shared/series";
import { startApi } from "../test-support";
import type { MetricOption } from "./series";

const PET = {
  species: "cat",
  breed: null,
  sex: "female",
  reproductive: "altered",
  dob: null,
  dobEstimated: false,
  coatColor: null,
  eyeColor: null,
  microchip: null,
  chipRegistryId: null,
  photoFileId: null,
  vetId: null,
  notes: null,
  deceasedOn: null,
};

async function setup() {
  const api = await startApi();
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const add = async (name: string, dob: string | null) =>
    (await json<{ id: number }>(api.call("/api/pets", { method: "POST", body: { ...PET, name, dob } }))).id;
  const miso = await add("Miso", "2014-03-15");
  const reggie = await add("Reggie", null);
  const catalog = await json<{ id: number; code: string }[]>(api.call("/api/analytes"));
  const analyte = (code: string) => catalog.find((a) => a.code === code)!.id;
  return { ...api, json, miso, reggie, analyte };
}

test("every pet's weights or results for one test come back in one shape", async () => {
  const { call, json, miso, reggie, analyte } = await setup();
  await call(`/api/pets/${miso}/measurements`, {
    method: "POST",
    body: { date: "2026-01-01", kind: "weight", value: 4100 },
  });
  await call(`/api/pets/${miso}/labs`, {
    method: "POST",
    body: {
      date: "2026-11-06",
      source: "reference_lab",
      lab: null,
      accession: null,
      notes: null,
      entryId: null,
      vetId: null,
      results: [
        { analyteId: analyte("CREA"), valueText: "2.6", unit: "mg/dL", refLow: 0.6, refHigh: 2.4 },
        { analyteId: analyte("FELV"), valueText: "Negative", unit: null, refLow: null, refHigh: null },
      ],
    },
  });

  const weights = await json<ComparePet[]>(call("/api/series?metric=weight"));
  expect(weights.map((p) => [p.name, p.dob, p.results.map((r) => [r.date, r.value, r.unit])])).toEqual([
    ["Miso", "2014-03-15", [["2026-01-01", 4100, "g"]]],
    ["Reggie", null, []],
  ]);

  const crea = await json<ComparePet[]>(call(`/api/series?metric=${analyte("CREA")}`));
  expect(crea.find((p) => p.petId === miso)!.results).toMatchObject([
    { date: "2026-11-06", valueText: "2.6", value: 2.6, unit: "mg/dL", refLow: 0.6, refHigh: 2.4 },
  ]);
  expect(crea.find((p) => p.petId === reggie)!.results).toEqual([]);

  // Only metrics with a number for some pet are offered.
  const metrics = await json<MetricOption[]>(call("/api/series/metrics"));
  expect(metrics.map((m) => [m.key, m.petIds])).toEqual([
    ["weight", [miso]],
    [String(analyte("CREA")), [miso]],
  ]);
});

test("an unknown or malformed metric is refused", async () => {
  const { call } = await setup();
  expect((await call("/api/series")).status).toBe(400);
  expect((await call("/api/series?metric=height")).status).toBe(400);
  expect((await call("/api/series?metric=99999")).status).toBe(404);
});
