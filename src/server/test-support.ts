import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiRoutes } from "./app";
import { createAuthenticator } from "./auth";
import { openDb } from "./db";

export const ISSUER = "https://team.cloudflareaccess.com";
export const AUDIENCE = "aud-tag";

/**
 * Serves the API on a loopback port with an in-memory database and a local
 * Access signing key. Tests go through Bun's route table on purpose so that
 * method dispatch, path parameters and the /api/* fallback are covered too.
 * Dispose the returned server (`using`) at the end of each test.
 */
export async function startApi() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const { sqlite, db } = openDb(":memory:");
  const authenticate = createAuthenticator(db, {
    mode: "access",
    issuer: ISSUER,
    audience: AUDIENCE,
    keys: createLocalJWKSet({ keys: [await exportJWK(publicKey)] }),
  });
  const root = await mkdtemp(join(tmpdir(), "whiskerfile-api-"));
  const dataDir = join(root, "data");
  const server = Bun.serve({
    port: 0,
    routes: apiRoutes({ sqlite, db, dataDir, backupDir: join(root, "backups") }, authenticate),
  });

  const token = (
    claims: Record<string, unknown>,
    opts: { aud?: string; iss?: string; exp?: string; key?: CryptoKey } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? AUDIENCE)
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? privateKey);

  const signedIn = await token({ email: "a@example.com" });

  /**
   * Calls the API as a@example.com. A FormData body is sent as is, `raw` is
   * sent unchanged as JSON, and any other body is serialised to JSON.
   */
  const call = (path: string, init: { method?: string; body?: unknown; raw?: string; jwt?: string | null } = {}) => {
    const headers: Record<string, string> = {};
    const jwt = init.jwt === undefined ? signedIn : init.jwt;
    if (jwt) headers["Cf-Access-Jwt-Assertion"] = jwt;
    let body: BodyInit | undefined;
    if (init.raw !== undefined) {
      headers["Content-Type"] = "application/json";
      body = init.raw;
    } else if (init.body instanceof FormData) body = init.body;
    else if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }
    return fetch(new URL(path, server.url), { method: init.method ?? "GET", headers, body });
  };

  return { db, server, dataDir, token, call, otherKey: other.privateKey };
}
