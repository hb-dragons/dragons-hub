# Referee Game Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter the referee games list so each referee only sees games they're eligible to officiate, based on admin-curated local rules.

**Architecture:** Two new boolean columns on `referees` (`allowAllHomeGames`, `allowAwayGames`) control broad visibility. Existing `refereeAssignmentRules` (per referee-team pair) serve as the allowlist for home games. Two new FK columns on `refereeGames` (`homeTeamId`, `guestTeamId`) enable rule matching without JOINing through `matches`. Federation qualification is only checked at assignment time (existing flow, unchanged).

**Tech Stack:** Drizzle ORM, Hono, Vitest, Zod, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-16-referee-game-visibility-design.md`

---

### Task 1: Add `allowAllHomeGames` and `allowAwayGames` columns to `referees` schema

**Files:**
- Modify: `packages/db/src/schema/referees.ts:13-22` (referees table definition)

- [ ] **Step 1: Add the two new boolean columns to the referees table**

In `packages/db/src/schema/referees.ts`, add two columns to the `referees` table definition, after `licenseNumber`:

```ts
allowAllHomeGames: boolean("allow_all_home_games").notNull().default(false),
allowAwayGames: boolean("allow_away_games").notNull().default(false),
```

You'll need to add `boolean` to the import from `drizzle-orm/pg-core` (it's not currently imported in this file).

- [ ] **Step 2: Generate the Drizzle migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: A new migration file appears in `packages/db/drizzle/`

- [ ] **Step 3: Run the migration**

Run: `pnpm --filter @dragons/db db:migrate`
Expected: Migration applies successfully, no errors

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/referees.ts packages/db/drizzle/
git commit -m "feat(db): add allowAllHomeGames and allowAwayGames columns to referees"
```

---

### Task 2: Add `homeTeamId` and `guestTeamId` columns to `refereeGames` schema

**Files:**
- Modify: `packages/db/src/schema/referee-games.ts:14-54` (refereeGames table definition)

- [ ] **Step 1: Add the two new FK columns to the refereeGames table**

In `packages/db/src/schema/referee-games.ts`, add the import for `teams`:

```ts
import { teams } from "./teams";
```

Add two columns after `isGuestGame`, before `leagueApiId`:

```ts
homeTeamId: integer("home_team_id").references(() => teams.id),
guestTeamId: integer("guest_team_id").references(() => teams.id),
```

Add indexes for the new FK columns in the table's index array:

```ts
index("referee_games_home_team_id_idx").on(table.homeTeamId),
index("referee_games_guest_team_id_idx").on(table.guestTeamId),
```

- [ ] **Step 2: Generate the Drizzle migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: A new migration file in `packages/db/drizzle/`

- [ ] **Step 3: Run the migration**

Run: `pnpm --filter @dragons/db db:migrate`
Expected: Migration applies successfully

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/referee-games.ts packages/db/drizzle/
git commit -m "feat(db): add homeTeamId and guestTeamId FK columns to refereeGames"
```

---

### Task 3: Populate `homeTeamId`/`guestTeamId` during referee games sync

**Files:**
- Modify: `apps/api/src/services/sync/referee-games.sync.ts`
- Test: `apps/api/src/services/sync/referee-games.sync.test.ts` (create if doesn't exist, or modify)

- [ ] **Step 1: Write the failing test for team ID resolution**

In the test file for `referee-games.sync.ts`, add a test that verifies `mapApiResultToRow` output is enriched with team IDs during the sync loop. The actual team resolution happens in `syncRefereeGames`, not in the pure `mapApiResultToRow` function, so we test the resolution helper:

Create a helper function `resolveTeamIdByClubId` and test it:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the resolveTeamIdByClubId helper
describe("resolveTeamIdByClubId", () => {
  it("returns team ID when club ID matches a team in the database", async () => {
    // This test depends on your test DB setup — insert a team row with clubId=12345,
    // then call resolveTeamIdByClubId(12345) and expect the team's id back
  });

  it("returns null when club ID has no matching team", async () => {
    const result = await resolveTeamIdByClubId(99999);
    expect(result).toBeNull();
  });
});
```

