# Referee Games Query Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three copies of referee-games query normalization (defaults + `league[]→string` join) into one canonical normalizer that both the SWR cache key and the request fetcher derive from, preserving the exact wire key string.

**Architecture:** A new leaf module `referee-games-query.ts` owns the normalizer and its types. `SWR_KEYS.refereeGamesFiltered` becomes a pure serializer of the normalized object. The registry normalizes once and feeds both key and fetcher. The SSR fallback in `page.tsx` routes through `makeQueries(serverApi)` instead of hand-duplicating opts.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Next.js 16 App Router (`apps/web`), SWR, Vitest v4, `@dragons/api-client`.

**Spec:** `docs/superpowers/specs/2026-06-11-referee-games-filtered-normalization-design.md`

---

## File Structure

- **Create** `apps/web/src/lib/referee-games-query.ts` — canonical normalizer + `RawRefereeGamesOpts` + `NormalizedRefereeGamesQuery` types. Leaf module (imports only `@dragons/api-client` types).
- **Create** `apps/web/src/lib/referee-games-query.test.ts` — unit tests for the normalizer.
- **Modify** `apps/web/src/lib/swr-keys.ts` — `refereeGamesFiltered` takes the normalized object and serializes it (byte-identical output).
- **Modify** `apps/web/src/lib/swr-queries.ts` — delete local `normRefereeGames`; registry normalizes once via the new module.
- **Modify** `apps/web/src/lib/swr-queries.test.ts` — add a wire-key characterization test; update the two existing `refereeGamesFiltered` cases.
- **Modify** `apps/web/src/app/[locale]/admin/referees/page.tsx` — SSR fallback routes through `makeQueries(serverApi)`.

No change to the API route, the `RefereeGamesQueryParams` contract, the two consuming components (`open-games-list.tsx`, `upcoming-subtab.tsx`), or any other `SWR_KEYS` member.

---

## Task 1: Lock the current wire key with a characterization test

This test asserts the exact key string the registry produces from raw opts. The registry entry's input signature (raw opts) is the only entry point that stays stable across the whole refactor, so this test must keep passing through every later task — it is the proof that byte-identity is preserved.

**Files:**
- Test: `apps/web/src/lib/swr-queries.test.ts` (add cases in the existing `referee self-service` section, after line 285)

- [ ] **Step 1: Write the characterization test**

Add these two cases to `apps/web/src/lib/swr-queries.test.ts` immediately after the existing `"refereeGamesFiltered: optional fields are included when provided"` test (after its closing `});` around line 285):

```ts
  it("refereeGamesFiltered: wire key is stable (defaults-only)", () => {
    const { api } = mockApi();
    const q = makeQueries(api).refereeGamesFiltered({});
    expect(q.key).toBe("/referee/games?status=active&limit=100&offset=0");
  });

  it("refereeGamesFiltered: wire key is stable (full opts incl. league join)", () => {
    const { api } = mockApi();
    const q = makeQueries(api).refereeGamesFiltered({
      status: "all",
      limit: 200,
      offset: 50,
      slotStatus: "offered",
      gameType: "both",
      dateFrom: "2026-01-01",
      dateTo: "2026-02-28",
      league: ["U18", "U20"],
      search: "abc",
      assignedRefereeApiId: 7,
    });
    expect(q.key).toBe(
      "/referee/games?status=all&limit=200&offset=50&slotStatus=offered&gameType=both&dateFrom=2026-01-01&dateTo=2026-02-28&league=U18%2CU20&search=abc&assignedRefereeApiId=7",
    );
  });
```

- [ ] **Step 2: Run the tests against current (unchanged) production code**

Run: `pnpm --filter @dragons/web test -- src/lib/swr-queries.test.ts`
Expected: PASS. These literals describe the *current* `SWR_KEYS.refereeGamesFiltered` output. If either fails purely on the expected string, the literal was hand-mis-computed — replace it with the actual `Received` value from the test output (that value is the current behavior we are locking) and re-run until green. Do NOT change production code in this task.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/swr-queries.test.ts
git commit -m "test(web): characterize refereeGamesFiltered wire key before refactor"
```

---

## Task 2: Route the SSR fallback through the registry

Removes the third normalization copy in `page.tsx`. Works with the *current* `SWR_KEYS` signature, so it is independent of the serializer change and keeps Task 1 green.

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/referees/page.tsx`

