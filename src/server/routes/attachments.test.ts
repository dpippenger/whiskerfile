import { expect, test } from "bun:test";
import { attachments, files } from "../db/schema";
import { startApi } from "../test-support";
import type { PetRecords } from "./records";

const PET = {
  name: "Miso",
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
  notes: null,
  deceasedOn: null,
};

const visit = (fields: object = {}) => ({
  kind: "vet",
  date: "2026-10-01",
  clinic: "",
  vet: "",
  reason: "Bloodwork",
  notes: "",
  vitals: {},
  ...fields,
});

async function setup() {
  const api = await startApi();
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const upload = async (bytes: Uint8Array<ArrayBuffer>, name: string) => {
    const form = new FormData();
    form.append("file", new File([bytes], name));
    return json<{ id: number; sha256: string }>(api.call("/api/files", { method: "POST", body: form }));
  };
  const pet = await json<{ id: number }>(api.call("/api/pets", { method: "POST", body: PET }));
  const records = () => json<PetRecords>(api.call(`/api/pets/${pet.id}/records`));
  return { ...api, json, upload, records, petId: pet.id };
}

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7\n${text}`);

test("files attached to a visit are stored byte for byte and follow its date", async () => {
  const { server, call, json, upload, records, petId } = await setup();
  using _ = server;
  // A large photo of a receipt: attachments are originals, never shrunk or re-encoded.
  const photo = crypto.getRandomValues(new Uint8Array(3 * 1024 * 1024));
  photo.set([0xff, 0xd8, 0xff, 0xe0]);
  const lab = await upload(pdf("chemistry panel"), "Chem 17.pdf");
  const receipt = await upload(photo, "receipt.jpg");
  expect(receipt.sha256).toBe(new Bun.CryptoHasher("sha256").update(photo).digest("hex"));
  expect(new Uint8Array(await (await call(`/api/files/${receipt.id}`)).arrayBuffer())).toEqual(photo);

  const entry = await json<{ id: number }>(
    call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ fileIds: [lab.id, receipt.id] }) }),
  );
  let { entries } = await records();
  expect(entries[0]!.attachments.map((a) => [a.file.originalName, a.file.mime, a.date, a.author])).toEqual([
    ["receipt.jpg", "image/jpeg", "2026-10-01", "a"],
    ["Chem 17.pdf", "application/pdf", "2026-10-01", "a"],
  ]);

  // Moving the visit moves its files; leaving fileIds out keeps them.
  await call(`/api/entries/${entry.id}`, { method: "PUT", body: visit({ date: "2026-10-04" }) });
  ({ entries } = await records());
  expect(entries[0]!.attachments.map((a) => a.date)).toEqual(["2026-10-04", "2026-10-04"]);

  // A list replaces them.
  await call(`/api/entries/${entry.id}`, { method: "PUT", body: visit({ date: "2026-10-04", fileIds: [lab.id] }) });
  ({ entries } = await records());
  expect(entries[0]!.attachments.map((a) => a.fileId)).toEqual([lab.id]);
  await call(`/api/entries/${entry.id}`, { method: "PUT", body: visit({ date: "2026-10-04", fileIds: [] }) });
  ({ entries } = await records());
  expect(entries[0]!.attachments).toEqual([]);
});

test("a visit naming an unknown file is refused and changes nothing", async () => {
  const { server, call, json, upload, records, db, petId } = await setup();
  using _ = server;
  const lab = await upload(pdf("x"), "lab.pdf");
  const entry = await json<{ id: number }>(
    call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ fileIds: [lab.id] }) }),
  );

  const bad = await call(`/api/entries/${entry.id}`, {
    method: "PUT",
    body: visit({ reason: "Changed", fileIds: [lab.id, 9999] }),
  });
  expect(bad.status).toBe(400);
  expect((await json<{ fields: object }>(bad)).fields).toEqual({ fileIds: "Unknown file" });
  const { entries } = await records();
  expect(entries[0]).toMatchObject({ reason: "Bloodwork" });
  expect(entries[0]!.attachments.map((a) => a.fileId)).toEqual([lab.id]);

  expect((await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ fileIds: [9999] }) })).status).toBe(
    400,
  );
  expect(db.select().from(attachments).all()).toHaveLength(1);
});

test("files can be filed on their own, relabelled and removed", async () => {
  const { server, call, json, upload, records, petId } = await setup();
  using _ = server;
  const scan = await upload(pdf("adoption"), "adoption.pdf");
  const created = await call(`/api/pets/${petId}/attachments`, {
    method: "POST",
    body: { fileId: scan.id, label: "Adoption papers", date: "2019-05-01" },
  });
  expect(created.status).toBe(201);
  const { id } = await json<{ id: number }>(created);

  const renamed = await call(`/api/attachments/${id}`, {
    method: "PUT",
    body: { label: "Adoption contract", date: "2019-05-02" },
  });
  expect(await json(renamed)).toMatchObject({ label: "Adoption contract", date: "2019-05-02", fileId: scan.id });
  const { attachments: own, entries } = await records();
  expect(own.map((a) => [a.label, a.file.originalName])).toEqual([["Adoption contract", "adoption.pdf"]]);
  expect(entries).toEqual([]);

  expect(
    (
      await call(`/api/pets/${petId}/attachments`, {
        method: "POST",
        body: { fileId: 9999, label: "", date: "2019-05-01" },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("/api/pets/999/attachments", {
        method: "POST",
        body: { fileId: scan.id, label: "", date: "2019-05-01" },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(`/api/pets/${petId}/attachments`, {
        method: "POST",
        body: { fileId: scan.id, label: "", date: "2019-02-30" },
      })
    ).status,
  ).toBe(400);

  expect((await call(`/api/attachments/${id}`, { method: "DELETE" })).status).toBe(204);
  expect((await records()).attachments).toEqual([]);
  expect((await call(`/api/attachments/${id}`, { method: "DELETE" })).status).toBe(404);
  // The stored file stays.
  expect((await call(`/api/files/${scan.id}`)).status).toBe(200);
});

test("a visit's files can only be relabelled with the visit, but can be removed directly", async () => {
  const { server, call, json, upload, records, petId } = await setup();
  using _ = server;
  const lab = await upload(pdf("x"), "lab.pdf");
  await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ fileIds: [lab.id] }) });
  const attached = (await records()).entries[0]!.attachments[0]!;
  expect(
    (await call(`/api/attachments/${attached.id}`, { method: "PUT", body: { label: "x", date: "2020-01-01" } })).status,
  ).toBe(404);
  expect((await call(`/api/attachments/${attached.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await records()).entries[0]!.attachments).toEqual([]);
});

test("deleting a pet removes its attachments but not the stored files", async () => {
  const { server, call, upload, db, petId } = await setup();
  using _ = server;
  const lab = await upload(pdf("x"), "lab.pdf");
  await call(`/api/pets/${petId}/entries`, { method: "POST", body: visit({ fileIds: [lab.id] }) });
  await call(`/api/pets/${petId}/attachments`, {
    method: "POST",
    body: { fileId: lab.id, label: "", date: "2026-01-01" },
  });
  expect((await call(`/api/pets/${petId}`, { method: "DELETE" })).status).toBe(204);
  expect(db.select().from(attachments).all()).toEqual([]);
  expect(db.select().from(files).all()).toHaveLength(1);
});
