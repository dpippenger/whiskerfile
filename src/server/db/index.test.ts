import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./index";

test("migrations are found whatever directory the server starts from", async () => {
  const cwd = process.cwd();
  process.chdir(await mkdtemp(join(tmpdir(), "whiskerfile-cwd-")));
  try {
    const { sqlite } = openDb(":memory:");
    const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain("users");
    sqlite.close();
  } finally {
    process.chdir(cwd);
  }
});
