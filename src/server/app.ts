import type { Authenticate } from "./auth";
import { authedWith, error, type AppContext } from "./http";
import { backupRoutes } from "./routes/backups";
import { fileRoutes } from "./routes/files";
import { petRoutes } from "./routes/pets";
import { registryRoutes } from "./routes/registries";

/** API routes. Every handler here runs only for an authenticated user. */
export function apiRoutes(ctx: AppContext, authenticate: Authenticate) {
  const authed = authedWith(authenticate);
  return {
    "/api/me": { GET: authed((_req, user) => Response.json(user)) },
    ...backupRoutes(ctx, authed),
    ...fileRoutes(ctx, authed),
    ...petRoutes(ctx, authed),
    ...registryRoutes(ctx, authed),
    "/api/*": authed(() => error(404, "Not found")),
  };
}
