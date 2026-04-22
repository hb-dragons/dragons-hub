# Referee History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only referee history page at `/admin/referee/history` that shows past referee obligations/activity with coverage KPIs, a referee leaderboard, and a paginated game list.

**Architecture:** Two new API endpoints under `/admin/referee/history/*` backed by one service module reading existing tables (`referee_games`, `referees`, `app_settings`). Two SWR hooks + one Next.js page with five React components. No schema changes.

**Tech Stack:** Hono 4, Drizzle ORM 0.45, Zod 4, PostgreSQL 17 (pglite for tests), Next.js 16 (App Router), SWR, Tailwind/shadcn. Vitest 4.

**Spec:** `docs/superpowers/specs/2026-04-22-referee-history-design.md`

---

## File Map

API:
- Create: `apps/api/src/routes/admin/referee-history.schemas.ts`
- Create: `apps/api/src/services/admin/referee-history.service.ts`
- Create: `apps/api/src/services/admin/referee-history.service.test.ts`
- Create: `apps/api/src/routes/admin/referee-history.routes.ts`
- Create: `apps/api/src/routes/admin/referee-history.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts` — register new router
- Modify: `apps/api/src/test/setup-test-db.ts` — add `referee_games` to TRUNCATE list

Shared:
- Create: `packages/shared/src/referee-history.ts` — response types
- Modify: `packages/shared/src/index.ts` — re-export

Web:
- Modify: `apps/web/src/lib/swr-keys.ts` — add history keys
- Create: `apps/web/src/hooks/use-referee-history.ts` — both SWR hooks in one file
- Create: `apps/web/src/app/[locale]/admin/referee/history/page.tsx`
- Create: `apps/web/src/components/referee/history/history-page.tsx`
- Create: `apps/web/src/components/referee/history/history-filters.tsx`
- Create: `apps/web/src/components/referee/history/coverage-kpi-cards.tsx`
- Create: `apps/web/src/components/referee/history/referee-leaderboard.tsx`
- Create: `apps/web/src/components/referee/history/history-game-list.tsx`
- Modify: `apps/web/src/components/admin/app-sidebar.tsx` — add nav entry
- Modify: `apps/web/src/messages/en.json` + `apps/web/src/messages/de.json`

---

## Task 1: Test DB fixture prep

**Files:**
- Modify: `apps/api/src/test/setup-test-db.ts`

- [ ] **Step 1: Add `referee_games` to TRUNCATE list**

Edit the `TRUNCATE` statement in `resetTestDb` to include `referee_games` before `matches` (FK dependency).

Current state (line ~30):
```ts
await ctx.client.exec(`
  TRUNCATE
    match_changes, match_remote_versions, match_local_versions,
    match_overrides, match_referees, referee_assignment_intents,
    referee_assignment_rules, referee_roles,
    referees, standings, matches, teams, venues, leagues,
    ...
