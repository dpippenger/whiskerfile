FROM oven/bun:1.4.4-slim
WORKDIR /app

# Chromium prints the PDF reports. Its helper processes outlive each print,
# so tini runs as PID 1 to reap them; Bun as PID 1 would leave them as zombies.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium tini \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY bunfig.toml tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src

RUN mkdir /data /backups && chown bun:bun /data /backups
ENV NODE_ENV=production DATA_DIR=/data BACKUP_DIR=/backups CHROMIUM_PATH=/usr/bin/chromium
VOLUME ["/data", "/backups"]
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "fetch('http://localhost:3000/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "src/server/index.ts"]
