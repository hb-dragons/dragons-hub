# Phase 3 — Web → contracts/api-client migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace web's three bespoke fetch entry points (`fetchAPI`, `fetchAPIServer`, duplicate `APIError`) with the typed `@dragons/api-client` + `@dragons/contracts` stack, so web and native share one data layer.

**Architecture:** Build a `createApi(client)` aggregator in `@dragons/api-client` that composes per-group `xEndpoints(client)` factories (request types from `@dragons/contracts`, response types from `@dragons/shared`). Web exposes a browser singleton `api` and an async `getServerApi()` that forwards cookies per request. Migrate the 229 web call sites group by group; each group lands green. Delete the bespoke fetchers and add a lint guard at the end.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Hono API, Next.js 16 App Router, Zod contracts, Vitest v4, pnpm + Turborepo.

**Spec:** `docs/superpowers/specs/2026-06-10-phase3-web-contracts-migration-design.md`

**Green gate (run from repo root after every slice):**
`pnpm typecheck && pnpm lint && pnpm test && pnpm coverage && pnpm build && pnpm check:ai-slop && pnpm check:coverage-scripts`
Tolerated test-output noise (judge by summary + exit code): Redis `ECONNREFUSED:6379`, `forced event failure`, `boom`/`Canvas render failed`/`Image generation failed`, overlay `DOMException [NetworkError]`.

---

## File structure

**`@dragons/api-client` (`packages/api-client/src/`):**
- `client.ts` — modify: fix error parsing, add `cache` option.
- `endpoints/admin-board.ts` — modify: fix `reorderColumns` body + column-update `position` typing.
- `endpoints/<group>.ts` — create: one factory per new group (booking, match, sync, notification, social, settings, team, channel-config, broadcast, watch-rule, event, venue, standings, user, scoreboard, referee-admin, assistant, dashboard, …).
- `endpoints/<group>.contract.test.ts` — create: request-shape drift test per group with bodies/queries.
- `endpoints/index.ts` — modify: re-export each new factory + its inferred types.
- `create-api.ts` — create: `createApi(client)` aggregator.
- `index.ts` — modify: export `createApi`.

**`@dragons/contracts` (`packages/contracts/src/`):**
- `<group>.ts` — modify (gap groups only): add request schema + exported `z.infer` alias; `index.ts` re-export.

**`apps/api` (gap groups only):**
- `src/routes/.../<group>.routes.ts` — modify: wire `validator(...)` + `c.req.valid(...)` for newly-added contracts.

**`apps/web` (`apps/web/src/`):**
- `lib/api.ts` — rewrite: browser `ApiClient`, `export const api = createApi(...)`, re-export `APIError`. Eventually loses `fetchAPI`/`getBaseURL`.
- `lib/api.server.ts` — rewrite: `getServerApi()` (cookie forwarding). Loses `fetchAPIServer`.
- `lib/api-client.ts` — delete after Slice 0 (its `publicApi` folds into `api.public`).
- call sites across ~68 files — modify per group.
- `eslint.config.*` — modify (final slice): guard against bespoke fetch wrappers.

**Docs:** `AGENTS.md` — modify (final slice): document the data layer.

---

## Slice 0 — Foundation

Establishes the shared plumbing and migrates the three already-covered groups. After this slice both fetchers still exist (long-tail groups use them) but everything flows through one `ApiClient` and one `APIError`.

### Task 0.1: Fix api-client error parsing to the real envelope

**Files:**
- Modify: `packages/api-client/src/client.ts:91-99`
- Test: `packages/api-client/src/client.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./client";
import { APIError } from "./errors";

function clientReturning(status: number, body: unknown) {
  const fetchFn = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new ApiClient({ baseUrl: "https://x.test", fetchFn: fetchFn as unknown as typeof fetch });
}

describe("ApiClient error parsing", () => {
  it("uses the API's { error, code } envelope for the thrown APIError", async () => {
    const client = clientReturning(400, {
      error: "Invalid request data",
      code: "VALIDATION_ERROR",
      details: [],
    });
    await expect(client.get("/x")).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request data",
    });
  });

  it("falls back to message, then statusText", async () => {
    const a = clientReturning(500, { message: "boom" });
    await expect(a.get("/x")).rejects.toMatchObject({ message: "boom" });
    const b = clientReturning(503, {});
    await expect(b.get("/x")).rejects.toBeInstanceOf(APIError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api-client test -- client.test.ts`
Expected: FAIL — first test gets `message` = "Service Unavailable"/statusText, not "Invalid request data".

- [ ] **Step 3: Implement the fix**

In `client.ts`, change the error message resolution to read `error` first:

```ts
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorRecord = errorBody as Record<string, unknown>;
      throw new APIError(
        response.status,
        (errorRecord["code"] as string) ?? "UNKNOWN_ERROR",
        (errorRecord["error"] as string) ??
          (errorRecord["message"] as string) ??
          response.statusText,
      );
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api-client test -- client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/client.ts packages/api-client/src/client.test.ts
git commit -m "fix(api-client): parse API { error, code } envelope for APIError message"
```

### Task 0.2: Add `cache` option to ApiClient

**Files:**
- Modify: `packages/api-client/src/client.ts` (`ApiClientOptions`, constructor, `request`)
- Test: `packages/api-client/src/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("passes a configured cache mode to fetch", async () => {
  const fetchFn = vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  const client = new ApiClient({ baseUrl: "https://x.test", cache: "no-store", fetchFn: fetchFn as unknown as typeof fetch });
  await client.get("/x");
  expect(fetchFn.mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api-client test -- client.test.ts`
Expected: FAIL — `cache` not in options/init.

- [ ] **Step 3: Implement**

In `ApiClientOptions` add `cache?: RequestCache;`. In the constructor add `this.cache = options.cache;` (with a `private readonly cache?: RequestCache;` field). In `request`, after building `init`, add:

```ts
    if (this.cache) {
      init.cache = this.cache;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api-client test -- client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/client.ts packages/api-client/src/client.test.ts
git commit -m "feat(api-client): support cache mode option on ApiClient"
```

### Task 0.3: Fix the reorderColumns body and column-update `position` typing

**Files:**
- Modify: `packages/api-client/src/endpoints/admin-board.ts` (`reorderColumns`, `ColumnUpdateBody` usage)
- Test: `packages/api-client/src/endpoints/admin-board.contract.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing contract test)

```ts
import { columnReorderBodySchema, columnUpdateBodySchema } from "@dragons/contracts";

it("reorderColumns body parses against columnReorderBodySchema (uses { columns })", async () => {
  const { api, calls } = recordingClient();
  await api.reorderColumns(1, [{ id: 10, position: 0 }, { id: 11, position: 1 }]);
  const parsed = columnReorderBodySchema.safeParse(calls[0]!.body);
  expect(parsed.error?.issues, "columnReorderBodySchema rejected the request body").toBeUndefined();
});