```

Change to:
```ts
await ctx.client.exec(`
  TRUNCATE
    match_changes, match_remote_versions, match_local_versions,
    match_overrides, match_referees, referee_assignment_intents,
    referee_assignment_rules, referee_roles, referee_games,
    referees, standings, matches, teams, venues, leagues,
    ...
```

- [ ] **Step 2: Run setup-test-db test to confirm truncate still works**

Run: `pnpm --filter @dragons/api test -- setup-test-db`
Expected: PASS (no regressions).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/setup-test-db.ts
git commit -m "test(api): include referee_games in test db truncate"
```

---

## Task 2: Shared response types

**Files:**
- Create: `packages/shared/src/referee-history.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the types**

Create `packages/shared/src/referee-history.ts`:
```ts
export type HistoryMode = "obligation" | "activity";
export type HistoryStatus = "all" | "active" | "cancelled" | "forfeited";

export interface HistoryDateRange {
  from: string;
  to: string;
  source: "user" | "settings" | "default";
}

export interface HistoryKpis {
  games: number;
  obligatedSlots?: number;
  filledSlots?: number;
  unfilledSlots?: number;
  cancelled: number;
  forfeited: number;
  distinctReferees: number;
}

export interface HistoryLeaderboardEntry {
  refereeApiId: number | null;
  refereeId: number | null;
  displayName: string;
  isOwnClub: boolean;
  sr1Count: number;
  sr2Count: number;
  total: number;
  lastRefereedDate: string | null;
}

export interface HistorySummaryResponse {
  range: HistoryDateRange;
  kpis: HistoryKpis;
  leaderboard: HistoryLeaderboardEntry[];
}

export interface HistoryGameItem {
  id: number;
  matchId: number | null;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  leagueName: string | null;
  leagueShort: string | null;
  venueName: string | null;
  venueCity: string | null;
  sr1OurClub: boolean;
  sr2OurClub: boolean;
  sr1Name: string | null;
  sr2Name: string | null;
  sr1Status: string;
  sr2Status: string;
  isCancelled: boolean;
  isForfeited: boolean;
  isHomeGame: boolean;
}
```

- [ ] **Step 2: Re-export from package index**

Append to `packages/shared/src/index.ts`:
```ts
export * from "./referee-history";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/referee-history.ts packages/shared/src/index.ts
git commit -m "feat(shared): add referee history response types"
```

---

## Task 3: Zod request schemas

**Files:**
- Create: `apps/api/src/routes/admin/referee-history.schemas.ts`

- [ ] **Step 1: Write the schemas**

Create `apps/api/src/routes/admin/referee-history.schemas.ts`:
```ts
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const historyFilterSchema = z.object({
  mode: z.enum(["obligation", "activity"]).default("obligation"),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  league: z.string().trim().min(1).optional(),
  status: z.enum(["all", "active", "cancelled", "forfeited"]).default("active"),
});

export const historyGamesQuerySchema = historyFilterSchema.extend({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type HistoryFilterParams = z.infer<typeof historyFilterSchema>;
export type HistoryGamesQueryParams = z.infer<typeof historyGamesQuerySchema>;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/referee-history.schemas.ts
git commit -m "feat(api): add referee history zod schemas"
```

---

## Task 4: `resolveHistoryDateRange` (settings + fallback)

**Files:**
- Create: `apps/api/src/services/admin/referee-history.service.ts`
- Create: `apps/api/src/services/admin/referee-history.service.test.ts`

- [ ] **Step 1: Write failing tests for date resolution**

Create `apps/api/src/services/admin/referee-history.service.test.ts`:
```ts
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy({}, {
    get: (_target, prop) =>
      (dbHolder.ref as Record<string | symbol, unknown>)[prop],
  }),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  },
}));

import { resolveHistoryDateRange } from "./referee-history.service";
import { appSettings } from "@dragons/db/schema";
import {
  setupTestDb, resetTestDb, closeTestDb, type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); });

describe("resolveHistoryDateRange", () => {
  it("returns user values when both provided", async () => {
    const res = await resolveHistoryDateRange("2024-09-01", "2025-03-31");
    expect(res).toEqual({
      from: "2024-09-01", to: "2025-03-31", source: "user",
    });
  });

  it("reads app_settings when user values absent", async () => {
    await ctx.db.insert(appSettings).values([
      { key: "currentSeasonStart", value: "2025-08-01" },
      { key: "currentSeasonEnd", value: "2026-07-31" },
    ]);
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "settings",
    });
  });

  it("falls back to Aug-Jul season when settings missing", async () => {
    // Stub today's date so the test is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00Z"));
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "default",
    });
    vi.useRealTimers();
  });

  it("default fallback rolls to current calendar year when month >= Aug", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2026-08-01", to: "2027-07-31", source: "default",
    });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: FAIL (file/function not defined).

- [ ] **Step 3: Implement the function**

Create `apps/api/src/services/admin/referee-history.service.ts`:
```ts
import { db } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { HistoryDateRange } from "@dragons/shared";

export async function resolveHistoryDateRange(
  from?: string,
  to?: string,
): Promise<HistoryDateRange> {
  if (from && to) return { from, to, source: "user" };

  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, ["currentSeasonStart", "currentSeasonEnd"]));

  const settingsFrom = rows.find((r) => r.key === "currentSeasonStart")?.value;
  const settingsTo = rows.find((r) => r.key === "currentSeasonEnd")?.value;
  if (settingsFrom && settingsTo) {
    return { from: settingsFrom, to: settingsTo, source: "settings" };
  }

  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return {
    from: `${startYear}-08-01`,
    to: `${startYear + 1}-07-31`,
    source: "default",
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts apps/api/src/services/admin/referee-history.service.test.ts
git commit -m "feat(api): add resolveHistoryDateRange with app_settings fallback"
```

---

## Task 5: KPI summary aggregates

**Files:**
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.test.ts`

- [ ] **Step 1: Append failing tests for `getRefereeHistorySummary` KPIs**

Append to `apps/api/src/services/admin/referee-history.service.test.ts`:
```ts
import { getRefereeHistorySummary } from "./referee-history.service";
import { referees, refereeGames } from "@dragons/db/schema";

async function seedReferees() {
  await ctx.db.insert(referees).values([
    { apiId: 100, firstName: "Anna", lastName: "Own", isOwnClub: true },
    { apiId: 101, firstName: "Ben",  lastName: "Own",  isOwnClub: true },
    { apiId: 200, firstName: "Carl", lastName: "Guest", isOwnClub: false },
  ]);
}

function baseGame(overrides: Partial<typeof refereeGames.$inferInsert> = {}) {
  return {
    apiMatchId: Math.floor(Math.random() * 1_000_000),
    matchNo: 1,
    kickoffDate: "2025-09-15",
    kickoffTime: "18:00:00",
    homeTeamName: "Dragons",
    guestTeamName: "Bears",
    sr1OurClub: true,
    sr2OurClub: true,
    sr1Status: "filled",
    sr2Status: "filled",
    sr1RefereeApiId: 100,
    sr2RefereeApiId: 101,
    sr1Name: "Own, Anna",
    sr2Name: "Own, Ben",
    isHomeGame: true,
    ...overrides,
  };
}

describe("getRefereeHistorySummary KPIs (obligation mode)", () => {
  beforeEach(async () => { await seedReferees(); });

  it("counts games and slot fill states within range", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-15" }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-01",
        sr1Status: "open", sr1RefereeApiId: null, sr1Name: null }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-10-02",
        isCancelled: true }),
      baseGame({ apiMatchId: 4, kickoffDate: "2025-10-03",
        isForfeited: true }),
      // out of range → excluded
      baseGame({ apiMatchId: 5, kickoffDate: "2024-05-01" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "all",
    });

    expect(res.kpis.games).toBe(4);
    expect(res.kpis.obligatedSlots).toBe(8);
    expect(res.kpis.filledSlots).toBe(7);
    expect(res.kpis.unfilledSlots).toBe(1);
    expect(res.kpis.cancelled).toBe(1);
    expect(res.kpis.forfeited).toBe(1);
  });

  it("default status=active excludes cancelled/forfeited from game count", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1 }),
      baseGame({ apiMatchId: 2, isCancelled: true }),
      baseGame({ apiMatchId: 3, isForfeited: true }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "active",
    });

    expect(res.kpis.games).toBe(1);
    expect(res.kpis.cancelled).toBe(0);
    expect(res.kpis.forfeited).toBe(0);
  });

  it("activity mode omits obligation KPIs and counts games our refs worked", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, sr1OurClub: false, sr2OurClub: false,
        sr1RefereeApiId: 100, sr2RefereeApiId: 200,
        sr1Name: "Own, Anna", sr2Name: "Guest, Carl" }),
      baseGame({ apiMatchId: 2, sr1OurClub: false, sr2OurClub: false,
        sr1RefereeApiId: 200, sr2RefereeApiId: 200,
        sr1Name: "Guest, Carl", sr2Name: "Guest, Carl" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "activity",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "all",
    });

    expect(res.kpis.games).toBe(1);
    expect(res.kpis.obligatedSlots).toBeUndefined();
    expect(res.kpis.filledSlots).toBeUndefined();
    expect(res.kpis.unfilledSlots).toBeUndefined();
  });

  it("league filter narrows to matching leagueShort", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, leagueShort: "RLW" }),
      baseGame({ apiMatchId: 2, leagueShort: "OL" }),
    ]);
    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      league: "RLW",
      status: "all",
    });
    expect(res.kpis.games).toBe(1);
  });

  it("includes resolved range in response", async () => {
    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "all",
    });
    expect(res.range).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "user",
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: FAIL (function not defined).

- [ ] **Step 3: Implement KPI summary (leaderboard stub for now)**

Append to `apps/api/src/services/admin/referee-history.service.ts`:
```ts
import { referees, refereeGames } from "@dragons/db/schema";
import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import type {
  HistorySummaryResponse,
  HistoryLeaderboardEntry,
} from "@dragons/shared";
import type { HistoryFilterParams } from "../../routes/admin/referee-history.schemas";

function buildObligationPredicate() {
  return or(
    eq(refereeGames.sr1OurClub, true),
    eq(refereeGames.sr2OurClub, true),
  )!;
}

function buildActivityPredicate() {
  const ownIds = db
    .select({ id: referees.apiId })
    .from(referees)
    .where(eq(referees.isOwnClub, true));
  return or(
    sql`${refereeGames.sr1RefereeApiId} IN (${ownIds})`,
    sql`${refereeGames.sr2RefereeApiId} IN (${ownIds})`,
  )!;
}

function buildBaseWhere(
  params: HistoryFilterParams,
  resolvedFrom: string,
  resolvedTo: string,
) {
  const conds = [
    gte(refereeGames.kickoffDate, resolvedFrom),
    lte(refereeGames.kickoffDate, resolvedTo),
  ];
  conds.push(
    params.mode === "obligation"
      ? buildObligationPredicate()
      : buildActivityPredicate(),
  );
  if (params.league) conds.push(eq(refereeGames.leagueShort, params.league));
  if (params.status === "cancelled")
    conds.push(eq(refereeGames.isCancelled, true));
  else if (params.status === "forfeited")
    conds.push(eq(refereeGames.isForfeited, true));
  else if (params.status === "active") {
    conds.push(eq(refereeGames.isCancelled, false));
    conds.push(eq(refereeGames.isForfeited, false));
  }
  return and(...conds)!;
}

export async function getRefereeHistorySummary(
  params: HistoryFilterParams,
): Promise<HistorySummaryResponse> {
  const range = await resolveHistoryDateRange(params.dateFrom, params.dateTo);
  const where = buildBaseWhere(params, range.from, range.to);

  const [row] = await db
    .select({
      games: sql<number>`count(*)::int`,
      obligatedSlots: sql<number>`(
        sum(case when ${refereeGames.sr1OurClub} then 1 else 0 end)
        + sum(case when ${refereeGames.sr2OurClub} then 1 else 0 end)
      )::int`,
      filledSr1: sql<number>`sum(case when ${refereeGames.sr1OurClub}
        and ${refereeGames.sr1Status} <> 'open' then 1 else 0 end)::int`,
      filledSr2: sql<number>`sum(case when ${refereeGames.sr2OurClub}
        and ${refereeGames.sr2Status} <> 'open' then 1 else 0 end)::int`,
      unfilledSr1: sql<number>`sum(case when ${refereeGames.sr1OurClub}
        and ${refereeGames.sr1Status} = 'open' then 1 else 0 end)::int`,
      unfilledSr2: sql<number>`sum(case when ${refereeGames.sr2OurClub}
        and ${refereeGames.sr2Status} = 'open' then 1 else 0 end)::int`,
      cancelled: sql<number>`sum(case when ${refereeGames.isCancelled}
        then 1 else 0 end)::int`,
      forfeited: sql<number>`sum(case when ${refereeGames.isForfeited}
        then 1 else 0 end)::int`,
    })
    .from(refereeGames)
    .where(where);

  const kpis = params.mode === "obligation"
    ? {
        games: row?.games ?? 0,
        obligatedSlots: row?.obligatedSlots ?? 0,
        filledSlots: (row?.filledSr1 ?? 0) + (row?.filledSr2 ?? 0),
        unfilledSlots: (row?.unfilledSr1 ?? 0) + (row?.unfilledSr2 ?? 0),
        cancelled: row?.cancelled ?? 0,
        forfeited: row?.forfeited ?? 0,
        distinctReferees: 0, // filled in by leaderboard step
      }
    : {
        games: row?.games ?? 0,
        cancelled: row?.cancelled ?? 0,
        forfeited: row?.forfeited ?? 0,
        distinctReferees: 0,
      };

  const leaderboard: HistoryLeaderboardEntry[] = []; // Task 6

  return { range, kpis, leaderboard };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: 4 new tests PASS; `distinctReferees` still 0 (covered in Task 6).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts apps/api/src/services/admin/referee-history.service.test.ts
git commit -m "feat(api): add referee history KPI summary aggregates"
```

---

## Task 6: Leaderboard + distinctReferees

**Files:**
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.test.ts`

- [ ] **Step 1: Append failing tests for leaderboard**

Append to `apps/api/src/services/admin/referee-history.service.test.ts`:
```ts
describe("getRefereeHistorySummary leaderboard", () => {
  beforeEach(async () => { await seedReferees(); });

  it("counts sr1/sr2 per referee, joining own-club names", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-15",
        sr1RefereeApiId: 100, sr2RefereeApiId: 101 }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-01",
        sr1RefereeApiId: 100, sr2RefereeApiId: 100 }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-10-02",
        sr1RefereeApiId: 200, sr2RefereeApiId: 101,
        sr1Name: "Guest, Carl", sr2Name: "Own, Ben" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    });

    const anna  = res.leaderboard.find((e) => e.refereeApiId === 100);
    const ben   = res.leaderboard.find((e) => e.refereeApiId === 101);
    const carl  = res.leaderboard.find((e) => e.refereeApiId === 200);

    expect(anna).toEqual(expect.objectContaining({
      sr1Count: 2, sr2Count: 1, total: 3, isOwnClub: true,
      displayName: "Own, Anna", refereeId: expect.any(Number),
      lastRefereedDate: "2025-10-01",
    }));
    expect(ben).toEqual(expect.objectContaining({
      sr1Count: 0, sr2Count: 2, total: 2, isOwnClub: true,
    }));
    expect(carl).toEqual(expect.objectContaining({
      sr1Count: 1, sr2Count: 0, total: 1, isOwnClub: false,
      displayName: "Guest, Carl",
    }));
    expect(res.kpis.distinctReferees).toBe(3);
    // total desc sort
    expect(res.leaderboard.map((e) => e.refereeApiId)).toEqual([100, 101, 200]);
  });

  it("falls back to stored name when apiId is null", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-15",
        sr1RefereeApiId: null, sr2RefereeApiId: null,
        sr1Name: "Unknown, X", sr2Name: "Unknown, Y" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    });

    const x = res.leaderboard.find((e) => e.displayName === "Unknown, X");
    expect(x).toEqual(expect.objectContaining({
      refereeApiId: null, refereeId: null,
      isOwnClub: false, sr1Count: 1, sr2Count: 0, total: 1,
    }));
  });

  it("caps leaderboard at 100 entries", async () => {
    const rows = Array.from({ length: 110 }, (_, i) => baseGame({
      apiMatchId: 10_000 + i,
      kickoffDate: "2025-09-15",
      sr1RefereeApiId: null, sr2RefereeApiId: null,
      sr1Name: `Ref ${i}, A`, sr2Name: `Ref ${i}, B`,
    }));
    await ctx.db.insert(refereeGames).values(rows);

    const res = await getRefereeHistorySummary({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    });

    expect(res.leaderboard.length).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: FAIL — leaderboard empty.

- [ ] **Step 3: Implement leaderboard query**

Replace the `const leaderboard = [];` stub in `getRefereeHistorySummary` with:
```ts
const leaderboardRows = await db.execute(sql`
  WITH appearances AS (
    SELECT
      ${refereeGames.sr1RefereeApiId} AS api_id,
      ${refereeGames.sr1Name} AS raw_name,
      1 AS sr1, 0 AS sr2,
      ${refereeGames.kickoffDate} AS kickoff_date
    FROM ${refereeGames}
    WHERE ${where}
      AND (${refereeGames.sr1RefereeApiId} IS NOT NULL OR ${refereeGames.sr1Name} IS NOT NULL)
    UNION ALL
    SELECT
      ${refereeGames.sr2RefereeApiId},
      ${refereeGames.sr2Name},
      0, 1,
      ${refereeGames.kickoffDate}
    FROM ${refereeGames}
    WHERE ${where}
      AND (${refereeGames.sr2RefereeApiId} IS NOT NULL OR ${refereeGames.sr2Name} IS NOT NULL)
  )
  SELECT
    a.api_id::int AS "apiId",
    COALESCE(a.api_id::text, a.raw_name) AS group_key,
    MAX(a.raw_name) AS "rawName",
    SUM(a.sr1)::int AS "sr1Count",
    SUM(a.sr2)::int AS "sr2Count",
    (SUM(a.sr1) + SUM(a.sr2))::int AS total,
    MAX(a.kickoff_date)::text AS "lastRefereedDate",
    r.id AS "refereeId",
    r.first_name AS "firstName",
    r.last_name  AS "lastName",
    COALESCE(r.is_own_club, false) AS "isOwnClub"
  FROM appearances a
  LEFT JOIN ${referees} r ON r.api_id = a.api_id
  GROUP BY group_key, a.api_id, r.id, r.first_name, r.last_name, r.is_own_club
  ORDER BY total DESC, "lastRefereedDate" DESC NULLS LAST
  LIMIT 100
`);

const leaderboard: HistoryLeaderboardEntry[] = (
  leaderboardRows.rows as Array<{
    apiId: number | null;
    rawName: string | null;
    refereeId: number | null;
    firstName: string | null;
    lastName: string | null;
    isOwnClub: boolean;
    sr1Count: number;
    sr2Count: number;
    total: number;
    lastRefereedDate: string | null;
  }>
).map((r) => ({
  refereeApiId: r.apiId,
  refereeId: r.refereeId,
  displayName:
    r.lastName || r.firstName
      ? `${r.lastName ?? ""}${r.firstName ? ", " + r.firstName : ""}`.trim()
      : r.rawName ?? "",
  isOwnClub: !!r.isOwnClub,
  sr1Count: r.sr1Count,
  sr2Count: r.sr2Count,
  total: r.total,
  lastRefereedDate: r.lastRefereedDate,
}));

kpis.distinctReferees = leaderboard.length;
```

Note: `kpis` was declared `const` above — change to `let` or build via spread at return site. Simplest:
```ts
const finalKpis = { ...kpis, distinctReferees: leaderboard.length };
return { range, kpis: finalKpis, leaderboard };
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: 3 new tests PASS; earlier KPI tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts apps/api/src/services/admin/referee-history.service.test.ts
git commit -m "feat(api): add referee history leaderboard aggregation"
```

---

## Task 7: `getRefereeHistoryGames` paginated list

**Files:**
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/api/src/services/admin/referee-history.service.test.ts`:
```ts
import { getRefereeHistoryGames } from "./referee-history.service";

describe("getRefereeHistoryGames", () => {
  beforeEach(async () => { await seedReferees(); });

  it("returns paginated list sorted by kickoffDate desc", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-01", kickoffTime: "18:00:00" }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-05", kickoffTime: "20:00:00" }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-10-05", kickoffTime: "17:00:00" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      limit: 50, offset: 0,
    });
    expect(res.total).toBe(3);
    expect(res.hasMore).toBe(false);
    expect(res.items.map((i) => i.kickoffDate + " " + i.kickoffTime)).toEqual([
      "2025-10-05 20:00:00",
      "2025-10-05 17:00:00",
      "2025-09-01 18:00:00",
    ]);
  });

  it("respects limit/offset with hasMore", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-01" }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-01" }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-11-01" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      limit: 2, offset: 0,
    });
    expect(res.items.length).toBe(2);
    expect(res.hasMore).toBe(true);
    expect(res.total).toBe(3);
  });

  it("applies search on team + league names", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, homeTeamName: "Dragons", guestTeamName: "Bears" }),
      baseGame({ apiMatchId: 2, homeTeamName: "Wolves",  guestTeamName: "Eagles" }),
      baseGame({ apiMatchId: 3, homeTeamName: "Owls",    guestTeamName: "Hawks",
        leagueName: "Oberliga" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      limit: 50, offset: 0, search: "drag",
    });
    expect(res.items.length).toBe(1);
    expect(res.items[0]!.homeTeamName).toBe("Dragons");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: FAIL (function not defined).

- [ ] **Step 3: Implement the function**

Append to `apps/api/src/services/admin/referee-history.service.ts`:
```ts
import { asc, desc, ilike } from "drizzle-orm";
import type { HistoryGameItem } from "@dragons/shared";
import type { HistoryGamesQueryParams } from "../../routes/admin/referee-history.schemas";

export async function getRefereeHistoryGames(
  params: HistoryGamesQueryParams,
): Promise<{
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const range = await resolveHistoryDateRange(params.dateFrom, params.dateTo);
  const baseWhere = buildBaseWhere(params, range.from, range.to);

  const conds = [baseWhere];
  if (params.search) {
    const words = params.search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const p = `%${word}%`;
      conds.push(or(
        ilike(refereeGames.homeTeamName, p),
        ilike(refereeGames.guestTeamName, p),
        ilike(refereeGames.leagueName, p),
      )!);
    }
  }
  const where = and(...conds)!;

  const columns = {
    id: refereeGames.id,
    matchId: refereeGames.matchId,
    matchNo: refereeGames.matchNo,
    kickoffDate: refereeGames.kickoffDate,
    kickoffTime: refereeGames.kickoffTime,
    homeTeamName: refereeGames.homeTeamName,
    guestTeamName: refereeGames.guestTeamName,
    leagueName: refereeGames.leagueName,
    leagueShort: refereeGames.leagueShort,
    venueName: refereeGames.venueName,
    venueCity: refereeGames.venueCity,
    sr1OurClub: refereeGames.sr1OurClub,
    sr2OurClub: refereeGames.sr2OurClub,
    sr1Name: refereeGames.sr1Name,
    sr2Name: refereeGames.sr2Name,
    sr1Status: refereeGames.sr1Status,
    sr2Status: refereeGames.sr2Status,
    isCancelled: refereeGames.isCancelled,
    isForfeited: refereeGames.isForfeited,
    isHomeGame: refereeGames.isHomeGame,
  };

  const [items, countResult] = await Promise.all([
    db.select(columns).from(refereeGames).where(where)
      .orderBy(desc(refereeGames.kickoffDate), desc(refereeGames.kickoffTime))
      .limit(params.limit).offset(params.offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(refereeGames).where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return {
    items: items as HistoryGameItem[],
    total,
    limit: params.limit,
    offset: params.offset,
    hasMore: params.offset + items.length < total,
  };
}
```

Note: `asc` import not used — delete from import list if eslint flags it.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: all tests PASS.

- [ ] **Step 5: Run full API test suite + coverage**

Run: `pnpm --filter @dragons/api test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts apps/api/src/services/admin/referee-history.service.test.ts
git commit -m "feat(api): add paginated getRefereeHistoryGames"
```

---

## Task 8: Route handlers + register router

**Files:**
- Create: `apps/api/src/routes/admin/referee-history.routes.ts`
- Create: `apps/api/src/routes/admin/referee-history.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/routes/admin/referee-history.routes.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getRefereeHistorySummary: vi.fn(),
  getRefereeHistoryGames: vi.fn(),
}));

vi.mock("../../services/admin/referee-history.service", () => ({
  getRefereeHistorySummary: mocks.getRefereeHistorySummary,
  getRefereeHistoryGames: mocks.getRefereeHistoryGames,
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

import { adminRefereeHistoryRoutes } from "./referee-history.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", adminRefereeHistoryRoutes);

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /referee/history/summary", () => {
  it("parses defaults and calls service", async () => {
    mocks.getRefereeHistorySummary.mockResolvedValue({
      range: { from: "2025-08-01", to: "2026-07-31", source: "default" },
      kpis: { games: 0, cancelled: 0, forfeited: 0, distinctReferees: 0 },
      leaderboard: [],
    });
    const res = await app.request("/referee/history/summary");
    expect(res.status).toBe(200);
    expect(mocks.getRefereeHistorySummary).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "obligation", status: "active" }),
    );
  });

  it("400 on invalid mode", async () => {
    const res = await app.request("/referee/history/summary?mode=bogus");
    expect(res.status).toBe(400);
  });

  it("forwards explicit filters", async () => {
    mocks.getRefereeHistorySummary.mockResolvedValue({
      range: { from: "2024-08-01", to: "2025-07-31", source: "user" },
      kpis: { games: 1, cancelled: 0, forfeited: 0, distinctReferees: 0 },
      leaderboard: [],
    });
    const res = await app.request(
      "/referee/history/summary?mode=activity&dateFrom=2024-08-01&dateTo=2025-07-31&league=RLW&status=all",
    );
    expect(res.status).toBe(200);
    expect(mocks.getRefereeHistorySummary).toHaveBeenCalledWith({
      mode: "activity",
      dateFrom: "2024-08-01",
      dateTo: "2025-07-31",
      league: "RLW",
      status: "all",
    });
  });
});

