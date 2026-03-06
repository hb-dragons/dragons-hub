# Referee Assignment ("Übernehmen") Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow referees to log in, browse matches with open referee slots, and claim them via deep-link to basketball-bund.net, with intent tracking and sync confirmation.

**Architecture:** Extend the matches table with 3 boolean columns for open-slot status (synced from SDK). Add a `refereeAssignmentIntents` table for tracking deep-link clicks. Add a `refereeId` column to the user table for linking users to referee records. New `/referee/*` routes with `requireReferee` middleware. New frontend page at `/referee/matches`.

**Tech Stack:** Drizzle ORM (schema + migration), Hono (routes + middleware), Vitest (tests), Next.js App Router (frontend), SWR (data fetching), `@dragons/ui` components, `@dragons/shared` types.

---

### Task 1: Add `sr1Open`/`sr2Open`/`sr3Open` columns to matches schema

**Files:**
- Modify: `packages/db/src/schema/matches.ts:33-36` (add after `isCancelled`)

**Step 1: Add the 3 boolean columns**

In `packages/db/src/schema/matches.ts`, add after line 36 (`isCancelled`):

```typescript
    // Referee open-slot flags (from SDK offenAngeboten)
    sr1Open: boolean("sr1_open").notNull().default(false),
    sr2Open: boolean("sr2_open").notNull().default(false),
    sr3Open: boolean("sr3_open").notNull().default(false),
```

**Step 2: Generate Drizzle migration**

Run: `pnpm --filter @dragons/db db:generate`

**Step 3: Apply migration**

Run: `pnpm --filter @dragons/db db:migrate`

**Step 4: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 5: Commit**

```
feat(db): add sr1Open/sr2Open/sr3Open columns to matches table
```

---

### Task 2: Add `refereeAssignmentIntents` table

**Files:**
- Modify: `packages/db/src/schema/referees.ts` (add new table after `matchReferees`)
- Modify: `packages/db/src/schema/index.ts` (export new table)

**Step 1: Add the table definition**

In `packages/db/src/schema/referees.ts`, add after the `matchReferees` table definition (before the type exports):

```typescript
import { smallint } from "drizzle-orm/pg-core";
```

Add `smallint` to the existing import from `drizzle-orm/pg-core`. Then add:

```typescript
export const refereeAssignmentIntents = pgTable(
  "referee_assignment_intents",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    refereeId: integer("referee_id")
      .notNull()
      .references(() => referees.id),
    slotNumber: smallint("slot_number").notNull(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedBySyncAt: timestamp("confirmed_by_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matchRefereeSlotUnique: unique("referee_intent_unique").on(
      table.matchId,
      table.refereeId,
      table.slotNumber,
    ),
    matchIdIdx: index("referee_intent_match_id_idx").on(table.matchId),
    refereeIdIdx: index("referee_intent_referee_id_idx").on(table.refereeId),
  }),
);

export type RefereeAssignmentIntent = typeof refereeAssignmentIntents.$inferSelect;
export type NewRefereeAssignmentIntent = typeof refereeAssignmentIntents.$inferInsert;
```

**Step 2: Export from schema index**

In `packages/db/src/schema/index.ts`, ensure `refereeAssignmentIntents` is exported. It should already be re-exported if the file does `export * from "./referees"`. If not, add it.

**Step 3: Generate and apply migration**

Run: `pnpm --filter @dragons/db db:generate && pnpm --filter @dragons/db db:migrate`

**Step 4: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 5: Commit**

```
feat(db): add refereeAssignmentIntents table for tracking deep-link clicks
```

---

### Task 3: Add `refereeId` column to user table

**Files:**
- Modify: `packages/db/src/schema/auth.ts` (add `refereeId` column)

**Step 1: Add refereeId FK to user table**

In `packages/db/src/schema/auth.ts`, add import for referees and the column:

```typescript
import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { referees } from "./referees";
```

Add to the `user` table definition, after `banExpires`:

```typescript
  refereeId: integer("referee_id").references(() => referees.id),
```