The exact test setup depends on your existing test infrastructure (PGlite, mocks, etc.). Follow the patterns in existing sync tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- referee-games.sync`
Expected: FAIL — `resolveTeamIdByClubId` not defined

- [ ] **Step 3: Implement team ID resolution in the sync**

In `apps/api/src/services/sync/referee-games.sync.ts`:

Add a new helper function that batch-resolves club IDs to team IDs. The `refereeGames` table stores `homeClubId`/`guestClubId` (federation `vereinId`), and our `teams` table has `clubId`. Multiple teams can share a `clubId` (different age groups/squads for the same club), so for the `refereeGames` row we want the team whose name best matches. However, since `refereeGames` is about games where _our club_ provides referees, the home team is often _not_ our club — we just need a stable mapping for rule lookups.

**Approach:** batch-fetch all teams by club IDs at the start of sync, build a `Map<clubId, teamId>`. When multiple teams share a `clubId`, prefer the one marked `isOwnClub` (for our club's teams, rules are per-team). For opponent clubs, any team will do since rules are per-team and the admin sets rules for specific teams.

Add before the main sync loop in `syncRefereeGames`:

```ts
// Build clubId → team ID lookup for homeTeamId/guestTeamId resolution
const allClubIds = [
  ...new Set(
    response.results.flatMap((r) => [
      r.sp.heimMannschaftLiga.mannschaft.verein.vereinId,
      r.sp.gastMannschaftLiga.mannschaft.verein.vereinId,
    ]),
  ),
];

const teamRows = allClubIds.length > 0
  ? await db
      .select({ id: teams.id, clubId: teams.clubId, isOwnClub: teams.isOwnClub })
      .from(teams)
      .where(inArray(teams.clubId, allClubIds))
  : [];

// For each clubId, prefer isOwnClub=true team, otherwise take first
const teamByClubId = new Map<number, number>();
for (const row of teamRows) {
  const existing = teamByClubId.get(row.clubId);
  if (!existing || row.isOwnClub) {
    teamByClubId.set(row.clubId, row.id);
  }
}
```

Import `teams` from `@dragons/db/schema` (add to existing import).

Then in both the INSERT and UPDATE paths, add the resolved team IDs:

```ts
const homeTeamId = teamByClubId.get(mapped.homeClubId) ?? null;
const guestTeamId = teamByClubId.get(mapped.guestClubId) ?? null;
```

Pass `homeTeamId` and `guestTeamId` into the `values` object for INSERT and the `set` object for UPDATE.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- referee-games.sync`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sync/referee-games.sync.ts apps/api/src/services/sync/referee-games.sync.test.ts
git commit -m "feat(api): resolve and store homeTeamId/guestTeamId during referee games sync"
```

---

### Task 4: Update shared types for referee visibility flags

**Files:**
- Modify: `packages/shared/src/referees.ts`

- [ ] **Step 1: Add the new flags to `RefereeListItem`**

In `packages/shared/src/referees.ts`, add to the `RefereeListItem` interface:

```ts
allowAllHomeGames: boolean;
allowAwayGames: boolean;
```

- [ ] **Step 2: Create an update body type for the flags**

In the same file, add:

```ts
export interface UpdateRefereeVisibilityBody {
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
}
```

- [ ] **Step 3: Export the new type from the shared package index**

In `packages/shared/src/index.ts`, verify the `RefereeListItem` re-export already covers it (it does, since it's in the same file). Add `UpdateRefereeVisibilityBody` to the export if it's not automatically covered by the wildcard. Check the existing export pattern:

The existing line is:
```ts
export type { RefereeListItem, RefereeRule, RefereeRulesResponse, UpdateRefereeRulesBody } from "./referees";
```

Update to:
```ts
export type { RefereeListItem, RefereeRule, RefereeRulesResponse, UpdateRefereeRulesBody, UpdateRefereeVisibilityBody } from "./referees";
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/referees.ts packages/shared/src/index.ts
git commit -m "feat(shared): add referee visibility types (allowAllHomeGames, allowAwayGames)"
```

---

### Task 5: Update admin referee service to include and update visibility flags

**Files:**
- Modify: `apps/api/src/services/admin/referee-admin.service.ts`
- Test: `apps/api/src/services/admin/referee-admin.service.test.ts`

- [ ] **Step 1: Write the failing test for updateRefereeVisibility**

In `apps/api/src/services/admin/referee-admin.service.test.ts`, add a test:

```ts
describe("updateRefereeVisibility", () => {
  it("updates allowAllHomeGames and allowAwayGames on the referee", async () => {
    // Insert a referee row (using your test helper or direct DB insert)
    // Call updateRefereeVisibility(refereeId, { allowAllHomeGames: true, allowAwayGames: true })
    // Query the referee row and assert both flags are true
  });

  it("returns the updated referee with new flags", async () => {
    // Insert referee, call updateRefereeVisibility, assert return value includes the flags
  });
});
```

Follow existing test patterns in this file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- referee-admin.service`
Expected: FAIL — `updateRefereeVisibility` not defined

