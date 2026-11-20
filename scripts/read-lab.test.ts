import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs the script as `bun run read:lab` does, in its own process. A preload
// replaces fetch there, so the SDK gets the reply in READ_LAB_TEST_REPLY and
// nothing reaches the network.

const STUB = `
const { status, body } = JSON.parse(process.env.READ_LAB_TEST_REPLY);
globalThis.fetch = async () => Response.json(body, { status });
`;

const EXTRACTION = {
  date: "2026-11-06",
  lab: "IDEXX",
  accession: null,
  source: "reference_lab",
  results: [
    { code: "crea", printedName: "Creatinine", value: "2.9", unit: "mg/dL", rangeLow: "0.6", rangeHigh: "2.4" },
    { code: null, printedName: "Cystatin B", value: "0.4", unit: null, rangeLow: null, rangeHigh: null },
  ],
};
const MESSAGE = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(EXTRACTION) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
};

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "whiskerfile-read-lab-"));
  await Bun.write(join(dir, "stub.ts"), STUB);
  await Bun.write(join(dir, "report.pdf"), "%PDF-1.7\nCreatinine 2.9 mg/dL");
  await Bun.write(join(dir, "notes.pdf"), "<html>not a PDF, whatever the name says</html>");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function readLab(args: string[], reply: { status: number; body: unknown } = { status: 200, body: MESSAGE }) {
  const proc = Bun.spawn(
    [
      process.execPath,
      "--preload",
      join(dir, "stub.ts"),
      join("scripts", "read-lab.ts"),
      ...args.map((a) => join(dir, a)),
    ],
    {
      cwd: join(import.meta.dir, ".."),
      env: {
        PATH: process.env.PATH,
        ANTHROPIC_API_KEY: "test-key",
        ANTHROPIC_BASE_URL: "https://api.anthropic.com",
        READ_LAB_TEST_REPLY: JSON.stringify(reply),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exit };
}

test("a report is read against the seeded catalog and printed as a draft with each result's code", async () => {
  const { stdout, stderr, exit } = await readLab(["report.pdf"]);
  expect(exit).toBe(0);
  const draft = JSON.parse(stdout) as { results: Record<string, unknown>[]; unmatched: unknown[] };
  expect(draft).toMatchObject({ date: "2026-11-06", lab: "IDEXX", accession: null, source: "reference_lab" });
  expect(draft.results).toHaveLength(1);
  expect(draft.results[0]).toMatchObject({
    code: "CREA",
    valueText: "2.9",
    unit: "mg/dL",
    refLow: "0.6",
    refHigh: "2.4",
  });
  expect(draft.results[0]!.analyteId).toBeNumber();
  expect(draft.unmatched).toEqual([
    { printedName: "Cystatin B", valueText: "0.4", unit: null, reason: "Not in your list of tests" },
  ]);
  expect(stderr).toMatch(/^Read in \d+\.\d s\.\n$/);
});

test("without a file, or with one that isn't a PDF or image, it says so and exits 2", async () => {
  const none = await readLab([]);
  expect(none).toEqual({ stdout: "", stderr: "Usage: bun run read:lab <report.pdf | photo.jpg>\n", exit: 2 });
  const wrong = await readLab(["notes.pdf"]);
  expect(wrong).toEqual({
    stdout: "",
    stderr: "Only PDFs and JPEG, PNG, WebP or GIF images can be read.\n",
    exit: 2,
  });
});

test("a failed reading prints its status and message and exits 1", async () => {
  const refused = await readLab(["report.pdf"], {
    status: 401,
    body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
  });
  expect(refused).toEqual({
    stdout: "",
    stderr: "502: The Anthropic API key was refused. Check ANTHROPIC_API_KEY.\n",
    exit: 1,
  });
});
