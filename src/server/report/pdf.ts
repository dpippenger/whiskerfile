import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Prints a self-contained HTML document to PDF. */
export type RenderPdf = (html: string) => Promise<Uint8Array<ArrayBuffer>>;

/**
 * Far more than a report takes (well under a second); it only stops a stuck
 * Chromium from holding the request open forever.
 */
export const PDF_TIMEOUT_SECONDS = 30;

/**
 * Prints with headless Chromium. Each run gets its own temporary profile and
 * home directory, removed afterwards, so it works as any user without a
 * writable home. The sandbox is off because containers rarely allow the
 * namespaces it needs; the page is our own markup and its content security
 * policy forbids every request, so nothing outside it is loaded.
 */
export function chromiumPdf(binary: string): RenderPdf {
  return async (html) => {
    const dir = await mkdtemp(join(tmpdir(), "whiskerfile-report-"));
    try {
      const page = join(dir, "report.html");
      const out = join(dir, "report.pdf");
      const log = join(dir, "chromium.log");
      await Bun.write(page, html);
      const proc = Bun.spawn(
        [
          binary,
          "--headless",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
          `--user-data-dir=${join(dir, "profile")}`,
          "--no-pdf-header-footer",
          `--print-to-pdf=${out}`,
          pathToFileURL(page).href,
        ],
        {
          env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: join(dir, "config"), XDG_CACHE_HOME: join(dir, "cache") },
          stdin: "ignore",
          stdout: "ignore",
          // A file, not a pipe: a helper process that outlives a killed Chromium could
          // hold a pipe open and keep this wait (and the cleanup below) from finishing.
          stderr: Bun.file(log),
          timeout: PDF_TIMEOUT_SECONDS * 1000,
          killSignal: "SIGKILL",
        },
      );
      const code = await proc.exited;
      const pdf = Bun.file(out);
      if (code !== 0 || !(await pdf.exists())) {
        const reason = proc.signalCode ? `was stopped (${proc.signalCode})` : `exited with ${code}`;
        const tail = (
          await Bun.file(log)
            .text()
            .catch(() => "")
        )
          .trim()
          .split("\n")
          .slice(-3)
          .join(" / ");
        throw new Error(`Chromium ${reason}: ${tail}`);
      }
      return new Uint8Array(await pdf.arrayBuffer());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
