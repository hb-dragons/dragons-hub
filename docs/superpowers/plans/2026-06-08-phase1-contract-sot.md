# Phase 1 — Contract Single Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server-side zod schema the single source of truth for each API endpoint's request (and key response) contract, so client/server drift fails the build instead of shipping (the class of bug behind the native column-reorder 400).

**Architecture:** A new zod-only `@dragons/contracts` package holds each endpoint's schemas. The API validates requests with `hono-openapi`'s `validator()` (which also registers the request schema into the real OpenAPI spec) and documents responses with `resolver()`. `@dragons/api-client` imports `z.infer` types from `@dragons/contracts` instead of re-declaring request-body interfaces. A contract test parses each api-client request body against its `@dragons/contracts` schema. The board endpoints are migrated end-to-end first (the tracer), then every other route group follows the same template, one group per task.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), zod, Hono, `hono-openapi@1.3.0` (`validator`/`resolver`/`describeRoute`/`openAPIRouteHandler`), `@hono/standard-validator@0.2.2` (underlies `hono-openapi`'s validator), Vitest 4, pnpm workspaces + Turborepo.

**Branch:** This plan lives on `plan/phase1-contract-sot`. Implementation should run on a dedicated branch (see the spec's open question on base — `fix/phase0-live-bugs` vs rebased onto `main` once Phase 0 lands). Conventional commits, **no AI/Co-Authored-By trailers** (CLAUDE.md).

**Reference spec:** `docs/superpowers/specs/2026-06-08-phase1-contract-sot-design.md`

---

## File Structure

**New package `packages/contracts/` (`@dragons/contracts`):**
- `package.json` — name, zod dep, `test`/`coverage`/`typecheck`/`lint` scripts.
- `tsconfig.json` — extends `../../tsconfig.base.json`.
- `vitest.config.ts` — globals + v8 coverage thresholds.
- `src/index.ts` — barrel re-exporting every group module.
- `src/board.ts` — board + column request schemas and response schemas (moved from `apps/api/src/routes/admin/board.schemas.ts`), plus `z.infer` type exports.
- One `src/<group>.ts` per migrated route group, added incrementally.

**Modified — API:**
- `apps/api/src/middleware/validation.ts` — **new**: shared `validationHook` producing the central `{error, code, details}` envelope.
- `apps/api/src/middleware/validation.test.ts` — **new**: hook unit test.
- `apps/api/src/routes/admin/board.routes.ts` — replace manual `schema.parse()` with `validator()` (which auto-registers the request schema in the spec; no manual `requestBody`/`resolver()`).
- `apps/api/src/routes/admin/board.schemas.ts` — **deleted** (re-exported from `@dragons/contracts` during migration, then removed).
- `apps/api/package.json` — add `@dragons/contracts` workspace dep.

**Modified — api-client:**
- `packages/api-client/src/endpoints/admin-board.ts` — import request-body types from `@dragons/contracts`; delete local `CreateBoardBody`/`UpdateBoardBody`/`AddColumnBody`/`UpdateColumnBody` interfaces.
- `packages/api-client/src/endpoints/admin-board.contract.test.ts` — **new**: request-body contract test.
- `packages/api-client/src/index.ts` — stop re-exporting the deleted local body types; re-export the contracts types instead.
- `packages/api-client/package.json` — add `@dragons/contracts` workspace dep + `coverage` script.
- `packages/api-client/vitest.config.ts` — add coverage thresholds.

---

## Task 1: Scaffold `@dragons/contracts` with the board schemas

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/board.ts`
- Create: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/package.json`**

```json
{
  "name": "@dragons/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "coverage": "vitest run --coverage"
  },
  "dependencies": {
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.6",
    "typescript": "^6.0.3",
    "vitest": "^4.1.6"
  }
}
```

Note: match `zod`, `vitest`, `typescript`, and `@vitest/coverage-v8` to the exact versions already resolved in `apps/api/package.json` / `packages/api-client/package.json`. Read those files first and copy the version strings verbatim so `pnpm install` does not re-resolve the lockfile (CLAUDE.md / audit #7 sensitivity).

- [ ] **Step 2: Create `packages/contracts/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/contracts/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.test.ts"],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
});
```

- [ ] **Step 4: Create `packages/contracts/src/board.ts`** (move the schemas verbatim from `apps/api/src/routes/admin/board.schemas.ts`, keeping the existing exported names)

```ts
import { z } from "zod";

export const boardIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const boardCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  createdBy: z.string().max(100).nullable().optional(),
});

export const boardUpdateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const columnIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  colId: z.coerce.number().int().positive(),
});

export const columnCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .nullable()
    .optional(),
  isDoneColumn: z.boolean().optional(),
});

export const columnUpdateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .nullable()
    .optional(),
  isDoneColumn: z.boolean().optional(),
});

export const columnReorderBodySchema = z.object({
  columns: z
    .array(
      z.object({
        id: z.number().int().positive(),
        position: z.number().int().min(0),
      }),
    )
    .min(1),
});

export type BoardCreateBody = z.infer<typeof boardCreateBodySchema>;
export type BoardUpdateBody = z.infer<typeof boardUpdateBodySchema>;
export type ColumnCreateBody = z.infer<typeof columnCreateBodySchema>;
export type ColumnUpdateBody = z.infer<typeof columnUpdateBodySchema>;
export type ColumnReorderBody = z.infer<typeof columnReorderBodySchema>;
```

- [ ] **Step 5: Create `packages/contracts/src/index.ts`**

```ts
export * from "./board";
```

- [ ] **Step 6: Install and verify the package resolves**

Run: `pnpm install`
Expected: lockfile adds `@dragons/contracts`; the `[WARN] "pnpm" field … ignored` line is expected (deferred audit #7). No other lockfile churn.

Run: `pnpm --filter @dragons/contracts typecheck`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add packages/contracts pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(contracts): scaffold @dragons/contracts with board schemas"
```

---

## Task 2: Shared validation hook (central error envelope)

`hono-openapi`'s `validator()` returns a 400 on failure. Left to its default it emits `{success:false, error:[…]}`, which does **not** match the API's `{error, code, details}` envelope (`apps/api/src/middleware/error.ts`). A shared hook fixes this once for every route.

**Files:**
- Create: `apps/api/src/middleware/validation.ts`
- Test: `apps/api/src/middleware/validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { validator } from "hono-openapi";
import { z } from "zod";
import { validationHook } from "./validation";

const schema = z.object({ name: z.string().min(1) });

function makeApp() {
  const app = new Hono();
  app.post(
    "/t",
    validator("json", schema, validationHook),
    (c) => c.json({ ok: true }),
  );
  return app;
}

describe("validationHook", () => {
  it("returns the central {error, code, details} envelope on invalid body", async () => {
    const res = await makeApp().request("/t", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Invalid request data");
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.details[0]).toHaveProperty("path");
    expect(json.details[0]).toHaveProperty("message");
  });

  it("passes a valid body through to the handler", async () => {
    const res = await makeApp().request("/t", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ok" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test validation`
Expected: FAIL — `validationHook` is not exported / module not found.

- [ ] **Step 3: Write the implementation**

`apps/api/src/middleware/validation.ts`:

```ts
import type { Context } from "hono";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Shared hook for hono-openapi's validator(). On failure it produces the same
 * { error, code, details } envelope that middleware/error.ts emits for a
 * ZodError, so every validated route returns one consistent 400 shape.
 */
export function validationHook(
  result: { success: boolean; data: unknown } & {
    error?: readonly StandardSchemaV1.Issue[];
  },
  c: Context,
) {
  if (!result.success) {
    return c.json(
      {
        error: "Invalid request data",
        code: "VALIDATION_ERROR",
        details: (result.error ?? []).map((issue) => ({
          path: (issue.path ?? [])
            .map((p) =>
              typeof p === "object" && p !== null && "key" in p
                ? String((p as { key: PropertyKey }).key)
                : String(p),
            )
            .join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test validation`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/validation.ts apps/api/src/middleware/validation.test.ts
git commit -m "feat(api): add shared validation hook for consistent 400 envelope"
```

---

## Task 3: Wire board routes to `validator()`

Replace every manual `schema.parse(...)` in `board.routes.ts` with `validator()` reading from `@dragons/contracts`. Existing board route tests in `apps/api` must stay green (the envelope is unchanged; behavior is unchanged).

> **VERIFIED PATTERN (do not deviate — confirmed against `hono-openapi@1.3.0` source):** `hono-openapi`'s `validator("json"|"param"|"query", schema, validationHook)` middleware **already registers the request body and path/query parameters into the generated OpenAPI spec** (with `required: true` and a properly resolved schema). **Do NOT add a manual `requestBody:`/`parameters:` block to `describeRoute` for request schemas** — doing so overwrites the validator's correctly-resolved entry with an *unresolved* `resolver()` object reference (a latent spec bug) and forces an `as unknown as` cast. `describeRoute` carries only `description`, `tags`, and `responses`. `resolver()` is used **only for response schemas** inside `responses[...].content` (see the response-schema section in Task 7), because the library's response types are resolver-aware. For request-only routes you do not import `resolver` at all.

**Files:**
- Modify: `apps/api/src/routes/admin/board.routes.ts`
- Modify: `apps/api/src/routes/admin/board.schemas.ts` (becomes a thin re-export, deleted in Task 4)
- Modify: `apps/api/package.json` (add dep — done in Task 1's install if added there; otherwise add now)
- Test: existing `apps/api/src/routes/admin/board.routes.test.ts` (do not rewrite; keep green) + add a spec/envelope assertion below.

- [ ] **Step 1: Add `@dragons/contracts` to `apps/api/package.json` dependencies**

Add to the `dependencies` block (alphabetical with the other `@dragons/*` entries):

```json
"@dragons/contracts": "workspace:*",
```

Run: `pnpm install` (expected: no lockfile churn beyond the new link; the pnpm-field WARN is fine).

- [ ] **Step 2: Point `board.schemas.ts` at the contracts package (temporary shim)**

Replace the entire body of `apps/api/src/routes/admin/board.schemas.ts` with:

```ts
export * from "@dragons/contracts";
```

This keeps every existing `import { … } from "./board.schemas"` working while the source of truth moves. (Removed in Task 4 Step 5.)

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS.

- [ ] **Step 3: Write the regression-guard test — invalid body keeps the VALIDATION_ERROR envelope**

This test is a *regression guard*, not a red test: the current manual-parse path already routes a bad body through the central `errorHandler` (ZodError → `VALIDATION_ERROR`), so it passes before the change too. Its job is to prove the envelope is unchanged after switching to `validator()`. Add to `apps/api/src/routes/admin/board.routes.test.ts` (or a `board.contract.test.ts` beside it). Mirror how sibling route tests build the authed admin app — copy the `makeApp`/auth-stub setup from the top of the existing test file:

```ts
it("rejects an invalid reorder body with the VALIDATION_ERROR envelope", async () => {
  // build the authed admin app the same way the other tests in this file do
  const res = await adminRequest("/admin/boards/1/columns/reorder", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: [] }), // wrong shape: { columns } is required
  });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.code).toBe("VALIDATION_ERROR");
});
```

- [ ] **Step 4: Run the test to verify it passes (baseline) and stays green after Step 5**

Run: `pnpm --filter @dragons/api test board`
Expected: PASS now (manual-parse path) and PASS again after Step 5 (validator path). If it ever 400s with a different `code` or a non-400 status after Step 5, the `validationHook` wiring is wrong — fix before continuing.

- [ ] **Step 5: Convert the route handlers to `validator()`**

In `apps/api/src/routes/admin/board.routes.ts`:

1. Update imports (note: **no `resolver`** — request schemas need only `validator`):

```ts
import { describeRoute, validator } from "hono-openapi";
import { validationHook } from "../../middleware/validation";
import {
  boardIdParamSchema,
  boardCreateBodySchema,
  boardUpdateBodySchema,
  columnIdParamSchema,
  columnCreateBodySchema,
  columnUpdateBodySchema,
  columnReorderBodySchema,
} from "@dragons/contracts";
```

2. For each handler, (a) insert the `validator()` middleware, (b) read validated data via `c.req.valid(...)` instead of `schema.parse(...)`. The `validator()` call registers the request schema in the spec automatically; `describeRoute` keeps only `description`/`tags`/`responses` (NO manual `requestBody`).

Exemplar — the create-board POST:

```ts
boardRoutes.post(
  "/boards",
  boardUpdate,
  validator("json", boardCreateBodySchema, validationHook),
  describeRoute({
    description: "Create board with default columns",
    tags: ["Boards"],
    responses: { 201: { description: "Created" } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const result = await createBoard(body.name, body.description, body.createdBy);
    return c.json(result, 201);
  },
);
```

Exemplar — a param route (get board by id):

```ts
boardRoutes.get(
  "/boards/:id",
  boardView,
  validator("param", boardIdParamSchema, validationHook),
  describeRoute({
    description: "Get board with columns",
    tags: ["Boards"],
    responses: {
      200: { description: "Success" },
      404: { description: "Board not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await getBoard(id);
    if (!result) {
      return c.json({ error: "Board not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(result);
  },
);
```

Exemplar — the reorder route (the bug-prone one), `param` + `json`:

```ts
boardRoutes.patch(
  "/boards/:id/columns/reorder",
  boardUpdate,
  validator("param", boardIdParamSchema, validationHook),
  validator("json", columnReorderBodySchema, validationHook),
  describeRoute({
    description: "Reorder columns within a board",
    tags: ["Boards"],
    responses: { 204: { description: "Reordered" } },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { columns } = c.req.valid("json");
    await reorderColumns(id, columns);
    return c.body(null, 204);
  },
);
```

**Preserve each handler's existing response** (status code and body). The exemplars above show only the contract wiring (`validator()` middleware + `c.req.valid(...)` in place of `schema.parse(...)`). Read the current handler before editing and keep whatever status/body it returns today — e.g. if the current reorder handler returns `200` with a body rather than `204`, keep that; do not change response behavior in this task (route tests assert it). The `responses:` block in `describeRoute` should document the status the handler actually returns. **No `requestBody`/`resolver()` for request schemas** — `validator()` already puts them in the spec.

Apply the same transform to every remaining board/column handler in the file: `GET /boards` (no input), `PATCH /boards/:id` (`param` + `json` body `boardUpdateBodySchema`), `DELETE /boards/:id` (`param`), `POST /boards/:id/columns` (`param` boardId + `json` `columnCreateBodySchema`), `PATCH /boards/:id/columns/:colId` (`param` `columnIdParamSchema` + `json` `columnUpdateBodySchema`), `DELETE /boards/:id/columns/:colId` (`param`). Remove every now-unused manual `…Schema.parse(...)` call. Note the param routes currently parse `{ id: c.req.param("id") }`; `validator("param", …)` validates `c.req.param()` directly, and `z.coerce.number()` still coerces the string — so reading `c.req.valid("param")` yields the coerced number.

- [ ] **Step 6: Run the board suite to verify green**

Run: `pnpm --filter @dragons/api test board`
Expected: PASS — including the new envelope assertion and all pre-existing board route tests.

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/board.routes.ts apps/api/src/routes/admin/board.schemas.ts apps/api/package.json pnpm-lock.yaml
git commit -m "refactor(api): validate board routes via @dragons/contracts schemas"
```

---

## Task 4: Rewire api-client board endpoint to `z.infer` types

Delete the hand-declared request-body interfaces in `admin-board.ts` and import the inferred types from `@dragons/contracts`. This is where the audit's drift (`UpdateColumnBody` missing `position`) is structurally fixed — the type now *is* the schema.

**Files:**
- Modify: `packages/api-client/package.json` (add `@dragons/contracts` dep)
- Modify: `packages/api-client/src/endpoints/admin-board.ts`
- Modify: `packages/api-client/src/index.ts`
- Delete: `apps/api/src/routes/admin/board.schemas.ts`

- [ ] **Step 1: Add the dependency**

In `packages/api-client/package.json` `dependencies`:

```json
"@dragons/contracts": "workspace:*",
```

Run: `pnpm install`.

- [ ] **Step 2: Replace the local body interfaces with contracts imports**

In `packages/api-client/src/endpoints/admin-board.ts`:

Delete the `CreateBoardBody`, `UpdateBoardBody`, `AddColumnBody`, and `UpdateColumnBody` interface declarations. Add to the type imports at the top:

```ts
import type {
  BoardCreateBody,
  BoardUpdateBody,
  ColumnCreateBody,
  ColumnUpdateBody,
} from "@dragons/contracts";
```

Then rename the usages in the endpoint methods to the contracts type names:
- `createBoard(body: CreateBoardBody)` → `createBoard(body: BoardCreateBody)`
- `updateBoard(id, body: UpdateBoardBody)` → `BoardUpdateBody`
- `addColumn(boardId, body: AddColumnBody)` → `ColumnCreateBody`
- `updateColumn(boardId, colId, body: UpdateColumnBody)` → `ColumnUpdateBody`

Leave `CreateTaskBody`/`UpdateTaskBody`/`MoveTaskBody`/`TaskListFilters` as local for now — they migrate with the `task` group. (After this edit, `updateColumn` accepts `position`, matching the server schema and closing the drift.)

- [ ] **Step 3: Fix the barrel re-exports**

In `packages/api-client/src/index.ts`, the `export type { … } from "./endpoints"` block currently lists `CreateBoardBody, UpdateBoardBody, AddColumnBody, UpdateColumnBody`. Remove those four (they no longer exist in `./endpoints`). If web/native import them by those names, re-export the contracts equivalents instead:

```ts
export type {
  BoardCreateBody,
  BoardUpdateBody,
  ColumnCreateBody,
  ColumnUpdateBody,
} from "@dragons/contracts";
```

- [ ] **Step 4: Verify api-client still typechecks and its existing tests pass**

Run: `pnpm --filter @dragons/api-client test`
Expected: PASS (the existing `admin-board.test.ts` asserts URLs/methods/bodies — unaffected by the type rename).

Run: `pnpm --filter @dragons/api-client typecheck`
Expected: PASS.

- [ ] **Step 5: Delete the now-redundant API schema shim**

Delete `apps/api/src/routes/admin/board.schemas.ts`. Update `board.routes.ts` — it already imports from `@dragons/contracts` (Task 3 Step 5), so no import there changes. Grep for any other importer:

Run: `grep -rn "board.schemas" apps/api/src`
Expected: no results (if any remain, repoint them to `@dragons/contracts`).

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src/endpoints/admin-board.ts packages/api-client/src/index.ts packages/api-client/package.json apps/api/src/routes/admin/board.routes.ts pnpm-lock.yaml
git rm apps/api/src/routes/admin/board.schemas.ts
git commit -m "refactor(api-client): consume @dragons/contracts board types, drop hand-declared bodies"
```

---

## Task 5: Board contract test (the regression guard)

Assert that the body each api-client board/column method sends parses cleanly against the matching `@dragons/contracts` schema. This is the test that would have caught the reorder bug.

**Files:**
- Create: `packages/api-client/src/endpoints/admin-board.contract.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi } from "vitest";
import {
  boardCreateBodySchema,
  boardUpdateBodySchema,
  columnCreateBodySchema,
  columnUpdateBodySchema,
  columnReorderBodySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { adminBoardEndpoints } from "./admin-board";

/** Build a client whose fetch records the outgoing request body. */
function recordingClient() {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: adminBoardEndpoints(client), calls };
}

describe("admin-board request bodies satisfy @dragons/contracts schemas", () => {
  it("createBoard body parses against boardCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.createBoard({ name: "Sprint", description: "desc" });
    expect(boardCreateBodySchema.safeParse(calls[0]!.body).success).toBe(true);
  });

  it("updateBoard body parses against boardUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateBoard(1, { name: "Renamed" });
    expect(boardUpdateBodySchema.safeParse(calls[0]!.body).success).toBe(true);
  });

  it("addColumn body parses against columnCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.addColumn(1, { name: "To Do", color: "#ff0000" });
    expect(columnCreateBodySchema.safeParse(calls[0]!.body).success).toBe(true);
  });

  it("updateColumn body parses against columnUpdateBodySchema (incl. position)", async () => {
    const { api, calls } = recordingClient();
    await api.updateColumn(1, 2, { name: "Doing", position: 3 });
    expect(columnUpdateBodySchema.safeParse(calls[0]!.body).success).toBe(true);
  });

  it("reorderColumns body parses against columnReorderBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.reorderColumns(1, [{ id: 9, position: 0 }]);
    expect(columnReorderBodySchema.safeParse(calls[0]!.body).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api-client test admin-board.contract`
Expected: PASS (all five). The `updateColumn` case proves the closed drift — before Task 4 the client had no way to send `position`.

- [ ] **Step 3: Commit**

```bash
git add packages/api-client/src/endpoints/admin-board.contract.test.ts
git commit -m "test(api-client): contract test board request bodies against @dragons/contracts"
```

---

## Task 6: Coverage gates on the new + touched packages

**Files:**
- Modify: `packages/api-client/package.json`
- Modify: `packages/api-client/vitest.config.ts`

(`@dragons/contracts` already got its `coverage` script + thresholds in Task 1.)

- [ ] **Step 1: Add a `coverage` script to api-client**

In `packages/api-client/package.json` `scripts`:

```json
"coverage": "vitest run --coverage",
```

And add `"@vitest/coverage-v8"` to `devDependencies` (same version as `apps/api`).

- [ ] **Step 2: Add coverage thresholds to api-client vitest config**

`packages/api-client/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
});
```

- [ ] **Step 3: Run coverage on both packages**

Run: `pnpm --filter @dragons/contracts coverage`
Expected: PASS — schemas are all exercised by the contract test (imported in api-client) and by their own usage. If a schema file is under threshold because nothing imports it yet, add a minimal `src/board.test.ts` that `safeParse`s a valid + invalid sample per schema.

Run: `pnpm --filter @dragons/api-client coverage`
Expected: PASS. If existing endpoint files (`public.ts`, `referee.ts`, `devices.ts`) drag coverage below threshold, set the initial thresholds to the **current measured** numbers and note a ratchet-up follow-up (per the audit's "start at current measured levels and ratchet up"). Do not lower the API's gate.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/package.json packages/api-client/vitest.config.ts
git commit -m "test(api-client): add coverage gate for shared contract code"
```

- [ ] **Step 5: Full-suite regression check (board tracer complete)**

Run: `pnpm --filter @dragons/api test`
Expected: PASS — full API suite (2857+) still green.

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS.

**At this point the entire mechanism is proven on the board slice.** Tasks 7+ are mechanical applications of the same template.

---

## Task 7+: Per-group migration (one task per group)

Each remaining route group is its own task, instantiating the template below. **Order: client-facing groups first** (an api-client endpoint module exists — these kill real cross-client drift), then server-only groups. Within "server-only", groups that already have a `.schemas.ts` come before those needing inline-schema extraction.

### Template (apply per group `G`)

- [ ] **Step 1:** Create `packages/contracts/src/<G>.ts` containing the group's request schemas. If the API already has `apps/api/src/routes/<area>/<G>.schemas.ts`, move its contents verbatim (keep export names) and add `z.infer` type exports for every body schema. If the schemas are **inline `z.object(...)`** in the route file, extract them into `packages/contracts/src/<G>.ts` first.
- [ ] **Step 2:** Add `export * from "./<G>";` to `packages/contracts/src/index.ts`.
- [ ] **Step 3:** In the route file, replace `import … from "./<G>.schemas"` (or the inline definitions) with imports from `@dragons/contracts`; swap every `schema.parse(...)` for `validator("json" | "param" | "query", schema, validationHook)` + `c.req.valid(...)`. **Do NOT add a manual `requestBody`/`parameters` block to `describeRoute`** — `validator()` already registers request schemas in the spec (see the VERIFIED PATTERN note under Task 3). `describeRoute` keeps `description`/`tags`/`responses` only. Delete the old `.schemas.ts` (or inline definitions).
- [ ] **Step 4:** If an api-client endpoint module exists for this group, delete its hand-declared request-body interfaces and import the `z.infer` types from `@dragons/contracts`; fix the `src/index.ts` re-exports.
- [ ] **Step 5:** If an api-client endpoint module exists, add a `<G>.contract.test.ts` mirroring Task 5 (recording client → `schema.safeParse(body)`).
- [ ] **Step 6:** Run `pnpm --filter @dragons/api test <G>`, `pnpm --filter @dragons/api typecheck`, and (if touched) `pnpm --filter @dragons/api-client test`. All green.
- [ ] **Step 7:** Commit: `refactor(api): validate <G> routes via @dragons/contracts` (+ a second commit for the api-client rewire if applicable).

### Client-facing groups (full rewire — do these first)

| Group | API route file(s) | API schema source | api-client module |
|---|---|---|---|
| public | `routes/public/match.routes.ts` (inline), `routes/public/standings.routes.ts`, `routes/public/team.routes.ts` | inline `z.object` → extract | `endpoints/public.ts` (`PublicTeam`, `MatchQueryParams`) |
| referee-self | `routes/referee/assignment.routes.ts` (inline), `routes/referee/games.routes.ts` (inline) | inline `z.object` → extract | `endpoints/referee.ts` (`RefereeGamesQueryParams`) |
| devices | `routes/device.routes.ts` (inline) | inline `z.object` → extract | `endpoints/devices.ts` (`RegisterDeviceResponse`, `UnregisterDeviceResponse`) |

### Server-only groups with existing `.schemas.ts` (no client rewire yet)

`match`, `booking`, `channel-config`, `event`, `notification`, `referee-history`, `referee-rules`, `referee` (admin), `social`, `sync`, `task`, `team`, `venue`, `watch-rule`.

Route files: `routes/admin/<group>.routes.ts`; schema source: `routes/admin/<group>.schemas.ts`. (`task` also backs api-client's `adminBoardEndpoints` task/checklist/comment methods — when you do `task`, also migrate `CreateTaskBody`/`UpdateTaskBody`/`MoveTaskBody`/`TaskListFilters` in `endpoints/admin-board.ts` and add their contract test, per Steps 4–5.)

### Server-only groups needing inline-schema extraction first

`league`, `settings`, `user`, `broadcast`, `scoreboard` (admin), `notification-test`, `referee-eligible-games`, `standings`.

Route files: `routes/admin/<group>.routes.ts` (and `routes/api/scoreboard.routes.ts` for the ingest schema). Extract each inline `z.object(...)` into `packages/contracts/src/<group>.ts` (Step 1) before wiring `validator()`.

### Response schemas (per group, scoped)

For each group's **primary read endpoint(s)**, define a response zod schema in `packages/contracts/src/<G>.ts`, reference it via `resolver()` in the `describeRoute` `responses` block, and add a test asserting the service's return value `safeParse`s against it (test-time only — no runtime response validation). Do not attempt response schemas for every endpoint; cover the read shapes the clients actually consume. This is where the `@dragons/shared` hand-written response types start being superseded by inferred ones (full replacement is Phase 3).

---

## Out of scope (do not do in Phase 1)

- Web's ~74 `fetchAPI` files → `@dragons/api-client` migration (Phase 3 — now migrates onto a settled contract).
- Broader error-class unification / removing `status as never` (Phase 3). Only the `validator` envelope is touched here.
- Audit #7 — moving `pnpm.overrides` to `pnpm-workspace.yaml` (standalone task on `main`).
- Deleting `@dragons/shared` response types (Phase 3 split).

---

## Final verification (whole phase)

```bash
cd ~/.config/superpowers/worktrees/dragons-hub/fix-phase0
pnpm --filter @dragons/api test          # full API suite, 2857+ green
pnpm --filter @dragons/api typecheck
pnpm --filter @dragons/contracts coverage
pnpm --filter @dragons/api-client test
pnpm typecheck                           # whole monorepo
```

Expected: all green. The `[WARN] "pnpm" field … ignored` line is expected (deferred audit #7).

## Success criteria (from the spec)

- `@dragons/contracts` exists, zod-only runtime dep, sole declaration of every migrated endpoint's request body.
- api-client declares zero request-body interfaces for migrated endpoints — all are `z.infer` of a contracts schema.
- A contract test fails if any api-client request body diverges from its API schema.
- Migrated routes validate via `validator()`; their request schemas appear in `/openapi.json`.
- Board endpoints fully migrated and green; remaining groups follow the documented template.