describe("GET /referee/history/games", () => {
  it("applies default limit/offset", async () => {
    mocks.getRefereeHistoryGames.mockResolvedValue({
      items: [], total: 0, limit: 50, offset: 0, hasMore: false,
    });
    const res = await app.request("/referee/history/games");
    expect(res.status).toBe(200);
    expect(mocks.getRefereeHistoryGames).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0, mode: "obligation" }),
    );
  });

  it("400 on invalid date", async () => {
    const res = await app.request("/referee/history/games?dateFrom=not-a-date");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @dragons/api test -- referee-history.routes`
Expected: FAIL (file not defined).

- [ ] **Step 3: Implement the routes**

Create `apps/api/src/routes/admin/referee-history.routes.ts`:
```ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import {
  getRefereeHistorySummary,
  getRefereeHistoryGames,
} from "../../services/admin/referee-history.service";
import {
  historyFilterSchema,
  historyGamesQuerySchema,
} from "./referee-history.schemas";

const adminRefereeHistoryRoutes = new Hono<AppEnv>();

adminRefereeHistoryRoutes.get(
  "/referee/history/summary",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "Referee history KPIs + leaderboard for a date range",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const parsed = historyFilterSchema.parse({
      mode: c.req.query("mode"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
    });
    return c.json(await getRefereeHistorySummary(parsed));
  },
);

adminRefereeHistoryRoutes.get(
  "/referee/history/games",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "Paginated past referee games",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const parsed = historyGamesQuerySchema.parse({
      mode: c.req.query("mode"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
      search: c.req.query("search"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });
    return c.json(await getRefereeHistoryGames(parsed));
  },
);

export { adminRefereeHistoryRoutes };
```

- [ ] **Step 4: Register router in `routes/index.ts`**

Add import near other admin referee imports:
```ts
import { adminRefereeHistoryRoutes } from "./admin/referee-history.routes";
```

Add mount near other admin mounts (after `adminRefereeAssignmentRoutes`):
```ts
routes.route("/admin", adminRefereeHistoryRoutes);
```

- [ ] **Step 5: Run route tests to confirm they pass**

Run: `pnpm --filter @dragons/api test -- referee-history.routes`
Expected: all PASS.

- [ ] **Step 6: Run full API suite + coverage**

Run: `pnpm --filter @dragons/api test` and `pnpm --filter @dragons/api coverage`
Expected: PASS, coverage thresholds (90/95) still met for the new files.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/referee-history.routes.ts apps/api/src/routes/admin/referee-history.routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): expose referee history summary + games endpoints"
```

---

## Task 9: Web SWR keys + hooks

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts`
- Create: `apps/web/src/hooks/use-referee-history.ts`

- [ ] **Step 1: Add SWR keys**

Append inside the `SWR_KEYS` object in `apps/web/src/lib/swr-keys.ts`:
```ts
  refereeHistorySummary: (qs: string) =>
    `/admin/referee/history/summary${qs ? `?${qs}` : ""}`,
  refereeHistoryGames: (qs: string) =>
    `/admin/referee/history/games${qs ? `?${qs}` : ""}`,
```

- [ ] **Step 2: Write the hooks**

Create `apps/web/src/hooks/use-referee-history.ts`:
```ts
"use client";

import useSWR from "swr";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type {
  HistoryMode,
  HistoryStatus,
  HistorySummaryResponse,
  HistoryGameItem,
} from "@dragons/shared";

export interface HistoryFilterState {
  mode: HistoryMode;
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatus;
}

function toQuery(state: HistoryFilterState, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  p.set("mode", state.mode);
  p.set("status", state.status);
  if (state.dateFrom) p.set("dateFrom", state.dateFrom);
  if (state.dateTo) p.set("dateTo", state.dateTo);
  if (state.league) p.set("league", state.league);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export function useRefereeHistorySummary(state: HistoryFilterState) {
  const key = SWR_KEYS.refereeHistorySummary(toQuery(state));
  return useSWR<HistorySummaryResponse>(key, (url: string) =>
    fetchAPI<HistorySummaryResponse>(url),
  );
}

export interface HistoryGamesQueryState extends HistoryFilterState {
  search?: string;
  limit: number;
  offset: number;
}

export function useRefereeHistoryGames(state: HistoryGamesQueryState) {
  const extra: Record<string, string> = {
    limit: String(state.limit),
    offset: String(state.offset),
  };
  if (state.search) extra.search = state.search;
  const key = SWR_KEYS.refereeHistoryGames(toQuery(state, extra));
  return useSWR<{
    items: HistoryGameItem[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>(key, (url: string) => fetchAPI(url));
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts apps/web/src/hooks/use-referee-history.ts
git commit -m "feat(web): add referee history SWR hooks"
```

---

## Task 10: Translations

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Add `refereeHistory` namespace to en.json**

Append a `refereeHistory` object with keys used by the components:
```json
"refereeHistory": {
  "title": "Referee History",
  "mode": {
    "label": "Lens",
    "obligation": "Obligation",
    "activity": "Activity"
  },
  "status": {
    "label": "Status",
    "all": "All",
    "active": "Played",
    "cancelled": "Cancelled",
    "forfeited": "Forfeited"
  },
  "filters": {
    "dateFrom": "From",
    "dateTo": "To",
    "league": "League",
    "search": "Search team or league",
    "reset": "Reset"
  },
  "kpi": {
    "games": "Games",
    "obligatedSlots": "Obligated slots",
    "filledSlots": "Filled slots",
    "unfilledSlots": "Unfilled slots",
    "cancelled": "Cancelled",
    "forfeited": "Forfeited",
    "distinctReferees": "Distinct referees",
    "unfilledWarning": "Past games with unfilled slots indicate a data issue."
  },
  "leaderboard": {
    "title": "Referee leaderboard",
    "name": "Name",
    "ownClub": "Own club",
    "guest": "Guest",
    "sr1": "SR1",
    "sr2": "SR2",
    "total": "Total",
    "lastRefereed": "Last refereed"
  },
  "games": {
    "title": "Games",
    "empty": "No games in this range."
  },
  "range": {
    "source": {
      "user": "Custom range",
      "settings": "Current season",
      "default": "Current season (fallback)"
    }
  }
}
```

- [ ] **Step 2: Mirror into de.json with German strings**

```json
"refereeHistory": {
  "title": "Schiedsrichter-Historie",
  "mode": {
    "label": "Sicht",
    "obligation": "Verpflichtung",
    "activity": "Einsätze"
  },
  "status": {
    "label": "Status",
    "all": "Alle",
    "active": "Gespielt",
    "cancelled": "Abgesagt",
    "forfeited": "Verzicht"
  },
  "filters": {
    "dateFrom": "Von",
    "dateTo": "Bis",
    "league": "Liga",
    "search": "Team oder Liga suchen",
    "reset": "Zurücksetzen"
  },
  "kpi": {
    "games": "Spiele",
    "obligatedSlots": "Pflicht-Slots",
    "filledSlots": "Besetzt",
    "unfilledSlots": "Unbesetzt",
    "cancelled": "Abgesagt",
    "forfeited": "Verzicht",
    "distinctReferees": "Schiedsrichter",
    "unfilledWarning": "Vergangene Spiele mit offenen Slots deuten auf Datenprobleme hin."
  },
  "leaderboard": {
    "title": "Schiedsrichter-Rangliste",
    "name": "Name",
    "ownClub": "Eigener Verein",
    "guest": "Gast",
    "sr1": "SR1",
    "sr2": "SR2",
    "total": "Gesamt",
    "lastRefereed": "Zuletzt gepfiffen"
  },
  "games": {
    "title": "Spiele",
    "empty": "Keine Spiele im gewählten Zeitraum."
  },
  "range": {
    "source": {
      "user": "Eigener Zeitraum",
      "settings": "Aktuelle Saison",
      "default": "Aktuelle Saison (Fallback)"
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add referee history translations"
```

---

## Task 11: `HistoryFilters` component

**Files:**
- Create: `apps/web/src/components/referee/history/history-filters.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/referee/history/history-filters.tsx`:
```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import type { HistoryFilterState } from "@/hooks/use-referee-history";

interface Props {
  state: HistoryFilterState & { search?: string };
  onChange: (patch: Partial<HistoryFilterState & { search?: string }>) => void;
  onReset: () => void;
}

export function HistoryFilters({ state, onChange, onReset }: Props) {
  const t = useTranslations("refereeHistory");

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="flex flex-col text-sm">
        {t("mode.label")}
        <select
          className="border rounded px-2 py-1"
          value={state.mode}
          onChange={(e) => onChange({ mode: e.target.value as HistoryFilterState["mode"] })}
        >
          <option value="obligation">{t("mode.obligation")}</option>
          <option value="activity">{t("mode.activity")}</option>
        </select>
      </label>

      <label className="flex flex-col text-sm">
        {t("status.label")}
        <select
          className="border rounded px-2 py-1"
          value={state.status}
          onChange={(e) => onChange({ status: e.target.value as HistoryFilterState["status"] })}
        >
          <option value="active">{t("status.active")}</option>
          <option value="all">{t("status.all")}</option>
          <option value="cancelled">{t("status.cancelled")}</option>
          <option value="forfeited">{t("status.forfeited")}</option>
        </select>
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.dateFrom")}
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={state.dateFrom ?? ""}
          onChange={(e) => onChange({ dateFrom: e.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.dateTo")}
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={state.dateTo ?? ""}
          onChange={(e) => onChange({ dateTo: e.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.league")}
        <input
          type="text"
          className="border rounded px-2 py-1 w-24"
          value={state.league ?? ""}
          onChange={(e) => onChange({ league: e.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.search")}
        <input
          type="text"
          className="border rounded px-2 py-1"
          value={state.search ?? ""}
          onChange={(e) => onChange({ search: e.target.value || undefined })}
        />
      </label>

      <Button variant="outline" size="sm" onClick={onReset}>
        {t("filters.reset")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/history/history-filters.tsx
git commit -m "feat(web): add referee history filters component"
```

---

## Task 12: `CoverageKPICards` component

**Files:**
- Create: `apps/web/src/components/referee/history/coverage-kpi-cards.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/referee/history/coverage-kpi-cards.tsx`:
```tsx
"use client";

import { useTranslations } from "next-intl";
import type { HistoryKpis, HistoryMode } from "@dragons/shared";

function KpiCard({ label, value, tone = "default" }: {
  label: string; value: number | string; tone?: "default" | "warn";
}) {
  return (
    <div className={`rounded-lg border p-3 ${
      tone === "warn" ? "border-destructive/50 bg-destructive/5" : "border-border"
    }`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function CoverageKPICards({
  kpis, mode,
}: { kpis: HistoryKpis; mode: HistoryMode }) {
  const t = useTranslations("refereeHistory.kpi");

  const cards: Array<[string, number | string, "default" | "warn"?]> = [
    [t("games"), kpis.games],
    [t("distinctReferees"), kpis.distinctReferees],
    [t("cancelled"), kpis.cancelled],
    [t("forfeited"), kpis.forfeited],
  ];
  if (mode === "obligation") {
    cards.push([t("obligatedSlots"), kpis.obligatedSlots ?? 0]);
    cards.push([t("filledSlots"), kpis.filledSlots ?? 0]);
    cards.push([
      t("unfilledSlots"),
      kpis.unfilledSlots ?? 0,
      (kpis.unfilledSlots ?? 0) > 0 ? "warn" : "default",
    ]);
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(([label, value, tone]) => (
        <KpiCard key={label} label={label} value={value} tone={tone} />
      ))}
      {mode === "obligation" && (kpis.unfilledSlots ?? 0) > 0 && (
        <div className="col-span-full text-sm text-destructive">
          {t("unfilledWarning")}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/history/coverage-kpi-cards.tsx
git commit -m "feat(web): add coverage KPI cards"
```

---

## Task 13: `RefereeLeaderboard` component

**Files:**
- Create: `apps/web/src/components/referee/history/referee-leaderboard.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/referee/history/referee-leaderboard.tsx`:
```tsx
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui";
import type { HistoryLeaderboardEntry } from "@dragons/shared";

export function RefereeLeaderboard({ rows }: { rows: HistoryLeaderboardEntry[] }) {
  const t = useTranslations("refereeHistory.leaderboard");

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">{t("title")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4">{t("name")}</th>
              <th className="py-2 pr-4 text-right">{t("sr1")}</th>
              <th className="py-2 pr-4 text-right">{t("sr2")}</th>
              <th className="py-2 pr-4 text-right">{t("total")}</th>
              <th className="py-2 pr-4">{t("lastRefereed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.refereeApiId ?? "name"}-${r.displayName}`}
                className="border-t"
              >
                <td className="py-1 pr-4">
                  <span className="font-medium">{r.displayName}</span>{" "}
                  <Badge variant={r.isOwnClub ? "default" : "outline"}>
                    {r.isOwnClub ? t("ownClub") : t("guest")}
                  </Badge>
                </td>
                <td className="py-1 pr-4 text-right">{r.sr1Count}</td>
                <td className="py-1 pr-4 text-right">{r.sr2Count}</td>
                <td className="py-1 pr-4 text-right font-semibold">{r.total}</td>
                <td className="py-1 pr-4">{r.lastRefereedDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/history/referee-leaderboard.tsx
git commit -m "feat(web): add referee leaderboard table"
```

---

## Task 14: `HistoryGameList` component

**Files:**
- Create: `apps/web/src/components/referee/history/history-game-list.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/referee/history/history-game-list.tsx`:
```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import type { HistoryGameItem } from "@dragons/shared";

interface Props {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  onPage: (offset: number) => void;
}

export function HistoryGameList({ items, total, limit, offset, onPage }: Props) {
  const t = useTranslations("refereeHistory.games");

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">{t("title")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Match</th>
              <th className="py-2 pr-4">League</th>
              <th className="py-2 pr-4">SR1</th>
              <th className="py-2 pr-4">SR2</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="py-1 pr-4">
                  {g.kickoffDate} {g.kickoffTime.slice(0, 5)}
                </td>
                <td className="py-1 pr-4">
                  {g.homeTeamName} vs {g.guestTeamName}
                </td>
                <td className="py-1 pr-4">{g.leagueShort ?? g.leagueName ?? ""}</td>
                <td className="py-1 pr-4">{g.sr1Name ?? "—"}</td>
                <td className="py-1 pr-4">{g.sr2Name ?? "—"}</td>
                <td className="py-1 pr-4">
                  {g.isCancelled ? "cancelled" : g.isForfeited ? "forfeited" : "played"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center mt-3 text-sm">
        <span>
          {offset + 1}–{offset + items.length} / {total}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => onPage(Math.max(0, offset - limit))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + items.length >= total}
            onClick={() => onPage(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/history/history-game-list.tsx
git commit -m "feat(web): add history game list component"
```

---

## Task 15: `HistoryPage` client root + server page

**Files:**
- Create: `apps/web/src/components/referee/history/history-page.tsx`
- Create: `apps/web/src/app/[locale]/admin/referee/history/page.tsx`

- [ ] **Step 1: Write the client root**

Create `apps/web/src/components/referee/history/history-page.tsx`:
```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useRefereeHistorySummary,
  useRefereeHistoryGames,
  type HistoryFilterState,
} from "@/hooks/use-referee-history";
import { HistoryFilters } from "./history-filters";
import { CoverageKPICards } from "./coverage-kpi-cards";
import { RefereeLeaderboard } from "./referee-leaderboard";
import { HistoryGameList } from "./history-game-list";
import type { HistoryMode, HistoryStatus } from "@dragons/shared";

const DEFAULT_LIMIT = 50;

function parseState(params: URLSearchParams): HistoryFilterState & { search?: string } {
  return {
    mode: ((params.get("mode") as HistoryMode) ?? "obligation"),
    status: ((params.get("status") as HistoryStatus) ?? "active"),
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    league: params.get("league") ?? undefined,
    search: params.get("search") ?? undefined,
  };
}

export function HistoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("refereeHistory");

  const [offset, setOffset] = useState(0);
  const filterState = parseState(new URLSearchParams(params.toString()));

  const setParams = useCallback(
    (patch: Partial<HistoryFilterState & { search?: string }>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      router.replace(`?${next.toString()}`);
      setOffset(0);
    },
    [params, router],
  );

  const reset = () => {
    router.replace("?");
    setOffset(0);
  };

  const summary = useRefereeHistorySummary(filterState);
  const games = useRefereeHistoryGames({
    ...filterState, limit: DEFAULT_LIMIT, offset,
  });

  return (
    <div className="space-y-6">
      <HistoryFilters state={filterState} onChange={setParams} onReset={reset} />

      {summary.data && (
        <>
          <p className="text-xs text-muted-foreground">
            {t(`range.source.${summary.data.range.source}`)}: {summary.data.range.from} → {summary.data.range.to}
          </p>
          <CoverageKPICards kpis={summary.data.kpis} mode={filterState.mode} />
          <RefereeLeaderboard rows={summary.data.leaderboard} />
        </>
      )}

      {games.data && (
        <HistoryGameList
          items={games.data.items}
          total={games.data.total}
          limit={games.data.limit}
          offset={games.data.offset}
          onPage={setOffset}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the server page**

Create `apps/web/src/app/[locale]/admin/referee/history/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { HistoryPage } from "@/components/referee/history/history-page";

export default async function RefereeHistoryPage() {
  const session = await getServerSession();
  const user = session?.user ?? null;
  if (!can(user, "assignment", "view")) notFound();

  const t = await getTranslations("refereeHistory");
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <HistoryPage />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/referee/history/history-page.tsx apps/web/src/app/[locale]/admin/referee/history/page.tsx
git commit -m "feat(web): add referee history page"
```

---

## Task 16: Sidebar nav entry

**Files:**
- Modify: `apps/web/src/components/admin/app-sidebar.tsx`

- [ ] **Step 1: Add a nav item in the referee group**

Find (around line 48–55):
```ts
items: [
  {
    href: "/admin/referee/matches",
    labelKey: "nav.openAssignments" as const,
    perm: { resource: "assignment", action: "view" } as const,
  },
],
```

Replace the inner `items` array with:
```ts
items: [
  {
    href: "/admin/referee/matches",
    labelKey: "nav.openAssignments" as const,
    perm: { resource: "assignment", action: "view" } as const,
  },
  {
    href: "/admin/referee/history",
    labelKey: "nav.refereeHistory" as const,
    perm: { resource: "assignment", action: "view" } as const,
  },
],
```

- [ ] **Step 2: Add the nav translation key**

Add to both `apps/web/src/messages/en.json` and `de.json`, inside the existing `nav` namespace:

en.json:
```json
"refereeHistory": "Referee History",
```

de.json:
```json
"refereeHistory": "Schiedsrichter-Historie",
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/app-sidebar.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): link referee history from admin sidebar"
```

---

## Task 17: Build + manual verification

**Files:** (none — verification only)

- [ ] **Step 1: Run repo-wide lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Run tests + coverage**

Run: `pnpm test && pnpm --filter @dragons/api coverage`
Expected: PASS, coverage thresholds (90/95) met.

- [ ] **Step 3: Run AI slop check**

Run: `pnpm check:ai-slop`
Expected: PASS.

- [ ] **Step 4: Boot dev + manual smoke**

Run: `pnpm dev`
Then in a browser:
1. Log in as admin or refereeAdmin, visit `http://localhost:3000/admin/referee/history`.
2. Confirm default range resolves (settings or Aug→Jul fallback) and shows as a subtitle under the filters.
3. KPI cards render; switching `mode` toggles obligation KPIs.
4. Leaderboard renders own-club + guest rows with the correct badge.
5. Game list paginates; changing filters resets to offset 0.
6. Log in as teamManager (no `assignment:view`) → hitting the URL returns 404.

- [ ] **Step 5: Commit any tidy-up**

If lint/typecheck fixes were needed, commit them:
```bash
git add -A
git commit -m "chore(web): post-history-page cleanup"
```

---

## Out-of-Scope Prerequisites

- Settings UI for `currentSeasonStart` / `currentSeasonEnd` in `app_settings`. History page works via the Aug→Jul fallback until that lands.