**Step 2: Generate and apply migration**

Run: `pnpm --filter @dragons/db db:generate && pnpm --filter @dragons/db db:migrate`

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 4: Commit**

```
feat(db): add refereeId FK to user table for referee account linking
```

---

### Task 4: Update matches sync to populate open-slot flags

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts`
- Test: `apps/api/src/services/sync/matches.sync.test.ts`

**Step 1: Write tests for open-slot flag syncing**

In `apps/api/src/services/sync/matches.sync.test.ts`, add tests that verify:
1. When a new match is created, `sr1Open`/`sr2Open`/`sr3Open` are set from the game response `offenAngeboten` flags
2. When a match is updated, the open-slot flags are updated
3. When no game details exist, flags default to `false`

The test helper `makeGameResponse` already accepts overrides for `sr1`/`sr2`/`sr3`. Use it with `offenAngeboten: true` to verify the flags are passed through.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- --testPathPattern=matches.sync`

**Step 3: Update `toRemoteSnapshot` to include open-slot flags**

In `matches.sync.ts`, update the `RemoteSnapshot` interface to add:

```typescript
  sr1Open: boolean;
  sr2Open: boolean;
  sr3Open: boolean;
```

Update `toRemoteSnapshot()` to extract these from the game details:

```typescript
    sr1Open: details?.sr1?.offenAngeboten ?? false,
    sr2Open: details?.sr2?.offenAngeboten ?? false,
    sr3Open: details?.sr3?.offenAngeboten ?? false,
```

**Step 4: Include open-slot flags in hash computation**

Add to `snapshotToHashData()`:

```typescript
    sr1Open: snapshot.sr1Open,
    sr2Open: snapshot.sr2Open,
    sr3Open: snapshot.sr3Open,
```

**Step 5: Include in SNAPSHOT_DB_FIELDS and TRACKED_FIELDS**

Add `"sr1Open"`, `"sr2Open"`, `"sr3Open"` to both `SNAPSHOT_DB_FIELDS` and `TRACKED_FIELDS` arrays.

**Step 6: Include in match create values**

In the `db.insert(matches).values({...})` block (around line 676), add:

```typescript
              sr1Open: remoteSnapshot.sr1Open,
              sr2Open: remoteSnapshot.sr2Open,
              sr3Open: remoteSnapshot.sr3Open,
```

**Step 7: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- --testPathPattern=matches.sync`

**Step 8: Run full test suite and coverage**

Run: `pnpm --filter @dragons/api coverage`

**Step 9: Commit**

```
feat(sync): populate sr1Open/sr2Open/sr3Open from SDK offenAngeboten during match sync
```

---

### Task 5: Add intent confirmation step to sync pipeline

**Files:**
- Modify: `apps/api/src/services/sync/referees.sync.ts` (add `confirmIntentsFromSync`)
- Test: `apps/api/src/services/sync/referees.sync.test.ts`
- Modify: `apps/api/src/services/sync/index.ts` (wire into orchestrator)

**Step 1: Write test for `confirmIntentsFromSync`**

In `referees.sync.test.ts`, add a test:
- Insert a match, referee, role, a `matchReferees` record (assignment), and a `refereeAssignmentIntents` row with `confirmedBySyncAt = null`
- Call `confirmIntentsFromSync()`
- Assert that the intent row now has `confirmedBySyncAt` set

Also test the negative case: intent exists but no matching `matchReferees` row → `confirmedBySyncAt` stays null.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- --testPathPattern=referees.sync`

**Step 3: Implement `confirmIntentsFromSync`**

In `referees.sync.ts`:

