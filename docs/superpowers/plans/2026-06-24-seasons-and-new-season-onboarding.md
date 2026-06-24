# Seasons + New-Season Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "season" a first-class entity so the club can stand up the next federation season (its `vorabliga` leagues + game plan) in the background and flip it live when the current season ends.

**Architecture:** A new `seasons` table; every `leagues` row gets a `seasonId` FK and a persisted `vorabliga` flag. Exactly one season is `active` (drives the public site); an `upcoming` season is staged in the background; activation archives the prior season. Season scoping flows entirely through `leagues.seasonId` — matches/standings reach their season via the existing `leagueId → leagues` join, so no `seasonId` columns are added to them. The federation mints fresh `ligaId`/`matchId` per season (verified by live probe), so the migration is additive with no unique-constraint changes.

**Tech Stack:** Hono + hono-openapi (API), Drizzle ORM 0.45 + drizzle-kit 0.31 + PostgreSQL (DB), Zod 4 (`@dragons/contracts`), typed `@dragons/api-client`, Next.js 16 + SWR (web), Vitest 4 + PGlite (tests).

## Global Constraints

- Package manager: **pnpm** workspaces + Turborepo. Run package tests with `pnpm --filter @dragons/<pkg> test`.
- No `any`; `verbatimModuleSyntax` is on, so use `import type` for type-only imports. `consistent-type-imports`, `no-floating-promises`, `no-misused-promises` are CI errors.
- Tests co-located: `foo.ts` → `foo.test.ts`. `apps/api` coverage gate: **branches 90, functions/lines/statements 95** — never lower a threshold; ratchet others up.
- Each API request contract lives in `@dragons/contracts` (zod-only, domain-noun-prefixed, re-exported from `index.ts`); routes validate with `validator(target, schema, validationHook)` + `c.req.valid(...)`; api-client infers request types from the same schemas; every client request needs a `*.contract.test.ts`.
- DB schema: snake_case columns, `serial` PK, `.$type<Union>()` for status columns (union type lives in `@dragons/shared`). After schema changes run `pnpm --filter @dragons/db db:generate`, then hand-edit the generated SQL for data steps, then `db:migrate`.
- Commits: never add `Co-Authored-By` or any AI-credit trailer. Work happens on branch `feat/seasons-and-new-season-onboarding` (already created).
- No AI-slop phrases in any `.md`/prose (CI runs `pnpm check:ai-slop`).
- Verband scope for discovery stays the existing default `getAllLigen()` → `verbandIds=[7]`.

## File Structure

**Phase 1 — schema/migration**
- Create `packages/shared/src/seasons.ts` — `SeasonStatus`, `Season`, `SeasonWithCounts`, `BrowsableLeague`, `SetSeasonLeaguesResult` DTOs.
- Modify `packages/shared/src/index.ts` — re-export the above.
- Create `packages/db/src/schema/seasons.ts` — `seasons` table + partial-unique-active index.
- Modify `packages/db/src/schema/leagues.ts` — add `seasonId` FK + `vorabliga`.
- Modify `packages/db/src/schema/index.ts` — export `./seasons`.
- Create `packages/db/drizzle/00NN_*.sql` (generated, then hand-edited for backfill).
- Create `apps/api/src/services/admin/season.service.migration.test.ts` — migration/constraint test.

**Phase 2 — season service + API surface**
- Create `apps/api/src/services/admin/season.service.ts` (+ `.test.ts`).
- Create `packages/contracts/src/season.ts`; modify `packages/contracts/src/index.ts`.
- Create `packages/api-client/src/endpoints/seasons.ts` (+ `.contract.test.ts`); modify `packages/api-client/src/endpoints/index.ts`, `packages/api-client/src/create-api.ts`.
- Create `apps/api/src/routes/admin/season.routes.ts` (+ `.test.ts`); modify `apps/api/src/routes/index.ts`.

**Phase 3 — sync gating**
- Modify `apps/api/src/services/sync/data-fetcher.ts`, `apps/api/src/services/sync/leagues.sync.ts` (+ their tests).

**Phase 4 — read gating**
- Create `apps/api/src/services/season-scope.ts` (+ `.test.ts`) — active-season filter helper.
- Modify `apps/api/src/services/admin/standings-admin.service.ts`, `apps/api/src/services/admin/match-query.service.ts`, `apps/api/src/services/public/team-stats.service.ts`, `apps/api/src/services/public/calendar.service.ts`, `apps/api/src/services/public/home-dashboard.service.ts` and the public/admin match routes (+ tests).

**Phase 5 — discovery rewrite**
- Modify `apps/api/src/services/admin/league-discovery.service.ts` (+ `.test.ts`).
- Modify `apps/api/src/routes/admin/season.routes.ts`, `apps/api/src/routes/admin/league.routes.ts` (+ tests).
- Modify `packages/api-client/src/endpoints/seasons.ts`, `settings.ts` (+ contract tests).

**Phase 6 — admin UI**
- Create `apps/web/src/app/[locale]/admin/seasons/page.tsx`, `apps/web/src/components/admin/seasons/*`.
- Modify `apps/web/src/lib/swr-keys.ts`, `apps/web/src/lib/swr-queries.ts`, `apps/web/src/messages/en.json`, `de.json`.

**Phase 7 — verification**
- Create `apps/api/src/services/admin/season-isolation.integration.test.ts`.

---

## Phase 1 — Schema, migration, backfill

### Task 1: Season shared types

**Files:**
- Create: `packages/shared/src/seasons.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/seasons.test.ts`

**Interfaces:**
- Produces: `type SeasonStatus = "upcoming" | "active" | "archived"`; `SEASON_STATUSES: readonly SeasonStatus[]`; `interface Season { id; name; sdkSeasonId; status; startDate; endDate; createdAt; updatedAt }`; `interface SeasonWithCounts extends Season { leagueCount }`; `interface BrowsableLeague { ligaId; ligaNr; name; skName; akName; geschlecht; vorabliga; alreadyTracked }`; `interface SetSeasonLeaguesResult { tracked; untracked }`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/seasons.test.ts
import { describe, it, expect } from "vitest";
import { SEASON_STATUSES } from "./seasons";

