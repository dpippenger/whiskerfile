const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  dataDir: env.DATA_DIR ?? "./data",
  backupDir: env.BACKUP_DIR ?? "./backups",
  backupCron: env.BACKUP_CRON ?? "0 3 * * *",
  // "access" verifies the Cloudflare Access JWT; "dev" signs everyone in as a
  // fixed local user and must never be used on a reachable host.
  authMode: env.AUTH_MODE === "dev" ? ("dev" as const) : ("access" as const),
  accessTeamDomain: env.CF_ACCESS_TEAM_DOMAIN ?? "",
  accessAud: env.CF_ACCESS_AUD ?? "",
  // Prints PDF reports; without it, reports answer 503.
  chromiumPath: env.CHROMIUM_PATH ?? "",
  // Reads lab documents with Claude; without it, importing answers 503.
  anthropicApiKey: env.ANTHROPIC_API_KEY ?? "",
};
