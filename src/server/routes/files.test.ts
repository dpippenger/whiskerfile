import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { MAX_UPLOAD_BYTES, sniffMime } from "../files";
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
