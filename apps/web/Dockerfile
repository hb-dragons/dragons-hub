FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.base.json ./

# Copy packages
COPY packages/ ./packages/

# Copy web app
COPY apps/web/ ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build argument: NEXT_PUBLIC_API_URL is inlined at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@dragons/web...

# Production stage — no pnpm needed, standalone is self-contained
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output (includes server.js + pruned node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Copy static files (not included in standalone by default)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy public directory
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
