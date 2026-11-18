import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromiumPdf } from "./pdf";

let scratch: string | null = null;

afterEach(async () => {
  if (!scratch) return;
  // Stop the helper the fake browser left running, then remove its folder.
  const pid = await Bun.file(join(scratch, "child.pid"))
    .text()
    .catch(() => "");
  if (pid.trim()) process.kill(Number(pid), "SIGKILL");
  await rm(scratch, { recursive: true, force: true });
  scratch = null;
});

const reportDirs = async () => (await readdir(tmpdir())).filter((name) => name.startsWith("whiskerfile-report-"));

test("a failed print is reported with the browser's last words, even when a helper outlives it", async () => {
  scratch = await mkdtemp(join(tmpdir(), "whiskerfile-fake-chromium-"));
  const binary = join(scratch, "chromium");
  // Like Chromium: a helper process inherits stderr and keeps running after the browser exits.
  await Bun.write(
    binary,
    `#!/bin/sh\necho "starting" >&2\necho "no usable display" >&2\nsleep 60 &\necho $! > "${scratch}/child.pid"\nexit 3\n`,
  );
  await chmod(binary, 0o755);
  const before = await reportDirs();

  const print = chromiumPdf(binary)("<!doctype html><p>hi</p>");
  await expect(print).rejects.toThrow("Chromium exited with 3: starting / no usable display");
  // Its temporary folder is gone.
  expect(await reportDirs()).toEqual(before);
});
