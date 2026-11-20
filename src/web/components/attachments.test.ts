import { afterEach, expect, test } from "bun:test";
import type { StoredFile } from "../../server/db/schema";
import { formatSize, uploadOriginal } from "./attachments";

const globals = globalThis as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globals.createImageBitmap;
  delete globals.OffscreenCanvas;
});

const MB = 1024 * 1024;
const stored = (fields: Partial<StoredFile>) =>
  ({
    id: 7,
    originalName: "photo.jpg",
    mime: "image/jpeg",
    sizeBytes: 3 * MB,
    previewId: null,
    ...fields,
  }) as StoredFile;

/** Replaces fetch with the API's answers in order, recording what was sent. */
function server(...answers: (() => Response)[]) {
  const calls: { path: string; method: string; file: File }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ path: String(url), method: init.method!, file: (init.body as FormData).get("file") as File });
    return answers[calls.length - 1]!();
  }) as typeof fetch;
  return calls;
}

/** A browser that decodes every image as 1280 x 960 and encodes WebP. */
function decodeImages() {
  globals.createImageBitmap = async () => ({ width: 1280, height: 960, close: () => {} });
  globals.OffscreenCanvas = class {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    getContext() {
      return { drawImage: () => {} };
    }
    async convertToBlob({ type }: { type: string }) {
      return new Blob([`${this.width}x${this.height}`], { type });
    }
  };
}

const photo = new File(["original bytes"], "photo.jpg", { type: "image/jpeg" });

test("a file is uploaded exactly as picked", async () => {
  const report = new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" });
  const answer = stored({ originalName: "report.pdf", mime: "application/pdf" });
  const calls = server(() => Response.json(answer, { status: 201 }));
  expect(await uploadOriginal(report)).toEqual(answer);
  expect(calls.map((c) => [c.method, c.path, c.file.name])).toEqual([["POST", "/api/files", "report.pdf"]]);
  expect(await calls[0]!.file.text()).toBe("%PDF-1.7");
});

test("a small image, or one that already has a preview, needs no preview made", async () => {
  // With a working decoder, a preview made by mistake would show up as a second request.
  decodeImages();
  for (const answer of [stored({ sizeBytes: 512 * 1024 }), stored({ previewId: 3 })]) {
    const calls = server(() => Response.json(answer, { status: 201 }));
    expect(await uploadOriginal(photo)).toEqual(answer);
    expect(calls).toHaveLength(1);
  }
});

test("a large image also gets a small preview, made here from the original", async () => {
  decodeImages();
  const withPreview = stored({ previewId: 8 });
  const calls = server(
    () => Response.json(stored({}), { status: 201 }),
    () => Response.json(withPreview),
  );
  expect(await uploadOriginal(photo)).toEqual(withPreview);
  expect(calls.map((c) => [c.method, c.path])).toEqual([
    ["POST", "/api/files"],
    ["PUT", "/api/files/7/preview"],
  ]);
  expect([calls[0]!.file.name, await calls[0]!.file.text()]).toEqual(["photo.jpg", "original bytes"]);
  // At most 640 px on the long edge, re-encoded.
  expect(calls[1]!.file.name).toBe("photo.webp");
  expect(await calls[1]!.file.text()).toBe("640x480");
});

test("a preview that can't be made or stored leaves the upload as it is", async () => {
  // The browser can't decode it: nothing more is sent.
  globals.createImageBitmap = async () => {
    throw new DOMException("The source image could not be decoded.", "InvalidStateError");
  };
  const undecodable = server(() => Response.json(stored({}), { status: 201 }));
  expect(await uploadOriginal(photo)).toEqual(stored({}));
  expect(undecodable).toHaveLength(1);

  // The server refuses the preview: the original still counts as uploaded.
  decodeImages();
  server(
    () => Response.json(stored({}), { status: 201 }),
    () => Response.json({ error: "A preview can be at most 512 KB" }, { status: 400 }),
  );
  expect(await uploadOriginal(photo)).toEqual(stored({}));
});

test("a failed upload is an error, with the server's reason", async () => {
  server(() => Response.json({ error: "Files can be at most 25 MB" }, { status: 413 }));
  await expect(uploadOriginal(photo)).rejects.toThrow("Files can be at most 25 MB");
});

test("sizes are shown in the largest unit that fits", () => {
  expect(formatSize(0)).toBe("0 B");
  expect(formatSize(1023)).toBe("1023 B");
  expect(formatSize(1024)).toBe("1 KB");
  expect(formatSize(MB - 1)).toBe("1024 KB");
  expect(formatSize(MB)).toBe("1.0 MB");
  expect(formatSize(2.56 * MB)).toBe("2.6 MB");
});
