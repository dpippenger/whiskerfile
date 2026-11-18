import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiRoutes } from "./app";
import { createAuthenticator } from "./auth";
import { openDb } from "./db";
import type { RenderPdf } from "./report/pdf";

export const ISSUER = "https://team.cloudflareaccess.com";
export const AUDIENCE = "aud-tag";

type Handler = (req: Request, server: unknown) => Response | Promise<Response>;
type Route = Response | Handler | Partial<Record<string, Handler>>;

const match = (pattern: string, path: string): Record<string, string> | null => {
  if (pattern.endsWith("/*")) return path.startsWith(pattern.slice(0, -1)) ? {} : null;
  const want = pattern.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of want.entries()) {
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(got[i]!);
    else if (part !== got[i]) return null;
  }
  return params;
};

// Bun prefers exact paths, then paths with parameters, then wildcards.
const rank = (pattern: string) => (pattern.endsWith("/*") ? 2 : pattern.includes("/:") ? 1 : 0);

/** The only part of Bun's server object a handler uses. */
const fakeServer = { timeout: () => {} };

/**
 * Dispatches a request through a Bun `routes` table in process, the way
 * Bun.serve would, without opening a listener: method dispatch, path
 * parameters and wildcard fallbacks behave as in the server.
 */
export async function dispatch(routes: object, req: Request): Promise<Response> {
  // Handlers are typed for Bun's request; the one built here carries the same params.
  const table = routes as unknown as Record<string, Route>;
  const path = new URL(req.url).pathname;
  const patterns = Object.keys(table).sort((a, b) => rank(a) - rank(b));
  for (const pattern of patterns) {
    const params = match(pattern, path);
    if (!params) continue;
    const route = table[pattern]!;
    const handler =
      route instanceof Response ? () => route.clone() : typeof route === "function" ? route : route[req.method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler(Object.assign(req, { params }), fakeServer);
  }
  return new Response("Not found", { status: 404 });
}

/**
 * The API with an in-memory database and a local Access signing key, called
 * in process through its route table (see dispatch).
 */
export async function startApi(opts: { renderPdf?: RenderPdf } = {}) {
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
  const routes = apiRoutes(
    { sqlite, db, dataDir, backupDir: join(root, "backups"), renderPdf: opts.renderPdf },
    authenticate,
  );

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
    return dispatch(
      routes,
      new Request(new URL(path, "http://whiskerfile.test"), { method: init.method ?? "GET", headers, body }),
    );
  };

  return { db, dataDir, token, call, otherKey: other.privateKey };
}
