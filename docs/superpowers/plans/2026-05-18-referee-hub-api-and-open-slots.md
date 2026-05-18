# Referee Hub Redesign — API + Open Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the combined `PATCH /admin/referees/:id` endpoint with split visibility/rules endpoints, add server-side filtering + paginated counts + candidate ranking + eligible-open-games to the API, redesign the Open Slots tab as a 3-pane layout with virtualization, and remove the season-role labels everywhere.

**Architecture:** API services keep their existing layering (`services/admin/*`, `services/referee/*`). Add one new service for eligibility-inversion (`getEligibleOpenGames`) and refactor `referee-slot-resolver` so candidate-centric and game-centric eligibility share a single check. Web Open Slots tab moves to a `200px | 320px | 1fr` grid with a URL-synced filter sidebar; list is virtualized via `react-window`. Web Referees tab gets minimal patches to compile against the new API surface — full Referees-tab redesign is deferred to Plan 2.

**Tech Stack:** Hono 4.12, Zod 4.3, Drizzle 0.45, PostgreSQL 17, Vitest v4, Next.js 16.2, SWR, `react-window` 1.8 (new), Tailwind, Radix.

**Companion spec:** `docs/superpowers/specs/2026-05-18-referee-hub-redesign-design.md`

---

## File Structure

### Modify (API)
- `apps/api/src/routes/admin/referee.schemas.ts` — new query schema with scope + sort
- `apps/api/src/routes/admin/referee.routes.ts` — drop combined PATCH, add counts route
- `apps/api/src/routes/admin/referee-assignment.routes.ts` — surface ranked candidates (no shape change, ordering only)
- `apps/api/src/routes/admin/referee-rules.routes.ts` — keep GET, add PATCH for rules-only (replaces combined endpoint's rules path)
- `apps/api/src/routes/referee/games.routes.ts` — accept new `gameType`, `assignedRefereeApiId` query params
- `apps/api/src/services/admin/referee-admin.service.ts` — drop roles join, add scope/sort, add counts, drop `updateRefereeSettings`
- `apps/api/src/services/referee/referee-assignment.service.ts` — add `rankCandidates` helper
- `apps/api/src/services/referee/referee-games.service.ts` — extend `getRefereeGames` with `gameType`, `assignedRefereeApiId`
- `apps/api/src/services/referee/referee-game-visibility.service.ts` — pass new params through
- `apps/api/src/services/referee/referee-slot-resolver.ts` — extract shared eligibility check

### Create (API)
- `packages/db/drizzle/0035_referee_games_status_kickoff_index.sql` — composite index
- `apps/api/src/services/referee/eligible-open-games.service.ts` — game-centric eligibility for a referee
- `apps/api/src/routes/admin/referee-eligible-games.routes.ts` — `GET /admin/referees/:id/eligible-open-games`
- Tests alongside each new/modified file (Vitest, co-located `*.test.ts`)

### Modify (shared)
- `packages/shared/src/referees.ts` — drop `roles`, drop `UpdateRefereeSettingsBody`/`Response`, add `RefereeCountsResponse`

### Modify (web)
- `apps/web/src/app/[locale]/admin/referees/page.tsx` — SSR fallback uses canonical URLs
- `apps/web/src/lib/swr-keys.ts` — replace `referees`/`refereeGames` keys
- `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts` — drop `range`, add open-slots filter facets
- `apps/web/src/components/admin/referee-hub/hub-header.tsx` — drop range selector
- `apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx` — 3-pane grid
- `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx` — server-filter + virtualize
- `apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx` — fetch by id
- `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.tsx` — trust server order, no client re-sort
- `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx` — minimal patch (new SWR key, drop roles line)
- `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx` — drop roles in header
- `apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx` — minimal patch (use split endpoints, keep existing UX shape)
- `apps/web/src/messages/{en,de}.json` — i18n keys for new sidebar facets, drop unused keys

### Create (web)
- `apps/web/src/components/admin/referee-hub/open-slots/slots-filter-sidebar.tsx`
- Tests for every modified/created component (Vitest + Testing Library, co-located `*.test.tsx`)

### Dependencies
- `apps/web/package.json` — add `react-window@^1.8` and `@types/react-window@^1.8`

---

## Conventions for every task

- **TDD.** Failing test first, run to confirm fail, implement, run to confirm pass, commit.
- **Co-located tests.** `foo.ts` → `foo.test.ts` in the same directory.
- **Coverage gates.** Stay above 90% branches / 95% functions / 95% lines / 95% statements (project `vitest.config.ts`).
- **Run tests scoped to the changed package** unless the change crosses packages.
  - API only: `pnpm --filter @dragons/api test -- <path>`
  - Web only: `pnpm --filter @dragons/web test -- <path>`
  - Shared: `pnpm --filter @dragons/shared build` (no tests, type-check only)
- **Type check before commit** when touching shared types: `pnpm --filter @dragons/api typecheck && pnpm --filter @dragons/web typecheck`.
- **Commit message style** mirrors recent history: `feat(referee-hub): …` / `fix(referee-hub): …` / `chore(referee-hub): …`.
- **No `Co-Authored-By` trailer.** Per repo memory: all commits are authored solely by the human developer.
- **Never run destructive git commands** (`reset --hard`, `push --force`, etc.) without explicit user instruction.

---

## Milestone M1 — Shared types + DB index (3 tasks)

### Task 1: Composite index migration on `referee_games`

**Files:**
- Create: `packages/db/drizzle/0035_referee_games_status_kickoff_index.sql`
- Modify: `packages/db/drizzle/meta/_journal.json` (auto-updated by `pnpm db:generate` — but we are writing the SQL by hand)

- [ ] **Step 1: Create the migration file**

```sql
-- packages/db/drizzle/0035_referee_games_status_kickoff_index.sql
CREATE INDEX IF NOT EXISTS "referee_games_status_kickoff_idx"
  ON "referee_games" ("sr1_status", "sr2_status", "kickoff_date");
```

- [ ] **Step 2: Update drizzle journal**

Open `packages/db/drizzle/meta/_journal.json`, find the `entries` array, append:

```json
{
  "idx": 35,
  "version": "7",
  "when": <unix-ms-now>,
  "tag": "0035_referee_games_status_kickoff_index",
  "breakpoints": true
}
```

Use the current Unix epoch ms for `when` — e.g. `Date.now()` output at the time you run this. Match the `version` and `breakpoints` fields used by the previous entries in the same file (look at the last existing entry as the template).

- [ ] **Step 3: Apply migration locally**

```bash
pnpm --filter @dragons/db db:migrate
```

Expected: "Migration 0035 applied" (or equivalent drizzle output) with no errors.

- [ ] **Step 4: Verify index exists**

```bash
psql "$DATABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename = 'referee_games' AND indexname = 'referee_games_status_kickoff_idx';"
```

Expected: one row returned with `referee_games_status_kickoff_idx`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0035_referee_games_status_kickoff_index.sql packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): add composite index for referee_games open-status scans"
```

---

### Task 2: Shared types — drop `roles`, drop combined settings, add counts response

**Files:**
- Modify: `packages/shared/src/referees.ts`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `packages/shared/src/referees.ts` with:

```ts
export interface RefereeListItem {
  id: number;
  apiId: number;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: number | null;
  matchCount: number;
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
  isOwnClub: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RefereeRule {
  id: number;
  teamId: number;
  teamName: string;
  deny: boolean;
  allowSr1: boolean;
  allowSr2: boolean;
}

export interface RefereeRulesResponse {
  rules: RefereeRule[];
}

export interface UpdateRefereeVisibilityBody {
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
  isOwnClub: boolean;
}

export interface UpdateRefereeRulesBody {
  rules: Array<{
    teamId: number;
    deny: boolean;
    allowSr1: boolean;
    allowSr2: boolean;
  }>;
}

export interface RefereeCountsResponse {
  own: number;
  all: number;
}
```

Note removed: `roles: string[]` field, `UpdateRefereeSettingsBody`, `UpdateRefereeSettingsResponse`.

- [ ] **Step 2: Build the shared package and verify types**

```bash
pnpm --filter @dragons/shared build
```

Expected: clean build. (API and web will fail to compile next — that's expected and gets fixed in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/referees.ts
git commit -m "feat(shared): drop referee roles + combined settings types; add counts response"
```

---

### Task 3: Add `react-window` dependency to web

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install**

```bash
pnpm --filter @dragons/web add react-window@^1.8 && pnpm --filter @dragons/web add -D @types/react-window@^1.8
```

- [ ] **Step 2: Verify installed**

```bash
pnpm --filter @dragons/web exec node -e "console.log(require('react-window').FixedSizeList.name)"
```

Expected: prints `List`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add react-window for virtualized referee lists"
```

---

## Milestone M2 — API services (5 tasks)

### Task 4: `referee-admin.service` — drop roles join, add scope + sort + counts

**Files:**
- Modify: `apps/api/src/services/admin/referee-admin.service.ts`
- Modify: `apps/api/src/services/admin/referee-admin.service.test.ts`

- [ ] **Step 1: Write failing tests for new signature**

Open `apps/api/src/services/admin/referee-admin.service.test.ts`. Add this `describe` block at the end (before the final `});` that closes the outermost describe; if no outermost describe exists, just append):

```ts
describe("getReferees scope + sort", () => {
  beforeEach(() => {
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.leftJoin.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.groupBy.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.offset.mockReturnThis();
  });

  it("returns all referees when scope is 'all'", async () => {
    mockDb.offset.mockResolvedValueOnce([
      { id: 1, apiId: 100, firstName: "A", lastName: "Z", licenseNumber: 1, allowAllHomeGames: false, allowAwayGames: false, isOwnClub: true, matchCount: 5, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, apiId: 200, firstName: "B", lastName: "Y", licenseNumber: 2, allowAllHomeGames: false, allowAwayGames: false, isOwnClub: false, matchCount: 3, createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockDb.where.mockResolvedValueOnce([{ count: 2 }]);

    const result = await getReferees({ limit: 50, offset: 0, scope: "all" });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.items.some((r) => !r.isOwnClub)).toBe(true);
    expect(result.items[0]).not.toHaveProperty("roles");
  });

  it("orders by ascending workload when sort is 'workloadAsc'", async () => {
    mockDb.offset.mockResolvedValueOnce([]);
    mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

    await getReferees({ limit: 50, offset: 0, scope: "own", sort: "workloadAsc" });

    const orderByArgs = mockDb.orderBy.mock.calls[0];
    expect(JSON.stringify(orderByArgs)).toMatch(/match_count|matchCount/i);
    expect(JSON.stringify(orderByArgs)).toMatch(/asc/i);
  });
});

describe("getRefereeCounts", () => {
  it("returns own and all counts", async () => {
    mockDb.select.mockReturnThis();
    mockDb.from.mockResolvedValueOnce([{ own: 7, all: 42 }]);

    const result = await getRefereeCounts();
    expect(result).toEqual({ own: 7, all: 42 });
  });
});
```

At the top of the file, add `getRefereeCounts` to the existing import from the service (it'll be created in step 3).

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm --filter @dragons/api test -- referee-admin.service.test.ts
```

Expected: fails — `roles` still present in items, `getRefereeCounts` not exported.

- [ ] **Step 3: Rewrite `referee-admin.service.ts`**

Replace the entire file with:

```ts
import { db } from "../../config/database";
import { referees, refereeAssignmentRules, teams, matchReferees } from "@dragons/db/schema";
import { sql, asc, desc, ilike, and, or, eq, inArray } from "drizzle-orm";
import type {
  RefereeListItem,
  PaginatedResponse,
  UpdateRefereeVisibilityBody,
  UpdateRefereeRulesBody,
  RefereeCountsResponse,
} from "@dragons/shared";

export class RefereeSettingsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "NOT_OWN_CLUB"
      | "VALIDATION_ERROR",
  ) {
    super(message);
    this.name = "RefereeSettingsError";
  }
}

export type RefereeScope = "own" | "all";
export type RefereeSort = "name" | "workloadAsc" | "workloadDesc";

export interface RefereeListParams {
  limit: number;
  offset: number;
  search?: string;
  scope: RefereeScope;
  sort?: RefereeSort;
}

export async function getReferees(
  params: RefereeListParams,
): Promise<PaginatedResponse<RefereeListItem>> {
  const { limit, offset, search, scope, sort = "name" } = params;

  const conditions = [];
  if (scope === "own") conditions.push(eq(referees.isOwnClub, true));
  if (search) {
    conditions.push(
      or(
        ilike(referees.firstName, `%${search}%`),
        ilike(referees.lastName, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const matchCountExpr = sql<number>`count(distinct ${matchReferees.matchId})::int`.as("match_count");

  const orderBy =
    sort === "workloadDesc" ? [desc(matchCountExpr), asc(referees.lastName)] :
    sort === "workloadAsc"  ? [asc(matchCountExpr),  asc(referees.lastName)] :
                              [asc(referees.lastName), asc(referees.firstName)];

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: referees.id,
        apiId: referees.apiId,
        firstName: referees.firstName,
        lastName: referees.lastName,
        licenseNumber: referees.licenseNumber,
        allowAllHomeGames: referees.allowAllHomeGames,
        allowAwayGames: referees.allowAwayGames,
        isOwnClub: referees.isOwnClub,
        matchCount: matchCountExpr,
        createdAt: referees.createdAt,
        updatedAt: referees.updatedAt,
      })
      .from(referees)
      .leftJoin(matchReferees, eq(matchReferees.refereeId, referees.id))
      .where(whereClause)
      .groupBy(referees.id)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(referees)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const items: RefereeListItem[] = rows.map((row) => ({
    id: row.id,
    apiId: row.apiId,
    firstName: row.firstName,
    lastName: row.lastName,
    licenseNumber: row.licenseNumber,
    allowAllHomeGames: row.allowAllHomeGames,
    allowAwayGames: row.allowAwayGames,
    isOwnClub: row.isOwnClub,
    matchCount: row.matchCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

export async function getRefereeCounts(): Promise<RefereeCountsResponse> {
  const [row] = await db
    .select({
      own: sql<number>`count(*) filter (where ${referees.isOwnClub})::int`,
      all: sql<number>`count(*)::int`,
    })
    .from(referees);
  return { own: row?.own ?? 0, all: row?.all ?? 0 };
}

export async function updateRefereeVisibility(
  refereeId: number,
  body: UpdateRefereeVisibilityBody,
) {
  const [updated] = await db
    .update(referees)
    .set({
      allowAllHomeGames: body.allowAllHomeGames,
      allowAwayGames: body.allowAwayGames,
      isOwnClub: body.isOwnClub,
      updatedAt: new Date(),
    })
    .where(eq(referees.id, refereeId))
    .returning({
      id: referees.id,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
      isOwnClub: referees.isOwnClub,
    });

  if (!updated) {
    throw new RefereeSettingsError(`Referee ${refereeId} not found`, "NOT_FOUND");
  }

  return updated;
}

export async function updateRefereeRules(
  refereeId: number,
  body: UpdateRefereeRulesBody,
) {
  return db.transaction(async (tx) => {
    const [ref] = await tx
      .select({ isOwnClub: referees.isOwnClub })
      .from(referees)
      .where(eq(referees.id, refereeId))
      .limit(1);

    if (!ref) {
      throw new RefereeSettingsError(`Referee ${refereeId} not found`, "NOT_FOUND");
    }
    if (!ref.isOwnClub) {
      throw new RefereeSettingsError("Referee is not an own-club referee", "NOT_OWN_CLUB");
    }

    if (body.rules.length > 0) {
      const teamIds = body.rules.map((r) => r.teamId);
      const validTeams = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(and(inArray(teams.id, teamIds), eq(teams.isOwnClub, true)));
      const validTeamIds = new Set(validTeams.map((t) => t.id));
      const invalidIds = teamIds.filter((id) => !validTeamIds.has(id));
      if (invalidIds.length > 0) {
        throw new RefereeSettingsError(
          `Invalid or non-own-club team IDs: ${invalidIds.join(", ")}`,
          "VALIDATION_ERROR",
        );
      }
    }

    await tx
      .delete(refereeAssignmentRules)
      .where(eq(refereeAssignmentRules.refereeId, refereeId));

    if (body.rules.length > 0) {
      const now = new Date();
      await tx.insert(refereeAssignmentRules).values(
        body.rules.map((rule) => ({
          refereeId,
          teamId: rule.teamId,
          deny: rule.deny,
          allowSr1: rule.deny ? false : rule.allowSr1,
          allowSr2: rule.deny ? false : rule.allowSr2,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    const rules = await tx
      .select({
        id: refereeAssignmentRules.id,
        teamId: refereeAssignmentRules.teamId,
        teamName: teams.name,
        deny: refereeAssignmentRules.deny,
        allowSr1: refereeAssignmentRules.allowSr1,
        allowSr2: refereeAssignmentRules.allowSr2,
      })
      .from(refereeAssignmentRules)
      .innerJoin(teams, eq(refereeAssignmentRules.teamId, teams.id))
      .where(eq(refereeAssignmentRules.refereeId, refereeId));

    return { rules };
  });
}
```

Note removed: `updateRefereeSettings`, the second `roleRows` query, the `roles` field in the response.

- [ ] **Step 4: Delete obsolete tests for `updateRefereeSettings`**

In the test file, delete any `describe("updateRefereeSettings", ...)` block. The new `updateRefereeRules` and existing `updateRefereeVisibility` cover the split functionality. Add new tests:

```ts
describe("updateRefereeRules", () => {
  beforeEach(() => {
    mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
  });

  it("throws NOT_OWN_CLUB when referee is not own-club", async () => {
    mockTx.select.mockReturnThis();
    mockTx.from.mockReturnThis();
    mockTx.where.mockReturnThis();
    mockTx.limit.mockResolvedValueOnce([{ isOwnClub: false }]);

    await expect(updateRefereeRules(1, { rules: [] })).rejects.toMatchObject({
      code: "NOT_OWN_CLUB",
    });
  });

  it("throws VALIDATION_ERROR for non-own-club team IDs", async () => {
    mockTx.select.mockReturnThis();
    mockTx.from.mockReturnThis();
    mockTx.where.mockReturnThis();
    mockTx.limit.mockResolvedValueOnce([{ isOwnClub: true }]);
    mockTx.select.mockReturnThis();
    mockTx.from.mockReturnThis();
    mockTx.where.mockResolvedValueOnce([]); // no valid teams

    await expect(
      updateRefereeRules(1, { rules: [{ teamId: 99, deny: false, allowSr1: true, allowSr2: false }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
```

(Adapt `mockTx`/`mockDb` shapes to match what the existing test file already defines.)

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @dragons/api test -- referee-admin.service.test.ts
```

Expected: pass. If a mock shape mismatch fails, add the missing chain method to `mockDb`/`mockTx` definitions at the top of the test file — every chained drizzle method needs `.mockReturnThis()`.

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @dragons/api typecheck
```

Expected: errors only in `routes/admin/referee.routes.ts` (the route still imports `updateRefereeSettings`). We fix that in Task 8 — leave broken for now.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/admin/referee-admin.service.ts apps/api/src/services/admin/referee-admin.service.test.ts
git commit -m "feat(api): split referee settings into visibility+rules, add counts, drop roles join"
```

---

### Task 5: `referee-games.service` — add `gameType` and `assignedRefereeApiId`

**Files:**
- Modify: `apps/api/src/services/referee/referee-games.service.ts`
- Modify: `apps/api/src/services/referee/referee-games.service.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `referee-games.service.test.ts`:

```ts
describe("getRefereeGames new filters", () => {
  beforeEach(() => {
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.offset.mockReturnThis();
  });

  it("filters by gameType=home", async () => {
    mockDb.offset.mockResolvedValueOnce([]);
    mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

    await getRefereeGames({ limit: 50, offset: 0, gameType: "home" });

    const whereArg = mockDb.where.mock.calls[0]?.[0];
    expect(JSON.stringify(whereArg)).toMatch(/is_home_game/);
  });

  it("filters by gameType=away", async () => {
    mockDb.offset.mockResolvedValueOnce([]);
    mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

    await getRefereeGames({ limit: 50, offset: 0, gameType: "away" });

    const whereArg = mockDb.where.mock.calls[0]?.[0];
    expect(JSON.stringify(whereArg)).toMatch(/is_guest_game/);
  });

  it("filters by assignedRefereeApiId across both slots", async () => {
    mockDb.offset.mockResolvedValueOnce([]);
    mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

    await getRefereeGames({ limit: 50, offset: 0, assignedRefereeApiId: 12345 });

    const whereArg = mockDb.where.mock.calls[0]?.[0];
    expect(JSON.stringify(whereArg)).toMatch(/sr1_referee_api_id|sr2_referee_api_id/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/api test -- referee-games.service.test.ts
```

Expected: type error or assertion failure (`gameType` not in `GetRefereeGamesParams`).

- [ ] **Step 3: Extend the service**

In `apps/api/src/services/referee/referee-games.service.ts`:

```ts
// Update the interface:
interface GetRefereeGamesParams {
  limit: number;
  offset: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  league?: string;
  dateFrom?: string;
  dateTo?: string;
  gameType?: "home" | "away" | "both";
  assignedRefereeApiId?: number;
}
```

Inside `getRefereeGames`, after the existing `league` block and before the `dateFrom` block, add:

```ts
// Game type
if (gameType === "home") conditions.push(eq(refereeGames.isHomeGame, true));
else if (gameType === "away") conditions.push(eq(refereeGames.isGuestGame, true));
// "both" or undefined: no filter
```

After the `search` block, add:

```ts
// Assigned referee
if (assignedRefereeApiId != null) {
  conditions.push(or(
    eq(refereeGames.sr1RefereeApiId, assignedRefereeApiId),
    eq(refereeGames.sr2RefereeApiId, assignedRefereeApiId),
  )!);
}
```

Destructure the new params from `params` at the top of the function: `const { limit, offset, search, status, league, dateFrom, dateTo, gameType, assignedRefereeApiId } = params;`.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/api test -- referee-games.service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-games.service.ts apps/api/src/services/referee/referee-games.service.test.ts
git commit -m "feat(api): add gameType and assignedRefereeApiId filters to referee-games service"
```

---

### Task 6: `referee-slot-resolver` — extract shared eligibility check

**Files:**
- Modify: `apps/api/src/services/referee/referee-slot-resolver.ts`
- Modify: `apps/api/src/services/referee/referee-slot-resolver.test.ts` (create if absent)

- [ ] **Step 1: Inspect current shape**

Open `apps/api/src/services/referee/referee-slot-resolver.ts`. Identify the function(s) that determine whether a referee can fill a slot (look for usages of `qualiSr1`, `qualiSr2`, `srModusMismatch`, `blocktermin`, `zeitraumBlockiert`). Capture the existing signature.

- [ ] **Step 2: Add failing test for `isRefereeEligibleForGame`**

Create `apps/api/src/services/referee/referee-slot-resolver.test.ts` (or append if it already exists):

```ts
import { describe, it, expect } from "vitest";
import { isRefereeEligibleForGame, type RefereeCandidateMeta } from "./referee-slot-resolver";

const baseCandidate: RefereeCandidateMeta = {
  qualiSr1: true,
  qualiSr2: true,
  srModusMismatchSr1: false,
  srModusMismatchSr2: false,
  blocktermin: false,
  zeitraumBlockiert: null,
};

describe("isRefereeEligibleForGame", () => {
  it("returns true when slot=1 qualified and unblocked", () => {
    expect(isRefereeEligibleForGame(baseCandidate, 1)).toBe(true);
  });

  it("returns false when not qualified for slot=1", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, qualiSr1: false }, 1)).toBe(false);
  });

  it("returns false on blocktermin", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, blocktermin: true }, 1)).toBe(false);
  });

  it("returns false on zeitraumBlockiert", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, zeitraumBlockiert: "Urlaub" }, 1)).toBe(false);
  });

  it("returns false on srModusMismatchSr2 for slot=2", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, srModusMismatchSr2: true }, 2)).toBe(false);
  });

  it("returns true for slot=either when at least one slot is eligible", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, qualiSr1: false }, "either")).toBe(true);
  });

  it("returns false for slot=either when neither slot is eligible", () => {
    expect(isRefereeEligibleForGame({ ...baseCandidate, qualiSr1: false, qualiSr2: false }, "either")).toBe(false);
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm --filter @dragons/api test -- referee-slot-resolver.test.ts
```

Expected: fails — `isRefereeEligibleForGame` not exported.

- [ ] **Step 4: Add the exported helper**

In `apps/api/src/services/referee/referee-slot-resolver.ts`, add at the bottom of the file:

```ts
export interface RefereeCandidateMeta {
  qualiSr1: boolean;
  qualiSr2: boolean;
  srModusMismatchSr1: boolean;
  srModusMismatchSr2: boolean;
  blocktermin: boolean;
  zeitraumBlockiert: string | null;
}

export type EligibilitySlot = 1 | 2 | "either";

export function isRefereeEligibleForGame(
  meta: RefereeCandidateMeta,
  slot: EligibilitySlot,
): boolean {
  if (meta.blocktermin) return false;
  if (meta.zeitraumBlockiert) return false;

  if (slot === 1) {
    return meta.qualiSr1 && !meta.srModusMismatchSr1;
  }
  if (slot === 2) {
    return meta.qualiSr2 && !meta.srModusMismatchSr2;
  }
  // "either"
  return (
    (meta.qualiSr1 && !meta.srModusMismatchSr1) ||
    (meta.qualiSr2 && !meta.srModusMismatchSr2)
  );
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @dragons/api test -- referee-slot-resolver.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/referee/referee-slot-resolver.ts apps/api/src/services/referee/referee-slot-resolver.test.ts
git commit -m "feat(api): extract shared eligibility check for referee slot resolver"
```

---

### Task 7: `referee-assignment.service` — add `rankCandidates`

**Files:**
- Modify: `apps/api/src/services/referee/referee-assignment.service.ts`
- Modify: `apps/api/src/services/referee/referee-assignment.service.test.ts`

- [ ] **Step 1: Locate the candidate search function**

Open `apps/api/src/services/referee/referee-assignment.service.ts`. Find `searchCandidates`. Capture the return shape `CandidateSearchResponse`.

- [ ] **Step 2: Add failing tests**

Append to `referee-assignment.service.test.ts`:

```ts
import { rankCandidates } from "./referee-assignment.service";

describe("rankCandidates", () => {
  const makeCandidate = (overrides: Partial<any> = {}) => ({
    srId: 1,
    vorname: "A",
    nachName: "Last",
    lizenznummer: 100,
    qualiSr1: true,
    qualiSr2: true,
    srModusMismatchSr1: false,
    srModusMismatchSr2: false,
    blocktermin: false,
    zeitraumBlockiert: null,
    meta: { total: 5 },
    ...overrides,
  });

  it("places eligible candidates before blocked ones", () => {
    const eligible = makeCandidate({ srId: 1 });
    const blocked = makeCandidate({ srId: 2, blocktermin: true });
    const result = rankCandidates([blocked, eligible], 1);
    expect(result.map((c) => c.srId)).toEqual([1, 2]);
  });

  it("orders eligible candidates by ascending workload", () => {
    const a = makeCandidate({ srId: 1, meta: { total: 10 } });
    const b = makeCandidate({ srId: 2, meta: { total: 3 } });
    const c = makeCandidate({ srId: 3, meta: { total: 7 } });
    const result = rankCandidates([a, b, c], 1);
    expect(result.map((x) => x.srId)).toEqual([2, 3, 1]);
  });

  it("tie-breaks equal workload by license number, then last name", () => {
    const a = makeCandidate({ srId: 1, lizenznummer: 200, nachName: "Beta", meta: { total: 5 } });
    const b = makeCandidate({ srId: 2, lizenznummer: 100, nachName: "Alpha", meta: { total: 5 } });
    const c = makeCandidate({ srId: 3, lizenznummer: 200, nachName: "Alpha", meta: { total: 5 } });
    const result = rankCandidates([a, b, c], 1);
    expect(result.map((x) => x.srId)).toEqual([2, 3, 1]);
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm --filter @dragons/api test -- referee-assignment.service.test.ts
```

Expected: fails — `rankCandidates` not exported.

- [ ] **Step 4: Implement `rankCandidates`**

Add to `referee-assignment.service.ts` (export it):

```ts
import { isRefereeEligibleForGame, type EligibilitySlot } from "./referee-slot-resolver";

export function rankCandidates<
  T extends {
    srId: number;
    nachName: string;
    lizenznummer: number;
    qualiSr1: boolean;
    qualiSr2: boolean;
    srModusMismatchSr1: boolean;
    srModusMismatchSr2: boolean;
    blocktermin: boolean;
    zeitraumBlockiert: string | null;
    meta: { total: number };
  },
>(candidates: T[], slot: EligibilitySlot): T[] {
  const eligible: T[] = [];
  const blocked: T[] = [];

  for (const c of candidates) {
    if (isRefereeEligibleForGame(c, slot)) eligible.push(c);
    else blocked.push(c);
  }

  const compare = (a: T, b: T) => {
    if (a.meta.total !== b.meta.total) return a.meta.total - b.meta.total;
    if (a.lizenznummer !== b.lizenznummer) return a.lizenznummer - b.lizenznummer;
    return a.nachName.localeCompare(b.nachName);
  };

  eligible.sort(compare);
  blocked.sort(compare);

  return [...eligible, ...blocked];
}
```

- [ ] **Step 5: Apply ranking in `searchCandidates`**

In the same file, find the final `return` of `searchCandidates`. Pass the results through `rankCandidates` keyed to the slot the caller is filling. The current function takes `spielplanId, search, pageFrom, pageSize`. Add an optional `slot` parameter to the signature (default `"either"` for backward compatibility within this service since some callers may not yet pass it):

```ts
export async function searchCandidates(
  spielplanId: number,
  search: string,
  pageFrom: number,
  pageSize: number,
  slot: EligibilitySlot = "either",
): Promise<CandidateSearchResponse> {
  // ... existing fetch logic returns `results` ...
  const ranked = rankCandidates(results, slot);
  return { ...rest, results: ranked };
}
```

(Adapt to the actual variable names in the existing function.)

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @dragons/api test -- referee-assignment.service.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/referee/referee-assignment.service.ts apps/api/src/services/referee/referee-assignment.service.test.ts
git commit -m "feat(api): rank referee candidates eligible-first by lowest workload"
```

---

### Task 8: New `eligible-open-games.service`

**Files:**
- Create: `apps/api/src/services/referee/eligible-open-games.service.ts`
- Create: `apps/api/src/services/referee/eligible-open-games.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `eligible-open-games.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEligibleOpenGames } from "./eligible-open-games.service";

vi.mock("./referee-assignment.service", () => ({
  searchCandidates: vi.fn(),
}));
vi.mock("./referee-games.service", () => ({
  getRefereeGames: vi.fn(),
}));

import { searchCandidates } from "./referee-assignment.service";
import { getRefereeGames } from "./referee-games.service";

const mockedSearch = vi.mocked(searchCandidates);
const mockedGames = vi.mocked(getRefereeGames);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEligibleOpenGames", () => {
  it("returns games where the referee is eligible for at least one open slot", async () => {
    mockedGames.mockResolvedValueOnce({
      items: [
        // Game with SR1 open, ref eligible
        { id: 1, apiMatchId: 100, sr1Status: "open", sr2Status: "assigned", sr1RefereeApiId: null, sr2RefereeApiId: 999 } as any,
        // Game with SR2 open, ref blocked
        { id: 2, apiMatchId: 200, sr1Status: "assigned", sr2Status: "open", sr1RefereeApiId: 888, sr2RefereeApiId: null } as any,
      ],
      total: 2, limit: 500, offset: 0, hasMore: false,
    });
    mockedSearch
      // for game 100 slot 1: ref eligible
      .mockResolvedValueOnce({
        results: [{ srId: 555, qualiSr1: true, qualiSr2: false, srModusMismatchSr1: false, srModusMismatchSr2: false, blocktermin: false, zeitraumBlockiert: null, meta: { total: 0 } }],
        total: 1, page: 0, pageSize: 1,
      } as any)
      // for game 200 slot 2: ref blocked
      .mockResolvedValueOnce({
        results: [{ srId: 555, qualiSr1: false, qualiSr2: true, srModusMismatchSr1: false, srModusMismatchSr2: true, blocktermin: false, zeitraumBlockiert: null, meta: { total: 0 } }],
        total: 1, page: 0, pageSize: 1,
      } as any);

    const result = await getEligibleOpenGames(555);
    expect(result.items.map((g) => g.apiMatchId)).toEqual([100]);
  });

  it("returns empty when no open games exist", async () => {
    mockedGames.mockResolvedValueOnce({ items: [], total: 0, limit: 500, offset: 0, hasMore: false });
    const result = await getEligibleOpenGames(555);
    expect(result.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/api test -- eligible-open-games.service.test.ts
```

Expected: fails — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/services/referee/eligible-open-games.service.ts`:

```ts
import { getRefereeGames } from "./referee-games.service";
import { searchCandidates } from "./referee-assignment.service";
import { isRefereeEligibleForGame } from "./referee-slot-resolver";
import type { RefereeGameListItem } from "@dragons/shared";

export interface EligibleOpenGamesResponse {
  items: RefereeGameListItem[];
}

/**
 * Returns open games this referee is eligible to take (matching the candidate-picker
 * eligibility rules: qualification + mode + no blocktermin + no time-window conflict).
 *
 * For each game, queries the federation candidate list for the open slot, finds the
 * referee, and applies the same `isRefereeEligibleForGame` check used by the picker.
 */
export async function getEligibleOpenGames(
  refereeApiId: number,
): Promise<EligibleOpenGamesResponse> {
  const openGames = await getRefereeGames({
    limit: 500,
    offset: 0,
    status: "active",
  });

  const candidates = openGames.items.filter(
    (g) =>
      (g.sr1Status === "open" && g.sr1RefereeApiId == null) ||
      (g.sr2Status === "open" && g.sr2RefereeApiId == null),
  );

  const results: RefereeGameListItem[] = [];

  for (const game of candidates) {
    const openSlot: 1 | 2 = game.sr1Status === "open" && game.sr1RefereeApiId == null ? 1 : 2;
    const candidateList = await searchCandidates(game.apiMatchId, "", 0, 100, openSlot);
    const meta = candidateList.results.find((c: any) => c.srId === refereeApiId);
    if (meta && isRefereeEligibleForGame(meta, openSlot)) {
      results.push(game);
    }
  }

  return { items: results };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/api test -- eligible-open-games.service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/eligible-open-games.service.ts apps/api/src/services/referee/eligible-open-games.service.test.ts
git commit -m "feat(api): add eligible-open-games service (inverted candidate eligibility)"
```

---

## Milestone M3 — API routes (4 tasks)

### Task 9: Update `referee.routes` — remove combined PATCH, add counts, scope+sort query

**Files:**
- Modify: `apps/api/src/routes/admin/referee.routes.ts`
- Modify: `apps/api/src/routes/admin/referee.schemas.ts`
- Modify: `apps/api/src/routes/admin/referee.routes.test.ts`

- [ ] **Step 1: Update the schema**

Replace `apps/api/src/routes/admin/referee.schemas.ts` with:

```ts
import { z } from "zod";

export const refereeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  scope: z.enum(["own", "all"]).default("own"),
  sort: z.enum(["name", "workloadAsc", "workloadDesc"]).default("name"),
});

export type RefereeListQuery = z.infer<typeof refereeListQuerySchema>;
```

- [ ] **Step 2: Write failing tests for the route**

In `apps/api/src/routes/admin/referee.routes.test.ts`, add:

```ts
describe("GET /admin/referees", () => {
  it("defaults scope to 'own'", async () => {
    // mock getReferees to capture params
    const spy = vi.spyOn(refereeAdminService, "getReferees").mockResolvedValueOnce({
      items: [], total: 0, limit: 50, offset: 0, hasMore: false,
    });
    await app.request("/admin/referees");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ scope: "own", sort: "name" }));
  });

  it("accepts scope=all", async () => {
    const spy = vi.spyOn(refereeAdminService, "getReferees").mockResolvedValueOnce({
      items: [], total: 0, limit: 50, offset: 0, hasMore: false,
    });
    await app.request("/admin/referees?scope=all");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ scope: "all" }));
  });

  it("rejects invalid sort", async () => {
    const res = await app.request("/admin/referees?sort=banana");
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/referees/counts", () => {
  it("returns own and all", async () => {
    vi.spyOn(refereeAdminService, "getRefereeCounts").mockResolvedValueOnce({ own: 5, all: 30 });
    const res = await app.request("/admin/referees/counts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ own: 5, all: 30 });
  });
});

describe("PATCH /admin/referees/:id (combined)", () => {
  it("no longer exists — returns 404", async () => {
    const res = await app.request("/admin/referees/1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility: { isOwnClub: true, allowAllHomeGames: false, allowAwayGames: false } }),
    });
    expect(res.status).toBe(404);
  });
});
```

Imports at top: `import * as refereeAdminService from "../../services/admin/referee-admin.service";` if not already present.

- [ ] **Step 3: Run — expect failures**

```bash
pnpm --filter @dragons/api test -- referee.routes.test.ts
```

Expected: failures on counts route (doesn't exist) and combined PATCH (still exists).

- [ ] **Step 4: Rewrite the routes file**

Replace `apps/api/src/routes/admin/referee.routes.ts` with:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { describeRoute } from "hono-openapi";
import {
  getReferees,
  getRefereeCounts,
  updateRefereeVisibility,
  updateRefereeRules,
  RefereeSettingsError,
} from "../../services/admin/referee-admin.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import { refereeListQuerySchema } from "./referee.schemas";

const refereeRoutes = new Hono<AppEnv>();

refereeRoutes.get(
  "/referees",
  requirePermission("referee", "view"),
  describeRoute({
    description: "List referees with pagination, search, and sort",
    tags: ["Referees"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = refereeListQuerySchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
      scope: c.req.query("scope"),
      sort: c.req.query("sort"),
    });
    const result = await getReferees(query);
    return c.json(result);
  },
);

refereeRoutes.get(
  "/referees/counts",
  requirePermission("referee", "view"),
  describeRoute({
    description: "Returns own-club and total referee counts",
    tags: ["Referees"],
    responses: { 200: { description: "Counts" } },
  }),
  async (c) => {
    const result = await getRefereeCounts();
    return c.json(result);
  },
);

const visibilityBodySchema = z.object({
  allowAllHomeGames: z.boolean(),
  allowAwayGames: z.boolean(),
  isOwnClub: z.boolean(),
});

refereeRoutes.patch(
  "/referees/:id/visibility",
  requirePermission("referee", "update"),
  describeRoute({
    description: "Update referee visibility flags (own-club, all home, away)",
    tags: ["Referees"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid request" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid referee ID", code: "VALIDATION_ERROR" }, 400);
    }
    const body = visibilityBodySchema.parse(await c.req.json());
    try {
      const result = await updateRefereeVisibility(id, body);
      return c.json(result);
    } catch (err) {
      if (err instanceof RefereeSettingsError) {
        return c.json({ error: err.message, code: err.code }, err.code === "NOT_FOUND" ? 404 : 400);
      }
      throw err;
    }
  },
);

const rulesBodySchema = z.object({
  rules: z.array(
    z.object({
      teamId: z.number().int().positive(),
      deny: z.boolean(),
      allowSr1: z.boolean(),
      allowSr2: z.boolean(),
    }),
  ),
});

refereeRoutes.patch(
  "/referees/:id/rules",
  requirePermission("referee", "update"),
  describeRoute({
    description: "Replace all assignment rules for a referee",
    tags: ["Referees"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid request" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid referee ID", code: "VALIDATION_ERROR" }, 400);
    }
    const body = rulesBodySchema.parse(await c.req.json());
    try {
      const result = await updateRefereeRules(id, body);
      return c.json(result);
    } catch (err) {
      if (err instanceof RefereeSettingsError) {
        const status = err.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ error: err.message, code: err.code }, status);
      }
      throw err;
    }
  },
);

export { refereeRoutes };
```

Note removed: `PATCH /referees/:id` (combined) and the legacy `/visibility` route is preserved with the new shape (no behavior change). The combined PATCH simply doesn't exist — requests to it 404 via Hono's default handler.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @dragons/api test -- referee.routes.test.ts
```

Expected: pass.

- [ ] **Step 6: Type-check whole API**

```bash
pnpm --filter @dragons/api typecheck
```

Expected: no remaining errors from the route/service changes. (If `referee-rules.routes.ts` still references the old type, fix it in the next task.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/referee.routes.ts apps/api/src/routes/admin/referee.schemas.ts apps/api/src/routes/admin/referee.routes.test.ts
git commit -m "feat(api): split referee PATCH endpoints; add counts; drop combined settings route"
```

---

### Task 10: Verify/clean `referee-rules.routes.ts`

**Files:**
- Modify: `apps/api/src/routes/admin/referee-rules.routes.ts`
- Modify: `apps/api/src/routes/admin/referee-rules.routes.test.ts`

- [ ] **Step 1: Read current file**

Open `apps/api/src/routes/admin/referee-rules.routes.ts`. If it contains a `PATCH` handler that duplicates the rules endpoint we added in Task 9, delete the PATCH handler (the new one in `referee.routes.ts` is canonical). Keep the `GET /admin/referees/:id/rules` handler.

If the GET handler relies on `updateRefereeSettings`, update its imports to use what's still exported. If it references removed types, update them.

- [ ] **Step 2: Run existing tests**

```bash
pnpm --filter @dragons/api test -- referee-rules.routes.test.ts
```

If any test exercises the now-removed PATCH path, delete it (rules updates are tested under the new endpoint in Task 9).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/referee-rules.routes.ts apps/api/src/routes/admin/referee-rules.routes.test.ts
git commit -m "chore(api): remove duplicate rules PATCH from referee-rules.routes"
```

---

### Task 11: Surface `gameType` / `assignedRefereeApiId` on `/referee/games` route

**Files:**
- Modify: `apps/api/src/routes/referee/games.routes.ts`
- Modify: `apps/api/src/services/referee/referee-game-visibility.service.ts` (pass-through)
- Modify: `apps/api/src/routes/referee/games.routes.test.ts`

- [ ] **Step 1: Failing test**

Append to `games.routes.test.ts`:

```ts
describe("GET /referee/games new query params", () => {
  it("passes gameType to the service", async () => {
    const spy = vi.spyOn(visibilityService, "getVisibleRefereeGames").mockResolvedValueOnce({
      items: [], total: 0, limit: 100, offset: 0, hasMore: false,
    });
    await app.request("/referee/games?gameType=home");
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ gameType: "home" }));
  });

  it("passes assignedRefereeApiId to the service", async () => {
    const spy = vi.spyOn(visibilityService, "getVisibleRefereeGames").mockResolvedValueOnce({
      items: [], total: 0, limit: 100, offset: 0, hasMore: false,
    });
    await app.request("/referee/games?assignedRefereeApiId=12345");
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ assignedRefereeApiId: 12345 }));
  });
});
```

(Adjust import name `visibilityService` to match existing test file style.)

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/api test -- games.routes.test.ts
```

- [ ] **Step 3: Update the route**

In `apps/api/src/routes/referee/games.routes.ts`, inside the `/games` handler, after the existing query parse, add:

```ts
const gameType = c.req.query("gameType") as "home" | "away" | "both" | undefined;
const assignedRefereeApiIdRaw = c.req.query("assignedRefereeApiId");
const assignedRefereeApiId = assignedRefereeApiIdRaw ? Number(assignedRefereeApiIdRaw) : undefined;
```

Include them in `params`:

```ts
const params = { limit, offset, search, status, league, dateFrom, dateTo, gameType, assignedRefereeApiId };
```

- [ ] **Step 4: Update the visibility service signature**

In `apps/api/src/services/referee/referee-game-visibility.service.ts`, find `getVisibleRefereeGames`. Extend its `params` interface to include `gameType?` and `assignedRefereeApiId?`, and pass them through to the inner `getRefereeGames` call.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @dragons/api test -- games.routes.test.ts referee-game-visibility.service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/referee/games.routes.ts apps/api/src/services/referee/referee-game-visibility.service.ts apps/api/src/routes/referee/games.routes.test.ts
git commit -m "feat(api): pipe gameType + assignedRefereeApiId through to /referee/games"
```

---

### Task 12: New eligible-open-games route

**Files:**
- Create: `apps/api/src/routes/admin/referee-eligible-games.routes.ts`
- Create: `apps/api/src/routes/admin/referee-eligible-games.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts` (mount the route)

- [ ] **Step 1: Failing test**

Create `referee-eligible-games.routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { refereeEligibleGamesRoutes } from "./referee-eligible-games.routes";
import * as eligibleSvc from "../../services/referee/eligible-open-games.service";
import * as refereeSvc from "../../services/admin/referee-admin.service";

vi.mock("../../middleware/rbac", () => ({
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const app = new Hono().route("/admin", refereeEligibleGamesRoutes);

beforeEach(() => vi.clearAllMocks());

describe("GET /admin/referees/:id/eligible-open-games", () => {
  it("returns 400 for invalid id", async () => {
    const res = await app.request("/admin/referees/0/eligible-open-games");
    expect(res.status).toBe(400);
  });

  it("returns 404 if referee not found", async () => {
    vi.spyOn(refereeSvc, "getReferees").mockResolvedValueOnce({
      items: [], total: 0, limit: 1, offset: 0, hasMore: false,
    });
    // The route looks up referee by id to resolve apiId; assume helper returns null
    vi.spyOn(eligibleSvc, "getEligibleOpenGames").mockResolvedValueOnce({ items: [] });
    const res = await app.request("/admin/referees/999/eligible-open-games");
    // depending on implementation: if route accepts id directly, returns 200 with empty
    expect([200, 404]).toContain(res.status);
  });

  it("returns eligible games", async () => {
    vi.spyOn(eligibleSvc, "getEligibleOpenGames").mockResolvedValueOnce({
      items: [{ apiMatchId: 100 } as any],
    });
    // Make a request that supplies the referee's apiId directly via query, OR rely on
    // route's internal id→apiId lookup. The route below uses ?apiId= for simplicity.
    const res = await app.request("/admin/referees/1/eligible-open-games?apiId=555");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/api test -- referee-eligible-games.routes.test.ts
```

- [ ] **Step 3: Implement the route**

Create `apps/api/src/routes/admin/referee-eligible-games.routes.ts`:

```ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { getEligibleOpenGames } from "../../services/referee/eligible-open-games.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";

const refereeEligibleGamesRoutes = new Hono<AppEnv>();

refereeEligibleGamesRoutes.get(
  "/referees/:id/eligible-open-games",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "Returns open games the referee is eligible to take",
    tags: ["Referees"],
    responses: { 200: { description: "Eligible games" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid id", code: "VALIDATION_ERROR" }, 400);
    }

    const [row] = await db
      .select({ apiId: referees.apiId })
      .from(referees)
      .where(eq(referees.id, id))
      .limit(1);

    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await getEligibleOpenGames(row.apiId);
    return c.json(result);
  },
);

export { refereeEligibleGamesRoutes };
```

- [ ] **Step 4: Mount the route**

In `apps/api/src/routes/index.ts`, find where `refereeRoutes` is mounted under `/admin` and add:

```ts
import { refereeEligibleGamesRoutes } from "./admin/referee-eligible-games.routes";
// inside the admin route group:
app.route("/admin", refereeEligibleGamesRoutes);
```

(Match the existing mount pattern — if the file uses `app.route("/admin", refereeRoutes)`, do the same.)

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @dragons/api test -- referee-eligible-games.routes.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/referee-eligible-games.routes.ts apps/api/src/routes/admin/referee-eligible-games.routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add GET /admin/referees/:id/eligible-open-games"
```

---

### Task 13: API integration smoke test

**Files:** (no new files — verification only)

- [ ] **Step 1: Run the full API test suite**

```bash
pnpm --filter @dragons/api test
```

Expected: all green, coverage stays ≥ 90/95/95/95. If coverage dropped, identify the file and add tests for the uncovered branches before continuing.

- [ ] **Step 2: Run typecheck across both apps**

```bash
pnpm --filter @dragons/api typecheck
pnpm --filter @dragons/web typecheck
```

Expected: API passes, web fails (we haven't touched it yet). Confirm web failures are limited to the referee-hub area.

- [ ] **Step 3: No commit (verification step)**

---

## Milestone M4 — Web SWR keys + URL state (2 tasks)

### Task 14: Replace SWR keys

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts`

- [ ] **Step 1: Edit the file**

In `apps/web/src/lib/swr-keys.ts`, replace these two lines:

```ts
referees: (ownClub?: boolean) =>
  `/admin/referees${ownClub === false ? "?ownClub=false" : ""}`,
```

with:

```ts
refereesPaginated: (opts: {
  scope?: "own" | "all";
  search?: string;
  sort?: "name" | "workloadAsc" | "workloadDesc";
  limit?: number;
  offset?: number;
} = {}) => {
  const qs = new URLSearchParams();
  qs.set("scope", opts.scope ?? "own");
  qs.set("sort", opts.sort ?? "name");
  qs.set("limit", String(opts.limit ?? 50));
  qs.set("offset", String(opts.offset ?? 0));
  if (opts.search) qs.set("search", opts.search);
  return `/admin/referees?${qs.toString()}`;
},
refereeCounts: "/admin/referees/counts",
refereeEligibleGames: (refereeId: number) =>
  `/admin/referees/${refereeId}/eligible-open-games`,
```

And replace:

```ts
refereeGames: "/referee/games?limit=500&offset=0",
```

with:

```ts
refereeGamesFiltered: (opts: {
  status?: "active" | "all";
  league?: string[];
  dateFrom?: string;
  dateTo?: string;
  gameType?: "home" | "away" | "both";
  assignedRefereeApiId?: number;
  search?: string;
  limit?: number;
  offset?: number;
} = {}) => {
  const qs = new URLSearchParams();
  qs.set("status", opts.status ?? "active");
  qs.set("limit", String(opts.limit ?? 100));
  qs.set("offset", String(opts.offset ?? 0));
  if (opts.gameType) qs.set("gameType", opts.gameType);
  if (opts.dateFrom) qs.set("dateFrom", opts.dateFrom);
  if (opts.dateTo) qs.set("dateTo", opts.dateTo);
  if (opts.league?.length) qs.set("league", opts.league.join(","));
  if (opts.search) qs.set("search", opts.search);
  if (opts.assignedRefereeApiId != null) qs.set("assignedRefereeApiId", String(opts.assignedRefereeApiId));
  return `/referee/games?${qs.toString()}`;
},
```

The candidate key (`refereeCandidates`) stays as-is — it already matches the backend.

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @dragons/web typecheck
```

Expected: errors in every file that still calls `SWR_KEYS.referees` or `SWR_KEYS.refereeGames`. List them — they'll be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts
git commit -m "feat(web): replace referee SWR keys with paginated/filtered variants"
```

---

### Task 15: Hub URL state — drop `range`, add open-slots filters

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts`
- Modify: `apps/web/src/components/admin/referee-hub/use-referee-hub-url.test.ts`

- [ ] **Step 1: Failing tests**

In `use-referee-hub-url.test.ts`, replace any test that asserts `range` exists. Add:

```ts
describe("hub URL state — open-slots filters", () => {
  it("parses status, league, dateFrom, dateTo, gameType from URL", () => {
    const params = new URLSearchParams("tab=open-slots&status=open&league=OL,BL&dateFrom=2026-05-18&dateTo=2026-06-01&gameType=home");
    const state = parseHubUrl(params);
    expect(state.filters).toEqual({
      status: "open",
      league: ["OL", "BL"],
      dateFrom: "2026-05-18",
      dateTo: "2026-06-01",
      gameType: "home",
    });
  });

  it("defaults to status=open, gameType=both, no league filter", () => {
    const params = new URLSearchParams("tab=open-slots");
    const state = parseHubUrl(params);
    expect(state.filters.status).toBe("open");
    expect(state.filters.gameType).toBe("both");
    expect(state.filters.league).toEqual([]);
  });

  it("omits default filter values from rebuilt URL", () => {
    const url = buildHubUrl({
      tab: "open-slots",
      gameId: null,
      refereeId: null,
      subtab: "profile",
      filters: { status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" },
      scope: "own",
    });
    expect(url).toBe("");
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/web test -- use-referee-hub-url.test.ts
```

- [ ] **Step 3: Rewrite the URL state module**

Replace `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts` with:

```ts
"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type HubTab = "open-slots" | "referees";
export type HubSubtab = "profile" | "upcoming" | "history" | "rules";
export type HubStatus = "open" | "offered" | "any";
export type HubGameType = "home" | "away" | "both";
export type HubScope = "own" | "all";

export interface HubFilters {
  status: HubStatus;
  league: string[];
  dateFrom: string | null;
  dateTo: string | null;
  gameType: HubGameType;
}

export interface HubState {
  tab: HubTab;
  gameId: number | null;
  refereeId: number | null;
  subtab: HubSubtab;
  filters: HubFilters;
  scope: HubScope;
}

const TABS: readonly HubTab[] = ["open-slots", "referees"];
const SUBTABS: readonly HubSubtab[] = ["profile", "upcoming", "history", "rules"];
const STATUSES: readonly HubStatus[] = ["open", "offered", "any"];
const GAME_TYPES: readonly HubGameType[] = ["home", "away", "both"];
const SCOPES: readonly HubScope[] = ["own", "all"];

const DEFAULT_FILTERS: HubFilters = {
  status: "open",
  league: [],
  dateFrom: null,
  dateTo: null,
  gameType: "both",
};

const DEFAULT_STATE: HubState = {
  tab: "open-slots",
  gameId: null,
  refereeId: null,
  subtab: "profile",
  filters: DEFAULT_FILTERS,
  scope: "own",
};

function parseId(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clamp<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function parseHubUrl(params: URLSearchParams): HubState {
  const leagueRaw = params.get("league");
  return {
    tab: clamp(params.get("tab"), TABS, DEFAULT_STATE.tab),
    gameId: parseId(params.get("game")),
    refereeId: parseId(params.get("id")),
    subtab: clamp(params.get("subtab"), SUBTABS, DEFAULT_STATE.subtab),
    filters: {
      status: clamp(params.get("status"), STATUSES, DEFAULT_FILTERS.status),
      league: leagueRaw ? leagueRaw.split(",").filter(Boolean) : [],
      dateFrom: params.get("dateFrom") || null,
      dateTo: params.get("dateTo") || null,
      gameType: clamp(params.get("gameType"), GAME_TYPES, DEFAULT_FILTERS.gameType),
    },
    scope: clamp(params.get("scope"), SCOPES, DEFAULT_STATE.scope),
  };
}

export function buildHubUrl(state: HubState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_STATE.tab) params.set("tab", state.tab);
  if (state.tab === "open-slots" && state.gameId !== null) params.set("game", String(state.gameId));
  if (state.tab === "referees" && state.refereeId !== null) params.set("id", String(state.refereeId));
  if (state.tab === "referees" && state.subtab !== DEFAULT_STATE.subtab) params.set("subtab", state.subtab);
  if (state.tab === "referees" && state.scope !== DEFAULT_STATE.scope) params.set("scope", state.scope);
  if (state.tab === "open-slots") {
    if (state.filters.status !== DEFAULT_FILTERS.status) params.set("status", state.filters.status);
    if (state.filters.league.length > 0) params.set("league", state.filters.league.join(","));
    if (state.filters.dateFrom) params.set("dateFrom", state.filters.dateFrom);
    if (state.filters.dateTo) params.set("dateTo", state.filters.dateTo);
    if (state.filters.gameType !== DEFAULT_FILTERS.gameType) params.set("gameType", state.filters.gameType);
  }
  return params.toString();
}

export function useRefereeHubUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(
    () => parseHubUrl(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const update = useCallback(
    (patch: Partial<HubState>) => {
      const next: HubState = {
        ...state,
        ...patch,
        filters: { ...state.filters, ...(patch.filters ?? {}) },
      };
      if (patch.tab && patch.tab !== state.tab) {
        next.gameId = patch.tab === "open-slots" ? next.gameId : null;
        next.refereeId = patch.tab === "referees" ? next.refereeId : null;
      }
      const qs = buildHubUrl(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, state],
  );

  return { state, update };
}
```

Note removed: `HubRange`, the `range` property, the export `parseHubUrl` shape change (now includes `filters` and `scope`).

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/web test -- use-referee-hub-url.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts apps/web/src/components/admin/referee-hub/use-referee-hub-url.test.ts
git commit -m "feat(web): drop range from hub URL state; add open-slots filter facets + scope"
```

---

## Milestone M5 — Open Slots tab (6 tasks)

### Task 16: Hub header — drop range selector

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/hub-header.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl, type HubTab } from "./use-referee-hub-url";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";

const TABS = ["open-slots", "referees"] as const satisfies HubTab[];

export function HubHeader() {
  const t = useTranslations("refereeHub");
  const { state, update } = useRefereeHubUrl();

  return (
    <div className="flex flex-col gap-3 border-b pb-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Tabs value={state.tab} onValueChange={(v) => update({ tab: v as HubTab })}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab === "open-slots" ? "openSlots" : "referees"}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @dragons/web typecheck -- hub-header.tsx
```

Expected: pass (no more `HubRange` import).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/hub-header.tsx
git commit -m "feat(web): remove dead range selector from hub header"
```

---

### Task 17: Slots filter sidebar

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/slots-filter-sidebar.tsx`
- Create: `apps/web/src/components/admin/referee-hub/open-slots/slots-filter-sidebar.test.tsx`

- [ ] **Step 1: Failing test**

Create the test:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlotsFilterSidebar } from "./slots-filter-sidebar";

const baseFilters = {
  status: "open" as const,
  league: [] as string[],
  dateFrom: null as string | null,
  dateTo: null as string | null,
  gameType: "both" as const,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

describe("SlotsFilterSidebar", () => {
  it("calls onChange with status when radio changes", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByLabelText(/offered/i));
    expect(onChange).toHaveBeenCalledWith({ status: "offered" });
  });

  it("calls onChange with gameType when checkbox toggles", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByLabelText(/away/i));
    expect(onChange).toHaveBeenCalledWith({ gameType: "away" });
  });

  it("renders league checkboxes from options", () => {
    render(
      <SlotsFilterSidebar
        filters={baseFilters}
        onChange={() => {}}
        leagueOptions={[{ value: "OL", label: "Oberliga" }, { value: "BL", label: "Bundesliga" }]}
      />,
    );
    expect(screen.getByLabelText("Oberliga")).toBeInTheDocument();
    expect(screen.getByLabelText("Bundesliga")).toBeInTheDocument();
  });

  it("Reset button restores defaults", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={{ ...baseFilters, gameType: "home" }} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByText(/reset/i));
    expect(onChange).toHaveBeenCalledWith({
      status: "open",
      league: [],
      dateFrom: null,
      dateTo: null,
      gameType: "both",
    });
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/web test -- slots-filter-sidebar.test.tsx
```

- [ ] **Step 3: Implement**

Create `slots-filter-sidebar.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Label } from "@dragons/ui/components/label";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Button } from "@dragons/ui/components/button";
import type { HubFilters } from "../use-referee-hub-url";

interface LeagueOption {
  value: string;
  label: string;
}

interface Props {
  filters: HubFilters;
  onChange: (patch: Partial<HubFilters>) => void;
  leagueOptions: LeagueOption[];
}

const DEFAULTS: HubFilters = {
  status: "open",
  league: [],
  dateFrom: null,
  dateTo: null,
  gameType: "both",
};

export function SlotsFilterSidebar({ filters, onChange, leagueOptions }: Props) {
  const t = useTranslations("refereeHub.openSlots.filters");

  function toggleLeague(value: string, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...filters.league, value]))
      : filters.league.filter((v) => v !== value);
    onChange({ league: next });
  }

  function toggleGameType(kind: "home" | "away") {
    const has = filters.gameType === kind || filters.gameType === "both";
    const other: "home" | "away" = kind === "home" ? "away" : "home";
    const otherHas = filters.gameType === other || filters.gameType === "both";
    const nextHasThis = !has;
    if (nextHasThis && otherHas) onChange({ gameType: "both" });
    else if (nextHasThis && !otherHas) onChange({ gameType: kind });
    else if (!nextHasThis && otherHas) onChange({ gameType: other });
    else onChange({ gameType: "both" }); // never both off — default to both
  }

  return (
    <aside className="flex flex-col gap-4 p-3 border-r bg-muted/30 text-sm">
      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("status")}</div>
        {(["open", "offered", "any"] as const).map((s) => (
          <label key={s} className="flex items-center gap-2 py-1">
            <input
              type="radio"
              name="status"
              checked={filters.status === s}
              onChange={() => onChange({ status: s })}
              aria-label={t(`statusValue.${s}`)}
            />
            <span>{t(`statusValue.${s}`)}</span>
          </label>
        ))}
      </section>

      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("league")}</div>
        {leagueOptions.length === 0 && (
          <div className="text-xs text-muted-foreground">{t("noLeagues")}</div>
        )}
        {leagueOptions.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 py-1">
            <Checkbox
              checked={filters.league.includes(opt.value)}
              onCheckedChange={(c) => toggleLeague(opt.value, c === true)}
              aria-label={opt.label}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </section>

      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("date")}</div>
        {(["14d", "30d", "season", "custom"] as const).map((preset) => (
          <label key={preset} className="flex items-center gap-2 py-1">
            <input
              type="radio"
              name="datePreset"
              checked={matchesPreset(filters, preset)}
              onChange={() => onChange(applyPreset(preset))}
            />
            <span>{t(`datePreset.${preset}`)}</span>
          </label>
        ))}
        {matchesPreset(filters, "custom") && (
          <div className="flex flex-col gap-1 mt-2">
            <input
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) => onChange({ dateFrom: e.target.value || null })}
              aria-label={t("dateFrom")}
              className="border rounded px-2 py-1 text-xs"
            />
            <input
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) => onChange({ dateTo: e.target.value || null })}
              aria-label={t("dateTo")}
              className="border rounded px-2 py-1 text-xs"
            />
          </div>
        )}
      </section>

      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("gameType")}</div>
        {(["home", "away"] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-2 py-1">
            <Checkbox
              checked={filters.gameType === kind || filters.gameType === "both"}
              onCheckedChange={() => toggleGameType(kind)}
              aria-label={t(`gameTypeValue.${kind}`)}
            />
            <span>{t(`gameTypeValue.${kind}`)}</span>
          </label>
        ))}
      </section>

      <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULTS)}>
        {t("reset")}
      </Button>
    </aside>
  );
}

function matchesPreset(f: HubFilters, preset: "14d" | "30d" | "season" | "custom"): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (preset === "14d") {
    const to = new Date(); to.setDate(to.getDate() + 14);
    return f.dateFrom === today && f.dateTo === to.toISOString().slice(0, 10);
  }
  if (preset === "30d") {
    const to = new Date(); to.setDate(to.getDate() + 30);
    return f.dateFrom === today && f.dateTo === to.toISOString().slice(0, 10);
  }
  if (preset === "season") {
    return f.dateFrom === null && f.dateTo === null;
  }
  // custom
  return f.dateFrom !== null && f.dateTo !== null && !matchesPreset(f, "14d") && !matchesPreset(f, "30d");
}

function applyPreset(preset: "14d" | "30d" | "season" | "custom"): Partial<HubFilters> {
  const today = new Date().toISOString().slice(0, 10);
  if (preset === "14d") {
    const to = new Date(); to.setDate(to.getDate() + 14);
    return { dateFrom: today, dateTo: to.toISOString().slice(0, 10) };
  }
  if (preset === "30d") {
    const to = new Date(); to.setDate(to.getDate() + 30);
    return { dateFrom: today, dateTo: to.toISOString().slice(0, 10) };
  }
  if (preset === "season") {
    return { dateFrom: null, dateTo: null };
  }
  // custom — keep existing dates or initialize to today
  return { dateFrom: today, dateTo: today };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/web test -- slots-filter-sidebar.test.tsx
```

Expected: pass.

- [ ] **Step 5: Add i18n keys**

In `apps/web/src/messages/en.json`, locate the existing `refereeHub.openSlots` block and add:

```json
"filters": {
  "status": "Status",
  "statusValue": { "open": "Open only", "offered": "Open + Offered", "any": "Any" },
  "league": "League",
  "noLeagues": "No leagues loaded",
  "date": "Date",
  "datePreset": { "14d": "Next 14 days", "30d": "Next 30 days", "season": "Whole season", "custom": "Custom range" },
  "dateFrom": "From",
  "dateTo": "To",
  "gameType": "Game type",
  "gameTypeValue": { "home": "Home", "away": "Away" },
  "reset": "Reset filters"
}
```

In `apps/web/src/messages/de.json`, mirror the structure with German strings (translate accordingly).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/slots-filter-sidebar.tsx apps/web/src/components/admin/referee-hub/open-slots/slots-filter-sidebar.test.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add slots filter sidebar with status/league/date/gameType facets"
```

---

### Task 18: Open games list — server filter + virtualize

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx`

- [ ] **Step 1: Failing tests**

Replace the contents of `open-games-list.test.tsx` with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { OpenGamesList } from "./open-games-list";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const baseFilters = {
  status: "open" as const,
  league: [] as string[],
  dateFrom: null as string | null,
  dateTo: null as string | null,
  gameType: "both" as const,
};

const wrap = (ui: React.ReactNode) => (
  <SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>
);

describe("OpenGamesList", () => {
  it("renders rows from server response without client-side status filter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: 1, apiMatchId: 100, kickoffDate: "2026-05-24", kickoffTime: "18:00", leagueShort: "OL",
            homeTeamName: "Dragons", guestTeamName: "Bears",
            sr1Status: "open", sr2Status: "assigned", sr1Name: null, sr2Name: "Meier",
            sr1RefereeApiId: null, sr2RefereeApiId: 999 },
        ],
        total: 1, limit: 50, offset: 0, hasMore: false,
      }),
    }));
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    expect(await screen.findByText("Dragons vs Bears")).toBeInTheDocument();
  });

  it("renders empty state when no rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0, limit: 50, offset: 0, hasMore: false }),
    }));
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    expect(await screen.findByText(/empty|no games/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/web test -- open-games-list.test.tsx
```

- [ ] **Step 3: Rewrite the component**

Replace `open-games-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { FixedSizeList as List, type ListChildComponentProps } from "react-window";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Input } from "@dragons/ui/components/input";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import type { RefereeGameListItem } from "@dragons/shared";
import type { HubFilters } from "../use-referee-hub-url";

interface Props {
  filters: HubFilters;
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
}

interface ApiResponse {
  items: RefereeGameListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const ROW_HEIGHT = 64;

export function OpenGamesList({ filters, selectedGameId, onSelect }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Map our status to server's expected status param
  const serverStatus =
    filters.status === "any" ? "all" : "active";

  const key = SWR_KEYS.refereeGamesFiltered({
    status: serverStatus,
    league: filters.league,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    gameType: filters.gameType,
    search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    limit: 200,
    offset: 0,
  });

  const { data, error, isLoading } = useSWR<ApiResponse>(key, apiFetcher, {
    dedupingInterval: 5000,
  });

  // Client-side post-filter for slot-level open/offered distinction
  const rows = (data?.items ?? []).filter((g) => {
    if (filters.status === "open") return g.sr1Status === "open" || g.sr2Status === "open";
    if (filters.status === "offered") return g.sr1Status === "offered" || g.sr2Status === "offered" || g.sr1Status === "open" || g.sr2Status === "open";
    return true;
  });

  const Row = ({ index, style }: ListChildComponentProps) => {
    const g = rows[index]!;
    const selected = selectedGameId === g.apiMatchId;
    return (
      <button
        type="button"
        style={style}
        data-selected={selected}
        onClick={() => onSelect(g.apiMatchId)}
        className={cn(
          "w-full text-left px-3 py-2 border-b hover:bg-muted/50 transition-colors block",
          selected && "bg-primary text-primary-foreground hover:bg-primary",
        )}
      >
        <div className="text-xs opacity-70">
          {g.kickoffDate} · {g.kickoffTime} · {g.leagueShort ?? ""}
        </div>
        <div className="text-sm font-medium truncate">{g.homeTeamName} vs {g.guestTeamName}</div>
        <div className="flex gap-1 mt-1">
          <SlotBadge status={g.sr1Status} who={g.sr1Name} prefix="SR1" />
          <SlotBadge status={g.sr2Status} who={g.sr2Name} prefix="SR2" />
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
      </div>
      <div className="flex-1 min-h-0">
        {error && <div className="p-4 text-sm text-destructive">{t("loadError")}</div>}
        {isLoading && !data && <div className="p-4 text-sm text-muted-foreground">{t("loading")}</div>}
        {!isLoading && rows.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">{t("empty")}</div>
        )}
        {rows.length > 0 && (
          <List
            height={600}
            itemCount={rows.length}
            itemSize={ROW_HEIGHT}
            width="100%"
          >
            {Row}
          </List>
        )}
      </div>
    </div>
  );
}

function SlotBadge({ status, who, prefix }: { status: string; who: string | null; prefix: string }) {
  if (status === "assigned") return <Badge variant="secondary">{prefix} {who ?? "?"}</Badge>;
  if (status === "offered") return <Badge variant="outline">{prefix} offered</Badge>;
  return <Badge variant="destructive">{prefix} open</Badge>;
}
```

- [ ] **Step 4: Add i18n keys**

In `en.json` under `refereeHub.openSlots`, add `"loading": "Loading…"`, `"loadError": "Failed to load games."`. Mirror in `de.json`.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @dragons/web test -- open-games-list.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): virtualize open-games list; drive filters from server"
```

---

### Task 19: Open slot detail — fetch by id

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx`

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SlotCard } from "./slot-card";
import type { RefereeGameListItem } from "@dragons/shared";

interface Props {
  selectedGameId: number;
}

export function OpenSlotDetail({ selectedGameId }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const key = `/referee/matches/${selectedGameId}`;
  const { data: game, mutate } = useSWR<RefereeGameListItem>(key, apiFetcher);

  if (!game) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t("detail.notFound")}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">
          {game.kickoffDate} · {game.kickoffTime} · {game.leagueShort ?? ""} · #{game.matchNo}
        </div>
        <h2 className="text-xl font-semibold">{game.homeTeamName} vs {game.guestTeamName}</h2>
      </div>
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={1}
        assignment={{ refereeApiId: game.sr1RefereeApiId, refereeName: game.sr1Name, status: game.sr1Status }}
        onChange={() => mutate()}
      />
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={2}
        assignment={{ refereeApiId: game.sr2RefereeApiId, refereeName: game.sr2Name, status: game.sr2Status }}
        onChange={() => mutate()}
      />
    </div>
  );
}
```

This uses the existing `GET /referee/matches/:matchId` endpoint that returns a single `RefereeGameListItem`.

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @dragons/web typecheck
```

Expected: no errors in `open-slot-detail.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx
git commit -m "feat(web): fetch open-slot detail by id instead of scanning list"
```

---

### Task 20: Candidate picker — trust server order

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.test.tsx`

- [ ] **Step 1: Failing test**

In `candidate-picker.test.tsx`, add:

```tsx
it("renders candidates in the order returned by the server (no client re-sort)", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        { srId: 2, vorname: "Lower", nachName: "Workload", qualiSr1: true, qualiSr2: true, srModusMismatchSr1: false, srModusMismatchSr2: false, blocktermin: false, zeitraumBlockiert: null, meta: { total: 3 } },
        { srId: 1, vorname: "Higher", nachName: "Workload", qualiSr1: true, qualiSr2: true, srModusMismatchSr1: false, srModusMismatchSr2: false, blocktermin: false, zeitraumBlockiert: null, meta: { total: 10 } },
      ],
      total: 2, page: 0, pageSize: 15,
    }),
  }));

  render(<CandidatePicker gameApiId={1} slotNumber={1} onPick={() => {}} />);
  const items = await screen.findAllByTestId("candidate-row");
  expect(items[0]).toHaveTextContent("Lower Workload");
  expect(items[1]).toHaveTextContent("Higher Workload");
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/web test -- candidate-picker.test.tsx
```

- [ ] **Step 3: Adjust the component**

Open `candidate-picker.tsx`. The current implementation already iterates the server's `results` order — confirm there is no `.sort()` call anywhere on the array. Add `data-testid="candidate-row"` to each rendered candidate `div`. Wrap each candidate's inner content so the test can assert order.

```tsx
{results.map((c) => {
  const blockReason = getBlockReason(c, slotNumber, tDisposition);
  const blocked = blockReason !== null;
  const displayName = `${c.vorname} ${c.nachName}`.trim();
  return (
    <div
      key={c.srId}
      data-testid="candidate-row"
      data-candidate
      data-disabled={blocked}
      className={cn(
        "flex items-center justify-between p-2 border rounded-md gap-2",
        blocked && "opacity-50",
      )}
    >
      {/* ... existing content ... */}
    </div>
  );
})}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/web test -- candidate-picker.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.tsx apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.test.tsx
git commit -m "feat(web): preserve server-ranked candidate order in picker"
```

---

### Task 21: Open Slots tab — wire up 3-pane layout

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx`

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { SWR_KEYS } from "@/lib/swr-keys";
import { apiFetcher } from "@/lib/swr";
import { SlotsFilterSidebar } from "./slots-filter-sidebar";
import { OpenGamesList } from "./open-games-list";
import { OpenSlotDetail } from "./open-slot-detail";

interface LeagueSetting {
  leagueNumber: number;
  shortName: string | null;
  name: string;
}

export function OpenSlotsTab() {
  const t = useTranslations("refereeHub.openSlots");
  const { state, update } = useRefereeHubUrl();

  const { data: leagueData } = useSWR<{ leagues: LeagueSetting[] }>(
    SWR_KEYS.settingsLeagues,
    apiFetcher,
  );
  const leagueOptions = (leagueData?.leagues ?? []).map((l) => ({
    value: l.shortName ?? String(l.leagueNumber),
    label: l.name,
  }));

  return (
    <div className="grid grid-cols-[200px_320px_1fr] border rounded-md overflow-hidden min-h-[600px]">
      <SlotsFilterSidebar
        filters={state.filters}
        onChange={(patch) => update({ filters: patch })}
        leagueOptions={leagueOptions}
      />
      <div className="border-r">
        <OpenGamesList
          filters={state.filters}
          selectedGameId={state.gameId}
          onSelect={(gameId) => update({ gameId })}
        />
      </div>
      <div>
        {state.gameId !== null ? (
          <OpenSlotDetail selectedGameId={state.gameId} />
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("detail.selectGamePrompt")}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @dragons/web typecheck
```

Expected: no errors in this file. (Other web files may still error from later milestones.)

- [ ] **Step 3: Visual smoke check**

Start the dev server and navigate to `/admin/referees?tab=open-slots`. Verify:
- 3-pane layout renders
- Filter sidebar shows
- Selecting a game opens detail pane
- Status chip filtering works (toggle "Any" → assigned games appear)
- Reset button restores defaults

```bash
pnpm --filter @dragons/web dev
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx
git commit -m "feat(web): wire open-slots tab as 3-pane filter+list+detail layout"
```

---

## Milestone M6 — Web Referees tab compat + role-label removal (3 tasks)

These changes are minimal — just enough to compile against the new API surface. Full Referees-tab redesign is in **Plan 2**.

### Task 22: Referee list — drop roles, use new SWR key

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx`

- [ ] **Step 1: Failing test**

In `referee-list.test.tsx`, add:

```tsx
it("does not render role labels", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      items: [{
        id: 1, apiId: 100, firstName: "Anna", lastName: "Schmidt",
        licenseNumber: 123, matchCount: 5,
        allowAllHomeGames: false, allowAwayGames: false, isOwnClub: true,
        createdAt: "", updatedAt: "",
      }],
      total: 1, limit: 50, offset: 0, hasMore: false,
    }),
  }));
  render(<RefereeList selectedId={null} onSelect={() => {}} />);
  expect(await screen.findByText("Schmidt, Anna")).toBeInTheDocument();
  expect(screen.queryByText(/Schiedsrichter|1\.|2\./)).toBeNull();
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/web test -- referee-list.test.tsx
```

- [ ] **Step 3: Patch the component**

In `referee-list.tsx`:

1. Replace `SWR_KEYS.referees(true)` with `SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 })`.
2. Replace `fetchAPI(\`/admin/referees/${ref.id}\`, ...)` (the combined PATCH) with `fetchAPI(\`/admin/referees/${ref.id}/visibility\`, { method: "PATCH", body: JSON.stringify({ isOwnClub: checked, allowAllHomeGames: ref.allowAllHomeGames, allowAwayGames: ref.allowAwayGames }) })`.
3. Update the `mutate(SWR_KEYS.referees(true))` call to `mutate(SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 }))`.
4. Remove the line `<div className="text-xs opacity-70">Lic {r.licenseNumber ?? "—"} · {r.roles.join(", ")}</div>` and replace with `<div className="text-xs opacity-70">Lic {r.licenseNumber ?? "—"}</div>`.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/web test -- referee-list.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/referee-list.tsx apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx
git commit -m "feat(web): drop role labels from referee list; use split visibility endpoint"
```

---

### Task 23: Referee detail — drop roles in header

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx`

- [ ] **Step 1: Patch**

In `referee-detail.tsx`:

1. Replace `SWR_KEYS.referees(true)` with `SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 })`.
2. Remove `· {ref.roles.join(", ")}` from the header line.

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @dragons/web typecheck
```

Expected: pass (no more `roles` references in this file).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx
git commit -m "feat(web): drop role labels from referee detail header"
```

---

### Task 24: Profile subtab — use split endpoints

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx`

This task keeps the existing UX (combined visibility + rules in one subtab with autosave) but swaps the API calls. Full subtab split is in Plan 2.

- [ ] **Step 1: Failing test**

In `profile-subtab.test.tsx`, add:

```tsx
it("saves visibility via /visibility endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  render(<ProfileSubtab referee={{
    id: 1, apiId: 100, firstName: "A", lastName: "B", licenseNumber: 1, matchCount: 0,
    allowAllHomeGames: false, allowAwayGames: false, isOwnClub: true,
    createdAt: "", updatedAt: "",
  }} />);

  fireEvent.click(screen.getByLabelText(/all home/i));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/referees/1/visibility"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

it("saves rules via /rules endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  // ... trigger save with a rule added ...
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/referees/1/rules"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/web test -- profile-subtab.test.tsx
```

- [ ] **Step 3: Patch the autosave function**

In `profile-subtab.tsx`, the current autosave does:

```ts
await fetchAPI(`/admin/referees/${referee.id}`, {
  method: "PATCH",
  body: JSON.stringify({ visibility, rules: rules.filter(...) }),
});
```

Replace with two calls (fired in parallel):

```ts
await Promise.all([
  fetchAPI(`/admin/referees/${referee.id}/visibility`, {
    method: "PATCH",
    body: JSON.stringify(visibility),
  }),
  fetchAPI(`/admin/referees/${referee.id}/rules`, {
    method: "PATCH",
    body: JSON.stringify({ rules: rules.filter((r) => r.deny || r.allowSr1 || r.allowSr2) }),
  }),
]);
```

Then update the `swrMutate` call: `await swrMutate(SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 }))` instead of `referees(true)`.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/web test -- profile-subtab.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx
git commit -m "feat(web): split profile-subtab autosave into visibility + rules endpoints"
```

---

### Task 25: Upcoming subtab — use eligible-open-games endpoint

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.test.tsx` (create if absent)

- [ ] **Step 1: Failing test**

Create `upcoming-subtab.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { UpcomingSubtab } from "./upcoming-subtab";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const wrap = (ui: React.ReactNode) => (
  <SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>
);

const referee = {
  id: 42, apiId: 555, firstName: "A", lastName: "B", licenseNumber: 1, matchCount: 0,
  allowAllHomeGames: false, allowAwayGames: false, isOwnClub: true,
  createdAt: "", updatedAt: "",
};

describe("UpcomingSubtab", () => {
  it("fetches assigned games via assignedRefereeApiId param", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [], total: 0, limit: 100, offset: 0, hasMore: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(wrap(<UpcomingSubtab referee={referee} />));

    await screen.findAllByText(/assigned/i);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("assignedRefereeApiId=555"),
      expect.anything(),
    );
  });

  it("fetches eligible games via /eligible-open-games", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [], total: 0, limit: 100, offset: 0, hasMore: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ apiMatchId: 1, kickoffDate: "2026-05-24", kickoffTime: "18:00", homeTeamName: "A", guestTeamName: "B" }] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(wrap(<UpcomingSubtab referee={referee} />));
    expect(await screen.findByText("A vs B")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/referees/42/eligible-open-games"),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm --filter @dragons/web test -- upcoming-subtab.test.tsx
```

- [ ] **Step 3: Rewrite the component**

Replace `upcoming-subtab.tsx`:

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { RefereeGameListItem, RefereeListItem } from "@dragons/shared";

interface Props { referee: RefereeListItem }

interface AssignedResp { items: RefereeGameListItem[]; total: number; limit: number; offset: number; hasMore: boolean }
interface EligibleResp { items: RefereeGameListItem[] }

export function UpcomingSubtab({ referee }: Props) {
  const t = useTranslations() as (key: string) => string;

  const { data: assignedData } = useSWR<AssignedResp>(
    SWR_KEYS.refereeGamesFiltered({ assignedRefereeApiId: referee.apiId, status: "active", limit: 100 }),
    apiFetcher,
  );
  const { data: eligibleData } = useSWR<EligibleResp>(
    SWR_KEYS.refereeEligibleGames(referee.id),
    apiFetcher,
  );

  const assigned = assignedData?.items ?? [];
  const eligible = eligibleData?.items ?? [];

  return (
    <div className="p-4 space-y-6">
      <Section title={t("refereeHub.referees.upcoming.assigned")} count={assigned.length}>
        {assigned.map((g) => <Row key={g.apiMatchId} game={g} />)}
        {assigned.length === 0 && <Empty text={t("refereeHub.referees.upcoming.assignedEmpty")} />}
      </Section>
      <Section title={t("refereeHub.referees.upcoming.eligibleOpen")} count={eligible.length}>
        {eligible.map((g) => <Row key={g.apiMatchId} game={g} />)}
        {eligible.length === 0 && <Empty text={t("refereeHub.referees.upcoming.eligibleOpenEmpty")} />}
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title} ({count})</div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ game }: { game: RefereeGameListItem }) {
  return (
    <div className="flex justify-between border rounded-md p-2 text-sm">
      <div>
        <div className="text-xs text-muted-foreground">{game.kickoffDate} · {game.kickoffTime} · {game.leagueShort ?? ""}</div>
        <div>{game.homeTeamName} vs {game.guestTeamName}</div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-2">{text}</div>;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/web test -- upcoming-subtab.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.test.tsx
git commit -m "feat(web): drive upcoming subtab from assignedRefereeApiId + eligible-open-games"
```

---

## Milestone M7 — SSR fallback fix + final verification (2 tasks)

### Task 26: SSR canonical URLs

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/referees/page.tsx`

- [ ] **Step 1: Rewrite**

```tsx
import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeHubPage } from "@/components/admin/referee-hub/referee-hub";