- [ ] **Step 1: Add the `makeQueries` import**

In `apps/web/src/app/[locale]/admin/referees/page.tsx`, add this import next to the existing `SWR_KEYS` import (keep `SWR_KEYS` — it is still used for `refereesPaginated`):

```ts
import { makeQueries } from "@/lib/swr-queries";
```

- [ ] **Step 2: Build the games query from the server-bound registry**

Replace the body from `const refereesKey = ...` through the `gamesKey` block and the `serverApi` creation so `serverApi` is created first and the games query comes from the registry. The relevant region currently reads:

```ts
  const fallback: Record<string, unknown> = {};

  const refereesKey = SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 });

  const today = todayInBerlin();
  const to = plusDaysInBerlin(14);

  const gamesKey = SWR_KEYS.refereeGamesFiltered({
    status: "active",
    dateFrom: today,
    dateTo: to,
    gameType: "both",
    limit: 200,
  });

  const serverApi = await getServerApi();

  try {
    fallback[refereesKey] = await serverApi.refereeAdmin.listReferees({
      scope: "own",
      limit: 50,
    });
  } catch {}

  try {
    fallback[gamesKey] = await serverApi.referees.getGames({
      status: "active",
      dateFrom: today,
      dateTo: to,
      gameType: "both",
      limit: 200,
    });
  } catch {}
```

Replace that entire region with:

```ts
  const fallback: Record<string, unknown> = {};

  const serverApi = await getServerApi();

  const refereesKey = SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 });

  const today = todayInBerlin();
  const to = plusDaysInBerlin(14);

  const gamesQ = makeQueries(serverApi).refereeGamesFiltered({
    status: "active",
    dateFrom: today,
    dateTo: to,
    gameType: "both",
    limit: 200,
  });

  try {
    fallback[refereesKey] = await serverApi.refereeAdmin.listReferees({
      scope: "own",
      limit: 50,
    });
  } catch {}

  try {
    fallback[gamesQ.key] = await gamesQ.fetcher();
  } catch {}
```

- [ ] **Step 3: Typecheck the web package**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS (no type errors).

- [ ] **Step 4: Run the web test suite**

