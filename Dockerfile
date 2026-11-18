FROM oven/bun:1.4.4-slim
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY bunfig.toml tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src

RUN mkdir /data /backups && chown bun:bun /data /backups
ENV NODE_ENV=production DATA_DIR=/data BACKUP_DIR=/backups
VOLUME ["/data", "/backups"]
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "fetch('http://localhost:3000/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["bun", "src/server/index.ts"]