```typescript
export async function confirmIntentsFromSync(): Promise<number> {
  // Find intents where referee is now assigned to the match
  const pendingIntents = await db
    .select({
      intentId: refereeAssignmentIntents.id,
      matchId: refereeAssignmentIntents.matchId,
      refereeId: refereeAssignmentIntents.refereeId,
    })
    .from(refereeAssignmentIntents)
    .where(sql`${refereeAssignmentIntents.confirmedBySyncAt} IS NULL`);

  let confirmed = 0;
  for (const intent of pendingIntents) {
    const [assignment] = await db
      .select({ id: matchReferees.id })
      .from(matchReferees)
      .where(
        and(
          eq(matchReferees.matchId, intent.matchId),
          eq(matchReferees.refereeId, intent.refereeId),
        ),
      )
      .limit(1);

    if (assignment) {
      await db
        .update(refereeAssignmentIntents)
        .set({ confirmedBySyncAt: new Date() })
        .where(eq(refereeAssignmentIntents.id, intent.intentId));
      confirmed++;
    }
  }

  return confirmed;
}
```

Add necessary imports: `refereeAssignmentIntents` from schema, `sql` from drizzle-orm.

**Step 4: Wire into sync orchestrator**

In `apps/api/src/services/sync/index.ts`, import `confirmIntentsFromSync` and call it after Step 5 (referee assignments):

```typescript
      // Step 5.25: Confirm referee assignment intents
      await logStep("Confirming referee assignment intents...");
      const confirmedIntents = await confirmIntentsFromSync();
      if (confirmedIntents > 0) {
        await logStep(`Confirmed ${confirmedIntents} referee assignment intents`);
      }
```

**Step 5: Run tests**

Run: `pnpm --filter @dragons/api test`

**Step 6: Run coverage**

Run: `pnpm --filter @dragons/api coverage`

**Step 7: Commit**

```
feat(sync): confirm referee assignment intents when sync detects actual assignments
```

---

### Task 6: Add shared types for referee matches and intents

**Files:**
- Create: `packages/shared/src/referee-matches.ts`
- Modify: `packages/shared/src/referees.ts` (extend if needed)
- Modify: `packages/shared/src/matches.ts` (add referee slot info to MatchDetail)
- Modify: `packages/shared/src/index.ts` (export new types)

**Step 1: Create referee-matches types**

Create `packages/shared/src/referee-matches.ts`:

```typescript
export interface RefereeSlotInfo {
  slotNumber: number;
  isOpen: boolean;
  referee: {
    id: number;
    firstName: string | null;
    lastName: string | null;
  } | null;
  role: {
    id: number;
    name: string;
    shortName: string | null;
  } | null;
  intent: {
    refereeId: number;
    refereeFirstName: string | null;
    refereeLastName: string | null;
    clickedAt: string;
    confirmedBySyncAt: string | null;
  } | null;
}

export interface RefereeMatchListItem {
  id: number;
  apiMatchId: number;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  homeIsOwnClub: boolean;
  guestIsOwnClub: boolean;
  leagueName: string | null;
  venueName: string | null;
  venueCity: string | null;
  sr1Open: boolean;
  sr2Open: boolean;
  sr3Open: boolean;
  myIntents: { slotNumber: number; clickedAt: string; confirmedBySyncAt: string | null }[];
}

export interface TakeMatchResponse {
  deepLink: string;
  intent: {
    matchId: number;
    slotNumber: number;
    clickedAt: string;
  };
}
```

**Step 2: Add referee slot info to MatchDetail**

In `packages/shared/src/matches.ts`, add to `MatchDetail`:

```typescript
  refereeSlots?: RefereeSlotInfo[];
```

Import `RefereeSlotInfo` from `./referee-matches`.

**Step 3: Export from index**

In `packages/shared/src/index.ts`, add:

```typescript
export type {
  RefereeSlotInfo,
  RefereeMatchListItem,
  TakeMatchResponse,
} from "./referee-matches";
```

**Step 4: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 5: Commit**

```
feat(shared): add referee match types (RefereeMatchListItem, RefereeSlotInfo, TakeMatchResponse)
```

---

### Task 7: Add `requireReferee` middleware

**Files:**
- Modify: `apps/api/src/middleware/auth.ts` (add `requireReferee`)
- Test: (test via route integration tests in Task 9)

**Step 1: Add `requireReferee` middleware**

