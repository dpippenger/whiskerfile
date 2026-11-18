import { expect, test } from "bun:test";
import { join } from "node:path";
import { PUBLIC_DIR, staticRoutes } from "./static";
import { dispatch } from "./test-support";

test("every icon the web app manifest names is served", async () => {
  const manifest = (await Bun.file(join(PUBLIC_DIR, "manifest.webmanifest")).json()) as {
    start_url: string;
    display: string;
    icons: { src: string; type: string }[];
  };
  expect(manifest).toMatchObject({ start_url: "/", display: "standalone" });
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons) {
    const served = await dispatch(staticRoutes, new Request(new URL(icon.src, "http://whiskerfile.test")));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe(icon.type);
  }
});
