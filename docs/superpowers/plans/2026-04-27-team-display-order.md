# Team Display Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an admin to define the display order of own-club teams via a drag-list in `admin/teams`; have all team-list endpoints and consumers (web public, native) respect this order.

**Architecture:** Add a `display_order` integer column to the `teams` table. Sort own-club teams by it in both `GET /admin/teams` and `GET /public/teams` (with `name ASC` as tiebreaker). Add a single bulk `PUT /admin/teams/order` endpoint that rewrites positions in one transaction. Wrap the existing admin teams table in `@dnd-kit` for drag reordering. Native and web public are pure consumers — no logic changes needed beyond removing any local sort.

**Tech Stack:** Drizzle ORM (PostgreSQL), Hono, Zod, Vitest + PGlite for service tests, Next.js (App Router) + SWR for the admin UI, `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop.

**Spec:** `docs/superpowers/specs/2026-04-27-team-display-order-design.md`

---

## File Structure

**Modified:**

- `packages/db/src/schema/teams.ts` — add `displayOrder` column + index
- `apps/api/src/services/admin/team-admin.service.ts` — drop client-side sort, add `reorderOwnClubTeams`, expose `displayOrder` on `OwnClubTeam`
- `apps/api/src/routes/admin/team.routes.ts` — register `PUT /teams/order`
- `apps/api/src/routes/admin/team.routes.test.ts` — add tests for new route
- `apps/api/src/routes/admin/team.schemas.ts` — add `teamReorderBodySchema`
- `apps/api/src/routes/admin/team.schemas.test.ts` — add schema tests
- `apps/api/src/routes/public/team.routes.ts` — add `ORDER BY` clause
- `apps/api/src/services/sync/teams.sync.ts` — exclude `display_order` from upsert; assign on insert; reset on `isOwnClub` flip-to-false; assign on flip-to-true
- `apps/web/package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `apps/web/src/app/[locale]/admin/teams/teams-table.tsx` — wrap own-club rows in DnD context, add drag-handle column, optimistic reorder

**Created:**

- `packages/db/drizzle/0032_team_display_order.sql` — migration with backfill (file name will follow drizzle's auto-generated suffix; rename if needed)
- `apps/api/src/services/admin/team-admin.service.test.ts` — service-level tests against PGlite
- `apps/api/src/services/sync/teams.sync.test.ts` — sync-level tests for `display_order` behavior

---

## Task 1: Add `displayOrder` column to `teams` schema

**Files:**

- Modify: `packages/db/src/schema/teams.ts`

- [ ] **Step 1: Edit schema**

```ts
// packages/db/src/schema/teams.ts — full file after edit
import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    apiTeamPermanentId: integer("api_team_permanent_id").notNull().unique(),
    seasonTeamId: integer("season_team_id").notNull(),
    teamCompetitionId: integer("team_competition_id").notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    nameShort: varchar("name_short", { length: 100 }),
    customName: varchar("custom_name", { length: 50 }),
    clubId: integer("club_id").notNull(),
    isOwnClub: boolean("is_own_club").default(false),
    verzicht: boolean("verzicht").default(false),
    estimatedGameDuration: integer("estimated_game_duration"),
    badgeColor: varchar("badge_color", { length: 20 }),
    displayOrder: integer("display_order").notNull().default(0),
    dataHash: varchar("data_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    clubIdIdx: index("teams_club_id_idx").on(table.clubId),
    ownOrderIdx: index("teams_own_order_idx").on(table.isOwnClub, table.displayOrder),
  }),
);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
```

- [ ] **Step 2: Generate migration**

Run: `pnpm --filter @dragons/db db:generate`

Expected: a new file `packages/db/drizzle/00XX_<auto-name>.sql` is created. Note the path — used in next step.

- [ ] **Step 3: Append backfill SQL to the generated migration**

Open the new migration file and append (after the existing `ALTER TABLE` and any `CREATE INDEX` statements):

```sql
--> statement-breakpoint
UPDATE "teams"
SET "display_order" = sub.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY name) - 1 AS rn
  FROM "teams"
  WHERE "is_own_club" = true
) sub
WHERE "teams"."id" = sub.id;
```

- [ ] **Step 4: Verify migration runs against the dev DB**

Run: `pnpm --filter @dragons/db db:migrate`

Expected: migration applies cleanly. Existing own-club teams have `display_order` set to `0..n-1` in alphabetical order. New column default is `0` for non-own-club rows.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/teams.ts packages/db/drizzle/
git commit -m "feat(db): add display_order column to teams"
```

---

## Task 2: Sort `getOwnClubTeams` by `displayOrder`

**Files:**

- Modify: `apps/api/src/services/admin/team-admin.service.ts`

- [ ] **Step 1: Update the `OwnClubTeam` interface**

Edit `apps/api/src/services/admin/team-admin.service.ts`. Add `displayOrder: number;` to `OwnClubTeam`:

```ts
export interface OwnClubTeam {
  id: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueName: string | null;
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}
```

- [ ] **Step 2: Update `getOwnClubTeams` to ORDER BY in SQL and drop the client-side `.sort`**

Replace the body of `getOwnClubTeams`:

```ts
export async function getOwnClubTeams(): Promise<OwnClubTeam[]> {
  const rows = await db
    .selectDistinctOn([teams.id], {
      id: teams.id,
      name: teams.name,
      nameShort: teams.nameShort,
      customName: teams.customName,
      leagueName: leagues.name,
      estimatedGameDuration: teams.estimatedGameDuration,
      badgeColor: teams.badgeColor,
      displayOrder: teams.displayOrder,
    })
    .from(teams)
    .leftJoin(standings, eq(standings.teamApiId, teams.apiTeamPermanentId))
    .leftJoin(leagues, eq(leagues.id, standings.leagueId))
    .where(eq(teams.isOwnClub, true))
    .orderBy(teams.id, sql`${leagues.name} ASC NULLS LAST`);

  return rows.sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  );
}
```

> Note: `selectDistinctOn` requires the `ORDER BY` to start with the distinct columns (`teams.id`). Final ordering by `displayOrder` then `name` is applied client-side after deduplication. Cardinality is small (≤ 30 own-club teams), so this is fine.

- [ ] **Step 3: Update `updateTeam` returning to also include `displayOrder`**

In the same file, in the `updateTeam` function, add `displayOrder: teams.displayOrder` to the `.returning({ ... })` block so the PATCH response stays compatible with the new interface:

```ts
.returning({
  id: teams.id,
  name: teams.name,
  nameShort: teams.nameShort,
  customName: teams.customName,
  estimatedGameDuration: teams.estimatedGameDuration,
  badgeColor: teams.badgeColor,
  displayOrder: teams.displayOrder,
});
```

- [ ] **Step 4: Update existing route test fixture**

Open `apps/api/src/routes/admin/team.routes.test.ts`. The two fixture team objects in `describe("GET /teams")` and `describe("PATCH /teams/:id")` need `displayOrder: 0` (or any number) added so they satisfy the updated `OwnClubTeam` type.

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm --filter @dragons/api typecheck && pnpm --filter @dragons/api test team.routes`

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/team-admin.service.ts apps/api/src/routes/admin/team.routes.test.ts
git commit -m "feat(api): order own-club teams by display_order"
```

---

## Task 3: Sort `/public/teams` by `displayOrder`

**Files:**

- Modify: `apps/api/src/routes/public/team.routes.ts`

- [ ] **Step 1: Update the route to ORDER BY**

Edit the `GET /teams` handler:

```ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { desc, asc } from "drizzle-orm";
import { getTeamStats } from "../../services/public/team-stats.service";