In `apps/api/src/middleware/auth.ts`, add after `requireAdmin`:

```typescript
export const requireReferee: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  if (session.user.role !== "referee" && session.user.role !== "admin") {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 3: Commit**

```
feat(api): add requireReferee middleware allowing referee and admin roles
```

---

### Task 8: Add referee match service

**Files:**
- Create: `apps/api/src/services/referee/referee-match.service.ts`
- Test: `apps/api/src/services/referee/referee-match.service.test.ts`

**Step 1: Write tests**

Create `apps/api/src/services/referee/referee-match.service.test.ts`:

Test `getMatchesWithOpenSlots`:
- Returns matches where at least one of sr1Open/sr2Open/sr3Open is true
- Excludes matches with all slots closed
- Includes own-club flags (homeIsOwnClub, guestIsOwnClub)
- Supports pagination and date/league filtering
- Includes the current user's intents for each match

Test `recordTakeIntent`:
- Creates an intent row with correct matchId, refereeId, slotNumber
- Returns the deep-link URL with the match's apiMatchId
- Returns 404 if match doesn't exist
- Returns 400 if the slot is not open
- Returns 409 if intent already exists (upsert — returns existing)

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- --testPathPattern=referee-match.service`

**Step 3: Implement the service**

Create `apps/api/src/services/referee/referee-match.service.ts`:

