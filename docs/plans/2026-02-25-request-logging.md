# Request Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured HTTP request logging to the API using Pino, with per-request IDs and configurable verbosity.

**Architecture:** Pino root logger created at startup, configured via `LOG_LEVEL` env var. A Hono middleware generates a unique request ID per request, creates a child logger, attaches both to the Hono context, and logs request/response summaries. All existing `console.*` calls are migrated to use the logger.

**Tech Stack:** Pino, pino-pretty (dev), Hono middleware, crypto.randomUUID()

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install pino and pino-pretty**

Run:
```bash
pnpm --filter @dragons/api add pino && pnpm --filter @dragons/api add -D pino-pretty
```

**Step 2: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add pino and pino-pretty dependencies"
```

---

### Task 2: Create logger config and add LOG_LEVEL to env schema

**Files:**
- Create: `apps/api/src/config/logger.ts`
- Create: `apps/api/src/config/logger.test.ts`
- Modify: `apps/api/src/config/env.ts`

**Step 1: Add LOG_LEVEL to env schema**

In `apps/api/src/config/env.ts`, add to the `envSchema` object:

```typescript
LOG_LEVEL: z
  .enum(["fatal", "error", "warn", "info", "debug", "trace"])
  .default("info"),
```

**Step 2: Write the failing test for logger config**

Create `apps/api/src/config/logger.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  it("exports a pino logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("creates child loggers with additional context", () => {
    const child = logger.child({ requestId: "test-123" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });
});
```

**Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/config/logger.test.ts`
Expected: FAIL — module not found

**Step 4: Implement logger config**

Create `apps/api/src/config/logger.ts`:

```typescript
import pino from "pino";
import { env } from "./env";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "HH:MM:ss.l",
      },
    },
  }),
});
```

**Step 5: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- src/config/logger.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/config/logger.ts apps/api/src/config/logger.test.ts apps/api/src/config/env.ts
git commit -m "feat(api): add pino logger config with LOG_LEVEL env var"
```

---

### Task 3: Define Hono app types for context variables

**Files:**
- Create: `apps/api/src/types.ts`
- Modify: `apps/api/src/app.ts`

Currently the app uses a plain `new Hono()` with no type parameter. The auth middleware already uses `c.set("user", ...)` and `c.set("session", ...)` without types. Define an `AppEnv` type that covers existing context variables plus the new logger and requestId.

**Step 1: Create app types file**

Create `apps/api/src/types.ts`:

```typescript
import type { Logger } from "pino";

export type AppEnv = {
  Variables: {
    logger: Logger;
    requestId: string;
    user: { id: string; role: string; email: string; name: string };
    session: { id: string; expiresAt: Date };
  };
};
```

Check the auth middleware (`apps/api/src/middleware/auth.ts`) first to see what user/session types look like, and match accordingly.

**Step 2: Update app.ts to use typed Hono**

Change `export const app = new Hono();` to:

```typescript
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();
```

**Step 3: Verify everything still compiles**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS (no type errors). If any existing `c.set()` or `c.get()` calls produce type errors, fix the types in `AppEnv` to match.

**Step 4: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/app.ts
git commit -m "feat(api): define typed Hono context with AppEnv"
```

---

### Task 4: Create request logging middleware

**Files:**
- Create: `apps/api/src/middleware/request-logger.ts`
- Create: `apps/api/src/middleware/request-logger.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/middleware/request-logger.test.ts`:

```typescript
import { Hono } from "hono";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { requestLogger } from "./request-logger";

// Mock pino to capture log calls
vi.mock("../config/logger", () => {
  const childLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    level: "info",
  };
  return {
    logger: {
      child: vi.fn(() => childLogger),
      level: "info",
    },
  };
});

describe("requestLogger middleware", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.use("*", requestLogger);
    app.get("/test", (c) => c.json({ ok: true }));
    app.post("/test", (c) => c.json({ created: true }, 201));
  });

  it("logs request info at info level", async () => {
    const { logger } = await import("../config/logger");
    const child = (logger.child as ReturnType<typeof vi.fn>).mock.results[0]?.value;

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(logger.child).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it("sets requestId on the response header", async () => {
    const res = await app.request("/test");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("logs POST requests", async () => {
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(201);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/middleware/request-logger.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the middleware**

Create `apps/api/src/middleware/request-logger.ts`:

```typescript
import { createMiddleware } from "hono/factory";
import { logger } from "../config/logger";
import type { AppEnv } from "../types";

