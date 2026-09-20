# syntax=docker/dockerfile:1
# Peace✘ - hardened multi-stage build.
# better-sqlite3 needs its native module compiled in the build stage.

FROM node:22-bookworm-slim AS build
WORKDIR /opt/peacex
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM build AS deps
COPY src ./src
COPY scripts ./scripts
COPY test ./test
COPY vitest.config.mjs ./

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /opt/peacex
COPY --from=deps /opt/peacex/node_modules ./node_modules
COPY --from=deps /opt/peacex/src ./src
COPY --from=deps /opt/peacex/scripts ./scripts
COPY package.json ./
RUN groupadd --system --gid 10001 appuser \
 && useradd --system --uid 10001 --gid appuser --home /opt/peacex appuser \
 && mkdir -p /opt/peacex/data /opt/peacex/logs \
 && chown -R appuser:appuser /opt/peacex
USER appuser
VOLUME ["/opt/peacex/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const p=process.env.SECURITY_METRICS_PORT||9090;fetch('http://127.0.0.1:${p}/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]