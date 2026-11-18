import { join } from "node:path";

export const PUBLIC_DIR = join(import.meta.dir, "../web/public");

const file = (name: string, type: string) =>
  new Response(Bun.file(join(PUBLIC_DIR, name)), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
  });

/**
 * The icons named in the web app manifest, at the fixed paths it uses. The
 * manifest itself is linked from index.html and served by the bundler.
 */
export const staticRoutes = {
  "/icon.svg": () => file("icon.svg", "image/svg+xml"),
  "/icon-192.png": () => file("icon-192.png", "image/png"),
  "/icon-512.png": () => file("icon-512.png", "image/png"),
};