- [ ] **Step 3: Implement updateRefereeVisibility**

In `apps/api/src/services/admin/referee-admin.service.ts`, add:

```ts
import type { UpdateRefereeVisibilityBody } from "@dragons/shared";

export async function updateRefereeVisibility(
  refereeId: number,
  body: UpdateRefereeVisibilityBody,
) {
  const [updated] = await db
    .update(referees)
    .set({
      allowAllHomeGames: body.allowAllHomeGames,
      allowAwayGames: body.allowAwayGames,
      updatedAt: new Date(),
    })
    .where(eq(referees.id, refereeId))
    .returning({
      id: referees.id,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
    });

  if (!updated) {
    throw new Error(`Referee ${refereeId} not found`);
  }

  return updated;
}
```

Add `eq` to the drizzle-orm import if not already there.

- [ ] **Step 4: Update getReferees to include the new flags**

In the same file, update the `getReferees` function's select to include:

```ts
allowAllHomeGames: referees.allowAllHomeGames,
allowAwayGames: referees.allowAwayGames,
```

And update the mapping in the `items` array to include these fields.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- referee-admin.service`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/referee-admin.service.ts apps/api/src/services/admin/referee-admin.service.test.ts
git commit -m "feat(api): add updateRefereeVisibility service and include flags in getReferees"
```

---

### Task 6: Add admin API route for updating referee visibility

**Files:**
- Modify: `apps/api/src/routes/admin/referee-assignment.routes.ts` (or create a new `referee-visibility.routes.ts` if cleaner)
- Test: corresponding test file

- [ ] **Step 1: Write the failing test for PATCH /admin/referees/:id/visibility**

```ts
describe("PATCH /admin/referees/:id/visibility", () => {
  it("returns 200 and updates visibility flags", async () => {
    // Create referee in test DB
    // PATCH with { allowAllHomeGames: true, allowAwayGames: false }
    // Assert 200, response body includes updated flags
  });

  it("returns 401 without auth", async () => {
    // PATCH without session → 401
  });

  it("returns 404 for non-existent referee", async () => {
    // PATCH with valid auth but bad referee ID → 404
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- <test-file>`
Expected: FAIL — route not defined

- [ ] **Step 3: Implement the route**

Add to the admin referee routes (wherever referee admin routes are mounted). Use Zod for body validation:

```ts
import { z } from "zod";
import { updateRefereeVisibility } from "../../services/admin/referee-admin.service";

const visibilityBodySchema = z.object({
  allowAllHomeGames: z.boolean(),
  allowAwayGames: z.boolean(),
});

// PATCH /admin/referees/:id/visibility
adminRefereeRoutes.patch("/:id/visibility", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid referee ID", code: "VALIDATION_ERROR" }, 400);
  }

  const body = visibilityBodySchema.parse(await c.req.json());

  try {
    const result = await updateRefereeVisibility(id, body);
    return c.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return c.json({ error: error.message, code: "NOT_FOUND" }, 404);
    }
    throw error;
  }
});
```

Make sure this route is behind `requireAdmin` middleware.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- <test-file>`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/
git commit -m "feat(api): add PATCH /admin/referees/:id/visibility route"
```

---

### Task 7: Implement filtered referee games service

**Files:**
- Create: `apps/api/src/services/referee/referee-game-visibility.service.ts`
- Create: `apps/api/src/services/referee/referee-game-visibility.service.test.ts`

This is the core feature — the query that filters games based on referee rules.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { getVisibleRefereeGames } from "./referee-game-visibility.service";

