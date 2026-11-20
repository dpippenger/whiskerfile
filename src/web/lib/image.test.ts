import { afterEach, expect, test } from "bun:test";
import { downsizeImage } from "./image";

const globals = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete globals.createImageBitmap;
  delete globals.OffscreenCanvas;
});

/**
 * Stands in for the browser's decoder and canvas: every image decodes to
 * `width` x `height`, and the canvas encodes the types in `encodes`, falling
 * back to PNG for any other as browsers do.
 */
function browser(width: number, height: number, encodes = ["image/webp", "image/jpeg"]) {
  const log: unknown[] = [];
  globals.createImageBitmap = async () => ({ width, height, close: () => log.push("closed") });
  globals.OffscreenCanvas = class {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    getContext(kind: string) {
      return {
        drawImage: (_bitmap: unknown, ...box: number[]) => log.push([kind, ...box]),
      };
    }
    async convertToBlob({ type, quality }: { type: string; quality: number }) {
      log.push([type, quality]);
      return new Blob(["pixels"], { type: encodes.includes(type) ? type : "image/png" });
    }
  };
  return log;
}

const photo = (name: string) => new File(["original"], name, { type: "image/jpeg" });

test("a large photo is scaled to the longest edge allowed and re-encoded as WebP", async () => {
  const log = browser(4000, 3000);
  const small = await downsizeImage(photo("IMG_0042.JPEG"), 640);
  expect(log).toEqual([["2d", 0, 0, 640, 480], "closed", ["image/webp", 0.85]]);
  expect(small.name).toBe("IMG_0042.webp");
  expect(small.type).toBe("image/webp");
  expect(await small.text()).toBe("pixels");
});

test("a small image is re-encoded at its own size, never enlarged", async () => {
  const log = browser(300, 200);
  await downsizeImage(photo("icon.png"), 640);
  expect(log[0]).toEqual(["2d", 0, 0, 300, 200]);
});

test("a tall image is limited by its height", async () => {
  const log = browser(1000, 3000);
  await downsizeImage(photo("receipt.jpg"), 1500);
  expect(log[0]).toEqual(["2d", 0, 0, 500, 1500]);
});

test("a browser that can't encode WebP gets a JPEG instead of its PNG fallback", async () => {
  const log = browser(800, 600, ["image/jpeg"]);
  const small = await downsizeImage(photo("scan.final.png"), 640);
  expect(log.slice(2)).toEqual([
    ["image/webp", 0.85],
    ["image/jpeg", 0.88],
  ]);
  expect(small.name).toBe("scan.final.jpg");
  expect(small.type).toBe("image/jpeg");
});

test("a name with no base still gets one", async () => {
  browser(10, 10);
  expect((await downsizeImage(photo(".png"), 640)).name).toBe("photo.webp");
  expect((await downsizeImage(photo("receipt"), 640)).name).toBe("receipt.webp");
});

test("an image the browser can't decode is refused with what to try", async () => {
  globals.createImageBitmap = async () => {
    throw new DOMException("The source image could not be decoded.", "InvalidStateError");
  };
  await expect(downsizeImage(photo("photo.heic"), 640)).rejects.toThrow(
    "This image format can't be used here. Try a JPEG or PNG.",
  );
});
