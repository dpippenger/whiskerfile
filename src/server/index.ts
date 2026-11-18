import { createRemoteJWKSet } from "jose";
import index from "../web/index.html";
import { apiRoutes } from "./app";
import { createAuthenticator, type AuthOptions } from "./auth";
import { failInterruptedRuns, runBackup } from "./backup";
import { config } from "./config";
import { openDb } from "./db";

function authOptions(): AuthOptions {
  if (config.authMode === "dev") {
    console.warn("AUTH_MODE=dev: every request is signed in as a local user. Do not expose this server.");
    return { mode: "dev" };
  }
  if (!config.accessTeamDomain || !config.accessAud) {
    throw new Error("Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD, or AUTH_MODE=dev for local development.");
  }
  const issuer = `https://${config.accessTeamDomain}`;
  return {
    mode: "access",
    issuer,
    audience: config.accessAud,
    keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
  };
}

const { sqlite, db } = openDb(config.dataDir);
const ctx = { sqlite, db, dataDir: config.dataDir, backupDir: config.backupDir };

failInterruptedRuns(db);
Bun.cron(config.backupCron, async () => {
  const run = await runBackup(ctx);
  if (run.status === "failed") console.error(`Backup failed: ${run.error}`);
});

const server = Bun.serve({
  port: config.port,
  // Uploads are capped at 25 MB; this rejects anything far larger before it is read.
  maxRequestBodySize: 32 * 1024 * 1024,
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  routes: {
    "/healthz": new Response("ok"),
    ...apiRoutes(ctx, createAuthenticator(db, authOptions())),
    "/*": index,
  },
});

console.log(`Whiskerfile listening on ${server.url}`);