it("updateColumn body with position parses against columnUpdateBodySchema", async () => {
  const { api, calls } = recordingClient();
  await api.updateColumn(1, 10, { position: 3 });
  const parsed = columnUpdateBodySchema.safeParse(calls[0]!.body);
  expect(parsed.error?.issues, "columnUpdateBodySchema rejected the request body").toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api-client test -- admin-board.contract.test.ts`
Expected: FAIL — reorder sends `{ order }`, and `updateColumn` rejects `position` if the type omits it.

- [ ] **Step 3: Implement**

In `admin-board.ts`, change `reorderColumns` to send `{ columns }` matching `columnReorderBodySchema`:

```ts
    reorderColumns(
      boardId: number,
      columns: { id: number; position: number }[],
    ): Promise<void> {
      return client.patch(`/admin/boards/${boardId}/columns/reorder`, { columns });
    },
```

Change `updateColumn`'s body type to the contract type so `position` is accepted: import `ColumnUpdateBody` from `@dragons/contracts` (already imported) and type the param `body: ColumnUpdateBody`. Confirm `ColumnUpdateBody = z.infer<typeof columnUpdateBodySchema>` includes `position`; if `columnUpdateBodySchema` lacks `position`, that is a contract bug — add it to the schema in `packages/contracts/src/board.ts` and keep the API route reading it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api-client test -- admin-board.contract.test.ts`
Expected: PASS. Also run native's column-mutation tests to confirm the fix unbreaks native:
`pnpm --filter @dragons/native test -- useColumnMutations`

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/endpoints/admin-board.ts packages/api-client/src/endpoints/admin-board.contract.test.ts packages/contracts/src/board.ts
git commit -m "fix(api-client): reorderColumns sends { columns }; updateColumn accepts position"
```

### Task 0.4: `createApi(client)` aggregator over the existing four groups

**Files:**
- Create: `packages/api-client/src/create-api.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `packages/api-client/src/create-api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./client";
import { createApi } from "./create-api";

function client() {
  const fetchFn = vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
  return new ApiClient({ baseUrl: "https://x.test", fetchFn: fetchFn as unknown as typeof fetch });
}

describe("createApi", () => {
  it("exposes the existing groups as namespaces", () => {
    const api = createApi(client());
    expect(typeof api.public.getMatches).toBe("function");
    expect(typeof api.devices.register).toBe("function");
    expect(typeof api.referees.getGames).toBe("function");
    expect(typeof api.boards.listBoards).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api-client test -- create-api.test.ts`
Expected: FAIL — `createApi` not defined.

- [ ] **Step 3: Implement**

```ts
// packages/api-client/src/create-api.ts
import type { ApiClient } from "./client";
import {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
  adminBoardEndpoints,
} from "./endpoints";

export function createApi(client: ApiClient) {
  return {
    public: publicEndpoints(client),
    devices: deviceEndpoints(client),
    referees: refereeEndpoints(client),
    boards: adminBoardEndpoints(client),
  };
}

export type Api = ReturnType<typeof createApi>;
```

Add to `index.ts`: `export { createApi } from "./create-api";` and `export type { Api } from "./create-api";`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api-client test -- create-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/create-api.ts packages/api-client/src/index.ts packages/api-client/src/create-api.test.ts
git commit -m "feat(api-client): add createApi aggregator over endpoint groups"
```

> **Note for later slices:** every new group factory is added to `createApi` as one new namespace line, and its `.contract.test.ts` is added alongside the factory. Keep `createApi` namespaces in the same order as the roster table below.

### Task 0.5: Rewrite web `lib/api.ts` onto the shared client

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Delete (after migration in 0.7): `apps/web/src/lib/api-client.ts`
- Test: `apps/web/src/lib/api.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { api, APIError } from "./api";

describe("web api", () => {
  it("exposes namespaced groups and the shared APIError", () => {
    expect(typeof api.boards.listBoards).toBe("function");
    expect(typeof api.public.getMatches).toBe("function");
    expect(APIError).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/lib/api.test.ts`
Expected: FAIL — `api` export not present.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/api.ts
import { ApiClient, createApi, APIError } from "@dragons/api-client";

const browserClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  credentials: "include",
});

export const api = createApi(browserClient);
export { APIError };
```

Keep `fetchAPI` and `getBaseURL` in the file **for now** (long-tail groups still call them) — append the new exports above them; remove them in the final slice. To avoid a duplicate `APIError`, delete the local `class APIError` and rely on the re-export.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/web test -- src/lib/api.test.ts`
Then `pnpm --filter @dragons/web typecheck` — fix any call site that imported the now-removed local `APIError` symbol shape (it is structurally identical; only the source moved).
Expected: PASS / typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts
git commit -m "feat(web): expose shared createApi client; drop duplicate APIError"
```

### Task 0.6: Rewrite web `lib/api.server.ts` to `getServerApi()`

**Files:**
- Modify: `apps/web/src/lib/api.server.ts`
- Test: `apps/web/src/lib/api.server.test.ts` (create; mock `next/headers`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "session=abc" }),
}));

describe("getServerApi", () => {
  it("returns a namespaced client", async () => {
    const { getServerApi } = await import("./api.server");
    const api = await getServerApi();
    expect(typeof api.boards.listBoards).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/lib/api.server.test.ts`
Expected: FAIL — `getServerApi` not exported.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/api.server.ts
import "server-only";
import { cookies } from "next/headers";
import { ApiClient, createApi } from "@dragons/api-client";

export async function getServerApi() {
  const cookieHeader = (await cookies()).toString();
  const client = new ApiClient({
    baseUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    cache: "no-store",
    auth: { getHeaders: () => (cookieHeader ? { Cookie: cookieHeader } : {}) },
  });
  return createApi(client);
}
```

Keep `fetchAPIServer` in the file for now; remove in the final slice.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/web test -- src/lib/api.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.server.ts apps/web/src/lib/api.server.test.ts
git commit -m "feat(web): add getServerApi with per-request cookie forwarding"
```

### Task 0.7: Migrate the already-covered groups' call sites

**Files (modify):** every web file calling `fetchAPI(Server)` for `/admin/boards`, `/admin/tasks`, `/referee/games`, and the public endpoints; plus the 11 `APIError` importers and the 3 `lib/api-client.ts` (`publicApi`) consumers.

- [ ] **Step 1:** Replace board/task call sites: `fetchAPI<T>("/admin/boards"...)` → `api.boards.listBoards()` etc.; server components → `(await getServerApi()).boards.…`. Use the existing `adminBoardEndpoints` method names (see `packages/api-client/src/endpoints/admin-board.ts`). For board hooks (`use-board-mutations.ts`, `use-column-mutations.ts`) use `api.boards.*` — the reorder fix from Task 0.3 makes this correct.
- [ ] **Step 2:** Replace `publicApi.*` (from `lib/api-client.ts`) with `api.public.*`; delete `lib/api-client.ts`.
- [ ] **Step 3:** Repoint any `import { APIError } from "@/lib/api"` that still resolves (it now re-exports) — no change needed, but confirm typecheck.
- [ ] **Step 4:** Add/keep tests for changed hooks (mock the `api` namespace method). Run `pnpm --filter @dragons/web test` + `typecheck`.
- [ ] **Step 5:** Full green gate. Commit:

```bash
git add -A
git commit -m "refactor(web): migrate boards/tasks/referee/public call sites onto shared api"
```

---

## Canonical per-group recipe (template for Slices 1..N)

Each remaining group is one slice. A subagent executes this recipe against the group's real files. **Reference example:** `packages/api-client/src/endpoints/admin-board.ts` + its `.contract.test.ts`.

**Inputs from the roster table:** group key, route path(s), API route file, contract status, factory methods, web files.

1. **Contract (gap groups only).** If a body/query has no schema: add it to `packages/contracts/src/<group>.ts` with an exported `z.infer` alias, re-export from `packages/contracts/src/index.ts`, and wire the API route — `validator("json"|"query", <schema>, validationHook)` + `c.req.valid(...)` in `apps/api/src/routes/.../<group>.routes.ts` (pattern: any existing validated route). Add/extend the route test. For non-gap groups, just confirm the `z.infer` alias is exported; add it if only the schema is exported.

2. **Factory.** Create `packages/api-client/src/endpoints/<group>.ts`:

```ts
// Example shape — booking group
import type { BookingListItem } from "@dragons/shared";
import type { BookingCreateBody, BookingUpdateBody, BookingStatusBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function bookingEndpoints(client: ApiClient) {
  return {
    list(): Promise<BookingListItem[]> {
      return client.get("/admin/bookings");
    },
    create(body: BookingCreateBody): Promise<BookingListItem> {
      return client.post("/admin/bookings", body);
    },
    update(id: number, body: BookingUpdateBody): Promise<BookingListItem> {
      return client.patch(`/admin/bookings/${id}`, body);
    },
    setStatus(id: number, body: BookingStatusBody): Promise<BookingListItem> {
      return client.patch(`/admin/bookings/${id}/status`, body);
    },
  };
}
```

Rules: request body/query types come from `@dragons/contracts`; response types from `@dragons/shared` (if a response type is missing there, add it to shared rather than inlining). GET-with-params methods take a typed query object and pass it to `client.get(path, query)`.

3. **Contract test.** Create `packages/api-client/src/endpoints/<group>.contract.test.ts` mirroring `admin-board.contract.test.ts`'s `recordingClient()` pattern — one `it` per method that sends a body or query, asserting it `.safeParse`s against the matching contract schema.

4. **Register.** Add the factory + its inferred types to `endpoints/index.ts`, and add one namespace line to `create-api.ts` (`<key>: <group>Endpoints(client)`).

5. **Migrate web call sites.** Replace this group's `fetchAPI(Server)` calls with `api.<key>.*` / `(await getServerApi()).<key>.*`. Convert manual `URLSearchParams` to typed query objects. Update/keep hook + component tests.

6. **Green gate + commit** `feat(api-client): add <group> endpoints; refactor(web): migrate <group> call sites`.

---

## Group roster (Slices 1..N)

Execute in this order (highest traffic first, gap groups flagged). Counts are approximate web path-string usages.

| # | key | route path(s) | ~uses | contract | gap? |
|---|---|---|---|---|---|
| 1 | matches | `/admin/matches` | 23 | exists (`match.ts`) | no |
| 2 | sync | `/admin/sync` | 22 | exists (`sync.ts`) | no |
| 3 | notifications | `/admin/notifications` | 15 | partial (`notification.ts`) | confirm aliases; add missing schemas |
| 4 | social | `/admin/social` | 13 | exists (`social.ts`) | no |
| 5 | settings | `/admin/settings` | 13 | exists (`settings.ts`) | no |
| 6 | bookings | `/admin/bookings` | 13 | exists (`booking.ts`) | no |
| 7 | teams | `/admin/teams` | 8 | exists (`team.ts`) | no |
| 8 | channelConfigs | `/admin/channel-configs` | 7 | exists (`channel-config.ts`) | no |
| 9 | broadcast | `/admin/broadcast`, `/public/broadcast` | 8 | exists (`broadcast.ts`) | no |
| 10 | watchRules | `/admin/watch-rules` | 6 | exists (`watch-rule.ts`) | no |
| 11 | events | `/admin/events` | 5 | exists (`event.ts`) | no |
| 12 | refereesAdmin | `/admin/referees`, `/admin/referee`, `/admin/referee-assignment`, `/admin/referee-eligible-games` | 32 | partial (`referee*.ts`) | **yes** — add assignment/eligible-games schemas + wire routes |
| 13 | venues | `/admin/venues` | 4 | partial (`venue.ts` search only) | **yes** if non-search bodies used |
| 14 | standings | `/admin/standings` | 4 | GET, likely none | response type only |
| 15 | users | `/admin/users` | 3 | partial (`user.ts` referee-link only) | **yes** if other bodies used |
| 16 | scoreboard | `/admin/scoreboard`, `/public/scoreboard` | 3 | exists (`scoreboard.ts`) | no |
| 17 | assistant | `/admin/assistant` (if web uses it) | — | none | **yes** — add schema + wire route |
| 18 | dashboard | `/admin/dashboard` | 1 | none | **yes** if it takes params |

> Group 12 (referees-admin) is the second-biggest and a gap group — it adds contracts + wires API routes for assignment/eligible-games. Budget it accordingly; it may split into two commits (admin-referees read/visibility vs. assignment).
> `/api/auth/*` stays on better-auth — do **not** migrate.

---

## Final slice — Cleanup + guard

### Task F.1: Delete the bespoke fetchers

**Files:**
- Modify: `apps/web/src/lib/api.ts` (remove `fetchAPI`, `getBaseURL`)
- Delete: `apps/web/src/lib/api.server.ts`'s `fetchAPIServer` (or the file if empty)

- [ ] **Step 1:** Confirm zero remaining call sites: `grep -rn "fetchAPI" apps/web/src --include="*.ts" --include="*.tsx"` returns nothing (besides the definitions). If any remain, they belong to an unfinished group slice — finish it first.
- [ ] **Step 2:** Remove `fetchAPI`/`getBaseURL` from `api.ts` (leaving `api` + `APIError` re-export). Remove `fetchAPIServer` from `api.server.ts` (leaving `getServerApi`).
- [ ] **Step 3:** `pnpm --filter @dragons/web typecheck` — expect clean.
- [ ] **Step 4:** Commit `refactor(web): remove bespoke fetchAPI/fetchAPIServer`.

### Task F.2: Lint guard against reintroduction

**Files:**
- Modify: `eslint.config.base.mjs` (or web package eslint config)
- Test: a deliberately-violating fixture under `--no-eslintrc`, or assert via `pnpm lint` failing on a temp file (manual check).

- [ ] **Step 1:** Add a `no-restricted-syntax`/`no-restricted-imports` rule for web that forbids declaring a `fetchAPI`/`fetchAPIServer` wrapper or calling `fetch(` directly in `apps/web/src` outside `lib/` (allow the api-client package). Example `no-restricted-syntax` selector for a bare `fetch(` call expression, scoped via an override `files: ["apps/web/src/**"]` with an exception for `lib/`.
- [ ] **Step 2:** `pnpm lint` — expect clean on the real tree.
- [ ] **Step 3:** Temporarily add a `fetch("/x")` to a web component, run `pnpm lint`, confirm it errors, then revert.
- [ ] **Step 4:** Commit `chore(web): lint-guard against bespoke fetch wrappers`.

### Task F.3: Document the data layer

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1:** Add a "Web data layer" note: client components use `api` from `@/lib/api`; server components use `await getServerApi()`; both wrap `@dragons/api-client`'s `createApi`; request types come from `@dragons/contracts`, responses from `@dragons/shared`; new endpoints get a factory + `.contract.test.ts`.
- [ ] **Step 2:** Run `pnpm check:ai-slop`.
- [ ] **Step 3:** Commit `docs: document unified web data layer in AGENTS.md`.

---

## Self-review notes

- **Spec coverage:** error-parsing fix (0.1) ✓; cache option (0.2) ✓; reorder/position fix (0.3) ✓; createApi (0.4) ✓; web browser+server wiring (0.5/0.6) ✓; duplicate APIError removed (0.5) ✓; per-group factories+tests+migration (recipe + roster) ✓; contracts type-alias + gap-group route wiring (recipe step 1) ✓; delete fetchers (F.1) ✓; lint guard (F.2) ✓; AGENTS.md (F.3) ✓.
- **Response-type gaps** (spec risk): recipe step 2 says add the type to `@dragons/shared` when missing — keep responses out of contracts.
- **Coverage ratchets:** every new factory ships with its contract test; every migrated hook keeps its test. Run `pnpm coverage` per slice; never lower a threshold.
- **Naming consistency:** namespace keys in `createApi` match the roster `key` column and the `api.<key>` call sites.
