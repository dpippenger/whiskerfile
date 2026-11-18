import { expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiRoutes } from "./app";
import { createAuthenticator } from "./auth";
import { openDb } from "./db";
import { users } from "./db/schema";

const ISSUER = "https://team.cloudflareaccess.com";
const AUDIENCE = "aud-tag";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const { sqlite, db } = openDb(":memory:");
  const authenticate = createAuthenticator(db, {
    mode: "access",
    issuer: ISSUER,
    audience: AUDIENCE,
    keys: createLocalJWKSet({ keys: [await exportJWK(publicKey)] }),
  });
  const root = await mkdtemp(join(tmpdir(), "whiskerfile-app-"));
  const server = Bun.serve({
    port: 0,
    routes: apiRoutes({ sqlite, db, dataDir: join(root, "data"), backupDir: join(root, "backups") }, authenticate),
  });

  const token = (claims: Record<string, unknown>, opts: { aud?: string; exp?: string; key?: CryptoKey } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(opts.aud ?? AUDIENCE)
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? privateKey);
  const get = (path: string, jwt?: string) =>
    fetch(new URL(path, server.url), { headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {} });

  return { db, server, token, get, otherKey: other.privateKey };
}

test("requests without a valid Access token are rejected", async () => {
  const { server, token, get, otherKey, db } = await setup();
  using _ = server;
  const rejected = [
    undefined,
    "not-a-jwt",
    await token({ email: "a@example.com" }, { aud: "another-app" }),
    await token({ email: "a@example.com" }, { exp: "-1m" }),
    await token({ email: "a@example.com" }, { key: otherKey }),
    await token({ sub: "service-token" }),
  ];
  for (const jwt of rejected) {
    for (const path of ["/api/me", "/api/backups", "/api/backups/1/download", "/api/unknown"]) {
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
