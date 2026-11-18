import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { BackupRun } from "../../server/db/schema";
import { Page } from "../components/page";
import { RegistriesSettings } from "../components/registries-settings";
import { UnitsSettings } from "../components/units-settings";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api } from "../lib/api";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatSize(bytes: number) {
  return bytes < 1_048_576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const STATUS = {
  ok: { tone: "success", label: "OK" },
  failed: { tone: "danger", label: "Failed" },
  running: { tone: "info", label: "Running" },
} as const;

export function Settings() {
  const queryClient = useQueryClient();
  const runs = useQuery({ queryKey: ["backups"], queryFn: () => api<BackupRun[]>("/backups") });
  const backUp = useMutation({
    mutationFn: () => api<BackupRun>("/backups", { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });

  return (
    <Page title="Settings">
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Backups</h2>
              <p className="text-muted-foreground">
                The database and uploaded files are copied to the backup folder on a schedule.
              </p>
            </div>
            <Button variant="primary" onClick={() => backUp.mutate()} disabled={backUp.isPending}>
              {backUp.isPending ? "Backing up…" : "Back up now"}
            </Button>
          </div>

          {backUp.error && <p className="text-danger">{backUp.error.message}</p>}
          {runs.error && <p className="text-danger">{runs.error.message}</p>}
          {runs.data?.length === 0 && <p className="text-muted-foreground">No backups have run yet.</p>}

          {!!runs.data?.length && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {runs.data.map((run) => (
                <li key={run.id} className="px-3 py-1 md:px-4">
                  <div className="flex min-h-11 items-center gap-3">
                    <span className="min-w-0 flex-1 tabular-nums">{dateTime.format(run.startedAt)}</span>
                    <Badge tone={STATUS[run.status].tone}>{STATUS[run.status].label}</Badge>
                    <span className="hidden w-20 text-right font-mono text-xs text-muted-foreground tabular-nums sm:inline">
                      {run.sizeBytes != null && formatSize(run.sizeBytes)}
                    </span>
                    {run.file ? (
                      <a
                        href={`/api/backups/${run.id}/download`}
                        aria-label="Download snapshot"
                        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground md:size-9"
                      >
                        <Download className="size-4" aria-hidden />
                      </a>
                    ) : (
                      <span className="size-11 shrink-0 md:size-9" />
                    )}
                  </div>
                  {run.error && <p className="pb-2 text-xs text-danger">{run.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <UnitsSettings />
          <RegistriesSettings />
        </div>
      </div>
    </Page>
  );
}
