import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

export function openDb(dataDir: string | ":memory:") {
  let sqlite: Database;
  if (dataDir === ":memory:") {
    sqlite = new Database(":memory:");
  } else {
    mkdirSync(dataDir, { recursive: true });
    sqlite = new Database(join(dataDir, "whiskerfile.sqlite"), { create: true });
    sqlite.run("PRAGMA journal_mode = WAL");
    sqlite.run("PRAGMA synchronous = NORMAL");
  }
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema, casing: "snake_case" });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { sqlite, db };
}

export type Db = ReturnType<typeof openDb>["db"];
