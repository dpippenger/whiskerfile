// Installs the Bun canary that `.bun-canary-version` pins, for `bun lint`.
//
// Only canary builds have the linter, and the canary GitHub release is a moving
// tag, so the pin is the exact npm version of Bun's platform package
// (`@oven/bun-<os>-<arch>`), where every canary stays published. The tarball is
// checked against the registry's sha512 and its binary unpacked to
// $BUN_INSTALL/canary/<pin>/bin/bun (default ~/.bun), beside the release in
// `.bun-version`, never over it.
//
// Usage: bun scripts/install-bun-canary.ts

import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const pin = (await Bun.file(join(import.meta.dir, "../.bun-canary-version")).text()).trim();
// The pin names a registry path and an install directory, so only a version may reach either.
if (!/^\d+\.\d+\.\d+-canary\.[0-9.]+$/.test(pin)) fail(`.bun-canary-version does not hold a canary version: ${pin}`);

const root = process.env.BUN_INSTALL ?? join(homedir(), ".bun");
const bin = join(root, "canary", pin, "bin", "bun");
if (await Bun.file(bin).exists()) process.exit(0);

const os = { linux: "linux", darwin: "darwin" }[process.platform as string];
const cpu = { x64: "x64", arm64: "aarch64" }[process.arch as string];
if (!os || !cpu) fail(`no canary build for ${process.platform} ${process.arch}`);
const pkg = `@oven/bun-${os}-${cpu}`;

console.log(`Installing bun canary ${pin} (${pkg}) to ${dirname(dirname(bin))}`);
const meta = await fetch(`https://registry.npmjs.org/${pkg}/${pin}`);
if (!meta.ok) fail(`${pkg}@${pin} is not on the npm registry (HTTP ${meta.status})`);
const { dist } = (await meta.json()) as { dist: { integrity: string; tarball: string } };
const tarball = await fetch(dist.tarball);
if (!tarball.ok) fail(`download of ${dist.tarball} failed (HTTP ${tarball.status})`);
const bytes = await tarball.arrayBuffer();
const actual = `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`;
if (actual !== dist.integrity) fail(`integrity mismatch for ${pkg}@${pin}: expected ${dist.integrity}, got ${actual}`);

// Unpacked inside the install root, so the final rename never crosses a
// filesystem and a failed run leaves nothing at the versioned path.
await mkdir(join(root, "canary"), { recursive: true });
const tmp = await mkdtemp(join(root, "canary", ".tmp-"));
try {
  await Bun.write(join(tmp, "bun.tgz"), bytes);
  await Bun.$`tar -xzf ${join(tmp, "bun.tgz")} -C ${tmp} package/bin/bun`;
  await mkdir(dirname(bin), { recursive: true });
  await rename(join(tmp, "package/bin/bun"), bin);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
