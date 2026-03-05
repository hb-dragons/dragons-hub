FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS builder
RUN apk add --no-cache git openssh-client
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json tsconfig.base.json ./

# Copy packages needed by API
COPY packages/ ./packages/

# Copy API app
COPY apps/api/ ./apps/api/

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Build API and its workspace dependencies
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@dragons/api

# Create a self-contained production deployment with only prod dependencies
RUN pnpm --filter @dragons/api deploy --legacy --prod /app/deploy

# Production stage
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

# Copy built dist from tsup (workspace packages compiled in)
COPY --from=builder --chown=hono:nodejs /app/apps/api/dist ./dist

# Copy production node_modules from pnpm deploy (all external npm packages)
COPY --from=builder --chown=hono:nodejs /app/deploy/node_modules ./node_modules

RUN chown -R hono:nodejs /app

USER hono

EXPOSE 8080
ENV PORT=8080

CMD ["node", "dist/index.js"]