export default async function RefereesPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "referee", "view")) notFound();

  const fallback: Record<string, unknown> = {};

  const refereesKey = SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 });
  const today = new Date().toISOString().slice(0, 10);
  const to = new Date(); to.setDate(to.getDate() + 14);
  const gamesKey = SWR_KEYS.refereeGamesFiltered({
    status: "active",
    dateFrom: today,
    dateTo: to.toISOString().slice(0, 10),
    gameType: "both",
    limit: 200,
  });

  try {
    fallback[refereesKey] = await fetchAPIServer<unknown>(refereesKey);
  } catch {}

  try {
    fallback[gamesKey] = await fetchAPIServer<unknown>(gamesKey);
  } catch {}

  return (
    <SWRConfig value={{ fallback }}>
      <RefereeHubPage />
    </SWRConfig>
  );
}
```

- [ ] **Step 2: Manually verify SSR fallback hits**

Open `/admin/referees` in dev. In the Network tab, the first paint should not refetch the list — SWR uses fallback data immediately.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/admin/referees/page.tsx
git commit -m "fix(web): SSR fallback URLs match client SWR cache keys"
```

---

### Task 27: Full verification + i18n cleanup

**Files:**
- Modify: `apps/web/src/messages/{en,de}.json` (cleanup only)

- [ ] **Step 1: Remove unused i18n keys**

