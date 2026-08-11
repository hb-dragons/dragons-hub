FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.base.json ./

# Copy packages (lockfile-complete workspace, mirrors apps/web/Dockerfile)
COPY packages/ ./packages/

# Copy CMS app
COPY apps/cms/ ./apps/cms/

# Install dependencies
RUN pnpm install --frozen-lockfile

# No build args: unlike apps/web there are no NEXT_PUBLIC_* values to inline.
# Payload reads DATABASE_URL_CMS, PAYLOAD_SECRET, GCS_MEDIA_BUCKET,
# GH_DISPATCH_TOKEN and CMS_PUBLIC_URL from runtime env (Cloud Run), so one
# image serves any domain; `next build` imports payload.config without
# connecting (see the comment there).
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@dragons/cms...

# Production stage — no pnpm needed, standalone is self-contained
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Europe/Berlin

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output (includes server.js + pruned node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/apps/cms/.next/standalone ./

# Copy static files (not included in standalone by default)
COPY --from=builder --chown=nextjs:nodejs /app/apps/cms/.next/static ./apps/cms/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Payload migrations run on boot: src/instrumentation.ts initializes Payload
# before the server takes traffic, which applies the committed migrations via
# the postgres adapter's `prodMigrations` (payload.config.ts). The Payload CLI
# is not shipped in the standalone output, so this replaces a
# `payload migrate && start` entrypoint.
CMD ["node", "apps/cms/server.js"]
