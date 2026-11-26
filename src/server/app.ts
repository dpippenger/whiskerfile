import { eq } from "drizzle-orm";
import { unitsInput } from "../shared/records";
import type { Authenticate } from "./auth";
import { users } from "./db/schema";
import { authedWith, error, parseJson, type AppContext } from "./http";
import { backupRoutes } from "./routes/backups";
import { calendarRoutes } from "./routes/calendar";
import { fileRoutes } from "./routes/files";
import { healthRoutes } from "./routes/health";
import { labImportRoutes } from "./routes/lab-import";
import { labRoutes } from "./routes/labs";
import { petRoutes } from "./routes/pets";
import { recordRoutes } from "./routes/records";
import { registryRoutes } from "./routes/registries";
import { reportRoutes } from "./routes/reports";
import { seriesRoutes } from "./routes/series";
import { vetRoutes } from "./routes/vets";

/** API routes. Every handler here runs only for an authenticated user. */
export function apiRoutes(ctx: AppContext, authenticate: Authenticate) {
  const authed = authedWith(authenticate);
  return {
    "/api/me": {
      GET: authed((_req, user) => Response.json(user)),
      // Display units; null follows the browser's locale.
      PATCH: authed(async (req, user) => {
        const parsed = await parseJson(req, unitsInput);
        if ("response" in parsed) return parsed.response;
        return Response.json(ctx.db.update(users).set(parsed.data).where(eq(users.id, user.id)).returning().get());
      }),
    },
    ...backupRoutes(ctx, authed),
    ...fileRoutes(ctx, authed),
    ...petRoutes(ctx, authed),
    ...recordRoutes(ctx, authed),
    ...labRoutes(ctx, authed),
    ...labImportRoutes(ctx, authed),
    ...seriesRoutes(ctx, authed),
    ...healthRoutes(ctx, authed),
    ...registryRoutes(ctx, authed),
    ...vetRoutes(ctx, authed),
    ...calendarRoutes(ctx, authed),
    ...reportRoutes(ctx, authed),
    "/api/*": authed(() => error(404, "Not found")),
  };
}