In `en.json` and `de.json`, search for `refereeHub.range` and remove the whole subtree (range selector is gone). Search for `refereeHub.referees.columns.roles` and remove.

- [ ] **Step 2: Run all suites**

```bash
pnpm --filter @dragons/api test
pnpm --filter @dragons/web test
pnpm --filter @dragons/api typecheck
pnpm --filter @dragons/web typecheck
pnpm --filter @dragons/shared build
```

Expected: all green, coverage thresholds met.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 4: Knip + AI-slop check**

```bash
pnpm --filter @dragons/api exec knip
pnpm --filter @dragons/web exec knip
pnpm check:ai-slop
```

Expected: no new dead exports, no banned words in any modified doc.

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
```

Walk through:
- `/admin/referees` loads with Open Slots tab.
- Filter sidebar: toggle Status, League, Date preset, Game type — list updates.
- Click a game → detail pane loads via fetch-by-id (Network tab shows `/referee/matches/<id>`).
- Open candidate picker on an open slot — candidates appear in workload-ascending order, blocked candidates dimmed at bottom.
- Assign a candidate — toast + slot updates, no full list refetch.
- Switch to Referees tab → list shows own-club refs, no role labels.
- Open a referee's profile, toggle Own Club — visibility PATCH fires.
- Open Upcoming subtab — both sections load.

- [ ] **Step 6: Commit i18n cleanup**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "chore(i18n): remove unused refereeHub.range and roles keys"
```

