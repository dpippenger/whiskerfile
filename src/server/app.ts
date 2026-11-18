import type { BunRequest } from "bun";
import { desc, eq } from "drizzle-orm";
import { join } from "node:path";
import type { Authenticate } from "./auth";
import { runBackup, type BackupContext } from "./backup";
import { backupRuns, type User } from "./db/schema";

type Handler<P extends string> = (req: BunRequest<P>, user: User) => Response | Promise<Response>;

const error = (status: number, message: string) => Response.json({ error: message }, { status });

/** API routes. Every handler here runs only for an authenticated user. */
export function apiRoutes(ctx: BackupContext, authenticate: Authenticate) {
  const { db, backupDir } = ctx;

  const authed =
    <P extends string>(handler: Handler<P>) =>
    async (req: BunRequest<P>) => {
      const user = await authenticate(req);
      return user ? handler(req, user) : error(401, "Not signed in");
    };

  return {
    "/api/me": { GET: authed((_req, user) => Response.json(user)) },

    "/api/backups": {
      GET: authed(() =>
        Response.json(db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(50).all()),
      ),
      POST: authed(async () => Response.json(await runBackup(ctx))),
    },

    "/api/backups/:id/download": {
      GET: authed<"/api/backups/:id/download">((req) => {
        const run = db
          .select()
          .from(backupRuns)
          .where(eq(backupRuns.id, Number(req.params.id)))
          .get();
        if (!run?.file) return error(404, "Snapshot not available");
        return new Response(Bun.file(join(backupDir, "db", run.file)), {
          headers: { "Content-Disposition": `attachment; filename="${run.file}"` },
        });
      }),
    },

    "/api/*": authed(() => error(404, "Not found")),
  };
}
