import { expect, test } from "bun:test";
import { join } from "node:path";
import { PUBLIC_DIR, staticRoutes } from "./static";

test("every icon the web app manifest names is served", async () => {
  using server = Bun.serve({ port: 0, routes: staticRoutes });
  const manifest = (await Bun.file(join(PUBLIC_DIR, "manifest.webmanifest")).json()) as {
    start_url: string;
    display: string;
    icons: { src: string; type: string }[];
  };
  expect(manifest).toMatchObject({ start_url: "/", display: "standalone" });
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons) {
    const served = await fetch(new URL(icon.src, server.url));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe(icon.type);
  }
});
