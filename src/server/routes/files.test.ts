import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { MAX_UPLOAD_BYTES, PREVIEW_MAX_BYTES, sniffMime } from "../files";
import { startApi } from "../test-support";

const bytes = (text: string) => new TextEncoder().encode(text);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

test("file types are identified from their contents", () => {
  expect(sniffMime(JPEG)).toBe("image/jpeg");
  expect(sniffMime(PNG)).toBe("image/png");
  expect(sniffMime(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  expect(sniffMime(bytes("GIF89a..."))).toBe("image/gif");
  expect(sniffMime(bytes("%PDF-1.7\n"))).toBe("application/pdf");
  expect(sniffMime(bytes("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBe(
    "application/octet-stream",
  );
  expect(sniffMime(bytes("<html><script>alert(1)</script>"))).toBe("application/octet-stream");
  expect(sniffMime(new Uint8Array())).toBe("application/octet-stream");
});

async function setup() {
  const api = await startApi();
  const upload = (data: Uint8Array<ArrayBuffer>, name: string, type = "") => {
    const form = new FormData();
    form.append("file", new File([data], name, { type }));
    return api.call("/api/files", { method: "POST", body: form });
  };
  return { ...api, upload };
}

test("images and PDFs are shown inline; anything else, whatever it claims to be, downloads", async () => {
  const { server, call, upload } = await setup();
  using _ = server;

  const photo = (await (await upload(JPEG, "Miso at the vet.jpg")).json()) as { id: number; mime: string };
  expect(photo.mime).toBe("image/jpeg");
  const shown = await call(`/api/files/${photo.id}`);
  expect(shown.headers.get("content-type")).toBe("image/jpeg");
  expect(shown.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''Miso%20at%20the%20vet.jpg");
  expect(shown.headers.get("x-content-type-options")).toBe("nosniff");
  expect(new Uint8Array(await shown.arrayBuffer())).toEqual(JPEG);

  const forced = await call(`/api/files/${photo.id}?download`);
  expect(forced.headers.get("content-disposition")).toStartWith("attachment;");

  const svg = (await (
    await upload(bytes("<svg><script>alert(1)</script></svg>"), "x.svg", "image/svg+xml")
  ).json()) as { id: number; mime: string };
  expect(svg.mime).toBe("application/octet-stream");
  const served = await call(`/api/files/${svg.id}`);
  expect(served.headers.get("content-type")).toBe("application/octet-stream");
  expect(served.headers.get("content-disposition")).toStartWith("attachment;");
});

test("the same bytes are stored once, under their hash, with no leftovers", async () => {
  const { server, upload, dataDir } = await setup();
  using _ = server;
  const first = (await (await upload(PNG, "a.png")).json()) as { id: number; sha256: string };
  const second = (await (await upload(PNG, "b.png")).json()) as { id: number };
  expect(second.id).toBe(first.id);
  expect(first.sha256).toBe(new Bun.CryptoHasher("sha256").update(PNG).digest("hex"));
  expect(await readdir(join(dataDir, "uploads"))).toEqual([first.sha256]);
});

test("empty, missing and oversized uploads are refused", async () => {
  const { server, call, upload } = await setup();
  using _ = server;
  expect((await upload(new Uint8Array(), "empty.png")).status).toBe(400);
  expect((await call("/api/files", { method: "POST", body: new FormData() })).status).toBe(400);
  const big = await upload(new Uint8Array(MAX_UPLOAD_BYTES + 1), "big.bin");
  expect(big.status).toBe(413);
});

test("uploading the same bytes again restores a stored copy that went missing", async () => {
  const { server, call, upload, dataDir } = await setup();
  using _ = server;
  const first = (await (await upload(PNG, "a.png")).json()) as { id: number; sha256: string };
  await Bun.write(join(dataDir, "uploads", first.sha256), "trunc");

  const again = (await (await upload(PNG, "a.png")).json()) as { id: number };
  expect(again.id).toBe(first.id);
  expect(new Uint8Array(await (await call(`/api/files/${first.id}`)).arrayBuffer())).toEqual(PNG);
});

test("a large image can be given a small preview; nothing else can", async () => {
  const { server, call, upload } = await setup();
  using _ = server;
  const big = new Uint8Array(PREVIEW_MAX_BYTES + 10);
  big.set(JPEG);
  const photo = (await (await upload(big, "receipt.jpg")).json()) as { id: number; previewId: number | null };
  expect(photo.previewId).toBeNull();
  const lab = (await (await upload(bytes("%PDF-1.7 lab"), "lab.pdf")).json()) as { id: number };

  const preview = (data: Uint8Array<ArrayBuffer>, id: number) => {
    const form = new FormData();
    form.append("file", new File([data], "preview.webp"));
    return call(`/api/files/${id}/preview`, { method: "PUT", body: form });
  };
  const small = new Uint8Array([...bytes("RIFF\0\0\0\0WEBPVP8 "), 1, 2, 3]);
  const set = await preview(small, photo.id);
  expect(set.status).toBe(200);
  const updated = (await set.json()) as { id: number; previewId: number };
  expect(updated.id).toBe(photo.id);
  expect((await call(`/api/files/${updated.previewId}`)).headers.get("content-type")).toBe("image/webp");

  expect((await preview(small, lab.id)).status).toBe(400);
  expect((await preview(bytes("%PDF-1.7 not an image"), photo.id)).status).toBe(400);
  expect((await preview(big, photo.id)).status).toBe(400);
  expect((await preview(small, 9999)).status).toBe(404);
});