const REDACTED_HEADERS = new Set(["authorization", "cookie", "set-cookie"]);

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  const childLogger = logger.child({ requestId });
  const start = performance.now();

  c.set("requestId", requestId);
  c.set("logger", childLogger);
  c.header("x-request-id", requestId);

  const { method, path } = c.req;
  const url = c.req.url;

  // Debug-level: log incoming request details
  if (childLogger.level === "debug" || childLogger.level === "trace") {
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = REDACTED_HEADERS.has(key) ? "[REDACTED]" : value;
    });
    childLogger.debug({ method, path, url, headers }, "→ incoming request");
  }

  await next();

  const duration = Math.round(performance.now() - start);
  const status = c.res.status;

  childLogger.info(
    { method, path, status, duration },
    `${method} ${path} → ${status} (${duration}ms)`,
  );

  // Debug-level: log response details
  if (childLogger.level === "debug" || childLogger.level === "trace") {
    const contentLength = c.res.headers.get("content-length");
    childLogger.debug({ status, duration, contentLength }, "← response sent");
  }
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- src/middleware/request-logger.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/middleware/request-logger.ts apps/api/src/middleware/request-logger.test.ts
git commit -m "feat(api): add request logging middleware with request IDs"
```

---

### Task 5: Wire middleware into app.ts and update error handler

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/middleware/error.ts`
- Modify: `apps/api/src/middleware/error.test.ts` (update to work with logger)

**Step 1: Add request logger to app.ts**

In `apps/api/src/app.ts`, add the request logger middleware right after CORS:

```typescript
import { requestLogger } from "./middleware/request-logger";

// ... existing code ...

app.use("*", corsMiddleware);
app.use("*", requestLogger);  // <-- add this line
app.onError(errorHandler);
```

**Step 2: Update error handler to use pino**

Modify `apps/api/src/middleware/error.ts`:

```typescript
import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { logger as rootLogger } from "../config/logger";

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: "Invalid request data",
        code: "VALIDATION_ERROR",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }

  const isProd = process.env.NODE_ENV === "production";
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  // Use request-scoped logger if available, otherwise root logger
  const log = c.get?.("logger") ?? rootLogger;
  log.error({ err: error, stack }, message);

  return c.json(
    {
      error: isProd ? "Internal server error" : message,
      code: "INTERNAL_ERROR",
    },
    500,
  );
};
```

**Step 3: Update error handler tests**

Update `apps/api/src/middleware/error.test.ts` to mock the logger instead of `console.error`. The test should verify that `logger.error` is called when an unhandled error occurs.

**Step 4: Run all middleware tests**

Run: `pnpm --filter @dragons/api test -- src/middleware/`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/middleware/error.ts apps/api/src/middleware/error.test.ts
git commit -m "feat(api): wire request logger into app and update error handler"
```

---

### Task 6: Migrate infrastructure logging

**Files:**
- Modify: `apps/api/src/index.ts` (2 console calls: startup, shutdown)
- Modify: `apps/api/src/config/env.ts` (2 console.error calls: env validation)
- Modify: `apps/api/src/config/redis.ts` (2 calls: connected, error)

Replace all `console.*` calls with the root logger import:

```typescript
import { logger } from "./config/logger";
// or
import { logger } from "../config/logger";
```

Mapping:
- `console.log(...)` → `logger.info(...)`
- `console.warn(...)` → `logger.warn(...)`
- `console.error(...)` → `logger.error(...)`

**Special case — `config/env.ts`:** The logger depends on env (for LOG_LEVEL), so env.ts CANNOT import logger (circular dependency). Keep `console.error` in env.ts for validation failures since these happen before the logger is available. Add a comment explaining why.

**Step 1: Migrate index.ts**

```typescript
// apps/api/src/index.ts
import { logger } from "./config/logger";

// Replace:  console.log(`API running at http://localhost:${info.port}`);
// With:     logger.info(`API running at http://localhost:${info.port}`);

// Replace:  console.log("[Server] Shutting down...");
// With:     logger.info("Shutting down...");
```

**Step 2: Migrate config/redis.ts**

```typescript
import { logger } from "./logger";

// Replace:  console.log("[Redis] Connected");
// With:     logger.info("Redis connected");

// Replace:  console.error("[Redis] Connection error:", err.message);
// With:     logger.error({ err }, "Redis connection error");
```

**Step 3: Add comment to env.ts explaining why console stays**

```typescript
// Logger depends on env config, so we can't import it here (circular dependency).
// console.error is acceptable for env validation failures at startup.
```

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/config/redis.ts apps/api/src/config/env.ts
git commit -m "refactor(api): migrate infrastructure logging to pino"
```

