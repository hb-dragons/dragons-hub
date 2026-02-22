# dragons-all

Monorepo managed with pnpm workspaces and Turborepo.

## Workspace layout

- `apps/web` - Next.js frontend
- `apps/api` - Hono API service
- `packages/ui` - shared UI package

## Getting started

```bash
pnpm install
pnpm dev
```

## Common commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm coverage`
- `pnpm build`

## Package-specific commands

- `pnpm --filter @dragons/web <script>`
- `pnpm --filter @dragons/api <script>`
- `pnpm --filter @dragons/ui <script>`
