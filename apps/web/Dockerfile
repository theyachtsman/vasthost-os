# Build + run the Next.js dashboard from the monorepo root context.
# (docker-compose builds this with context: . so workspace packages are present.)
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ── Install dependencies ───────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --no-frozen-lockfile

# ── Build ──────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @vasthost/web build

# ── Runtime ────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo ./
EXPOSE 8111
CMD ["pnpm", "--filter", "@vasthost/web", "start"]