Run: `pnpm --filter @dragons/web test`
Expected: PASS, including the Task 1 characterization tests (the key the SSR path produces is unchanged because `makeQueries(...).refereeGamesFiltered(opts).key` === the old `SWR_KEYS.refereeGamesFiltered(opts)`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/admin/referees/page.tsx
git commit -m "refactor(web): seed referees SSR fallback via the query registry"
```

---

## Task 3: Create the canonical normalizer module (TDD)

**Files:**
- Create: `apps/web/src/lib/referee-games-query.ts`
- Test: `apps/web/src/lib/referee-games-query.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `apps/web/src/lib/referee-games-query.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeRefereeGamesQuery } from "./referee-games-query";

describe("normalizeRefereeGamesQuery", () => {
  it("applies status/limit/offset defaults when omitted", () => {
    expect(normalizeRefereeGamesQuery({})).toEqual({
      status: "active",
      limit: 100,
      offset: 0,
    });
  });

  it("joins a multi-element league array into a comma string", () => {
    const norm = normalizeRefereeGamesQuery({ league: ["U18", "U20"] });
    expect(norm.league).toBe("U18,U20");
  });

  it("omits league when the array is empty", () => {
    expect(normalizeRefereeGamesQuery({ league: [] })).not.toHaveProperty("league");
  });

  it("retains assignedRefereeApiId of 0 (uses != null, not truthiness)", () => {
    const norm = normalizeRefereeGamesQuery({ assignedRefereeApiId: 0 });
    expect(norm.assignedRefereeApiId).toBe(0);
  });

  it("passes through provided optional fields and overrides defaults", () => {
    expect(
      normalizeRefereeGamesQuery({
        status: "all",
        limit: 200,
        offset: 50,
        slotStatus: "offered",
        gameType: "both",
        dateFrom: "2026-01-01",
        dateTo: "2026-02-28",
        search: "abc",
      }),
    ).toEqual({
      status: "all",
      limit: 200,
      offset: 50,
      slotStatus: "offered",
      gameType: "both",
      dateFrom: "2026-01-01",
      dateTo: "2026-02-28",
      search: "abc",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/web test -- src/lib/referee-games-query.test.ts`
Expected: FAIL — cannot resolve module `./referee-games-query` (file does not exist yet).

- [ ] **Step 3: Write the module**

Create `apps/web/src/lib/referee-games-query.ts`. The field insertion order in the returned object literal must match the order `SWR_KEYS.refereeGamesFiltered` will serialize in (Task 4), which preserves byte-identity:

```ts
import type { RefereeGamesQueryParams } from "@dragons/api-client";

/**
 * Caller-facing referee-games query options. `league` is an array here;
 * `normalizeRefereeGamesQuery` joins it to the comma-separated string the API
 * expects. Every field is optional — defaults are applied during normalization.
 */
export interface RawRefereeGamesOpts {
  status?: "active" | "all";
  slotStatus?: "open" | "offered" | "any";
  league?: string[];
  dateFrom?: string;
  dateTo?: string;
  gameType?: "home" | "away" | "both";
  assignedRefereeApiId?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Normalized query: status/limit/offset defaults applied, `league` joined to a
 * string. Intersecting with RefereeGamesQueryParams makes this provably a valid
 * argument to `api.referees.getGames` and keeps it tracking the API contract.
 */
export type NormalizedRefereeGamesQuery = RefereeGamesQueryParams & {
  status: "active" | "all";
  limit: number;
  offset: number;
};

export function normalizeRefereeGamesQuery(
  opts: RawRefereeGamesOpts = {},
): NormalizedRefereeGamesQuery {
  return {
    status: opts.status ?? "active",
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
    ...(opts.slotStatus ? { slotStatus: opts.slotStatus } : {}),
    ...(opts.gameType ? { gameType: opts.gameType } : {}),
    ...(opts.dateFrom ? { dateFrom: opts.dateFrom } : {}),
    ...(opts.dateTo ? { dateTo: opts.dateTo } : {}),
    ...(opts.league?.length ? { league: opts.league.join(",") } : {}),
    ...(opts.search ? { search: opts.search } : {}),
    ...(opts.assignedRefereeApiId != null
      ? { assignedRefereeApiId: opts.assignedRefereeApiId }
      : {}),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/web test -- src/lib/referee-games-query.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/referee-games-query.ts apps/web/src/lib/referee-games-query.test.ts
git commit -m "feat(web): add canonical referee-games query normalizer"
```

---

## Task 4: Wire the normalizer through the key serializer and registry

Atomic change: the `SWR_KEYS.refereeGamesFiltered` signature flips to the normalized object, and its only two remaining callers (the registry and the two existing `swr-queries.test.ts` cases) update in the same commit so typecheck and tests stay green.

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts:68-92`
- Modify: `apps/web/src/lib/swr-queries.ts:29-45` (delete `normRefereeGames`), `:122-128` (registry entry)
- Modify: `apps/web/src/lib/swr-queries.test.ts` (two existing cases, ~lines 264-285)

- [ ] **Step 1: Convert `SWR_KEYS.refereeGamesFiltered` to a serializer**

In `apps/web/src/lib/swr-keys.ts`, add this import as the first line of the file (the file currently starts with `export const SWR_KEYS = {`):

```ts
import type { NormalizedRefereeGamesQuery } from "./referee-games-query";
```

Then replace the entire current `refereeGamesFiltered` member (the block from `refereeGamesFiltered: (opts: {` through its closing `},` — lines 68-92) with:

```ts
  refereeGamesFiltered: (q: NormalizedRefereeGamesQuery) => {
    const qs = new URLSearchParams();
    qs.set("status", q.status);
    qs.set("limit", String(q.limit));
    qs.set("offset", String(q.offset));
    if (q.slotStatus) qs.set("slotStatus", q.slotStatus);
    if (q.gameType) qs.set("gameType", q.gameType);
    if (q.dateFrom) qs.set("dateFrom", q.dateFrom);
    if (q.dateTo) qs.set("dateTo", q.dateTo);
    if (q.league) qs.set("league", q.league);
    if (q.search) qs.set("search", q.search);
    if (q.assignedRefereeApiId != null)
      qs.set("assignedRefereeApiId", String(q.assignedRefereeApiId));
    return `/referee/games?${qs.toString()}`;
  },
```

- [ ] **Step 2: Delete the duplicate `normRefereeGames` and update the registry**

In `apps/web/src/lib/swr-queries.ts`:

(a) Update the imports at the top (lines 1-3 currently) to add the new module:

```ts
import type { Api } from "@dragons/api-client";
import { SWR_KEYS } from "./swr-keys";
import { api } from "./api";
import {
  normalizeRefereeGamesQuery,
  type RawRefereeGamesOpts,
} from "./referee-games-query";
```

(b) Delete the entire local `normRefereeGames` function (the comment block + function, lines 29-45 — from `// The SWR_KEYS builder accepts` through the closing `}` of `normRefereeGames`).

(c) Replace the registry's `refereeGamesFiltered` entry (lines 122-128) with:

```ts
    refereeGamesFiltered: (opts: RawRefereeGamesOpts = {}) => {
      const norm = normalizeRefereeGamesQuery(opts);
      return {
        key: SWR_KEYS.refereeGamesFiltered(norm),
        fetcher: () => api.referees.getGames(norm),
      };
    },
```

- [ ] **Step 3: Update the two existing registry tests**

In `apps/web/src/lib/swr-queries.test.ts`:

(a) Add the normalizer to the imports (after the `SWR_KEYS` import near line 3):

```ts
import { normalizeRefereeGamesQuery } from "./referee-games-query";
```

(b) In the test `"refereeGamesFiltered: key from opts; fetcher normalizes defaults"`, change the key assertion line from:

```ts
    expect(q.key).toBe(SWR_KEYS.refereeGamesFiltered(opts));
```

to:

```ts
    expect(q.key).toBe(SWR_KEYS.refereeGamesFiltered(normalizeRefereeGamesQuery(opts)));
```

(c) In the test `"refereeGamesFiltered: optional fields are included when provided"`, change the same assertion line identically:

```ts
    expect(q.key).toBe(SWR_KEYS.refereeGamesFiltered(normalizeRefereeGamesQuery(opts)));
```

- [ ] **Step 4: Typecheck the web package**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS. (Confirms no other caller passes raw opts to `SWR_KEYS.refereeGamesFiltered`; `getGames(norm)` accepts the normalized type.)

- [ ] **Step 5: Run the full web test suite**

Run: `pnpm --filter @dragons/web test`
Expected: PASS. The Task 1 characterization tests stay green — proof the wire key is byte-identical after the refactor.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts apps/web/src/lib/swr-queries.ts apps/web/src/lib/swr-queries.test.ts
git commit -m "refactor(web): derive refereeGamesFiltered key and fetcher from one normalizer"
```

---

## Task 5: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole monorepo**

Run: `pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS (no new errors; `consistent-type-imports` satisfied by the `import type` usages above).

- [ ] **Step 3: Test**

Run: `pnpm test`
Expected: PASS. (Tolerated background noise per repo norms: Redis `ECONNREFUSED:6379`, happy-dom teardown chatter, `IntlError: MISSING_MESSAGE` — judge by exit code.)

- [ ] **Step 4: Coverage**

Run: `pnpm --filter @dragons/web coverage`
Expected: PASS — web coverage at or above its current floor. The new module is fully unit-tested; no threshold is lowered. (If `pnpm coverage` flakes on Redis, re-run before treating as real.)

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: PASS (web + api production builds succeed).

- [ ] **Step 6: Final commit (only if any verification produced a fix)**

If steps 1-5 were all green with no edits, there is nothing to commit. If a fix was needed, commit it:

```bash
git add -A
git commit -m "fix(web): address verification-gate findings for query normalization"
```

---

## Self-Review Notes

- **Spec coverage:** new module (Task 3) ✓; serializer flip + registry normalize-once (Task 4) ✓; `page.tsx` folded through registry (Task 2) ✓; byte-identity preserved + characterization test (Tasks 1, 4) ✓; normalizer unit tests incl. empty-league and `assignedRefereeApiId: 0` (Task 3) ✓; consumers unchanged ✓; full gate (Task 5) ✓.
- **Type consistency:** `RawRefereeGamesOpts`, `NormalizedRefereeGamesQuery`, `normalizeRefereeGamesQuery` are named identically everywhere they appear. The registry input type is `RawRefereeGamesOpts`; the serializer input type is `NormalizedRefereeGamesQuery`.
- **Ordering rationale:** Task 2 (page.tsx) precedes the signature flip so it can be a clean, independently-green commit using the current signature; after it, the only raw-opts callers of `SWR_KEYS.refereeGamesFiltered` are the registry and its two tests, which Task 4 flips atomically.