describe("getVisibleRefereeGames", () => {
  describe("referee with no rules and both flags false", () => {
    it("returns empty list", async () => {
      // Insert referee with allowAllHomeGames=false, allowAwayGames=false
      // Insert refereeGames rows (home games with open slots)
      // No refereeAssignmentRules for this referee
      // Call getVisibleRefereeGames(refereeId, { limit: 100, offset: 0 })
      // Expect: items=[], total=0
    });
  });

  describe("referee with allowAllHomeGames=true", () => {
    it("returns all home games with open our-club slots", async () => {
      // Insert referee with allowAllHomeGames=true
      // Insert home game with sr1OurClub=true, sr1Status='open'
      // Insert away game with sr1OurClub=true, sr1Status='open'
      // Expect: only the home game returned
    });

    it("excludes home games where referee has deny rule", async () => {
      // Insert referee with allowAllHomeGames=true
      // Insert team, insert deny rule for (referee, team)
      // Insert home game with homeTeamId=team.id
      // Expect: game excluded
    });
  });

  describe("referee with allowlist (allowAllHomeGames=false)", () => {
    it("returns only home games for allowed teams", async () => {
      // Insert referee with allowAllHomeGames=false
      // Insert team A (allowed), team B (no rule)
      // Insert refereeAssignmentRules: (referee, teamA, deny=false, allowSr1=true, allowSr2=true)
      // Insert home games for team A and team B
      // Expect: only team A's game returned
    });

    it("respects allowSr1/allowSr2 slot filtering", async () => {
      // Insert referee, team, rule with allowSr1=true, allowSr2=false
      // Insert game where only SR2 is open (sr2OurClub=true, sr2Status='open', sr1Status='assigned')
      // Expect: game excluded (referee only allowed SR1, but only SR2 is open)
    });

    it("shows game when allowed slot matches open slot", async () => {
      // Insert referee, team, rule with allowSr1=true, allowSr2=false
      // Insert game where SR1 is open (sr1OurClub=true, sr1Status='open')
      // Expect: game included
    });
  });

  describe("away games", () => {
    it("shows away games when allowAwayGames=true", async () => {
      // Insert referee with allowAwayGames=true
      // Insert away game (isHomeGame=false) with sr1OurClub=true, sr1Status='open'
      // Expect: game included
    });

    it("hides away games when allowAwayGames=false", async () => {
      // Insert referee with allowAwayGames=false
      // Insert away game
      // Expect: game excluded
    });
  });

  describe("base filters", () => {
    it("excludes cancelled games", async () => {
      // Insert referee with allowAllHomeGames=true
      // Insert home game with isCancelled=true
      // Expect: excluded
    });

    it("excludes games with no open our-club slots", async () => {
      // Insert home game where sr1Status='assigned' and sr2Status='assigned'
      // Expect: excluded
    });

    it("applies search, league, date filters on top of visibility", async () => {
      // Insert two visible games in different leagues
      // Filter by league → only matching game returned
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- referee-game-visibility`
Expected: FAIL — module not found

- [ ] **Step 3: Implement getVisibleRefereeGames**

Create `apps/api/src/services/referee/referee-game-visibility.service.ts`:

```ts
import { db } from "../../config/database";
import { refereeGames, referees, refereeAssignmentRules } from "@dragons/db/schema";
import { and, eq, or, sql, not, inArray, gte, lte, ilike, asc } from "drizzle-orm";
import type { RefereeGameListItem } from "@dragons/shared";

interface GetVisibleRefereeGamesParams {
  limit: number;
  offset: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  league?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getVisibleRefereeGames(
  refereeId: number,
  params: GetVisibleRefereeGamesParams,
) {
  const { limit, offset, search, status, league, dateFrom, dateTo } = params;

  // Load referee flags
  const [referee] = await db
    .select({
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
    })
    .from(referees)
    .where(eq(referees.id, refereeId))
    .limit(1);

  if (!referee) {
    return { items: [], total: 0, limit, offset, hasMore: false };
  }

  // Load referee rules (allowlist and deny list)
  const rules = await db
    .select({
      teamId: refereeAssignmentRules.teamId,
      deny: refereeAssignmentRules.deny,
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  const denyTeamIds = rules.filter((r) => r.deny).map((r) => r.teamId);
  const allowRules = rules.filter((r) => !r.deny);
  const allowTeamIds = allowRules.map((r) => r.teamId);
  const sr1AllowedTeamIds = allowRules.filter((r) => r.allowSr1).map((r) => r.teamId);
  const sr2AllowedTeamIds = allowRules.filter((r) => r.allowSr2).map((r) => r.teamId);

  // Build conditions
  const conditions = [];

  // Base: our club must provide refs, at least one open slot
  conditions.push(
    or(
      and(eq(refereeGames.sr1OurClub, true), eq(refereeGames.sr1Status, "open")),
      and(eq(refereeGames.sr2OurClub, true), eq(refereeGames.sr2Status, "open")),
    )!,
  );

  // Status filter
  if (status === "cancelled") conditions.push(eq(refereeGames.isCancelled, true));
  else if (status === "forfeited") conditions.push(eq(refereeGames.isForfeited, true));
  else if (status !== "all") {
    conditions.push(eq(refereeGames.isCancelled, false));
    conditions.push(eq(refereeGames.isForfeited, false));
  }

  // Build visibility condition: home OR away
  const visibilityParts = [];

  // Home game visibility
  if (referee.allowAllHomeGames) {
    // All home games, excluding deny list
    if (denyTeamIds.length > 0) {
      visibilityParts.push(
        and(
          eq(refereeGames.isHomeGame, true),
          or(
            sql`${refereeGames.homeTeamId} IS NULL`,
            not(inArray(refereeGames.homeTeamId, denyTeamIds)),
          )!,
        )!,
      );
    } else {
      visibilityParts.push(eq(refereeGames.isHomeGame, true));
    }
  } else if (allowTeamIds.length > 0) {
    // Allowlist: only allowed teams, with slot filtering
    // Build: homeTeamId IN allowedTeams AND (slot matches)
    const slotConditions = [];

    if (sr1AllowedTeamIds.length > 0) {
      slotConditions.push(
        and(
          inArray(refereeGames.homeTeamId, sr1AllowedTeamIds),
          eq(refereeGames.sr1OurClub, true),
          eq(refereeGames.sr1Status, "open"),
        )!,
      );
    }

    if (sr2AllowedTeamIds.length > 0) {
      slotConditions.push(
        and(
          inArray(refereeGames.homeTeamId, sr2AllowedTeamIds),
          eq(refereeGames.sr2OurClub, true),
          eq(refereeGames.sr2Status, "open"),
        )!,
      );
    }

    if (slotConditions.length > 0) {
      visibilityParts.push(
        and(
          eq(refereeGames.isHomeGame, true),
          or(...slotConditions)!,
        )!,
      );
    }
  }
  // else: no home game visibility (allowAllHomeGames=false, no allow rules)

  // Away game visibility
  if (referee.allowAwayGames) {
    visibilityParts.push(eq(refereeGames.isHomeGame, false));
  }

  // If no visibility parts, referee sees nothing
  if (visibilityParts.length === 0) {
    return { items: [], total: 0, limit, offset, hasMore: false };
  }

  conditions.push(
    visibilityParts.length === 1 ? visibilityParts[0]! : or(...visibilityParts)!,
  );

  // Optional filters
  if (league) conditions.push(eq(refereeGames.leagueShort, league));
  if (dateFrom) conditions.push(gte(refereeGames.kickoffDate, dateFrom));
  if (dateTo) conditions.push(lte(refereeGames.kickoffDate, dateTo));
  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const pattern = `%${word}%`;
      conditions.push(
        or(
          ilike(refereeGames.homeTeamName, pattern),
          ilike(refereeGames.guestTeamName, pattern),
          ilike(refereeGames.leagueName, pattern),
        )!,
      );
    }
  }

  const whereClause = and(...conditions)!;

  const isTrackedLeague = sql<boolean>`${refereeGames.matchId} IS NOT NULL`.as("is_tracked_league");

  const [items, countResult] = await Promise.all([
    db.select({
      id: refereeGames.id,
      apiMatchId: refereeGames.apiMatchId,
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
      lastSyncedAt: refereeGames.lastSyncedAt,
      isTrackedLeague,
      isHomeGame: refereeGames.isHomeGame,
      isGuestGame: refereeGames.isGuestGame,
    })
    .from(refereeGames)
    .where(whereClause)
    .orderBy(asc(refereeGames.kickoffDate), asc(refereeGames.kickoffTime))
    .limit(limit)
    .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
    .from(refereeGames)
    .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  return {
    items: items as RefereeGameListItem[],
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- referee-game-visibility`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-game-visibility.service.ts apps/api/src/services/referee/referee-game-visibility.service.test.ts
git commit -m "feat(api): implement filtered referee games visibility service"
```

---

### Task 8: Wire the referee games route to use visibility filtering

**Files:**
- Modify: `apps/api/src/routes/referee/games.routes.ts`
- Test: `apps/api/src/routes/referee/games.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Test that the `/referee/games` endpoint returns filtered results based on the logged-in referee's rules:

```ts
describe("GET /referee/games", () => {
  it("returns only visible games for the logged-in referee", async () => {
    // Set up:
    // - Referee with allowAllHomeGames=false, one allow rule for team A
    // - Home game for team A (should be visible)
    // - Home game for team B (should be hidden)
    // - Mock auth to return this referee's user session
    // GET /referee/games
    // Assert: only team A's game in response
  });

  it("returns empty list for referee with no rules", async () => {
    // Referee with no rules and both flags false
    // GET /referee/games
    // Assert: items=[], total=0
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- games.routes`
Expected: FAIL — route still returns unfiltered results

- [ ] **Step 3: Update the route to resolve referee ID and use visibility service**

In `apps/api/src/routes/referee/games.routes.ts`:

```ts
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireReferee } from "../../middleware/auth";
import { getRefereeGames } from "../../services/referee/referee-games.service";
import { getVisibleRefereeGames } from "../../services/referee/referee-game-visibility.service";
import { db } from "../../config/database";
import { user as userTable } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

const refereeGamesRoutes = new Hono<AppEnv>();
refereeGamesRoutes.use("/*", requireReferee);

refereeGamesRoutes.get("/games", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 100), 500);
  const offset = Number(c.req.query("offset") || 0);
  const search = c.req.query("search") || undefined;
  const status = (c.req.query("status") || "active") as "active" | "cancelled" | "forfeited" | "all";
  const league = c.req.query("league") || undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const sessionUser = c.get("user");

  // Admin sees all games (unfiltered)
  if (sessionUser.role === "admin") {
    const result = await getRefereeGames({ limit, offset, search, status, league, dateFrom, dateTo });
    return c.json(result);
  }

  // Referee sees filtered games
  const [userRow] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  if (!userRow?.refereeId) {
    return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
  }

  const result = await getVisibleRefereeGames(userRow.refereeId, {
    limit, offset, search, status, league, dateFrom, dateTo,
  });
  return c.json(result);
});

export { refereeGamesRoutes };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- games.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/referee/games.routes.ts apps/api/src/routes/referee/games.routes.test.ts
git commit -m "feat(api): wire referee games route to use visibility filtering"
```

---

### Task 9: Run full test suite and coverage check

**Files:** None (verification only)

- [ ] **Step 1: Run the full API test suite**

Run: `pnpm --filter @dragons/api test`
Expected: All tests pass

- [ ] **Step 2: Run coverage check**

Run: `pnpm --filter @dragons/api coverage`
Expected: Coverage meets thresholds (90% branches, 95% functions/lines/statements)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: No lint errors

- [ ] **Step 5: Fix any failures and commit**

If any failures, fix and commit with appropriate message.

---

### Task 10: Update AGENTS.md with new endpoint and data model changes

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the new endpoint to the API endpoints section**

Add to the referee endpoints section:
- `PATCH /admin/referees/:id/visibility` — Update referee visibility flags (allowAllHomeGames, allowAwayGames)

- [ ] **Step 2: Update the data model section**

Document the new columns:
- `referees.allowAllHomeGames` (boolean) — referee sees all home games minus deny rules
- `referees.allowAwayGames` (boolean) — referee sees away games
- `refereeGames.homeTeamId` (FK → teams.id) — resolved home team for rule matching
- `refereeGames.guestTeamId` (FK → teams.id) — resolved guest team for rule matching

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with referee visibility endpoint and schema changes"
```
