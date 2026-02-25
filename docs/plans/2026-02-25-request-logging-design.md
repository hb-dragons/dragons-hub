# Request Logging Design

**Date**: 2026-02-25
**Status**: Approved

## Goal

Add structured HTTP request logging to the API package using Pino, with per-request IDs for traceability and configurable verbosity.

## Current State

- No logging library installed — only ad-hoc `console.*` calls across ~29 files
- No request/response logging middleware
- Existing middleware: CORS, auth (`requireAdmin`), error handler
- SyncLogger class handles sync-specific logging (DB + Redis pub/sub) — remains unchanged

## Design

### Components

**1. Logger setup** (`apps/api/src/config/logger.ts`)

- Root Pino instance, created once at startup
- `LOG_LEVEL` env var controls verbosity (default: `info` in prod, `debug` in dev)
- `pino-pretty` transport in development for colorized, human-readable output
- Standard JSON output in production

**2. Request logging middleware** (`apps/api/src/middleware/request-logger.ts`)

- Generates `requestId` via `crypto.randomUUID()`
- Creates child logger: `logger.child({ requestId })`
- Attaches `logger` and `requestId` to Hono context
- At `info` level: one line per request — method, path, status, duration (ms)
- At `debug` level: also logs headers (redacting `authorization`, `cookie`), query params, request body (POST/PUT/PATCH), response content-length

**3. Migrate existing `console.*` calls**

- Replace `console.log("[Service Name]", ...)` with Pino logger
- Services import the root logger or receive a child logger via parameter
- Error handler logs through Pino instead of `console.error`

### Dependencies

- `pino` (runtime)
- `pino-pretty` (devDependency)

### Environment

New env var `LOG_LEVEL`: `fatal | error | warn | info | debug | trace`. Added to Zod schema in `config/env.ts`.

### Example Output

Standard (`info`):
```
[12:34:56.789] INFO (req-abc123): GET /admin/matches → 200 (45ms)
```

Debug:
```
[12:34:56.780] DEBUG (req-abc123): → GET /admin/matches?leagueId=5&limit=50
  headers: { host: "localhost:3001", accept: "application/json" }
[12:34:56.789] DEBUG (req-abc123): ← 200 (45ms) content-length: 12345
```

### Out of Scope

- SyncLogger (DB + Redis pub/sub for sync runs) — different purpose, unchanged
- Log aggregation infrastructure — just stdout for now