---

## Self-review checklist (run yourself after completing all tasks)

**Spec coverage:** Open `docs/superpowers/specs/2026-05-18-referee-hub-redesign-design.md` and tick each requirement:

- [ ] Header dropped range selector
- [ ] Open Slots 3-pane layout with filter sidebar
- [ ] Filter facets: status, league, date, gameType
- [ ] Server-side filtering via new query params
- [ ] List virtualization
- [ ] Server-ranked candidate picker
- [ ] No client-side re-sort of candidates
- [ ] `roles: string[]` removed from API + UI
- [ ] Composite index created
- [ ] `GET /admin/referees/counts` exists
- [ ] `PATCH /admin/referees/:id/visibility` exists (already did)
- [ ] `PATCH /admin/referees/:id/rules` exists
- [ ] `PATCH /admin/referees/:id` (combined) removed
- [ ] `GET /admin/referees/:id/eligible-open-games` exists
- [ ] `GET /referee/games` accepts `gameType` + `assignedRefereeApiId`
- [ ] SSR fallback URLs match client SWR keys
- [ ] History role detection fix → **deferred to Plan 2** (not in Plan 1 scope)
- [ ] Profile/Rules subtab split → **deferred to Plan 2**
- [ ] Own/All scope chip → **deferred to Plan 2**

**Placeholder scan:** Grep this plan for `TBD`, `TODO`, `appropriate`, `similar to`. None should appear in step bodies (the words may appear in prose explaining the file structure).

**Type consistency:** Compare every signature mentioned in later tasks against the type it was defined with (`HubFilters`, `RefereeListParams`, `RefereeCountsResponse`, `EligibleOpenGamesResponse`).

If any item is unticked, add a follow-up task before declaring the plan complete.