const publicTeamRoutes = new Hono();

publicTeamRoutes.get(
  "/teams",
  describeRoute({
    description: "List all teams (public)",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await db
      .select()
      .from(teams)
      .orderBy(desc(teams.isOwnClub), asc(teams.displayOrder), asc(teams.name));
    return c.json(result);
  },
);

// ... rest unchanged
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/public/team.routes.ts
git commit -m "feat(api): order public teams by isOwnClub, display_order, name"
```

---

## Task 4: Add `teamReorderBodySchema` Zod schema

**Files:**

- Modify: `apps/api/src/routes/admin/team.schemas.ts`
- Modify: `apps/api/src/routes/admin/team.schemas.test.ts`

- [ ] **Step 1: Write failing schema test**

Open `apps/api/src/routes/admin/team.schemas.test.ts` and append:

```ts
import { teamReorderBodySchema } from "./team.schemas";

describe("teamReorderBodySchema", () => {
  it("accepts a non-empty array of positive integers", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [3, 1, 2] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive ids", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [1, 0, 2] });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer ids", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [1, 1.5] });
    expect(result.success).toBe(false);
  });

  it("rejects missing teamIds", () => {
    const result = teamReorderBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @dragons/api test team.schemas`

Expected: FAIL on the new `describe` block (`teamReorderBodySchema` is not exported).

- [ ] **Step 3: Add the schema**

Edit `apps/api/src/routes/admin/team.schemas.ts`, append:

```ts
export const teamReorderBodySchema = z.object({
  teamIds: z.array(z.number().int().positive()).min(1),
});

export type TeamReorderBody = z.infer<typeof teamReorderBodySchema>;
```

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @dragons/api test team.schemas`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/team.schemas.ts apps/api/src/routes/admin/team.schemas.test.ts
git commit -m "feat(api): add teamReorderBodySchema"
```

---

## Task 5: Add `reorderOwnClubTeams` service

**Files:**

- Modify: `apps/api/src/services/admin/team-admin.service.ts`
- Create: `apps/api/src/services/admin/team-admin.service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/services/admin/team-admin.service.test.ts`:

```ts
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

import { reorderOwnClubTeams, getOwnClubTeams } from "./team-admin.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function insertTeam(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_team_permanent_id: 100,
    season_team_id: 200,
    team_competition_id: 300,
    name: "Dragons Test",
    club_id: 999,
    is_own_club: true,
    display_order: 0,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return result.rows[0]!.id;
}

describe("reorderOwnClubTeams", () => {
  it("persists dense positions 0..n-1 in given order", async () => {
    const a = await insertTeam({ api_team_permanent_id: 1, name: "A" });
    const b = await insertTeam({ api_team_permanent_id: 2, name: "B" });
    const c = await insertTeam({ api_team_permanent_id: 3, name: "C" });

    const result = await reorderOwnClubTeams([c, a, b]);

    expect(result.map((t) => t.id)).toEqual([c, a, b]);
    expect(result.map((t) => t.displayOrder)).toEqual([0, 1, 2]);
  });

  it("rejects when teamIds is missing an own-club team", async () => {
    const a = await insertTeam({ api_team_permanent_id: 1, name: "A" });
    await insertTeam({ api_team_permanent_id: 2, name: "B" });

    await expect(reorderOwnClubTeams([a])).rejects.toThrow(/INVALID_TEAM_SET/);
  });

  it("rejects when teamIds contains a non-own-club team", async () => {
    const a = await insertTeam({ api_team_permanent_id: 1, name: "A" });
    const foreign = await insertTeam({
      api_team_permanent_id: 9,
      name: "Foreign",
      is_own_club: false,
    });

    await expect(reorderOwnClubTeams([a, foreign])).rejects.toThrow(/INVALID_TEAM_SET/);
  });

  it("rejects duplicate teamIds", async () => {
    const a = await insertTeam({ api_team_permanent_id: 1, name: "A" });
    const b = await insertTeam({ api_team_permanent_id: 2, name: "B" });

    await expect(reorderOwnClubTeams([a, b, a])).rejects.toThrow(/DUPLICATE_TEAM_ID/);
  });
});

describe("getOwnClubTeams ordering", () => {
  it("returns teams sorted by displayOrder then name", async () => {
    await insertTeam({ api_team_permanent_id: 1, name: "Charlie", display_order: 2 });
    await insertTeam({ api_team_permanent_id: 2, name: "Alpha", display_order: 0 });
    await insertTeam({ api_team_permanent_id: 3, name: "Bravo", display_order: 1 });

    const result = await getOwnClubTeams();

    expect(result.map((t) => t.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("uses name as tiebreaker when displayOrder is equal", async () => {
    await insertTeam({ api_team_permanent_id: 1, name: "Bravo", display_order: 0 });
    await insertTeam({ api_team_permanent_id: 2, name: "Alpha", display_order: 0 });

    const result = await getOwnClubTeams();

    expect(result.map((t) => t.name)).toEqual(["Alpha", "Bravo"]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @dragons/api test team-admin.service`

Expected: FAIL — `reorderOwnClubTeams` is not exported. The `getOwnClubTeams ordering` block may also fail until Task 2 changes are picked up; if Task 2 is already merged it should pass.

- [ ] **Step 3: Implement `reorderOwnClubTeams`**

Append to `apps/api/src/services/admin/team-admin.service.ts`:

```ts
import { inArray } from "drizzle-orm";

export interface ReorderedTeam {
  id: number;
  name: string;
  displayOrder: number;
}

export async function reorderOwnClubTeams(
  teamIds: number[],
): Promise<ReorderedTeam[]> {
  // Reject duplicates
  const unique = new Set(teamIds);
  if (unique.size !== teamIds.length) {
    throw new Error("DUPLICATE_TEAM_ID");
  }

  return await db.transaction(async (tx) => {
    // Load current own-club team IDs
    const ownClub = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.isOwnClub, true));

    const ownClubIds = new Set(ownClub.map((t) => t.id));

    // Validate exact set match
    if (
      ownClubIds.size !== teamIds.length ||
      teamIds.some((id) => !ownClubIds.has(id))
    ) {
      throw new Error("INVALID_TEAM_SET");
    }

    // Single UPDATE with CASE for atomic reorder
    const cases = teamIds
      .map((id, idx) => sql`WHEN ${id} THEN ${idx}`)
      .reduce((acc, frag) => sql`${acc} ${frag}`);

    await tx
      .update(teams)
      .set({
        displayOrder: sql`CASE ${teams.id} ${cases} END`,
        updatedAt: new Date(),
      })
      .where(inArray(teams.id, teamIds));

    // Return the new ordered list
    const updated = await tx
      .select({
        id: teams.id,
        name: teams.name,
        displayOrder: teams.displayOrder,
      })
      .from(teams)
      .where(inArray(teams.id, teamIds));

    return updated.sort((a, b) => a.displayOrder - b.displayOrder);
  });
}
```

> Note: `inArray` may already be imported in this file via `eq, and, sql`. If not, extend the import: `import { eq, and, sql, inArray } from "drizzle-orm";`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @dragons/api test team-admin.service`

Expected: all 6 tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/team-admin.service.ts apps/api/src/services/admin/team-admin.service.test.ts
git commit -m "feat(api): add reorderOwnClubTeams service"
```

---

## Task 6: Add `PUT /admin/teams/order` route

**Files:**

- Modify: `apps/api/src/routes/admin/team.routes.ts`
- Modify: `apps/api/src/routes/admin/team.routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Append to `apps/api/src/routes/admin/team.routes.test.ts`. First update the mocks block at the top of the file to include the new service function:

```ts
const mocks = vi.hoisted(() => ({
  getOwnClubTeams: vi.fn(),
  updateTeam: vi.fn(),
  reorderOwnClubTeams: vi.fn(),
}));

vi.mock("../../services/admin/team-admin.service", () => ({
  getOwnClubTeams: mocks.getOwnClubTeams,
  updateTeam: mocks.updateTeam,
  reorderOwnClubTeams: mocks.reorderOwnClubTeams,
}));
```

Then add a new `describe` block at the end of the file:

```ts
describe("PUT /teams/order", () => {
  it("returns the reordered list", async () => {
    const reordered = [
      { id: 3, name: "C", displayOrder: 0 },
      { id: 1, name: "A", displayOrder: 1 },
      { id: 2, name: "B", displayOrder: 2 },
    ];
    mocks.reorderOwnClubTeams.mockResolvedValue(reordered);

    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: [3, 1, 2] }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(reordered);
    expect(mocks.reorderOwnClubTeams).toHaveBeenCalledWith([3, 1, 2]);
  });

  it("rejects empty teamIds with 400", async () => {
    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: [] }),
    });

    expect(res.status).toBe(400);
    expect(mocks.reorderOwnClubTeams).not.toHaveBeenCalled();
  });

  it("returns 400 when service throws INVALID_TEAM_SET", async () => {
    mocks.reorderOwnClubTeams.mockRejectedValue(new Error("INVALID_TEAM_SET"));

    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: [1, 2] }),
    });

    expect(res.status).toBe(400);
    const body = (await json(res)) as { code: string };
    expect(body.code).toBe("INVALID_TEAM_SET");
  });

  it("returns 400 when service throws DUPLICATE_TEAM_ID", async () => {
    mocks.reorderOwnClubTeams.mockRejectedValue(new Error("DUPLICATE_TEAM_ID"));

    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: [1, 1] }),
    });

    expect(res.status).toBe(400);
    const body = (await json(res)) as { code: string };
    expect(body.code).toBe("DUPLICATE_TEAM_ID");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @dragons/api test team.routes`

Expected: FAIL — route does not exist.

- [ ] **Step 3: Add the route**

Edit `apps/api/src/routes/admin/team.routes.ts`. Replace the file contents with:

```ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import {
  getOwnClubTeams,
  updateTeam,
  reorderOwnClubTeams,
} from "../../services/admin/team-admin.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import {
  teamIdParamSchema,
  teamUpdateBodySchema,
  teamReorderBodySchema,
} from "./team.schemas";

const teamRoutes = new Hono<AppEnv>();

teamRoutes.get(
  "/teams",
  requirePermission("team", "view"),
  describeRoute({
    description: "List own club teams",
    tags: ["Teams"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const teams = await getOwnClubTeams();
    return c.json(teams);
  },
);

teamRoutes.put(
  "/teams/order",
  requirePermission("team", "manage"),
  describeRoute({
    description: "Reorder own club teams",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      400: { description: "Invalid team set or duplicate id" },
    },
  }),
  async (c) => {
    const { teamIds } = teamReorderBodySchema.parse(await c.req.json());
    try {
      const result = await reorderOwnClubTeams(teamIds);
      return c.json(result);
    } catch (err) {
      const code = err instanceof Error ? err.message : "REORDER_FAILED";
      if (code === "INVALID_TEAM_SET" || code === "DUPLICATE_TEAM_ID") {
        return c.json({ error: code, code }, 400);
      }
      throw err;
    }
  },
);

teamRoutes.patch(
  "/teams/:id",
  requirePermission("team", "manage"),
  describeRoute({
    description: "Update team properties",
    tags: ["Teams"],
    responses: {
      200: { description: "Success" },
      404: { description: "Team not found" },
    },
  }),
  async (c) => {
    const { id } = teamIdParamSchema.parse({ id: c.req.param("id") });
    const body = teamUpdateBodySchema.parse(await c.req.json());

    const result = await updateTeam(id, body);

    if (!result) {
      return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

export { teamRoutes };
```

> Note: `PUT /teams/order` is registered before `PATCH /teams/:id` to avoid the literal `order` matching `:id`. Hono routes by method so this is technically not strictly required, but keep the literal route first for clarity.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @dragons/api test team.routes`

Expected: all tests in the file pass (existing GET/PATCH plus new PUT block).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/team.routes.ts apps/api/src/routes/admin/team.routes.test.ts
git commit -m "feat(api): add PUT /admin/teams/order"
```

---

## Task 7: Update `teams.sync.ts` for `display_order`

**Files:**

- Modify: `apps/api/src/services/sync/teams.sync.ts`
- Create: `apps/api/src/services/sync/teams.sync.test.ts`

- [ ] **Step 1: Write failing sync tests**

Create `apps/api/src/services/sync/teams.sync.test.ts`:

```ts
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../admin/settings.service", () => ({
  getClubConfig: vi.fn(async () => ({ clubId: 999 })),
}));

vi.mock("../../config/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { syncTeamsFromData } from "./teams.sync";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
import type { SdkTeamRef } from "@dragons/sdk";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

function makeRef(overrides: Partial<SdkTeamRef> = {}): SdkTeamRef {
  return {
    teamPermanentId: 1,
    seasonTeamId: 100,
    teamCompetitionId: 200,
    teamname: "Team",
    teamnameSmall: null,
    clubId: 999,
    verzicht: false,
    ...overrides,
  } as SdkTeamRef;
}

async function fetchTeams() {
  const r = await ctx.client.query<{
    id: number;
    name: string;
    is_own_club: boolean;
    display_order: number;
  }>(`SELECT id, name, is_own_club, display_order FROM teams ORDER BY id`);
  return r.rows;
}

async function setDisplayOrder(apiTeamPermanentId: number, value: number) {
  await ctx.client.query(
    `UPDATE teams SET display_order = $1 WHERE api_team_permanent_id = $2`,
    [value, apiTeamPermanentId],
  );
}

describe("syncTeamsFromData displayOrder behavior", () => {
  it("assigns 0 to a single new own-club team and increments for additional ones in the same batch", async () => {
    const teamsMap = new Map<number, SdkTeamRef>([
      [1, makeRef({ teamPermanentId: 1, teamname: "A" })],
      [2, makeRef({ teamPermanentId: 2, teamname: "B" })],
      [3, makeRef({ teamPermanentId: 3, teamname: "C" })],
    ]);

    await syncTeamsFromData(teamsMap);

    const rows = await fetchTeams();
    expect(rows).toHaveLength(3);
    const orders = rows.map((r) => r.display_order).sort();
    expect(orders).toEqual([0, 1, 2]);
  });

  it("assigns 0 to non-own-club new teams", async () => {
    const teamsMap = new Map<number, SdkTeamRef>([
      [1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })],
      [2, makeRef({ teamPermanentId: 2, teamname: "Foreign", clubId: 12345 })],
    ]);

    await syncTeamsFromData(teamsMap);

    const rows = await fetchTeams();
    const foreign = rows.find((r) => r.name === "Foreign")!;
    expect(foreign.is_own_club).toBe(false);
    expect(foreign.display_order).toBe(0);
  });

  it("preserves displayOrder on existing-row update", async () => {
    // First sync — creates team
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A" })]]),
    );
    await setDisplayOrder(1, 7);

    // Second sync with changed teamname (forces dataHash change → UPDATE)
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A renamed" })]]),
    );

    const rows = await fetchTeams();
    expect(rows[0]!.display_order).toBe(7);
    expect(rows[0]!.name).toBe("A renamed");
  });

  it("appends max+1 when adding a new own-club team to an existing set", async () => {
    await syncTeamsFromData(
      new Map([
        [1, makeRef({ teamPermanentId: 1, teamname: "A" })],
        [2, makeRef({ teamPermanentId: 2, teamname: "B" })],
      ]),
    );
    await setDisplayOrder(1, 5);
    await setDisplayOrder(2, 10);

    await syncTeamsFromData(
      new Map([
        [1, makeRef({ teamPermanentId: 1, teamname: "A" })],
        [2, makeRef({ teamPermanentId: 2, teamname: "B" })],
        [3, makeRef({ teamPermanentId: 3, teamname: "C" })],
      ]),
    );

    const rows = await fetchTeams();
    const c = rows.find((r) => r.name === "C")!;
    expect(c.display_order).toBe(11);
  });

  it("resets displayOrder to 0 when isOwnClub flips to false", async () => {
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })]]),
    );
    await setDisplayOrder(1, 4);

    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 12345 })]]),
    );

    const rows = await fetchTeams();
    expect(rows[0]!.is_own_club).toBe(false);
    expect(rows[0]!.display_order).toBe(0);
  });

  it("assigns max+1 when isOwnClub flips to true via the corrective pass", async () => {
    // Seed an own-club team to establish a max
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })]]),
    );
    await setDisplayOrder(1, 3);

    // Insert a foreign team
    await syncTeamsFromData(
      new Map([[2, makeRef({ teamPermanentId: 2, teamname: "Foreign", clubId: 12345 })]]),
    );

    // Now flip team 2's club to ours
    await syncTeamsFromData(
      new Map([
        [1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })],
        [2, makeRef({ teamPermanentId: 2, teamname: "Foreign", clubId: 999 })],
      ]),
    );

    const rows = await fetchTeams();
    const flipped = rows.find((r) => r.name === "Foreign")!;
    expect(flipped.is_own_club).toBe(true);
    expect(flipped.display_order).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @dragons/api test teams.sync`

Expected: FAIL — sync does not yet manage `display_order`.

- [ ] **Step 3: Update `teams.sync.ts`**

Edit `apps/api/src/services/sync/teams.sync.ts`. The full updated file:

```ts
import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { sql, and, eq, ne } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import { getClubConfig } from "../admin/settings.service";
import type { SdkTeamRef } from "@dragons/sdk";
import { batchAction, type SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";

const log = logger.child({ service: "teams-sync" });

export interface TeamsSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

function teamHashData(teamRef: SdkTeamRef): Record<string, unknown> {
  return {
    teamPermanentId: teamRef.teamPermanentId,
    seasonTeamId: teamRef.seasonTeamId,
    teamCompetitionId: teamRef.teamCompetitionId,
    teamname: teamRef.teamname,
    teamnameSmall: teamRef.teamnameSmall,
    clubId: teamRef.clubId,
    verzicht: teamRef.verzicht,
  };
}

async function getMaxOwnDisplayOrder(): Promise<number> {
  const [row] = await db
    .select({ maxOrder: sql<number | null>`MAX(${teams.displayOrder})` })
    .from(teams)
    .where(eq(teams.isOwnClub, true));
  return row?.maxOrder ?? -1;
}

export async function syncTeamsFromData(
  teamsMap: Map<number, SdkTeamRef>,
  logger?: SyncLogger,
): Promise<TeamsSyncResult> {
  const startedAt = Date.now();
  const result: TeamsSyncResult = {
    total: teamsMap.size,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  if (teamsMap.size === 0) {
    return result;
  }

  log.info({ count: teamsMap.size }, "Batch syncing unique teams");

  const clubConfig = await getClubConfig();
  const ownClubId = clubConfig?.clubId ?? 0;
  const now = new Date();

  // Find which teamPermanentIds are already in the DB so we know which inserts are new
  const refIds = Array.from(teamsMap.keys());
  const existing = await db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(sql`${teams.apiTeamPermanentId} = ANY(${refIds})`);
  const existingIds = new Set(existing.map((e) => e.apiTeamPermanentId));

  // Compute next available displayOrder for own-club inserts
  let nextOrder = (await getMaxOwnDisplayOrder()) + 1;

  const teamRecords = Array.from(teamsMap.entries()).map(([permanentId, teamRef]) => {
    const isOwn = teamRef.clubId === ownClubId;
    const isNew = !existingIds.has(permanentId);
    const displayOrder = isNew && isOwn ? nextOrder++ : 0;
    return {
      apiTeamPermanentId: permanentId,
      seasonTeamId: teamRef.seasonTeamId,
      teamCompetitionId: teamRef.teamCompetitionId,
      name: teamRef.teamname,
      nameShort: teamRef.teamnameSmall || null,
      clubId: teamRef.clubId,
      isOwnClub: isOwn,
      verzicht: teamRef.verzicht,
      displayOrder,
      dataHash: computeEntityHash(teamHashData(teamRef)),
      createdAt: now,
      updatedAt: now,
    };
  });

  try {
    const upsertResult = await db
      .insert(teams)
      .values(teamRecords)
      .onConflictDoUpdate({
        target: teams.apiTeamPermanentId,
        set: {
          seasonTeamId: sql`excluded.season_team_id`,
          teamCompetitionId: sql`excluded.team_competition_id`,
          name: sql`excluded.name`,
          nameShort: sql`excluded.name_short`,
          clubId: sql`excluded.club_id`,
          isOwnClub: sql`excluded.is_own_club`,
          verzicht: sql`excluded.verzicht`,
          // displayOrder intentionally omitted — federation never owns it
          dataHash: sql`excluded.data_hash`,
          updatedAt: now,
        },
        setWhere: sql`excluded.data_hash != ${teams.dataHash}`,
      })
      .returning({ id: teams.id, createdAt: teams.createdAt });

    for (const row of upsertResult) {
      if (row.createdAt.getTime() === now.getTime()) {
        result.created++;
      } else {
        result.updated++;
      }
    }
    result.skipped = result.total - upsertResult.length - result.failed;

    log.info({ total: upsertResult.length, created: result.created, updated: result.updated, skipped: result.skipped }, "Batch synced teams");
    await logger?.log({
      entityType: "team",
      entityId: "batch",
      action: batchAction(result.created, result.updated, result.failed),
      message: `Batch synced ${upsertResult.length} teams (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`,
      metadata: { created: result.created, updated: result.updated, skipped: result.skipped },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Batch team sync failed: ${message}`);
    result.failed = teamsMap.size;
    log.error({ err: error }, "Batch sync error");
    await logger?.log({
      entityType: "team",
      entityId: "batch",
      action: "failed",
      message: `Batch team sync failed: ${message}`,
    });
  }

  // Corrective pass: fix isOwnClub for teams whose hash didn't change
  if (ownClubId > 0) {
    // Flip-to-true: assign next displayOrder
    const toMarkOwn = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.clubId, ownClubId), eq(teams.isOwnClub, false)));

    let nextCorrectionOrder = (await getMaxOwnDisplayOrder()) + 1;
    for (const row of toMarkOwn) {
      await db
        .update(teams)
        .set({
          isOwnClub: true,
          displayOrder: nextCorrectionOrder++,
          updatedAt: now,
        })
        .where(eq(teams.id, row.id));
    }

    // Flip-to-false: reset displayOrder to 0
    const unmarkOwn = await db
      .update(teams)
      .set({ isOwnClub: false, displayOrder: 0, updatedAt: now })
      .where(and(ne(teams.clubId, ownClubId), eq(teams.isOwnClub, true)))
      .returning({ id: teams.id });

    if (toMarkOwn.length > 0 || unmarkOwn.length > 0) {
      log.info({ marked: toMarkOwn.length, unmarked: unmarkOwn.length }, "Corrected isOwnClub");
    }
  }

  result.durationMs = Date.now() - startedAt;
  log.info({ durationMs: result.durationMs, total: result.total, errors: result.errors.length }, "Teams sync completed");

  return result;
}

export async function buildTeamIdLookup(): Promise<Map<number, number>> {
  const allTeams = await db
    .select({ id: teams.id, apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams);
  return new Map(allTeams.map((t) => [t.apiTeamPermanentId, t.id]));
}
```

> Notes:
> - The previous corrective pass used a single bulk `UPDATE ... SET isOwnClub = true`. We need per-row `displayOrder` assignment now, hence the loop. Set sizes are tiny (a flip is rare and applies to a handful of rows), so the loop cost is negligible.
> - The flip-to-false branch stays as a single `UPDATE` because all such rows go to `displayOrder = 0` together.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @dragons/api test teams.sync`

Expected: all 6 tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sync/teams.sync.ts apps/api/src/services/sync/teams.sync.test.ts
git commit -m "feat(api): manage display_order in team sync"
```

---

## Task 8: Add `@dnd-kit` packages to web app

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Install packages**

Run: `pnpm --filter @dragons/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

Expected: packages added to `apps/web/package.json` and `pnpm-lock.yaml` updated. Versions are picked by pnpm — they are peer-compatible with each other.

- [ ] **Step 2: Verify the web app still builds**

Run: `pnpm --filter @dragons/web typecheck`

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @dnd-kit for team reordering"
```

---

## Task 9: Add drag-reorder UI to `teams-table.tsx`

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`

- [ ] **Step 1: Replace the file with the DnD-enabled version**

Full contents of `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { can, COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { cn } from "@dragons/ui/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";

interface OwnClubTeam {
  id: number;
  name: string;
  customName: string | null;
  leagueName: string | null;
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}

interface SortableTeamRowProps {
  team: OwnClubTeam;
  canManage: boolean;
  draft: string;
  durationDraft: string;
  colorDraft: string | null | undefined;
  saving: boolean;
  isDirty: boolean;
  onDraftChange: (id: number, value: string) => void;
  onDurationChange: (id: number, value: string) => void;
  onColorChange: (id: number, value: string) => void;
  onSave: (team: OwnClubTeam) => void;
  t: ReturnType<typeof useTranslations>;
}

function SortableTeamRow(props: SortableTeamRowProps) {
  const { team, canManage, t } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-10">
        {canManage ? (
          <button
            type="button"
            className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground"
            aria-label={t("teams.dragHandle")}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
      </TableCell>
      <TableCell className="font-medium">{team.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {team.leagueName ?? "—"}
      </TableCell>
      <TableCell>
        <Input
          value={props.draft}
          onChange={(e) => props.onDraftChange(team.id, e.target.value)}
          placeholder={t("teams.placeholder")}
          maxLength={50}
          disabled={!canManage}
          className="max-w-xs"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          value={props.durationDraft}
          onChange={(e) => props.onDurationChange(team.id, e.target.value)}
          placeholder={t("teams.gameDurationPlaceholder")}
          disabled={!canManage}
          className="max-w-[100px]"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {COLOR_PRESET_KEYS.map((colorKey) => {
            const preset = getColorPreset(colorKey);
            const isSelected = props.colorDraft === colorKey;
            return (
              <button
                key={colorKey}
                type="button"
                disabled={!canManage}
                style={{ backgroundColor: preset.dot }}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform",
                  isSelected
                    ? "scale-110 border-foreground ring-2 ring-foreground/20"
                    : "border-transparent",
                  canManage ? "hover:scale-105" : "cursor-not-allowed opacity-50",
                )}
                onClick={() => props.onColorChange(team.id, colorKey)}
                aria-label={colorKey}
              />
            );
          })}
        </div>
      </TableCell>
      <TableCell>
        {canManage && (
          <Button
            size="sm"
            disabled={!props.isDirty || props.saving}
            onClick={() => props.onSave(team)}
          >
            {props.saving ? t("common.saving") : t("common.save")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function TeamsTable() {
  const t = useTranslations();
  const { data: session } = authClient.useSession();
  const canManage = can(session?.user ?? null, "team", "manage");
  const { data: teams } = useSWR<OwnClubTeam[]>(SWR_KEYS.teams, apiFetcher);
  const { mutate } = useSWRConfig();
  const teamsList = teams ?? [];
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<number, string>>({});
  const [colorDrafts, setColorDrafts] = useState<Record<number, string | null>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function getDraft(team: OwnClubTeam) {
    return drafts[team.id] ?? team.customName ?? "";
  }

  function getDurationDraft(team: OwnClubTeam) {
    return durationDrafts[team.id] ?? team.estimatedGameDuration?.toString() ?? "";
  }

  function getColorDraft(team: OwnClubTeam) {
    return team.id in colorDrafts ? colorDrafts[team.id] : team.badgeColor;
  }

  function isDirty(team: OwnClubTeam) {
    const nameDraft = getDraft(team);
    const durDraft = getDurationDraft(team);
    const colorDraft = getColorDraft(team);
    return (
      nameDraft !== (team.customName ?? "") ||
      durDraft !== (team.estimatedGameDuration?.toString() ?? "") ||
      colorDraft !== team.badgeColor
    );
  }

  async function save(team: OwnClubTeam) {
    const draft = getDraft(team);
    const customName = draft.trim() === "" ? null : draft.trim();
    const durDraft = getDurationDraft(team);
    const estimatedGameDuration =
      durDraft.trim() === "" ? null : parseInt(durDraft.trim(), 10);
    const badgeColor = getColorDraft(team);

    setSaving((prev) => ({ ...prev, [team.id]: true }));
    try {
      const updated = await fetchAPI<OwnClubTeam>(`/admin/teams/${team.id}`, {
        method: "PATCH",
        body: JSON.stringify({ customName, estimatedGameDuration, badgeColor }),
      });
      await mutate(
        SWR_KEYS.teams,
        (current: OwnClubTeam[] | undefined) =>
          (current ?? []).map((t) => (t.id === team.id ? updated : t)),
        { revalidate: false },
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
      setDurationDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
      setColorDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
    } catch {
      // surfaced by fetchAPI; keep draft for retry
    } finally {
      setSaving((prev) => ({ ...prev, [team.id]: false }));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = teamsList.findIndex((t) => t.id === active.id);
    const newIndex = teamsList.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(teamsList, oldIndex, newIndex);

    // Optimistic SWR update
    await mutate(SWR_KEYS.teams, reordered, { revalidate: false });

    try {
      await fetchAPI<Array<{ id: number; name: string; displayOrder: number }>>(
        `/admin/teams/order`,
        {
          method: "PUT",
          body: JSON.stringify({ teamIds: reordered.map((t) => t.id) }),
        },
      );
      // Revalidate to pick up server-truth displayOrder values
      await mutate(SWR_KEYS.teams);
    } catch {
      // Rollback on failure (fetchAPI surfaces toast)
      await mutate(SWR_KEYS.teams);
    }
  }

  if (teamsList.length === 0) {
    return <p className="text-muted-foreground">{t("teams.empty")}</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>{t("teams.columns.apiName")}</TableHead>
            <TableHead>{t("teams.columns.league")}</TableHead>
            <TableHead>{t("teams.columns.customName")}</TableHead>
            <TableHead>{t("teams.gameDuration")}</TableHead>
            <TableHead>{t("teams.badgeColor")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableContext
            items={teamsList.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {teamsList.map((team) => (
              <SortableTeamRow
                key={team.id}
                team={team}
                canManage={canManage}
                draft={getDraft(team)}
                durationDraft={getDurationDraft(team)}
                colorDraft={getColorDraft(team)}
                saving={saving[team.id] ?? false}
                isDirty={isDirty(team)}
                onDraftChange={(id, value) =>
                  setDrafts((prev) => ({ ...prev, [id]: value }))
                }
                onDurationChange={(id, value) =>
                  setDurationDrafts((prev) => ({ ...prev, [id]: value }))
                }
                onColorChange={(id, value) =>
                  setColorDrafts((prev) => ({ ...prev, [id]: value }))
                }
                onSave={save}
                t={t}
              />
            ))}
          </SortableContext>
        </TableBody>
      </Table>
    </DndContext>
  );
}
```

- [ ] **Step 2: Add the new translation key `teams.dragHandle`**

Find the messages files used by next-intl (likely `apps/web/messages/<locale>.json`). Add a `dragHandle` key under the existing `teams` namespace, e.g.:

```json
"teams": {
  "dragHandle": "Drag to reorder",
  ...
}
```

Add this to every locale file that contains a `teams` block (commonly `en.json` and `de.json`).

- [ ] **Step 3: Manual verification (UI)**

Bring up the dev stack:

```bash
docker compose -f docker/docker-compose.dev.yml up -d
pnpm dev
```

In a browser, log in as an admin and visit `http://localhost:3000/admin/teams`. Verify:

1. A drag handle (grip icon) appears in the leftmost column of each own-club row
2. Dragging a row up/down rearranges the table immediately
3. After dropping, the new order persists across a hard reload
4. Tab + arrow keys move focus to the handle and reorder via keyboard
5. Existing inline edits (custom name, duration, color) still save and do not interfere with drag

If any of those fail, fix before continuing.

- [ ] **Step 4: Run typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/admin/teams/teams-table.tsx apps/web/messages/
git commit -m "feat(web): drag-reorder for own-club teams in admin"
```

---

## Task 10: Final verification

**Files:** none

- [ ] **Step 1: Run all CI checks locally**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @dragons/api coverage`

Expected:
- typecheck: clean
- lint: clean
- test: all pass
- coverage: meets the project thresholds (90% branches, 95% functions/lines/statements) for all touched files

- [ ] **Step 2: Smoke test the complete flow**

With dev stack running:

1. Reorder teams in `admin/teams` — drag two rows to swap them
2. Hard reload `admin/teams` — order persists
3. Visit `/teams` (web public) — own-club teams appear in the new order at the top
4. Open the native app to the Teams tab — own-club teams (senior + youth) appear in the new order; the first own-club senior is the "featured" card

If any consumer is out of sync, open the corresponding file from the spec's "File touch list" and confirm no client-side re-sort overrides the backend order.

- [ ] **Step 3: Verify no AI-slop in any modified `.md` files**

Run: `pnpm check:ai-slop`

Expected: passes.
