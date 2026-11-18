import { expect, test } from "bun:test";
import { CHART_COLORS } from "../../shared/pets";
import { startApi } from "../test-support";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const pet = (fields: Record<string, unknown> = {}) => ({
  name: "Miso",
  species: "cat",
  breed: "Domestic shorthair",
  sex: "female",
  reproductive: "altered",
  dob: "2019-04-02",
  dobEstimated: false,
  coatColor: "Calico",
  eyeColor: "Green",
  microchip: "985112345678903",
  chipRegistryId: null,
  photoFileId: null,
  notes: "",
  deceasedOn: null,
  ...fields,
});

async function upload(call: Awaited<ReturnType<typeof startApi>>["call"], bytes: Uint8Array<ArrayBuffer>, name = "photo.png") {
  const form = new FormData();
  form.append("file", new File([bytes], name));
  return call("/api/files", { method: "POST", body: form });
}

test("a pet can be created, read, updated and deleted", async () => {
  const { server, call } = await startApi();
  using _ = server;

  const created = await call("/api/pets", { method: "POST", body: pet() });
  expect(created.status).toBe(201);
  const miso = (await created.json()) as { id: number; chartColor: string; notes: string | null; createdBy: number };
  expect(miso).toMatchObject({ name: "Miso", notes: null, chartColor: CHART_COLORS[0] });

  expect(await (await call(`/api/pets/${miso.id}`)).json()).toMatchObject({ name: "Miso" });

  const updated = await call(`/api/pets/${miso.id}`, { method: "PUT", body: pet({ name: "Miso Soup" }) });
  expect(await updated.json()).toMatchObject({ name: "Miso Soup", chartColor: miso.chartColor });

  const list = (await (await call("/api/pets")).json()) as { name: string }[];
  expect(list.map((p) => p.name)).toEqual(["Miso Soup"]);

  expect((await call(`/api/pets/${miso.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await call(`/api/pets/${miso.id}`)).status).toBe(404);
});

test("each new pet gets its own chart colour unless one is chosen", async () => {
  const { server, call } = await startApi();
  using _ = server;
  const colors = [];
  for (const name of ["A", "B"]) {
    colors.push(((await (await call("/api/pets", { method: "POST", body: pet({ name }) })).json()) as { chartColor: string }).chartColor);
  }
  const chosen = await call("/api/pets", { method: "POST", body: pet({ name: "C", chartColor: CHART_COLORS[5] }) });
  expect(colors).toEqual([CHART_COLORS[0], CHART_COLORS[1]]);
  expect(await chosen.json()).toMatchObject({ chartColor: CHART_COLORS[5] });
});

test("invalid pets get a 400 naming each bad field", async () => {
  const { server, call } = await startApi();
  using _ = server;
  const res = await call("/api/pets", { method: "POST", body: pet({ name: "", dob: "2019-02-30" }) });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { fields: object }).fields).toEqual({
    name: "Name is required",
    dob: "Use a valid date",
  });

  const notJson = await call("/api/pets", { method: "POST", raw: "{not json" });
  expect(notJson.status).toBe(400);
  expect(await notJson.json()).toEqual({ error: "Request body must be JSON" });
  const empty = await call("/api/pets/1", { method: "PUT", raw: "" });
  expect(empty.status).toBe(400);
  const notAnObject = await call("/api/pets", { method: "POST", body: "a string" });
  expect(notAnObject.status).toBe(400);
});

test("a pet may only refer to an existing registry and an image file", async () => {
  const { server, call } = await startApi();
  using _ = server;
  const registries = (await (await call("/api/chip-registries")).json()) as { id: number; name: string }[];
  const homeAgain = registries.find((r) => r.name === "HomeAgain")!;
  const photo = (await (await upload(call, PNG)).json()) as { id: number };
  const pdf = (await (await upload(call, new TextEncoder().encode("%PDF-1.7 x"), "lab.pdf")).json()) as { id: number };

  const ok = await call("/api/pets", { method: "POST", body: pet({ chipRegistryId: homeAgain.id, photoFileId: photo.id }) });
  expect(ok.status).toBe(201);

  const badRegistry = await call("/api/pets", { method: "POST", body: pet({ chipRegistryId: 9999 }) });
  expect(((await badRegistry.json()) as { fields: object }).fields).toHaveProperty("chipRegistryId");
  const pdfPhoto = await call("/api/pets", { method: "POST", body: pet({ photoFileId: pdf.id }) });
  expect(pdfPhoto.status).toBe(400);
  expect(((await pdfPhoto.json()) as { fields: object }).fields).toHaveProperty("photoFileId");
});

test("ids that are not positive integers, or not found, give 404", async () => {
  const { server, call } = await startApi();
  using _ = server;
  for (const path of ["/api/pets/0", "/api/pets/abc", "/api/pets/1.5", "/api/pets/99", "/api/files/x", "/api/files/7"]) {
    expect((await call(path)).status).toBe(404);
  }
  expect((await call("/api/pets/99", { method: "PUT", body: pet() })).status).toBe(404);
  expect((await call("/api/pets/99", { method: "DELETE" })).status).toBe(404);
  expect((await call("/api/chip-registries/99", { method: "DELETE" })).status).toBe(404);
});

test("registries come seeded, can be edited, and cannot be removed while in use", async () => {
  const { server, call } = await startApi();
  using _ = server;
  const seeded = (await (await call("/api/chip-registries")).json()) as { id: number; name: string }[];
  expect(seeded.map((r) => r.name)).toContain("AKC Reunite");

  const added = await call("/api/chip-registries", {
    method: "POST",
    body: { name: "Local shelter", website: "https://shelter.example", phone: "555-0100" },
  });
  const shelter = (await added.json()) as { id: number };
  expect(added.status).toBe(201);
  expect((await call("/api/chip-registries", { method: "POST", body: { name: "Local shelter", website: "", phone: "" } })).status).toBe(409);

  const edited = await call(`/api/chip-registries/${shelter.id}`, {
    method: "PUT",
    body: { name: "Shelter", website: "", phone: "" },
  });
  expect(await edited.json()).toEqual({ id: shelter.id, name: "Shelter", website: null, phone: null });

  const cat = (await (await call("/api/pets", { method: "POST", body: pet({ chipRegistryId: shelter.id }) })).json()) as { id: number };
  const blocked = await call(`/api/chip-registries/${shelter.id}`, { method: "DELETE" });
  expect(blocked.status).toBe(409);
  expect(((await blocked.json()) as { error: string }).error).toContain("Miso");

  await call(`/api/pets/${cat.id}`, { method: "DELETE" });
  expect((await call(`/api/chip-registries/${shelter.id}`, { method: "DELETE" })).status).toBe(204);
});
