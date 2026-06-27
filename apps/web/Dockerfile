# Build + run the Next.js dashboard from the monorepo root context.
# (docker-compose builds this with context: . so workspace packages are present.)
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ── Build ──────────────────────────────────────────────────────
# Install in the build stage so every workspace package (including
# packages/ui and packages/shared-types) gets its node_modules — the web build
# type-checks @vasthost/ui from source and needs React types resolvable there.
FROM base AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @vasthost/web build

# ── Runtime ────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo ./
EXPOSE 8111
CMD ["pnpm", "--filter", "@vasthost/web", "start"]