describe("season statuses", () => {
  it("lists the three lifecycle states in order", () => {
    expect(SEASON_STATUSES).toEqual(["upcoming", "active", "archived"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/shared test -- src/seasons.test.ts`
Expected: FAIL — `Cannot find module './seasons'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/seasons.ts
export type SeasonStatus = "upcoming" | "active" | "archived";

export const SEASON_STATUSES: readonly SeasonStatus[] = [
  "upcoming",
  "active",
  "archived",
] as const;

export interface Season {
  id: number;
  name: string;
  sdkSeasonId: number | null;
  status: SeasonStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonWithCounts extends Season {
  leagueCount: number;
}

export interface BrowsableLeague {
  ligaId: number;
  ligaNr: number | null;
  name: string;
  skName: string;
  akName: string;
  geschlecht: string;
  vorabliga: boolean;
  alreadyTracked: boolean;
}

export interface SetSeasonLeaguesResult {
  tracked: number;
  untracked: number;
}
```

```typescript
// packages/shared/src/index.ts — add near the other re-exports
export * from "./seasons";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/shared test -- src/seasons.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/seasons.ts packages/shared/src/seasons.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): season status + DTO types"
```

---

### Task 2: seasons table + leagues columns (schema)

**Files:**
- Create: `packages/db/src/schema/seasons.ts`
- Modify: `packages/db/src/schema/leagues.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Consumes: `SeasonStatus` from `@dragons/shared` (Task 1).
- Produces: `seasons` table (`id, name, sdkSeasonId, status, startDate, endDate, createdAt, updatedAt`) with partial-unique index `seasons_one_active_uniq`; `leagues.seasonId` (FK → `seasons.id`) and `leagues.vorabliga`. `type Season = typeof seasons.$inferSelect`.

- [ ] **Step 1: Write the seasons schema file**

```typescript
// packages/db/src/schema/seasons.ts
import {
  pgTable,
  serial,
  integer,
  varchar,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SeasonStatus } from "@dragons/shared";

export const seasons = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    sdkSeasonId: integer("sdk_season_id"),
    status: varchar("status", { length: 20 }).notNull().$type<SeasonStatus>(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // At most one active season. Partial unique index over a constant filter.
    oneActive: uniqueIndex("seasons_one_active_uniq")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
  }),
);

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
```

- [ ] **Step 2: Add columns to the leagues schema**

In `packages/db/src/schema/leagues.ts`, add the `seasons` import and two columns. The legacy `season_id` column (the SDK's integer season id, e.g. 2025) **stays as-is**; the new FK column is named **`season_ref_id`** to avoid the clash. Declare `seasonRefId` as `.notNull()` (the desired end state — the migration in Task 3 backfills before enforcing NOT NULL):

```typescript
// packages/db/src/schema/leagues.ts — add import at top
import { seasons } from "./seasons";

// inside pgTable("leagues", { ... }) — add after verbandName (leave the existing
// `seasonId: integer("season_id")` column untouched):
  seasonRefId: integer("season_ref_id")
    .notNull()
    .references(() => seasons.id),
  vorabliga: boolean("vorabliga").notNull().default(false),
```

- [ ] **Step 3: Export the new schema**

```typescript
// packages/db/src/schema/index.ts — add (order: before leagues is fine; FK resolves at migration time)
export * from "./seasons";
```

- [ ] **Step 4: Typecheck the db package**

Run: `pnpm --filter @dragons/db typecheck`
Expected: PASS (no emit; types resolve).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/seasons.ts packages/db/src/schema/leagues.ts packages/db/src/schema/index.ts
git commit -m "feat(db): seasons table + leagues.seasonId/vorabliga schema"
```

---

### Task 3: Migration with backfill + constraint test

**Files:**
- Create: `packages/db/drizzle/00NN_seasons.sql` (generated, then hand-edited)
- Test: `apps/api/src/services/admin/season.service.migration.test.ts`

**Interfaces:**
- Consumes: schema from Task 2.
- Produces: applied migration that (a) creates `seasons`, (b) adds `leagues.season_id` (nullable) + `leagues.vorabliga`, (c) backfills one season per distinct `season_name` (highest `season_id` → `active`, rest `archived`), (d) sets `leagues.season_id NOT NULL` + FK, (e) creates the partial-unique-active index. The PGlite test DB (`setup-test-db.ts`) runs this migration, so it must apply cleanly on an empty DB.

- [ ] **Step 1: Generate the migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: a new file `packages/db/drizzle/00NN_<name>.sql` plus an updated `meta/_journal.json`. It will contain `CREATE TABLE "seasons" ...`, `ALTER TABLE "leagues" ADD COLUMN "season_id" integer NOT NULL ...`, `ALTER TABLE "leagues" ADD COLUMN "vorabliga" boolean DEFAULT false NOT NULL`, the FK, and a `CREATE UNIQUE INDEX "seasons_one_active_uniq" ...`.

- [ ] **Step 2: Hand-edit the generated SQL**

Open the generated file. Replace the naive `ALTER TABLE "leagues" ADD COLUMN "season_id" integer NOT NULL;` (which would fail on existing rows) and reorder so the FK + NOT NULL come **after** backfill. The file should read (keep the generated `CREATE TABLE "seasons"` and `vorabliga` lines; adjust only the `season_id` handling and add the backfill block). Confirm the index line includes the `WHERE "status" = 'active'` clause — if drizzle-kit dropped it, add it:

```sql
-- 00NN_seasons.sql (final, hand-edited)
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"sdk_season_id" integer,
	"status" varchar(20) NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "season_ref_id" integer;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "vorabliga" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: one season per distinct season_name; newest (max legacy season_id) is active.
-- Reads the legacy "season_id" (SDK integer), writes the new FK "season_ref_id".
INSERT INTO "seasons" ("name", "sdk_season_id", "status")
SELECT g.season_name, g.sdk_season_id,
       CASE WHEN g.sdk_season_id = (
              SELECT max(season_id) FROM "leagues"
            ) THEN 'active' ELSE 'archived' END
FROM (
  SELECT season_name, max(season_id) AS sdk_season_id
  FROM "leagues" GROUP BY season_name
) g;--> statement-breakpoint
UPDATE "leagues" l SET "season_ref_id" = s.id
FROM "seasons" s WHERE s.name = l.season_name;--> statement-breakpoint
ALTER TABLE "leagues" ALTER COLUMN "season_ref_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_season_ref_id_seasons_id_fk"
  FOREIGN KEY ("season_ref_id") REFERENCES "public"."seasons"("id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_uniq" ON "seasons" ("status")
  WHERE "status" = 'active';
```

(On the empty PGlite test DB the backfill INSERT/UPDATE match zero rows — that is fine and must not error.)

- [ ] **Step 3: Write the failing constraint test**

```typescript
// apps/api/src/services/admin/season.service.migration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await ctx.client.close(); });

describe("seasons migration", () => {
  it("creates the seasons table with the expected columns", async () => {
    const cols = await ctx.client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'seasons'`,
    );
    const names = cols.rows.map((r) => r.column_name).sort();
    expect(names).toEqual(
      ["created_at", "end_date", "id", "name", "sdk_season_id", "start_date", "status", "updated_at"].sort(),
    );
  });

  it("adds season_ref_id and vorabliga to leagues", async () => {
    const cols = await ctx.client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'leagues' AND column_name IN ('season_ref_id','vorabliga')`,
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(["season_ref_id", "vorabliga"]);
  });

  it("allows only one active season", async () => {
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26', 'active')`);
    await expect(
      ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2026/27', 'active')`),
    ).rejects.toThrow();
    // upcoming + archived are unconstrained
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2026/27', 'upcoming')`);
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2024/25', 'archived')`);
    const count = await ctx.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM seasons`);
    expect(count.rows[0]!.n).toBe(3);
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- src/services/admin/season.service.migration.test.ts`
Expected: PASS (PGlite runs the new migration at `setupTestDb()`; the partial unique index rejects the second active insert). If it fails at `beforeAll`, the migration SQL is malformed — fix the generated file.

- [ ] **Step 5: Apply the migration locally and commit**

Run (against the dev DB; safe — additive): `pnpm --filter @dragons/db db:migrate`
Expected: migration applies; `psql` shows existing leagues now have a non-null `season_id`.

```bash
git add packages/db/drizzle apps/api/src/services/admin/season.service.migration.test.ts
git commit -m "feat(db): seasons migration with season backfill + one-active constraint"
```

---

## Phase 2 — Season service + API surface

### Task 4: season.service

**Files:**
- Create: `apps/api/src/services/admin/season.service.ts`
- Test: `apps/api/src/services/admin/season.service.test.ts`

**Interfaces:**
- Consumes: `seasons` schema; `Season`/`SeasonWithCounts` DTOs.
- Produces: `createSeason(input)`, `listSeasons()`, `getActiveSeason()`, `getActiveSeasonId()`, `invalidateActiveSeasonCache()`, `activateSeason(id)`, `archiveSeason(id)`.

  Signatures:
  - `createSeason(input: { name: string; sdkSeasonId?: number | null; startDate?: string | null; endDate?: string | null }): Promise<Season>`
  - `listSeasons(): Promise<SeasonWithCounts[]>`
  - `getActiveSeason(): Promise<Season | null>`
  - `getActiveSeasonId(): Promise<number | null>`
  - `invalidateActiveSeasonCache(): void`
  - `activateSeason(id: number): Promise<Season>`
  - `archiveSeason(id: number): Promise<Season>`

- [ ] **Step 1: Write the failing tests (PGlite)**

```typescript
// apps/api/src/services/admin/season.service.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

import {
  createSeason, listSeasons, getActiveSeason, getActiveSeasonId,
  invalidateActiveSeasonCache, activateSeason, archiveSeason,
} from "./season.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await ctx.client.close(); });
beforeEach(async () => { await resetTestDb(ctx); invalidateActiveSeasonCache(); vi.clearAllMocks(); });

describe("season.service", () => {
  it("creates an upcoming season", async () => {
    const s = await createSeason({ name: "2026/27", sdkSeasonId: 2026 });
    expect(s.status).toBe("upcoming");
    expect(s.name).toBe("2026/27");
    expect(s.sdkSeasonId).toBe(2026);
  });

  it("getActiveSeason returns the active row, null when none", async () => {
    expect(await getActiveSeason()).toBeNull();
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26','active')`);
    invalidateActiveSeasonCache();
    expect((await getActiveSeason())?.name).toBe("2025/26");
  });

  it("activateSeason archives the current active and activates the target", async () => {
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26','active')`);
    const next = await createSeason({ name: "2026/27" });
    const activated = await activateSeason(next.id);
    expect(activated.status).toBe("active");
    const rows = await ctx.client.query<{ name: string; status: string }>(
      `SELECT name, status FROM seasons ORDER BY name`,
    );
    expect(rows.rows).toEqual([
      { name: "2025/26", status: "archived" },
      { name: "2026/27", status: "active" },
    ]);
  });

  it("listSeasons includes league counts", async () => {
    const a = await ctx.client.query<{ id: number }>(
      `INSERT INTO seasons (name, status) VALUES ('2025/26','active') RETURNING id`,
    );
    const sid = a.rows[0]!.id;
    // legacy season_id (SDK int) = 2025; new FK season_ref_id = the seasons.id
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id)
       VALUES (1, 10, 'L1', 2025, '2025/26', $1)`,
      [sid],
    );
    const list = await listSeasons();
    expect(list.find((s) => s.id === sid)?.leagueCount).toBe(1);
  });

  it("getActiveSeasonId caches and invalidates", async () => {
    await ctx.client.query(`INSERT INTO seasons (name, status) VALUES ('2025/26','active')`);
    invalidateActiveSeasonCache();
    const first = await getActiveSeasonId();
    expect(first).not.toBeNull();
    await ctx.client.query(`UPDATE seasons SET status='archived'`);
    expect(await getActiveSeasonId()).toBe(first); // cached
    invalidateActiveSeasonCache();
    expect(await getActiveSeasonId()).toBeNull(); // fresh read
  });
});
```

> Reminder: `leagues.season_id` is the legacy SDK integer; the season FK added in Task 2 is `season_ref_id` (`leagues.seasonRefId`). Seeds insert both: legacy `season_id` (e.g. 2025) and the FK `season_ref_id` (the `seasons.id`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- src/services/admin/season.service.test.ts`
Expected: FAIL — `Cannot find module './season.service'`.

- [ ] **Step 3: Implement the service**

```typescript
// apps/api/src/services/admin/season.service.ts
import { getDb } from "../../config/database";
import { seasons, leagues } from "@dragons/db/schema";
import { eq, sql } from "drizzle-orm";
import type { Season, SeasonWithCounts } from "@dragons/shared";

function toDto(row: typeof seasons.$inferSelect): Season {
  return {
    id: row.id,
    name: row.name,
    sdkSeasonId: row.sdkSeasonId,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

let activeIdCache: { value: number | null; at: number } | null = null;
const ACTIVE_TTL_MS = 60_000;

export function invalidateActiveSeasonCache(): void {
  activeIdCache = null;
}

export async function getActiveSeason(): Promise<Season | null> {
  const [row] = await getDb().select().from(seasons).where(eq(seasons.status, "active")).limit(1);
  return row ? toDto(row) : null;
}

export async function getActiveSeasonId(): Promise<number | null> {
  const now = Date.now();
  if (activeIdCache && now - activeIdCache.at < ACTIVE_TTL_MS) return activeIdCache.value;
  const season = await getActiveSeason();
  activeIdCache = { value: season?.id ?? null, at: now };
  return activeIdCache.value;
}

export async function createSeason(input: {
  name: string;
  sdkSeasonId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<Season> {
  const [row] = await getDb()
    .insert(seasons)
    .values({
      name: input.name,
      sdkSeasonId: input.sdkSeasonId ?? null,
      status: "upcoming",
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create season");
  return toDto(row);
}

export async function listSeasons(): Promise<SeasonWithCounts[]> {
  const rows = await getDb()
    .select({
      id: seasons.id, name: seasons.name, sdkSeasonId: seasons.sdkSeasonId,
      status: seasons.status, startDate: seasons.startDate, endDate: seasons.endDate,
      createdAt: seasons.createdAt, updatedAt: seasons.updatedAt,
      leagueCount: sql<number>`count(${leagues.id})::int`,
    })
    .from(seasons)
    .leftJoin(leagues, eq(leagues.seasonRefId, seasons.id))
    .groupBy(seasons.id)
    .orderBy(seasons.createdAt);
  return rows.map((r) => ({ ...toDto(r), leagueCount: r.leagueCount }));
}

export async function activateSeason(id: number): Promise<Season> {
  const result = await getDb().transaction(async (tx) => {
    await tx.update(seasons).set({ status: "archived", updatedAt: new Date() }).where(eq(seasons.status, "active"));
    const [row] = await tx
      .update(seasons)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(seasons.id, id))
      .returning();
    if (!row) throw new Error(`Season ${id} not found`);
    return row;
  });
  invalidateActiveSeasonCache();
  return toDto(result);
}

export async function archiveSeason(id: number): Promise<Season> {
  const [row] = await getDb()
    .update(seasons)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(seasons.id, id))
    .returning();
  if (!row) throw new Error(`Season ${id} not found`);
  invalidateActiveSeasonCache();
  return toDto(row);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- src/services/admin/season.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/season.service.ts apps/api/src/services/admin/season.service.test.ts packages/db/src/schema/leagues.ts
git commit -m "feat(api): season lifecycle service (create/list/activate/archive + active cache)"
```

---

### Task 5: season request contracts

**Files:**
- Create: `packages/contracts/src/season.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/season.test.ts`

**Interfaces:**
- Produces: `createSeasonSchema`, `seasonIdParamSchema`, `browseLeaguesQuerySchema`, `seasonLeaguesSchema` + inferred types `CreateSeasonBody`, `SeasonIdParam`, `BrowseLeaguesQuery`, `SeasonLeaguesBody`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/contracts/src/season.test.ts
import { describe, it, expect } from "vitest";
import { createSeasonSchema, seasonLeaguesSchema, browseLeaguesQuerySchema } from "./season";

describe("season contracts", () => {
  it("accepts a valid create body", () => {
    expect(createSeasonSchema.safeParse({ name: "2026/27" }).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(createSeasonSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("parses ligaIds array", () => {
    expect(seasonLeaguesSchema.safeParse({ ligaIds: [54136, 54137] }).success).toBe(true);
  });
  it("coerces vorabligaOnly query string to boolean", () => {
    const p = browseLeaguesQuerySchema.parse({ vorabligaOnly: "true" });
    expect(p.vorabligaOnly).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/contracts test -- src/season.test.ts`
Expected: FAIL — `Cannot find module './season'`.

- [ ] **Step 3: Implement the contracts**

```typescript
// packages/contracts/src/season.ts
import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createSeasonSchema = z.object({
  name: z.string().min(1).max(100),
  sdkSeasonId: z.number().int().positive().nullish(),
  startDate: dateString.nullish(),
  endDate: dateString.nullish(),
});

export const seasonIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const browseLeaguesQuerySchema = z.object({
  vorabligaOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const seasonLeaguesSchema = z.object({
  ligaIds: z.array(z.number().int().positive()),
});

export type CreateSeasonBody = z.infer<typeof createSeasonSchema>;
export type SeasonIdParam = z.infer<typeof seasonIdParamSchema>;
export type BrowseLeaguesQuery = z.infer<typeof browseLeaguesQuerySchema>;
export type SeasonLeaguesBody = z.infer<typeof seasonLeaguesSchema>;
```

```typescript
// packages/contracts/src/index.ts — add
export {
  createSeasonSchema,
  seasonIdParamSchema,
  browseLeaguesQuerySchema,
  seasonLeaguesSchema,
  type CreateSeasonBody,
  type SeasonIdParam,
  type BrowseLeaguesQuery,
  type SeasonLeaguesBody,
} from "./season";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/contracts test -- src/season.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/season.ts packages/contracts/src/season.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): season + season-leagues request schemas"
```

---

### Task 6: api-client seasons endpoints

**Files:**
- Create: `packages/api-client/src/endpoints/seasons.ts`
- Modify: `packages/api-client/src/endpoints/index.ts`, `packages/api-client/src/create-api.ts`
- Test: `packages/api-client/src/endpoints/seasons.contract.test.ts`

**Interfaces:**
- Consumes: contracts from Task 5; `Season`, `SeasonWithCounts`, `BrowsableLeague`, `SetSeasonLeaguesResult`, `TrackedLeaguesResponse` from `@dragons/shared`.
- Produces: `seasonsEndpoints(client)` → `{ list, create, activate, archive, discover, getLeagues, setLeagues }`; mounted on `api.seasons`.

- [ ] **Step 1: Write the failing contract test**

```typescript
// packages/api-client/src/endpoints/seasons.contract.test.ts
import { describe, it, expect, vi } from "vitest";
import { createSeasonSchema, seasonLeaguesSchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { seasonsEndpoints } from "./seasons";

function recordingClient() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const client = new ApiClient({ baseUrl: "https://example.test", fetchFn: fetchFn as unknown as typeof fetch });
  return { api: seasonsEndpoints(client), calls };
}

describe("seasons request bodies satisfy @dragons/contracts schemas", () => {
  it("create body parses against createSeasonSchema", async () => {
    const { api, calls } = recordingClient();
    await api.create({ name: "2026/27", sdkSeasonId: 2026 });
    expect(createSeasonSchema.safeParse(calls[0]!.body).error?.issues).toBeUndefined();
    expect(calls[0]!.method).toBe("POST");
  });
  it("setLeagues body parses against seasonLeaguesSchema", async () => {
    const { api, calls } = recordingClient();
    await api.setLeagues(3, { ligaIds: [54136] });
    expect(seasonLeaguesSchema.safeParse(calls[0]!.body).error?.issues).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/seasons/3/leagues");
    expect(calls[0]!.method).toBe("PUT");
  });
  it("activate posts to the activate path", async () => {
    const { api, calls } = recordingClient();
    await api.activate(3);
    expect(calls[0]!.url).toContain("/admin/seasons/3/activate");
    expect(calls[0]!.method).toBe("POST");
  });
  it("discover encodes vorabligaOnly query", async () => {
    const { api, calls } = recordingClient();
    await api.discover(3, { vorabligaOnly: true });
    const q = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    expect(q.vorabligaOnly).toBe("true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api-client test -- src/endpoints/seasons.contract.test.ts`
Expected: FAIL — `Cannot find module './seasons'`.

- [ ] **Step 3: Implement the endpoints and wire them in**

```typescript
// packages/api-client/src/endpoints/seasons.ts
import type {
  Season, SeasonWithCounts, BrowsableLeague, SetSeasonLeaguesResult, TrackedLeaguesResponse,
} from "@dragons/shared";
import type { CreateSeasonBody, SeasonLeaguesBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function seasonsEndpoints(client: ApiClient) {
  return {
    list(): Promise<SeasonWithCounts[]> {
      return client.get("/admin/seasons");
    },
    create(body: CreateSeasonBody): Promise<Season> {
      return client.post("/admin/seasons", body);
    },
    activate(id: number): Promise<Season> {
      return client.post(`/admin/seasons/${id}/activate`);
    },
    archive(id: number): Promise<Season> {
      return client.post(`/admin/seasons/${id}/archive`);
    },
    discover(id: number, query?: { vorabligaOnly?: boolean }): Promise<BrowsableLeague[]> {
      return client.get(
        `/admin/seasons/${id}/discover`,
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    getLeagues(id: number): Promise<TrackedLeaguesResponse> {
      return client.get(`/admin/seasons/${id}/leagues`);
    },
    setLeagues(id: number, body: SeasonLeaguesBody): Promise<SetSeasonLeaguesResult> {
      return client.put(`/admin/seasons/${id}/leagues`, body);
    },
  };
}
```

```typescript
// packages/api-client/src/endpoints/index.ts — add
export { seasonsEndpoints } from "./seasons";
export type { CreateSeasonBody, SeasonLeaguesBody } from "@dragons/contracts";
```

```typescript
// packages/api-client/src/create-api.ts — import seasonsEndpoints, then add to the returned object:
    seasons: seasonsEndpoints(client),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api-client test -- src/endpoints/seasons.contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/endpoints/seasons.ts packages/api-client/src/endpoints/seasons.contract.test.ts packages/api-client/src/endpoints/index.ts packages/api-client/src/create-api.ts
git commit -m "feat(api-client): seasons endpoint group"
```

---

### Task 7: season CRUD/activate routes

**Files:**
- Create: `apps/api/src/routes/admin/season.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Test: `apps/api/src/routes/admin/season.routes.test.ts`

**Interfaces:**
- Consumes: `season.service` (Task 4), `createSeasonSchema`/`seasonIdParamSchema` (Task 5), `requirePermission`, `validationHook`.
- Produces: routes `GET /admin/seasons`, `POST /admin/seasons`, `POST /admin/seasons/:id/activate`, `POST /admin/seasons/:id/archive`. (Discover + leagues routes are appended in Phase 5.)

- [ ] **Step 1: Write the failing route test (mirror `league.routes.test.ts`)**

```typescript
// apps/api/src/routes/admin/season.routes.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  listSeasons: vi.fn(), createSeason: vi.fn(), activateSeason: vi.fn(), archiveSeason: vi.fn(),
}));
vi.mock("../../services/admin/season.service", () => mocks);
vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../config/logger", () => ({ logger: { error: vi.fn() } }));

import { seasonRoutes } from "./season.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", seasonRoutes);
const json = (r: Response) => r.json();
beforeEach(() => vi.clearAllMocks());

describe("GET /seasons", () => {
  it("lists seasons", async () => {
    mocks.listSeasons.mockResolvedValue([{ id: 1, name: "2025/26", status: "active", leagueCount: 3 }]);
    const res = await app.request("/seasons");
    expect(res.status).toBe(200);
    expect(await json(res)).toHaveLength(1);
  });
});

describe("POST /seasons", () => {
  it("creates a season", async () => {
    mocks.createSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "upcoming" });
    const res = await app.request("/seasons", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "2026/27" }),
    });
    expect(res.status).toBe(200);
    expect(mocks.createSeason).toHaveBeenCalledWith(expect.objectContaining({ name: "2026/27" }));
  });
  it("returns 400 for empty name", async () => {
    const res = await app.request("/seasons", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /seasons/:id/activate", () => {
  it("activates a season", async () => {
    mocks.activateSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "active" });
    const res = await app.request("/seasons/2/activate", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mocks.activateSeason).toHaveBeenCalledWith(2);
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/activate", { method: "POST" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/season.routes.test.ts`
Expected: FAIL — `Cannot find module './season.routes'`.

- [ ] **Step 3: Implement the routes and mount them**

```typescript
// apps/api/src/routes/admin/season.routes.ts
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  listSeasons, createSeason, activateSeason, archiveSeason,
} from "../../services/admin/season.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import { createSeasonSchema, seasonIdParamSchema } from "@dragons/contracts";

const seasonRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

seasonRoutes.get(
  "/seasons",
  settingsUpdate,
  describeRoute({ description: "List seasons", tags: ["Seasons"], responses: { 200: { description: "Success" } } }),
  async (c) => c.json(await listSeasons()),
);

seasonRoutes.post(
  "/seasons",
  settingsUpdate,
  validator("json", createSeasonSchema, validationHook),
  describeRoute({ description: "Create an upcoming season", tags: ["Seasons"], responses: { 200: { description: "Success" } } }),
  async (c) => c.json(await createSeason(c.req.valid("json"))),
);

seasonRoutes.post(
  "/seasons/:id/activate",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  describeRoute({ description: "Activate a season (archives the prior active one)", tags: ["Seasons"], responses: { 200: { description: "Success" } } }),
  async (c) => c.json(await activateSeason(c.req.valid("param").id)),
);

seasonRoutes.post(
  "/seasons/:id/archive",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  describeRoute({ description: "Archive a season", tags: ["Seasons"], responses: { 200: { description: "Success" } } }),
  async (c) => c.json(await archiveSeason(c.req.valid("param").id)),
);

export { seasonRoutes };
```

```typescript
// apps/api/src/routes/index.ts — add import + mount alongside the others
import { seasonRoutes } from "./admin/season.routes";
// ...
routes.route("/admin", seasonRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/season.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/season.routes.ts apps/api/src/routes/admin/season.routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): season CRUD + activate/archive routes"
```

---

## Phase 3 — Sync gating

### Task 8: gate sync to active + upcoming seasons

**Files:**
- Modify: `apps/api/src/services/sync/data-fetcher.ts:81-96` (the `fetchAllSyncData` league query)
- Modify: `apps/api/src/services/sync/leagues.sync.ts:52-57` (the `syncLeagues` tracked-league query)
- Test: `apps/api/src/services/sync/data-fetcher.season-gate.test.ts`

**Interfaces:**
- Consumes: `seasons` schema.
- Produces: both queries now require `seasons.status IN ('active','upcoming')` via an inner join on `leagues.seasonRefId`.

- [ ] **Step 1: Write the failing test (PGlite)**

```typescript
// apps/api/src/services/sync/data-fetcher.season-gate.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
// Stop the real SDK from being hit — we only care which leagues are selected.
vi.mock("./sdk-client", () => ({
  sdkClient: {
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    getSpielplan: vi.fn().mockResolvedValue([]),
    getTabelle: vi.fn().mockResolvedValue([]),
    getGameDetailsBatch: vi.fn().mockResolvedValue(new Map()),
  },
}));

import { fetchAllSyncData } from "./data-fetcher";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await ctx.client.close(); });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });

async function seasonWithLeague(status: string, apiLigaId: number) {
  const s = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ($1,$2) RETURNING id`, [`S${apiLigaId}`, status],
  );
  await ctx.client.query(
    `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked)
     VALUES ($1, $1, 'L', 2025, 'x', $2, true)`, [apiLigaId, s.rows[0]!.id],
  );
}

describe("fetchAllSyncData season gate", () => {
  it("fetches active + upcoming leagues, skips archived", async () => {
    await seasonWithLeague("active", 100);
    await seasonWithLeague("upcoming", 200);
    await seasonWithLeague("archived", 300);
    const data = await fetchAllSyncData();
    const fetched = data.leagueData.map((l) => l.leagueApiId).sort();
    expect(fetched).toEqual([100, 200]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/services/sync/data-fetcher.season-gate.test.ts`
Expected: FAIL — archived league 300 is still fetched (no gate yet).

- [ ] **Step 3: Add the season gate to both queries**

```typescript
// apps/api/src/services/sync/data-fetcher.ts
// add to imports:
import { leagues, seasons } from "@dragons/db/schema";
import { eq, and, inArray } from "drizzle-orm";
// replace the trackedLeagues query in fetchAllSyncData:
  const trackedLeagues = await getDb()
    .select({ id: leagues.id, apiLigaId: leagues.apiLigaId, name: leagues.name })
    .from(leagues)
    .innerJoin(seasons, eq(leagues.seasonRefId, seasons.id))
    .where(and(eq(leagues.isTracked, true), inArray(seasons.status, ["active", "upcoming"])));
```

```typescript
// apps/api/src/services/sync/leagues.sync.ts
// add seasons + and/inArray to imports (eq already imported):
import { eq, and, inArray } from "drizzle-orm";
import { leagues, seasons } from "@dragons/db/schema";
// replace the trackedLeagues query in syncLeagues:
    const trackedLeagues = await getDb()
      .select()
      .from(leagues)
      .innerJoin(seasons, eq(leagues.seasonRefId, seasons.id))
      .where(and(eq(leagues.isTracked, true), inArray(seasons.status, ["active", "upcoming"])));
```

> `leagues.sync.ts` currently `select()`s `leagues` directly; after adding the join the rows shape becomes `{ leagues: ..., seasons: ... }`. Update the downstream `.map((league) => ...)` to `.map((row) => row.leagues)` (or select explicit columns). Run the existing `leagues.sync.test.ts` and fix its mock chain to include `.innerJoin(...).where(...)`.

- [ ] **Step 4: Run the gate test + existing sync tests**

Run: `pnpm --filter @dragons/api test -- src/services/sync/data-fetcher.season-gate.test.ts src/services/sync/leagues.sync.test.ts`
Expected: PASS (fix the mocked query chains in `leagues.sync.test.ts` if they break).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sync/data-fetcher.ts apps/api/src/services/sync/leagues.sync.ts apps/api/src/services/sync/data-fetcher.season-gate.test.ts apps/api/src/services/sync/leagues.sync.test.ts
git commit -m "feat(api): gate sync to active + upcoming seasons"
```

---

## Phase 4 — Read gating

### Task 9: active-season scope helper + public reads

**Files:**
- Create: `apps/api/src/services/season-scope.ts`
- Modify: `apps/api/src/services/admin/standings-admin.service.ts:6-31`
- Test: `apps/api/src/services/admin/standings-admin.service.test.ts` (extend existing)

**Interfaces:**
- Consumes: `getActiveSeasonId` (Task 4).
- Produces: `getStandings()` returns only the active season's leagues; helper `withActiveSeason<T>(run: (seasonId: number) => Promise<T>, empty: T): Promise<T>` returns `empty` when no active season.

- [ ] **Step 1: Write the failing test (extend standings test)**

```typescript
// apps/api/src/services/admin/standings-admin.service.test.ts — add a case
it("only returns standings from the active season", async () => {
  const active = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2025/26','active') RETURNING id`);
  const upcoming = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2026/27','upcoming') RETURNING id`);
  const activeLeague = await insertLeague({ api_liga_id: 1, season_ref_id: active.rows[0]!.id });
  const upcomingLeague = await insertLeague({ api_liga_id: 2, name: "Next", season_ref_id: upcoming.rows[0]!.id });
  await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
  await insertStanding(activeLeague, 1000, { position: 1 });
  await insertStanding(upcomingLeague, 1000, { position: 1 });
  const result = await getStandings();
  expect(result).toHaveLength(1);
  expect(result[0]!.leagueId).toBe(activeLeague);
});
```

(Update the existing `insertLeague` helper to include `season_ref_id` with a default that points at an active season created in `beforeEach`, or pass it per-test as above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/services/admin/standings-admin.service.test.ts`
Expected: FAIL — both leagues returned (no season filter yet).

- [ ] **Step 3: Implement the helper and filter**

```typescript
// apps/api/src/services/season-scope.ts
import { getActiveSeasonId } from "./admin/season.service";

/** Run `fn` with the active season id, or return `empty` when there is no active season. */
export async function withActiveSeason<T>(
  fn: (seasonId: number) => Promise<T>,
  empty: T,
): Promise<T> {
  const seasonId = await getActiveSeasonId();
  if (seasonId === null) return empty;
  return fn(seasonId);
}
```

```typescript
// apps/api/src/services/admin/standings-admin.service.ts
import { standings, leagues, teams } from "@dragons/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { withActiveSeason } from "../season-scope";

export async function getStandings(): Promise<LeagueStandings[]> {
  return withActiveSeason(async (seasonId) => {
    const rows = await getDb()
      .select({ /* ...unchanged column selection... */ })
      .from(standings)
      .innerJoin(leagues, eq(standings.leagueId, leagues.id))
      .innerJoin(teams, eq(standings.teamApiId, teams.apiTeamPermanentId))
      .where(and(eq(leagues.isTracked, true), eq(leagues.seasonRefId, seasonId)))
      .orderBy(asc(leagues.name), asc(standings.position));
    /* ...unchanged grouping/sort logic... */
    return Array.from(grouped.values()).sort(/* unchanged */);
  }, []);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test -- src/services/admin/standings-admin.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/season-scope.ts apps/api/src/services/admin/standings-admin.service.ts apps/api/src/services/admin/standings-admin.service.test.ts
git commit -m "feat(api): scope public standings to the active season"
```

---

### Task 10: season-scope the remaining reads (team-stats, calendar, home-dashboard, games list)

**Files:**
- Modify: `apps/api/src/services/public/team-stats.service.ts`, `apps/api/src/services/public/calendar.service.ts`, `apps/api/src/services/public/home-dashboard.service.ts`
- Modify: `apps/api/src/services/admin/match-query.service.ts:34-45,431-481` (`MatchListParams` + `getOwnClubMatches`)
- Modify: `apps/api/src/routes/public/match.routes.ts` (pass active season), `apps/api/src/routes/admin/match.routes.ts` (pass query `seasonId`, default active)
- Modify: `packages/contracts/src/match.ts` (add optional `seasonId` to the admin match-list query schema)
- Test: extend each service's existing `.test.ts`

**Interfaces:**
- Consumes: `withActiveSeason`, `getActiveSeasonId`.
- Produces: `MatchListParams` gains `seasonId?: number`; `getOwnClubMatches` filters `leagues.seasonRefId = seasonId` when set. Public routes pass `seasonId: await getActiveSeasonId()`. Admin route reads `seasonId` from the validated query, defaulting to `await getActiveSeasonId()`.

- [ ] **Step 1: Write a failing test for `getOwnClubMatches` season filter**

```typescript
// apps/api/src/services/admin/match-query.service.season.test.ts (new; PGlite)
// Seed an own-club team, an active-season league + match, and an upcoming-season league + match.
// Assert getOwnClubMatches({ ..., seasonId: activeId }) returns only the active-season match.
// (Mirror the seeding helpers from standings-admin.service.test.ts: insertLeague/insertTeam,
//  plus an insertMatch helper writing into the matches table with league_id + home/guest team api ids.)
it("filters own-club matches to the given season", async () => {
  // ...seed as described...
  const result = await getOwnClubMatches({ limit: 50, offset: 0, seasonId: activeSeasonId });
  expect(result.items.every((m) => m.leagueId === activeLeagueId)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/services/admin/match-query.service.season.test.ts`
Expected: FAIL — upcoming-season match also returned.

- [ ] **Step 3: Implement the season param + filter**

```typescript
// apps/api/src/services/admin/match-query.service.ts
// 1) add to MatchListParams:
  seasonId?: number;
// 2) in getOwnClubMatches, destructure seasonId and add a condition.
//    queryMatchWithJoins already leftJoins leagues, so filter on leagues.seasonRefId:
import { leagues } from "@dragons/db/schema"; // already imported
// after the other conditions:
  if (seasonId !== undefined) {
    conditions.push(eq(leagues.seasonRefId, seasonId));
  }
```

```typescript
// apps/api/src/routes/public/match.routes.ts — where it calls getOwnClubMatches for public games:
import { getActiveSeasonId } from "../../services/admin/season.service";
// ...
  const seasonId = await getActiveSeasonId();
  const result = await getOwnClubMatches({ ...params, seasonId: seasonId ?? -1 });
  // seasonId ?? -1 guarantees an empty result when there is no active season.
```

```typescript
// apps/api/src/routes/admin/match.routes.ts — admin games list:
  const query = c.req.valid("query"); // matchListQuerySchema now includes optional seasonId
  const seasonId = query.seasonId ?? (await getActiveSeasonId()) ?? -1;
  const result = await getOwnClubMatches({ ...query, seasonId });
```

```typescript
// packages/contracts/src/match.ts — add to matchListQuerySchema:
  seasonId: z.coerce.number().int().positive().optional(),
```

For `team-stats.service.ts`, `calendar.service.ts`, `home-dashboard.service.ts`: each already joins or filters `leagues`/`matches`. Wrap each public read body in `withActiveSeason((seasonId) => ..., emptyValue)` and add `eq(leagues.seasonRefId, seasonId)` to the `where`. Add one season-isolation case to each service's existing test mirroring Task 9 Step 1.

- [ ] **Step 4: Run the full api test suite**

Run: `pnpm --filter @dragons/api test`
Expected: PASS. Then `pnpm --filter @dragons/api coverage` — confirm thresholds still hold (90/95/95/95). Add cases for any uncovered new branch.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services apps/api/src/routes/public/match.routes.ts apps/api/src/routes/admin/match.routes.ts packages/contracts/src/match.ts
git commit -m "feat(api): season-scope public reads; admin reads take optional seasonId"
```

---

## Phase 5 — Discovery rewrite

### Task 11: browse + per-season tracking service

**Files:**
- Modify: `apps/api/src/services/admin/league-discovery.service.ts` (remove `resolveAndSaveLeagues`; add `browseLeagues`, `setSeasonLeagues`; make `getTrackedLeagues(seasonId?)`)
- Test: `apps/api/src/services/admin/league-discovery.service.test.ts`

**Interfaces:**
- Consumes: `sdkClient.getAllLigen()`, `seasons`/`leagues` schema, `getActiveSeasonId`.
- Produces:
  - `browseLeagues(opts: { vorabligaOnly?: boolean; seasonId?: number }): Promise<BrowsableLeague[]>`
  - `setSeasonLeagues(seasonId: number, ligaIds: number[]): Promise<SetSeasonLeaguesResult>`
  - `getTrackedLeagues(seasonId?: number): Promise<TrackedLeaguesResponse>`
  - `setLeagueOwnClubRefs` unchanged. `resolveAndSaveLeagues` removed.

- [ ] **Step 1: Write the failing tests (PGlite + mocked SDK)**

```typescript
// apps/api/src/services/admin/league-discovery.service.test.ts (rewrite)
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
const getAllLigen = vi.fn();
vi.mock("../sync/sdk-client", () => ({ sdkClient: { getAllLigen } }));

import { browseLeagues, setSeasonLeagues, getTrackedLeagues } from "./league-discovery.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await ctx.client.close(); });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });

const liga = (ligaId: number, vorabliga: boolean, liganr: number | null = null) => ({
  ligaId, liganr, liganame: `Liga ${ligaId}`, seasonId: 2026, seasonName: "2026/27",
  skName: "Oberliga", akName: "Senioren", geschlecht: "männlich", verbandId: 7, verbandName: "NDS",
  vorabliga, tableExists: false, crossTableExists: false,
});

async function makeSeason(status: string) {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2026/27',$1) RETURNING id`, [status]);
  return r.rows[0]!.id;
}

describe("browseLeagues", () => {
  it("returns only vorabligas when vorabligaOnly is set", async () => {
    getAllLigen.mockResolvedValue([liga(54136, true), liga(48666, false, 4001)]);
    const rows = await browseLeagues({ vorabligaOnly: true });
    expect(rows.map((r) => r.ligaId)).toEqual([54136]);
  });
  it("marks alreadyTracked leagues for the season", async () => {
    const seasonId = await makeSeason("upcoming");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (54136, 0, 'Liga 54136', 2026, '2026/27', $1, true, true)`, [seasonId]);
    getAllLigen.mockResolvedValue([liga(54136, true), liga(54137, true)]);
    const rows = await browseLeagues({ seasonId });
    expect(rows.find((r) => r.ligaId === 54136)?.alreadyTracked).toBe(true);
    expect(rows.find((r) => r.ligaId === 54137)?.alreadyTracked).toBe(false);
  });
});

describe("setSeasonLeagues", () => {
  it("tracks selected ligas under the season and scoped-untracks the rest", async () => {
    const seasonId = await makeSeason("upcoming");
    getAllLigen.mockResolvedValue([liga(54136, true), liga(54137, true)]);
    const first = await setSeasonLeagues(seasonId, [54136, 54137]);
    expect(first.tracked).toBe(2);
    const second = await setSeasonLeagues(seasonId, [54136]); // drop 54137
    expect(second.untracked).toBe(1);
    const tracked = await getTrackedLeagues(seasonId);
    expect(tracked.leagues.map((l) => l.apiLigaId)).toEqual([54136]);
  });

  it("does not touch leagues from other seasons", async () => {
    const otherSeason = await makeSeason("active");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (99999, 0, 'Other', 2025, '2025/26', $1, true, false)`, [otherSeason]);
    const upcoming = await makeSeason("upcoming");
    getAllLigen.mockResolvedValue([liga(54136, true)]);
    await setSeasonLeagues(upcoming, [54136]);
    const other = await getTrackedLeagues(otherSeason);
    expect(other.leagues.map((l) => l.apiLigaId)).toContain(99999);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/services/admin/league-discovery.service.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the rewrite**

```typescript
// apps/api/src/services/admin/league-discovery.service.ts
import { getDb } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import { getActiveSeasonId } from "./season.service";
import type { SdkLiga } from "@dragons/sdk";
import type {
  BrowsableLeague, SetSeasonLeaguesResult, TrackedLeaguesResponse,
} from "@dragons/shared";

export async function browseLeagues(opts: {
  vorabligaOnly?: boolean;
  seasonId?: number;
} = {}): Promise<BrowsableLeague[]> {
  const all = await sdkClient.getAllLigen();
  const filtered = opts.vorabligaOnly ? all.filter((l) => l.vorabliga === true) : all;

  const trackedIds = new Set<number>();
  if (opts.seasonId !== undefined) {
    const tracked = await getDb()
      .select({ apiLigaId: leagues.apiLigaId })
      .from(leagues)
      .where(and(eq(leagues.seasonRefId, opts.seasonId), eq(leagues.isTracked, true)));
    for (const t of tracked) trackedIds.add(t.apiLigaId);
  }

  return filtered.map((l) => ({
    ligaId: l.ligaId,
    ligaNr: l.liganr,
    name: l.liganame,
    skName: l.skName,
    akName: l.akName,
    geschlecht: l.geschlecht,
    vorabliga: l.vorabliga,
    alreadyTracked: trackedIds.has(l.ligaId),
  }));
}

export async function setSeasonLeagues(
  seasonId: number,
  ligaIds: number[],
): Promise<SetSeasonLeaguesResult> {
  const all = await sdkClient.getAllLigen();
  const byId = new Map<number, SdkLiga>(all.map((l) => [l.ligaId, l]));
  const selected = ligaIds.map((id) => byId.get(id)).filter((l): l is SdkLiga => Boolean(l));

  for (const l of selected) {
    const [existing] = await getDb()
      .select({ id: leagues.id })
      .from(leagues)
      .where(eq(leagues.apiLigaId, l.ligaId))
      .limit(1);
    const values = {
      ligaNr: l.liganr ?? 0,
      name: l.liganame,
      seasonId: l.seasonId ?? 0,
      seasonName: l.seasonName ?? "",
      skName: l.skName || null,
      akName: l.akName || null,
      geschlecht: l.geschlecht || null,
      verbandId: l.verbandId || null,
      verbandName: l.verbandName || null,
      seasonRefId: seasonId,
      vorabliga: l.vorabliga,
      isTracked: true,
      updatedAt: new Date(),
    };
    if (existing) {
      await getDb().update(leagues).set(values).where(eq(leagues.id, existing.id));
    } else {
      await getDb().insert(leagues).values({
        apiLigaId: l.ligaId, isActive: true, discoveredAt: new Date(), ...values,
      });
    }
  }

  // Scoped untrack: only this season's leagues not in the new set.
  const keepIds = selected.map((l) => l.ligaId);
  const untracked = keepIds.length > 0
    ? await getDb().update(leagues).set({ isTracked: false, updatedAt: new Date() })
        .where(and(eq(leagues.seasonRefId, seasonId), eq(leagues.isTracked, true), notInArray(leagues.apiLigaId, keepIds)))
        .returning({ id: leagues.id })
    : await getDb().update(leagues).set({ isTracked: false, updatedAt: new Date() })
        .where(and(eq(leagues.seasonRefId, seasonId), eq(leagues.isTracked, true)))
        .returning({ id: leagues.id });

  return { tracked: selected.length, untracked: untracked.length };
}

export async function getTrackedLeagues(seasonId?: number): Promise<TrackedLeaguesResponse> {
  const scopeId = seasonId ?? (await getActiveSeasonId());
  const where = scopeId === null
    ? eq(leagues.isTracked, true)
    : and(eq(leagues.isTracked, true), eq(leagues.seasonRefId, scopeId));
  const tracked = await getDb()
    .select({
      id: leagues.id, ligaNr: leagues.ligaNr, apiLigaId: leagues.apiLigaId,
      name: leagues.name, seasonName: leagues.seasonName, ownClubRefs: leagues.ownClubRefs,
    })
    .from(leagues)
    .where(where);
  return {
    leagueNumbers: tracked.map((l) => l.ligaNr),
    leagues: tracked.map((l) => ({ ...l, ownClubRefs: l.ownClubRefs ?? false })),
  };
}

export async function setLeagueOwnClubRefs(leagueId: number, ownClubRefs: boolean): Promise<void> {
  await getDb().update(leagues).set({ ownClubRefs, updatedAt: new Date() }).where(eq(leagues.id, leagueId));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/api test -- src/services/admin/league-discovery.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/league-discovery.service.ts apps/api/src/services/admin/league-discovery.service.test.ts
git commit -m "feat(api): browse + per-season league tracking; drop paste-by-number"
```

---

### Task 12: discovery routes + remove the old paste route + api-client cleanup

**Files:**
- Modify: `apps/api/src/routes/admin/season.routes.ts` (append discover + leagues routes)
- Modify: `apps/api/src/routes/admin/league.routes.ts` (remove the PUT-by-number route + its import)
- Modify: `apps/api/src/services/admin/league-discovery.service` import in `league.routes.ts` (drop `resolveAndSaveLeagues`)
- Modify: `packages/api-client/src/endpoints/settings.ts` (remove `setLeagues`), `packages/api-client/src/endpoints/index.ts`
- Test: `apps/api/src/routes/admin/season.routes.test.ts` (extend), `apps/api/src/routes/admin/league.routes.test.ts` (drop PUT cases), `packages/api-client/src/endpoints/settings.contract.test.ts` (drop setLeagues case)

**Interfaces:**
- Consumes: `browseLeagues`, `setSeasonLeagues`, `getTrackedLeagues`; `seasonIdParamSchema`, `browseLeaguesQuerySchema`, `seasonLeaguesSchema`.
- Produces: `GET /admin/seasons/:id/discover`, `GET /admin/seasons/:id/leagues`, `PUT /admin/seasons/:id/leagues`. `PUT /admin/settings/leagues` and `api.settings.setLeagues` removed.

- [ ] **Step 1: Extend the season route test**

```typescript
// apps/api/src/routes/admin/season.routes.test.ts — extend mocks + add cases
// add to hoisted mocks: browseLeagues, setSeasonLeagues, getTrackedLeagues
vi.mock("../../services/admin/league-discovery.service", () => ({
  browseLeagues: mocks.browseLeagues,
  setSeasonLeagues: mocks.setSeasonLeagues,
  getTrackedLeagues: mocks.getTrackedLeagues,
}));

describe("GET /seasons/:id/discover", () => {
  it("returns browsable leagues", async () => {
    mocks.browseLeagues.mockResolvedValue([{ ligaId: 54136, vorabliga: true, alreadyTracked: false }]);
    const res = await app.request("/seasons/3/discover?vorabligaOnly=true");
    expect(res.status).toBe(200);
    expect(mocks.browseLeagues).toHaveBeenCalledWith({ vorabligaOnly: true, seasonId: 3 });
  });
});

describe("PUT /seasons/:id/leagues", () => {
  it("sets season leagues", async () => {
    mocks.setSeasonLeagues.mockResolvedValue({ tracked: 1, untracked: 0 });
    const res = await app.request("/seasons/3/leagues", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: [54136] }),
    });
    expect(res.status).toBe(200);
    expect(mocks.setSeasonLeagues).toHaveBeenCalledWith(3, [54136]);
  });
  it("returns 400 for a non-array ligaIds", async () => {
    const res = await app.request("/seasons/3/leagues", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/season.routes.test.ts`
Expected: FAIL — routes not defined.

- [ ] **Step 3: Append the routes; remove the old paste route**

```typescript
// apps/api/src/routes/admin/season.routes.ts — add imports + routes
import { browseLeagues, setSeasonLeagues, getTrackedLeagues } from "../../services/admin/league-discovery.service";
import { browseLeaguesQuerySchema, seasonLeaguesSchema } from "@dragons/contracts";

seasonRoutes.get(
  "/seasons/:id/discover",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  validator("query", browseLeaguesQuerySchema, validationHook),
  describeRoute({ description: "Browse federation leagues to track for a season", tags: ["Seasons"], responses: { 200: { description: "Success" } } }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { vorabligaOnly } = c.req.valid("query");
    return c.json(await browseLeagues({ vorabligaOnly, seasonId: id }));
  },
);

seasonRoutes.get(
  "/seasons/:id/leagues",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  describeRoute({ description: "Tracked leagues for a season", tags: ["Seasons"], responses: { 200: { description: "Success" } } }),
  async (c) => c.json(await getTrackedLeagues(c.req.valid("param").id)),
);

seasonRoutes.put(
  "/seasons/:id/leagues",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  validator("json", seasonLeaguesSchema, validationHook),
  describeRoute({ description: "Set tracked leagues for a season", tags: ["Seasons"], responses: { 200: { description: "Success" } } }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { ligaIds } = c.req.valid("json");
    return c.json(await setSeasonLeagues(id, ligaIds));
  },
);
```

```typescript
// apps/api/src/routes/admin/league.routes.ts
// - remove resolveAndSaveLeagues from the import
// - delete the entire `leagueRoutes.put("/settings/leagues", ...)` block
// - remove leagueNumbersSchema from the @dragons/contracts import
// Keep GET /settings/leagues (now season-scoped via getTrackedLeagues default) and the PATCH own-club-refs route.
```

```typescript
// packages/api-client/src/endpoints/settings.ts — remove setLeagues method and the LeagueNumbersBody import.
// packages/api-client/src/endpoints/index.ts — drop the LeagueNumbersBody re-export.
```

- [ ] **Step 4: Run affected tests**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/season.routes.test.ts src/routes/admin/league.routes.test.ts` and `pnpm --filter @dragons/api-client test`
Expected: PASS. Remove the now-dead `PUT /settings/leagues` cases from `league.routes.test.ts` and the `setLeagues` case from `settings.contract.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/season.routes.ts apps/api/src/routes/admin/season.routes.test.ts apps/api/src/routes/admin/league.routes.ts apps/api/src/routes/admin/league.routes.test.ts packages/api-client/src/endpoints/settings.ts packages/api-client/src/endpoints/settings.contract.test.ts packages/api-client/src/endpoints/index.ts
git commit -m "feat(api): season discovery routes; remove paste-by-number league flow"
```

---

## Phase 6 — Admin UI

### Task 13: SWR wiring + seasons list page

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts`, `apps/web/src/lib/swr-queries.ts`
- Create: `apps/web/src/app/[locale]/admin/seasons/page.tsx`, `apps/web/src/components/admin/seasons/seasons-list.tsx`
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json`
- Test: `apps/web/src/components/admin/seasons/seasons-list.test.tsx`

**Interfaces:**
- Consumes: `api.seasons.list/create/activate` (Task 6).
- Produces: `SWR_KEYS.seasons`; `queries.seasons()`; the `/admin/seasons` page rendering the list with create + activate actions.

- [ ] **Step 1: Add SWR key + query**

```typescript
// apps/web/src/lib/swr-keys.ts — add to SWR_KEYS
  seasons: "/admin/seasons",
```

```typescript
// apps/web/src/lib/swr-queries.ts — add inside makeQueries(api) return object
    seasons: () => ({ key: SWR_KEYS.seasons, fetcher: () => api.seasons.list() }),
```

- [ ] **Step 2: Write the failing component test**

```tsx
// apps/web/src/components/admin/seasons/seasons-list.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeasonsList } from "./seasons-list";

vi.mock("swr", () => ({
  default: () => ({
    data: [
      { id: 1, name: "2025/26", status: "active", leagueCount: 3 },
      { id: 2, name: "2026/27", status: "upcoming", leagueCount: 0 },
    ],
  }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

describe("SeasonsList", () => {
  it("renders each season with its status", () => {
    render(<SeasonsList />);
    expect(screen.getByText("2025/26")).toBeInTheDocument();
    expect(screen.getByText("2026/27")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/components/admin/seasons/seasons-list.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the page + list component**

```tsx
// apps/web/src/app/[locale]/admin/seasons/page.tsx
import { getServerSession } from "@/lib/auth-server";
import { can } from "@dragons/shared";
import { notFound } from "next/navigation";
import { getServerApi } from "@/lib/api-server";
import { makeQueries } from "@/lib/swr-queries";
import { SWRConfig } from "swr";
import { SeasonsList } from "@/components/admin/seasons/seasons-list";
import type { SeasonWithCounts } from "@dragons/shared";

export default async function SeasonsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const serverApi = await getServerApi();
  const q = makeQueries(serverApi).seasons();
  let seasons: SeasonWithCounts[] = [];
  try { seasons = await q.fetcher(); } catch { /* empty state */ }

  return (
    <SWRConfig value={{ fallback: { [q.key]: seasons } }}>
      <SeasonsList />
    </SWRConfig>
  );
}
```

```tsx
// apps/web/src/components/admin/seasons/seasons-list.tsx
"use client";
import useSWR, { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { queries } from "@/lib/swr-queries";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import type { SeasonWithCounts } from "@dragons/shared";

export function SeasonsList() {
  const t = useTranslations();
  const q = queries.seasons();
  const { data: seasons } = useSWR(q.key, q.fetcher);
  const { mutate } = useSWRConfig();

  async function activate(season: SeasonWithCounts) {
    // Spec: block activating an empty season behind a confirm (it would blank the public site).
    if (season.leagueCount === 0 && !window.confirm(t("settings.seasons.confirmEmptyActivate"))) {
      return;
    }
    try {
      await api.seasons.activate(season.id);
      await mutate(SWR_KEYS.seasons);
      toast.success(t("settings.seasons.toast.activated"));
    } catch {
      toast.error(t("settings.seasons.toast.activateFailed"));
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.seasons.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {(seasons ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between">
            <span>{s.name} · {t(`settings.seasons.status.${s.status}`)} · {s.leagueCount}</span>
            {s.status === "upcoming" && (
              <Button onClick={() => { void activate(s); }}>
                {t("settings.seasons.activate")}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

> Verify the exact import paths for `getServerSession`, `getServerApi`, `can`, and UI components against a sibling page (`apps/web/src/app/[locale]/admin/settings/page.tsx`) — match whatever it imports. Add `settings.seasons.*` keys to both `en.json` and `de.json` (title, activate, confirmEmptyActivate, status.upcoming/active/archived, toast.activated/activateFailed, plus the wizard keys used in Task 14).

- [ ] **Step 5: Run test, then commit**

Run: `pnpm --filter @dragons/web test -- src/components/admin/seasons/seasons-list.test.tsx`
Expected: PASS.

```bash
git add apps/web/src/lib/swr-keys.ts apps/web/src/lib/swr-queries.ts apps/web/src/app/[locale]/admin/seasons apps/web/src/components/admin/seasons apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): seasons admin list page with activate action"
```

---

### Task 14: onboarding wizard (create → discover → select → sync)

**Files:**
- Create: `apps/web/src/components/admin/seasons/season-wizard.tsx`
- Modify: `apps/web/src/components/admin/seasons/seasons-list.tsx` (mount a "Create season" button that opens the wizard)
- Modify: `apps/web/src/messages/en.json`, `de.json`
- Test: `apps/web/src/components/admin/seasons/season-wizard.test.tsx`

**Interfaces:**
- Consumes: `api.seasons.create/discover/setLeagues`, `api.sync.trigger` (existing manual-sync endpoint — confirm the method name in `packages/api-client/src/endpoints`), `BrowsableLeague`.
- Produces: a stepped dialog component `SeasonWizard({ open, onOpenChange })`. Manage steps with `useState` (no wizard library exists — confirmed). Step state: `"name" | "discover" | "syncing" | "done"`.

- [ ] **Step 1: Write a failing test for the first step**

```tsx
// apps/web/src/components/admin/seasons/season-wizard.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SeasonWizard } from "./season-wizard";

const create = vi.fn().mockResolvedValue({ id: 9, name: "2026/27", status: "upcoming" });
const discover = vi.fn().mockResolvedValue([
  { ligaId: 54136, ligaNr: null, name: "Oberliga Herren Ost", skName: "Oberliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: false },
]);
vi.mock("@/lib/api", () => ({ api: { seasons: { create, discover, setLeagues: vi.fn().mockResolvedValue({ tracked: 1, untracked: 0 }) } } }));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

describe("SeasonWizard", () => {
  it("creates a season then loads vorabligas to pick", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("settings.seasons.wizard.nameLabel"), { target: { value: "2026/27" } });
    fireEvent.click(screen.getByText("settings.seasons.wizard.next"));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "2026/27" }));
    await waitFor(() => expect(discover).toHaveBeenCalledWith(9, { vorabligaOnly: true }));
    expect(await screen.findByText("Oberliga Herren Ost")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/components/admin/seasons/season-wizard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the wizard**

```tsx
// apps/web/src/components/admin/seasons/season-wizard.tsx
"use client";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import type { BrowsableLeague } from "@dragons/shared";
import { Dialog, DialogContent } from "@dragons/ui/components/dialog";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";

type Step = "name" | "discover" | "syncing" | "done";

export function SeasonWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [leagues, setLeagues] = useState<BrowsableLeague[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function createAndDiscover() {
    const season = await api.seasons.create({ name });
    setSeasonId(season.id);
    const found = await api.seasons.discover(season.id, { vorabligaOnly: true });
    setLeagues(found);
    setStep("discover");
  }

  async function saveAndSync() {
    if (seasonId === null) return;
    await api.seasons.setLeagues(seasonId, { ligaIds: [...selected] });
    setStep("syncing");
    try {
      await api.sync.trigger(); // confirm exact method name in api-client
      await mutate(SWR_KEYS.seasons);
      setStep("done");
      toast.success(t("settings.seasons.wizard.synced"));
    } catch {
      toast.error(t("settings.seasons.wizard.syncFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === "name" && (
          <div className="space-y-3">
            <label htmlFor="season-name">{t("settings.seasons.wizard.nameLabel")}</label>
            <Input id="season-name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button disabled={!name.trim()} onClick={() => { void createAndDiscover(); }}>
              {t("settings.seasons.wizard.next")}
            </Button>
          </div>
        )}
        {step === "discover" && (
          <div className="space-y-2">
            {leagues.map((l) => (
              <label key={l.ligaId} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(l.ligaId)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(l.ligaId); else next.delete(l.ligaId);
                      return next;
                    });
                  }}
                />
                <span>{l.name} · {l.skName} · {l.akName} · {l.geschlecht}</span>
              </label>
            ))}
            <Button disabled={selected.size === 0} onClick={() => { void saveAndSync(); }}>
              {t("settings.seasons.wizard.saveAndSync")}
            </Button>
          </div>
        )}
        {step === "syncing" && <p>{t("settings.seasons.wizard.syncing")}</p>}
        {step === "done" && <p>{t("settings.seasons.wizard.done")}</p>}
      </DialogContent>
    </Dialog>
  );
}
```

> Confirm `Dialog`/`DialogContent`/`Input` import paths against an existing dialog (e.g. `create-user-dialog.tsx`). Confirm the manual-sync client method name (`api.sync.trigger()` or similar) in `packages/api-client/src/endpoints` and use the real one. Add all `settings.seasons.wizard.*` keys to `en.json` + `de.json`.

- [ ] **Step 4: Run the test; wire the Create button in `seasons-list.tsx`**

Add a `useState` for the wizard open-state and a `<Button>` that opens `<SeasonWizard>`. Run:
`pnpm --filter @dragons/web test -- src/components/admin/seasons/season-wizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/seasons apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): new-season onboarding wizard (create → discover → select → sync)"
```

---

### Task 15: season-context selector + season-scoped admin views

**Files:**
- Create: `apps/web/src/components/admin/seasons/season-context-select.tsx`
- Modify: the admin schedule/standings/games components to pass the selected `seasonId` into `api.matches.list({ seasonId })` / standings queries
- Modify: `apps/web/src/components/admin/settings/tracked-leagues.tsx` (use `api.seasons.getLeagues(activeSeasonId)` and drop the paste-numbers input)
- Test: `apps/web/src/components/admin/seasons/season-context-select.test.tsx`

**Interfaces:**
- Consumes: `api.seasons.list`, `api.matches.list({ seasonId })` (admin match list now accepts `seasonId`).
- Produces: a `<SeasonContextSelect value onChange>` dropdown listing seasons; admin views thread the chosen season id through their match/standings queries (default: active).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/admin/seasons/season-context-select.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeasonContextSelect } from "./season-context-select";

vi.mock("swr", () => ({ default: () => ({ data: [
  { id: 1, name: "2025/26", status: "active" }, { id: 2, name: "2026/27", status: "upcoming" },
] }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

describe("SeasonContextSelect", () => {
  it("renders an option per season", () => {
    render(<SeasonContextSelect value={1} onChange={() => {}} />);
    expect(screen.getByText("2025/26")).toBeInTheDocument();
    expect(screen.getByText("2026/27")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/components/admin/seasons/season-context-select.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the selector + thread season id through admin views**

```tsx
// apps/web/src/components/admin/seasons/season-context-select.tsx
"use client";
import useSWR from "swr";
import { queries } from "@/lib/swr-queries";

export function SeasonContextSelect({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
  const q = queries.seasons();
  const { data: seasons } = useSWR(q.key, q.fetcher);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
      {(seasons ?? []).map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
```

For the admin schedule/games/standings components: lift a `seasonId` state (default to the active season's id), render `<SeasonContextSelect>`, and pass `seasonId` into the data fetch (`api.matches.list({ ...filters, seasonId })`). For `tracked-leagues.tsx`: replace the paste-numbers `<Input>`/`handleSave` with a read-only list fed by `api.seasons.getLeagues(activeSeasonId)` (the wizard now performs selection); keep the own-club-refs toggle.

- [ ] **Step 4: Run web tests + typecheck**

Run: `pnpm --filter @dragons/web test` and `pnpm --filter @dragons/web typecheck`
Expected: PASS. Remove dead i18n keys (`settings.leagues.numbersLabel`, etc.) if no longer referenced.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin
git commit -m "feat(web): season-context selector + season-scoped admin league/match views"
```

---

## Phase 7 — Verification

### Task 16: two-season isolation integration test + full gate

**Files:**
- Create: `apps/api/src/services/admin/season-isolation.integration.test.ts`

**Interfaces:**
- Consumes: `getStandings`, `getOwnClubMatches`, `activateSeason`, the season + discovery services.

- [ ] **Step 1: Write the integration test (PGlite, real services)**

```typescript
// apps/api/src/services/admin/season-isolation.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

import { getStandings } from "./standings-admin.service";
import { activateSeason, invalidateActiveSeasonCache } from "./season.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await ctx.client.close(); });
beforeEach(async () => { await resetTestDb(ctx); invalidateActiveSeasonCache(); vi.clearAllMocks(); });

it("public standings follow the active season across activation", async () => {
  // Seed active 2025/26 (league A, standing) + upcoming 2026/27 (league B, standing).
  // Assert getStandings() shows only A. Then activateSeason(upcoming); invalidate cache.
  // Assert getStandings() now shows only B.
  // (Use raw INSERTs mirroring earlier seeding helpers for seasons/leagues/teams/standings.)
});
```

(Fill the seeding with the same raw-SQL helpers used in the standings test. Assert active-only before and after `activateSeason`.)

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @dragons/api test -- src/services/admin/season-isolation.integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full local CI gate**

Run, in order:
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @dragons/api coverage
pnpm check:ai-slop
```
Expected: all PASS; coverage at or above thresholds for every gated package. Fix any gap (add a test case for the uncovered branch) before proceeding.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/admin/season-isolation.integration.test.ts
git commit -m "test(api): two-season isolation integration coverage"
```

- [ ] **Step 5: Update docs**

Update `AGENTS.md` (data model: add `seasons` table + `leagues.seasonId`/`vorabliga`; endpoint list: add the `/admin/seasons*` routes; remove `PUT /admin/settings/leagues`) and `CLAUDE.md` "New DB table" note if needed. Run `pnpm check:ai-slop` again, then commit:

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: seasons entity, onboarding endpoints, data-model update"
```

---

## Self-review notes (resolved)

- **Column name clash:** the legacy SDK integer column on `leagues` is `season_id`; the new FK column is named `season_ref_id` (`seasonRefId`) throughout to avoid collision. Apply this name in Task 2's schema and everywhere it is referenced.
- **Coverage:** route handlers are exercised by `*.routes.test.ts` (mirroring `league.routes.test.ts`); services by PGlite tests; clients by `*.contract.test.ts`. Run `pnpm --filter @dragons/api coverage` after Phases 2/4/5 and add cases for any uncovered branch before committing.
- **Each phase is independently shippable** (the schema is additive and backward-compatible), so phases may be merged to `main` incrementally.
