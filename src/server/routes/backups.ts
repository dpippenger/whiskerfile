import { desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { join } from "node:path";
import { runBackup } from "../backup";
import { backupRuns } from "../db/schema";
import { error, idParam, type AppContext, type Authed } from "../http";

export function backupRoutes(ctx: AppContext, authed: Authed) {
  const { db, backupDir } = ctx;
  return {
    "/api/backups": {
      // Every run whose snapshot still exists (retention bounds these), plus recent history.
      GET: authed(() =>
        Response.json(
          db
            .select()
            .from(backupRuns)
            .where(or(isNotNull(backupRuns.file), sql`${backupRuns.id} > (select max(id) from backup_runs) - 20`))
            .orderBy(desc(backupRuns.startedAt))
            .all(),
        ),
      ),
      POST: authed(async (req, _user, server) => {
        // A backup to a slow disk can outlast the default idle timeout.
        server.timeout(req, 0);
        return Response.json(await runBackup(ctx));
      }),
    },

    "/api/backups/:id/download": {
      GET: authed<"/api/backups/:id/download">((req) => {
        const id = idParam(req.params.id);
        const run = id ? db.select().from(backupRuns).where(eq(backupRuns.id, id)).get() : undefined;
        if (!run?.file) return error(404, "Snapshot not available");
        return new Response(Bun.file(join(backupDir, "db", run.file)), {
          headers: { "Content-Disposition": `attachment; filename="${run.file}"` },
        });
      }),
    },
  };
}