```typescript
import { db } from "../../config/database";
import {
  matches,
  teams,
  leagues,
  venues,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import { eq, or, and, sql, asc, gte, lte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  RefereeMatchListItem,
  TakeMatchResponse,
  PaginatedResponse,
} from "@dragons/shared";

const homeTeam = alias(teams, "homeTeam");
const guestTeam = alias(teams, "guestTeam");

export interface OpenMatchListParams {
  limit: number;
  offset: number;
  leagueId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export async function getMatchesWithOpenSlots(
  params: OpenMatchListParams,
  refereeId: number,
): Promise<PaginatedResponse<RefereeMatchListItem>> {
  const { limit, offset, leagueId, dateFrom, dateTo } = params;

  const conditions = [
    or(
      eq(matches.sr1Open, true),
      eq(matches.sr2Open, true),
      eq(matches.sr3Open, true),
    )!,
  ];

  if (leagueId) conditions.push(eq(matches.leagueId, leagueId));
  if (dateFrom) conditions.push(gte(matches.kickoffDate, dateFrom));
  if (dateTo) conditions.push(lte(matches.kickoffDate, dateTo));

  const whereClause = and(...conditions)!;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: matches.id,
        apiMatchId: matches.apiMatchId,
        matchNo: matches.matchNo,
        kickoffDate: matches.kickoffDate,
        kickoffTime: matches.kickoffTime,
        homeTeamName: homeTeam.name,
        guestTeamName: guestTeam.name,
        homeIsOwnClub: homeTeam.isOwnClub,
        guestIsOwnClub: guestTeam.isOwnClub,
        leagueName: leagues.name,
        venueName: venues.name,
        venueCity: venues.city,
        sr1Open: matches.sr1Open,
        sr2Open: matches.sr2Open,
        sr3Open: matches.sr3Open,
      })
      .from(matches)
      .innerJoin(homeTeam, eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId))
      .innerJoin(guestTeam, eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId))
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(whereClause)
      .orderBy(asc(matches.kickoffDate), asc(matches.kickoffTime))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matches)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Load this referee's intents for these matches
  const matchIds = rows.map((r) => r.id);
  const intents = matchIds.length > 0
    ? await db
        .select({
          matchId: refereeAssignmentIntents.matchId,
          slotNumber: refereeAssignmentIntents.slotNumber,
          clickedAt: refereeAssignmentIntents.clickedAt,
          confirmedBySyncAt: refereeAssignmentIntents.confirmedBySyncAt,
        })
        .from(refereeAssignmentIntents)
        .where(
          and(
            inArray(refereeAssignmentIntents.matchId, matchIds),
            eq(refereeAssignmentIntents.refereeId, refereeId),
          ),
        )
    : [];

  const intentsByMatch = new Map<number, RefereeMatchListItem["myIntents"]>();
  for (const i of intents) {
    const existing = intentsByMatch.get(i.matchId) ?? [];
    existing.push({
      slotNumber: i.slotNumber,
      clickedAt: i.clickedAt.toISOString(),
      confirmedBySyncAt: i.confirmedBySyncAt?.toISOString() ?? null,
    });
    intentsByMatch.set(i.matchId, existing);
  }

  const items: RefereeMatchListItem[] = rows.map((row) => ({
    id: row.id,
    apiMatchId: row.apiMatchId,
    matchNo: row.matchNo,
    kickoffDate: row.kickoffDate,
    kickoffTime: row.kickoffTime,
    homeTeamName: row.homeTeamName,
    guestTeamName: row.guestTeamName,
    homeIsOwnClub: row.homeIsOwnClub ?? false,
    guestIsOwnClub: row.guestIsOwnClub ?? false,
    leagueName: row.leagueName,
    venueName: row.venueName,
    venueCity: row.venueCity,
    sr1Open: row.sr1Open,
    sr2Open: row.sr2Open,
    sr3Open: row.sr3Open,
    myIntents: intentsByMatch.get(row.id) ?? [],
  }));

  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

export async function recordTakeIntent(
  matchId: number,
  refereeId: number,
  slotNumber: number,
): Promise<TakeMatchResponse | { error: string; status: number }> {
  const [match] = await db
    .select({
      id: matches.id,
      apiMatchId: matches.apiMatchId,
      sr1Open: matches.sr1Open,
      sr2Open: matches.sr2Open,
      sr3Open: matches.sr3Open,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return { error: "Match not found", status: 404 };
  }

  const slotOpen =
    (slotNumber === 1 && match.sr1Open) ||
    (slotNumber === 2 && match.sr2Open) ||
    (slotNumber === 3 && match.sr3Open);

  if (!slotOpen) {
    return { error: "This referee slot is not open", status: 400 };
  }

  const now = new Date();
  const [intent] = await db
    .insert(refereeAssignmentIntents)
    .values({
      matchId,
      refereeId,
      slotNumber,
      clickedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        refereeAssignmentIntents.matchId,
        refereeAssignmentIntents.refereeId,
        refereeAssignmentIntents.slotNumber,
      ],
      set: { clickedAt: now },
    })
    .returning();

  return {
    deepLink: `https://basketball-bund.net/app.do?app=/sr/take&spielId=${match.apiMatchId}`,
    intent: {
      matchId: intent.matchId,
      slotNumber: intent.slotNumber,
      clickedAt: intent.clickedAt.toISOString(),
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- --testPathPattern=referee-match.service`

**Step 5: Run coverage**

Run: `pnpm --filter @dragons/api coverage`

**Step 6: Commit**

```
feat(api): add referee match service for open-slot browsing and take-intent recording
```

---

### Task 9: Add referee routes

**Files:**
- Create: `apps/api/src/routes/referee/match.routes.ts`
- Create: `apps/api/src/routes/referee/match.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts` (mount referee routes)

**Step 1: Write route integration tests**

Create `apps/api/src/routes/referee/match.routes.test.ts`:

Test cases:
- `GET /referee/matches` returns 401 without auth
- `GET /referee/matches` returns 403 for non-referee users
- `GET /referee/matches` returns open-slot matches for referee users
- `POST /referee/matches/:id/take` returns 401 without auth
- `POST /referee/matches/:id/take` records intent and returns deep-link
- `POST /referee/matches/:id/take` returns 400 for closed slot

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- --testPathPattern=match.routes`

**Step 3: Implement routes**

Create `apps/api/src/routes/referee/match.routes.ts`:

```typescript
import { Hono } from "hono";
import { requireReferee } from "../../middleware/auth";
import { getMatchesWithOpenSlots, recordTakeIntent } from "../../services/referee/referee-match.service";
import { db } from "../../config/database";
import { user as userTable } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

const refereeMatchRoutes = new Hono();

refereeMatchRoutes.use("/*", requireReferee);

refereeMatchRoutes.get("/matches", async (c) => {
  const sessionUser = c.get("user");

  // Look up the linked refereeId from the user table
  const [dbUser] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  if (!dbUser?.refereeId) {
    return c.json({ error: "User not linked to a referee record" }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit") || 50), 100);
  const offset = Number(c.req.query("offset") || 0);
  const leagueId = c.req.query("leagueId") ? Number(c.req.query("leagueId")) : undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const result = await getMatchesWithOpenSlots(
    { limit, offset, leagueId, dateFrom, dateTo },
    dbUser.refereeId,
  );

  return c.json(result);
});

refereeMatchRoutes.post("/matches/:id/take", async (c) => {
  const sessionUser = c.get("user");

  const [dbUser] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  if (!dbUser?.refereeId) {
    return c.json({ error: "User not linked to a referee record" }, 400);
  }

  const matchId = Number(c.req.param("id"));
  const body = await c.req.json<{ slotNumber: number }>();

  if (![1, 2, 3].includes(body.slotNumber)) {
    return c.json({ error: "slotNumber must be 1, 2, or 3" }, 400);
  }

  const result = await recordTakeIntent(matchId, dbUser.refereeId, body.slotNumber);

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 400 | 404);
  }

  return c.json(result, 201);
});

export { refereeMatchRoutes };
```

**Step 4: Mount routes**

In `apps/api/src/routes/index.ts`, add:

```typescript
import { refereeMatchRoutes } from "./referee/match.routes";
```

And mount:

```typescript
routes.route("/referee", refereeMatchRoutes);
```

**Step 5: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test`

**Step 6: Run coverage**

Run: `pnpm --filter @dragons/api coverage`

**Step 7: Commit**

```
feat(api): add /referee/matches routes for open-slot browsing and take-intent
```

---

### Task 10: Extend admin match detail with referee slot info

**Files:**
- Modify: `apps/api/src/services/admin/match-query.service.ts` (load referee slots + intents in `buildDetailResponse`)
- Test: `apps/api/src/services/admin/match-admin.service.test.ts`

**Step 1: Write test**

Add a test that verifies `getMatchDetail()` returns `refereeSlots` with correct data — slots showing assigned referees, open status, and intents.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- --testPathPattern=match-admin`

**Step 3: Implement**

In `match-query.service.ts`, extend `buildDetailResponse` to also query:
1. `matchReferees` + `referees` + `refereeRoles` for this match (assigned referees)
2. `refereeAssignmentIntents` + `referees` for this match (pending intents)
3. Combine into `refereeSlots` array on the response

Add to `buildDetailResponse`, after the booking query:

```typescript
  // Load referee assignments for this match
  const refAssignments = await client
    .select({
      refereeId: matchReferees.refereeId,
      roleId: matchReferees.roleId,
      roleName: refereeRoles.name,
      roleShortName: refereeRoles.shortName,
      firstName: referees.firstName,
      lastName: referees.lastName,
    })
    .from(matchReferees)
    .innerJoin(referees, eq(matchReferees.refereeId, referees.id))
    .innerJoin(refereeRoles, eq(matchReferees.roleId, refereeRoles.id))
    .where(eq(matchReferees.matchId, matchId));

  // Load intents for this match
  const intentsRows = await client
    .select({
      refereeId: refereeAssignmentIntents.refereeId,
      slotNumber: refereeAssignmentIntents.slotNumber,
      clickedAt: refereeAssignmentIntents.clickedAt,
      confirmedBySyncAt: refereeAssignmentIntents.confirmedBySyncAt,
      firstName: referees.firstName,
      lastName: referees.lastName,
    })
    .from(refereeAssignmentIntents)
    .innerJoin(referees, eq(refereeAssignmentIntents.refereeId, referees.id))
    .where(eq(refereeAssignmentIntents.matchId, matchId));
```

Then build the `refereeSlots` array for slots 1-3 using the match's `sr1Open`/`sr2Open`/`sr3Open` flags and the loaded data.

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test`

**Step 5: Commit**

```
feat(api): include refereeSlots in admin match detail response
```

---

### Task 11: Add referee matches page (frontend)

**Files:**
- Create: `apps/web/src/app/referee/layout.tsx`
- Create: `apps/web/src/app/referee/matches/page.tsx`
- Create: `apps/web/src/components/referee/referee-match-list.tsx`

**Step 1: Create referee layout**

Create `apps/web/src/app/referee/layout.tsx` — simplified layout for referee users with just the matches view and profile link in the header.

**Step 2: Create referee matches page**

Create `apps/web/src/app/referee/matches/page.tsx` — server component that renders the `RefereeMatchList` client component.

**Step 3: Create RefereeMatchList component**

Create `apps/web/src/components/referee/referee-match-list.tsx`:

- Use SWR to fetch `GET /referee/matches` with pagination
- Table columns: Date, Time, Home vs Guest, League, Venue, SR1/SR2/SR3 (open/closed indicators), Action
- Own club matches highlighted with a subtle background or badge
- Each open slot shows an "Übernehmen" button
- Slots where this referee already clicked show "Beantragt" with timestamp
- Confirmed intents show a checkmark
- Clicking "Übernehmen":
  1. Calls `POST /referee/matches/:id/take` with `{ slotNumber }`
  2. Opens the returned `deepLink` URL via `window.open(url, '_blank')`
  3. Mutates SWR cache to show the intent immediately
- Filters: date range (date picker), league (select)

**Step 4: Verify it builds**

Run: `pnpm --filter @dragons/web build`

**Step 5: Commit**

```
feat(web): add /referee/matches page with open-slot browsing and Übernehmen deep-link
```

---

### Task 12: Extend admin match detail with referee section (frontend)

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-detail-view.tsx` (add Schiedsrichter section)

**Step 1: Add referee slots section**

In `match-detail-view.tsx`, add a new card section "Schiedsrichter" that displays:
- 3 rows, one per slot (SR1, SR2, SR3)
- Each shows: role name, assigned referee name (if any), open badge (if open), intent info (if someone clicked Übernehmen)
- Use Badge from `@dragons/ui` for status indicators

**Step 2: Verify it builds**

Run: `pnpm --filter @dragons/web build`

**Step 3: Commit**

```
feat(web): add referee slots section to admin match detail view
```

---

### Task 13: Add referee navigation and auth guards

**Files:**
- Modify: `apps/web/src/middleware.ts` (allow referee role for `/referee/*` routes)
- Modify: `apps/web/src/app/admin/layout.tsx` or sidebar (no changes needed if referee uses separate `/referee` layout)

**Step 1: Update Next.js middleware**

In `apps/web/src/middleware.ts`, extend the auth check to allow referee-role users to access `/referee/*` paths and redirect unauthenticated users to `/auth/sign-in`.

**Step 2: Verify build**

Run: `pnpm --filter @dragons/web build`

**Step 3: Commit**

```
feat(web): add auth guards for /referee routes
```

---

### Task 14: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md` (add referee tables, endpoints, sync step)

**Step 1: Update documentation**

- Add `refereeAssignmentIntents` to the database tables section
- Add `refereeId` column to user table description
- Add `sr1Open`/`sr2Open`/`sr3Open` to matches table description
- Add `/referee/matches` and `/referee/matches/:id/take` endpoints
- Update sync pipeline to mention intent confirmation step

**Step 2: Commit**

```
docs: update AGENTS.md with referee assignment feature
```

---

### Task 15: Final verification

**Step 1: Run full lint**

Run: `pnpm lint`

**Step 2: Run full typecheck**

Run: `pnpm typecheck`

**Step 3: Run full test suite with coverage**

Run: `pnpm coverage`

**Step 4: Run build**

Run: `pnpm build`

**Step 5: Commit any fixes needed**

```
fix: address lint/type/test issues from referee assignment feature
```
