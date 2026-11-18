import { expect, test } from "bun:test";
import { createAuthenticator } from "./auth";
import { openDb } from "./db";
import { backupRuns, users } from "./db/schema";
import { startApi } from "./test-support";

async function setup() {
  const api = await startApi();
  const get = (path: string, jwt?: string) => api.call(path, { jwt: jwt ?? null });
  return { ...api, get };
}

test("requests without a valid Access token are rejected", async () => {
  const { server, token, get, otherKey, db } = await setup();
  using _ = server;
  const rejected = [
    undefined,
    "not-a-jwt",
    await token({ email: "a@example.com" }, { aud: "another-app" }),
    await token({ email: "a@example.com" }, { iss: "https://other.cloudflareaccess.com" }),
    await token({ email: "a@example.com" }, { exp: "-1m" }),
    await token({ email: "a@example.com" }, { key: otherKey }),
    await token({ sub: "service-token" }),
  ];
  for (const jwt of rejected) {
    for (const path of [
      "/api/me",
      "/api/backups",
      "/api/backups/1/download",
      "/api/pets",
      "/api/pets/1",
      "/api/files/1",
      "/api/chip-registries",
      "/api/pets/1/records",
      "/api/pets/1/measurements?kind=weight",
      "/api/unknown",
    ]) {
      expect((await get(path, jwt)).status).toBe(401);
    }
  }
  expect((await fetch(new URL("/api/backups", server.url), { method: "POST" })).status).toBe(401);
  expect(db.select().from(users).all()).toEqual([]);
});

test("a valid token signs in and creates the user once", async () => {
  const { server, token, get, db } = await setup();
  using _ = server;
  const jwt = await token({ email: "Riley@Example.com" });
  const first = await get("/api/me", jwt);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ email: "riley@example.com", name: "riley" });
  await get("/api/me", jwt);
  expect(db.select().from(users).all()).toHaveLength(1);
});

test("dev mode signs in a fixed local user without a token", async () => {
  const { db } = openDb(":memory:");
  const user = await createAuthenticator(db, { mode: "dev" })(new Request("http://localhost/api/me"));
  expect(user?.email).toBe("dev@localhost");
});

test("the backup list keeps every downloadable snapshot beyond recent history", async () => {
  const { server, token, db } = await setup();
  using _ = server;
  db.insert(backupRuns).values({ startedAt: 1, status: "ok", file: "old-kept.sqlite" }).run();
  db.insert(backupRuns).values({ startedAt: 2, status: "ok" }).run();
  for (let i = 0; i < 25; i++) db.insert(backupRuns).values({ startedAt: 10 + i, status: "failed" }).run();

  const res = await fetch(new URL("/api/backups", server.url), {
    headers: { "Cf-Access-Jwt-Assertion": await token({ email: "a@example.com" }) },
  });
  const runs = (await res.json()) as { file: string | null }[];
  expect(runs).toHaveLength(21);
  expect(runs.at(-1)?.file).toBe("old-kept.sqlite");
});

test("a backup can be run, listed and downloaded", async () => {
  const { server, token } = await setup();
  using _ = server;
  const headers = { "Cf-Access-Jwt-Assertion": await token({ email: "a@example.com" }) };
  const call = (path: string, method = "GET") => fetch(new URL(path, server.url), { method, headers });

  const run = (await (await call("/api/backups", "POST")).json()) as { id: number; status: string; file: string };
  expect(run.status).toBe("ok");
  expect(await (await call("/api/backups")).json()).toMatchObject([{ id: run.id, status: "ok" }]);

  const download = await call(`/api/backups/${run.id}/download`);
  expect(download.headers.get("content-disposition")).toContain(run.file);
  expect(new TextDecoder().decode((await download.arrayBuffer()).slice(0, 15))).toBe("SQLite format 3");
  expect((await call("/api/backups/999/download")).status).toBe(404);
});

test("writes are rejected without a valid Access token", async () => {
  const { server, call } = await setup();
  using _ = server;
  const writes: [string, string][] = [
    ["POST", "/api/pets"],
    ["PUT", "/api/pets/1"],
    ["DELETE", "/api/pets/1"],
    ["POST", "/api/files"],
    ["POST", "/api/chip-registries"],
    ["PUT", "/api/chip-registries/1"],
    ["DELETE", "/api/chip-registries/1"],
    ["PATCH", "/api/me"],
    ["POST", "/api/pets/1/entries"],
    ["PUT", "/api/entries/1"],
    ["DELETE", "/api/entries/1"],
    ["POST", "/api/pets/1/measurements"],
    ["PUT", "/api/measurements/1"],
    ["DELETE", "/api/measurements/1"],
  ];
  for (const [method, path] of writes) {
    expect((await call(path, { method, body: {}, jwt: null })).status).toBe(401);
  }
});