---

### Task 7: Migrate worker logging

**Files:**
- Modify: `apps/api/src/workers/index.ts` (7 console calls)
- Modify: `apps/api/src/workers/sync.worker.ts` (5 console calls)
- Modify: `apps/api/src/workers/queues.ts` (4 console calls)

In each file, add `import { logger } from "../config/logger";` and replace:
- `console.log("[Workers] ...")` → `logger.info("...")`
- `console.error("[Workers] ...")` → `logger.error({ err: error }, "...")`
- `console.warn("[Queues] ...")` → `logger.warn("...")`

Drop the `[Prefix]` brackets — Pino automatically includes the module context and these prefixes were only needed for unstructured console output.

**Step 1: Migrate workers/index.ts**

Replace all 7 console calls.

**Step 2: Migrate workers/sync.worker.ts**

Replace all 5 console calls. Use `logger.child({ jobId: job.id })` inside the worker handler for job-scoped logging.

**Step 3: Migrate workers/queues.ts**

Replace all 4 console calls.

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/workers/
git commit -m "refactor(api): migrate worker logging to pino"
```

---

### Task 8: Migrate sync service logging

**Files:**
- Modify: `apps/api/src/services/sync/index.ts` (2 console calls)
- Modify: `apps/api/src/services/sync/sync-logger.ts` (3 console calls)
- Modify: `apps/api/src/services/sync/sdk-client.ts` (5 console calls)
- Modify: `apps/api/src/services/sync/data-fetcher.ts` (7 console calls)
- Modify: `apps/api/src/services/sync/leagues.sync.ts` (3 console calls)
- Modify: `apps/api/src/services/sync/teams.sync.ts` (5 console calls)
- Modify: `apps/api/src/services/sync/matches.sync.ts` (2 console calls)
- Modify: `apps/api/src/services/sync/venues.sync.ts` (3 console calls)
- Modify: `apps/api/src/services/sync/standings.sync.ts` (4 console calls)
- Modify: `apps/api/src/services/sync/referees.sync.ts` (9 console calls)

In each file, add `import { logger } from "../../config/logger";` (adjust path) and replace all `console.*` calls.

Create child loggers where it adds context:
- `const log = logger.child({ service: "sync" });` in the orchestrator
- `const log = logger.child({ service: "sdk-client" });` in sdk-client
- Individual sync services: `const log = logger.child({ service: "venues-sync" });` etc.

**Step 1: Migrate sync orchestrator (index.ts)**

Replace 2 calls.

**Step 2: Migrate sync-logger.ts**

Replace 3 calls. These are fallback/error logs when Redis is unavailable.

**Step 3: Migrate sdk-client.ts**

Replace 5 calls.

**Step 4: Migrate data-fetcher.ts**

Replace 7 calls.

**Step 5: Migrate entity sync services (leagues, teams, matches, venues, standings, referees)**

Replace all remaining calls (26 total across 6 files).

**Step 6: Run all tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

**Step 7: Verify no console.* calls remain**

Run: `grep -r "console\.\(log\|warn\|error\)" apps/api/src/ --include="*.ts" --exclude="*.test.ts"`
Expected: Only `apps/api/src/config/env.ts` (intentionally kept, circular dep)

**Step 8: Commit**

```bash
git add apps/api/src/services/sync/
git commit -m "refactor(api): migrate sync service logging to pino"
```

---

### Task 9: Update .env.example and documentation

**Files:**
- Modify: `.env.example` (add LOG_LEVEL)
- Modify: `CLAUDE.md` (add LOG_LEVEL to env docs)
- Modify: `AGENTS.md` (update middleware section if it lists middleware)

**Step 1: Add LOG_LEVEL to .env.example**

```
LOG_LEVEL=debug    # fatal, error, warn, info, debug, trace (default: info)
```

**Step 2: Add to CLAUDE.md optional env vars section**

```
LOG_LEVEL=info                    # Pino log level (fatal/error/warn/info/debug/trace)
```

**Step 3: Commit**

```bash
git add .env.example CLAUDE.md AGENTS.md
git commit -m "docs: add LOG_LEVEL to env documentation"
```

---

### Task 10: Final verification

**Step 1: Run full test suite**

Run: `pnpm --filter @dragons/api test`
Expected: All tests PASS

**Step 2: Run coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: 100% coverage maintained

**Step 3: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

**Step 4: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 5: Manual smoke test**

Run: `LOG_LEVEL=debug pnpm --filter @dragons/api dev`
Hit `http://localhost:3001/health` and verify colorized log output with request ID.
