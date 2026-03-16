# Referee Assignment Rules Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-referee rules that control which own-club home games and referee slots each referee can see and take.

**Architecture:** New `referee_assignment_rules` table with FK to referees and teams. Admin CRUD via PUT/GET endpoints. Match list query in `referee-match.service.ts` gains SQL-level filtering based on rules. Take-intent endpoint gains a guard to enforce slot restrictions.

**Tech Stack:** Drizzle ORM (schema + migration), Hono (API routes), Zod (validation), Vitest (tests), React + shadcn (admin UI dialog)

**Spec:** `docs/superpowers/specs/2026-03-16-referee-assignment-rules-design.md`

---

## Chunk 1: Database Schema + Shared Types

### Task 1: Add Drizzle schema for `referee_assignment_rules`

**Files:**
- Create: `packages/db/src/schema/referee-assignment-rules.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// packages/db/src/schema/referee-assignment-rules.ts
import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { referees } from "./referees";
import { teams } from "./teams";

export const refereeAssignmentRules = pgTable(
  "referee_assignment_rules",
  {
    id: serial("id").primaryKey(),
    refereeId: integer("referee_id")
      .notNull()
      .references(() => referees.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    allowSr1: boolean("allow_sr1").notNull().default(false),
    allowSr2: boolean("allow_sr2").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    refereeTeamUnique: unique("referee_assignment_rules_referee_team_unique").on(
      table.refereeId,
      table.teamId,
    ),
  }),
);

export type RefereeAssignmentRule = typeof refereeAssignmentRules.$inferSelect;
export type NewRefereeAssignmentRule = typeof refereeAssignmentRules.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

Add to `packages/db/src/schema/index.ts`:
```typescript
export * from "./referee-assignment-rules";
```

- [ ] **Step 3: Generate Drizzle migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: New migration file in `packages/db/drizzle/` for the `referee_assignment_rules` table.

- [ ] **Step 4: Apply migration**

Run: `pnpm --filter @dragons/db db:push`
Expected: Table created in PostgreSQL.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm --filter @dragons/db typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/referee-assignment-rules.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "feat(db): add referee_assignment_rules schema and migration"
```

---

### Task 2: Add shared types for referee rules

**Files:**
- Modify: `packages/shared/src/referees.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add rule types to shared package**

Append to `packages/shared/src/referees.ts`:
```typescript
export interface RefereeRule {
  id: number;
  teamId: number;
  teamName: string;
  allowSr1: boolean;
  allowSr2: boolean;
}

export interface RefereeRulesResponse {
  rules: RefereeRule[];
}

export interface UpdateRefereeRulesBody {
  rules: Array<{
    teamId: number;
    allowSr1: boolean;
    allowSr2: boolean;
  }>;
}
```

- [ ] **Step 2: Export new types from shared index**

Add to the `referees` export line in `packages/shared/src/index.ts`:
```typescript
export type { RefereeListItem, RefereeRule, RefereeRulesResponse, UpdateRefereeRulesBody } from "./referees";
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/referees.ts packages/shared/src/index.ts
git commit -m "feat(shared): add referee rule types"
```

---

## Chunk 2: API — Rules Service + Routes

### Task 3: Create referee rules service

**Files:**
- Create: `apps/api/src/services/referee/referee-rules.service.ts`
- Create: `apps/api/src/services/referee/referee-rules.service.test.ts`

- [ ] **Step 1: Write tests for the rules service**

Create `apps/api/src/services/referee/referee-rules.service.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  refereeAssignmentRules: {
    id: "rar.id",
    refereeId: "rar.refereeId",
    teamId: "rar.teamId",
    allowSr1: "rar.allowSr1",
    allowSr2: "rar.allowSr2",
  },
  teams: {
    id: "t.id",
    name: "t.name",
    isOwnClub: "t.isOwnClub",
  },
  referees: {
    id: "r.id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
}));

import { getRulesForReferee, updateRulesForReferee, hasAnyRules } from "./referee-rules.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRulesForReferee", () => {
  it("returns rules with team names", async () => {
    const mockRules = [
      { id: 1, teamId: 42, teamName: "Dragons 1", allowSr1: true, allowSr2: false },
    ];
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => mockRules }) }) });

    const result = await getRulesForReferee(1);
    expect(result).toEqual({ rules: mockRules });
  });

  it("returns empty rules array when referee has no rules", async () => {
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) });

    const result = await getRulesForReferee(999);
    expect(result).toEqual({ rules: [] });
  });
});

describe("updateRulesForReferee", () => {
  it("deletes existing rules and inserts new ones via transaction", async () => {
    const mockTxDelete = vi.fn().mockReturnValue({ where: vi.fn() });
    const mockTxInsert = vi.fn().mockReturnValue({ values: vi.fn() });
    mockTransaction.mockImplementation(async (fn) => {
      await fn({ delete: mockTxDelete, insert: mockTxInsert });
    });
    // Mock the subsequent getRulesForReferee call
    const updatedRules = [
      { id: 2, teamId: 43, teamName: "Dragons 2", allowSr1: false, allowSr2: true },
    ];
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => updatedRules }) }) });

    const result = await updateRulesForReferee(1, {
      rules: [{ teamId: 43, allowSr1: false, allowSr2: true }],
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(result).toEqual({ rules: updatedRules });
  });

  it("clears all rules when given empty array", async () => {
    const mockTxDelete = vi.fn().mockReturnValue({ where: vi.fn() });
    mockTransaction.mockImplementation(async (fn) => {
      await fn({ delete: mockTxDelete, insert: vi.fn() });
    });
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) });

    const result = await updateRulesForReferee(1, { rules: [] });

    expect(mockTransaction).toHaveBeenCalled();
    expect(result).toEqual({ rules: [] });
  });
});

describe("hasAnyRules", () => {
  it("returns false when no rules exist", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => [],
        }),
      }),
    });

    const result = await hasAnyRules(1);
    expect(result).toBe(false);
  });

  it("returns true when rules exist", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => [{ id: 1 }],
        }),
      }),
    });

    const result = await hasAnyRules(1);
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- src/services/referee/referee-rules.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the rules service implementation**

Create `apps/api/src/services/referee/referee-rules.service.ts`:

```typescript
import { db } from "../../config/database";
import { refereeAssignmentRules, teams } from "@dragons/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { RefereeRulesResponse, UpdateRefereeRulesBody } from "@dragons/shared";

export async function getRulesForReferee(refereeId: number): Promise<RefereeRulesResponse> {
  const rows = await db
    .select({
      id: refereeAssignmentRules.id,
      teamId: refereeAssignmentRules.teamId,
      teamName: teams.name,
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .innerJoin(teams, eq(refereeAssignmentRules.teamId, teams.id))
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  return { rules: rows };
}

export async function updateRulesForReferee(
  refereeId: number,
  body: UpdateRefereeRulesBody,
): Promise<RefereeRulesResponse> {
  await db.transaction(async (tx) => {
    // Delete all existing rules for this referee
    await tx
      .delete(refereeAssignmentRules)
      .where(eq(refereeAssignmentRules.refereeId, refereeId));

    // Insert new rules
    if (body.rules.length > 0) {
      const now = new Date();
      await tx.insert(refereeAssignmentRules).values(
        body.rules.map((rule) => ({
          refereeId,
          teamId: rule.teamId,
          allowSr1: rule.allowSr1,
          allowSr2: rule.allowSr2,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  });

  // Return the updated rules
  return getRulesForReferee(refereeId);
}

export async function hasAnyRules(refereeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: refereeAssignmentRules.id })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId))
    .limit(1);

  return rows.length > 0;
}

export async function getRuleForRefereeAndTeam(
  refereeId: number,
  teamId: number,
): Promise<{ allowSr1: boolean; allowSr2: boolean } | null> {
  const [rule] = await db
    .select({
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .where(
      and(
        eq(refereeAssignmentRules.refereeId, refereeId),
        eq(refereeAssignmentRules.teamId, teamId),
      ),
    )
    .limit(1);

  return rule ?? null;
}

export async function getAllowedTeamIdsForReferee(refereeId: number): Promise<number[]> {
  const rows = await db
    .select({ teamId: refereeAssignmentRules.teamId })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  return rows.map((r) => r.teamId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- src/services/referee/referee-rules.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-rules.service.ts apps/api/src/services/referee/referee-rules.service.test.ts
git commit -m "feat(api): add referee rules service with CRUD and lookup"
```

---

### Task 4: Create admin routes for referee rules

**Files:**
- Create: `apps/api/src/routes/admin/referee-rules.routes.ts`
- Create: `apps/api/src/routes/admin/referee-rules.schemas.ts`
- Create: `apps/api/src/routes/admin/referee-rules.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Create Zod validation schemas**

Create `apps/api/src/routes/admin/referee-rules.schemas.ts`:

```typescript
import { z } from "zod";

export const refereeRulesParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const ruleItemSchema = z.object({
  teamId: z.number().int().positive(),
  allowSr1: z.boolean(),
  allowSr2: z.boolean(),
}).refine((rule) => rule.allowSr1 || rule.allowSr2, {
  message: "At least one of allowSr1 or allowSr2 must be true",
});

export const updateRefereeRulesBodySchema = z.object({
  rules: z.array(ruleItemSchema).refine(
    (rules) => {
      const teamIds = rules.map((r) => r.teamId);
      return new Set(teamIds).size === teamIds.length;
    },
    { message: "Duplicate teamId entries are not allowed" },
  ),
});

export type RefereeRulesParam = z.infer<typeof refereeRulesParamSchema>;
export type UpdateRefereeRulesBodyParsed = z.infer<typeof updateRefereeRulesBodySchema>;
```

- [ ] **Step 2: Write route tests**

Create `apps/api/src/routes/admin/referee-rules.routes.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getRulesForReferee: vi.fn(),
  updateRulesForReferee: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock("../../services/referee/referee-rules.service", () => ({
  getRulesForReferee: mocks.getRulesForReferee,
  updateRulesForReferee: mocks.updateRulesForReferee,
}));

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  teams: { id: "t.id", isOwnClub: "t.isOwnClub" },
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

import { refereeRulesRoutes } from "./referee-rules.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeRulesRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /referees/:id/rules", () => {
  it("returns rules for a referee", async () => {
    const rulesResponse = {
      rules: [{ id: 1, teamId: 42, teamName: "Dragons 1", allowSr1: false, allowSr2: true }],
    };
    mocks.getRulesForReferee.mockResolvedValue(rulesResponse);

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(rulesResponse);
    expect(mocks.getRulesForReferee).toHaveBeenCalledWith(1);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/referees/abc/rules");
    expect(res.status).toBe(400);
  });
});

describe("PUT /referees/:id/rules", () => {
  it("replaces rules for a referee", async () => {
    const body = { rules: [{ teamId: 42, allowSr1: true, allowSr2: false }] };
    const rulesResponse = {
      rules: [{ id: 1, teamId: 42, teamName: "Dragons 1", allowSr1: true, allowSr2: false }],
    };
    // Mock team validation: teamId 42 is a valid own-club team
    mocks.dbSelect.mockReturnValue({
      from: () => ({ where: () => [{ id: 42 }] }),
    });
    mocks.updateRulesForReferee.mockResolvedValue(rulesResponse);

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(rulesResponse);
    expect(mocks.updateRulesForReferee).toHaveBeenCalledWith(1, body);
  });

  it("returns 400 for non-own-club team IDs", async () => {
    // Mock team validation: teamId 999 not found as own-club
    mocks.dbSelect.mockReturnValue({
      from: () => ({ where: () => [] }),
    });

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [{ teamId: 999, allowSr1: true, allowSr2: false }] }),
    });

    expect(res.status).toBe(400);
    expect(mocks.updateRulesForReferee).not.toHaveBeenCalled();
  });

  it("accepts empty rules array (clears all rules)", async () => {
    mocks.updateRulesForReferee.mockResolvedValue({ rules: [] });

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 when neither slot is allowed", async () => {
    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [{ teamId: 42, allowSr1: false, allowSr2: false }] }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate teamIds", async () => {
    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: [
          { teamId: 42, allowSr1: true, allowSr2: false },
          { teamId: 42, allowSr1: false, allowSr2: true },
        ],
      }),
    });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/referee-rules.routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the route implementation**

Create `apps/api/src/routes/admin/referee-rules.routes.ts`:

```typescript
import { Hono } from "hono";
import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { inArray, eq, and } from "drizzle-orm";
import { getRulesForReferee, updateRulesForReferee } from "../../services/referee/referee-rules.service";
import { refereeRulesParamSchema, updateRefereeRulesBodySchema } from "./referee-rules.schemas";

const refereeRulesRoutes = new Hono();

refereeRulesRoutes.get("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });
  const result = await getRulesForReferee(id);
  return c.json(result);
});

refereeRulesRoutes.put("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });
  const body = updateRefereeRulesBodySchema.parse(await c.req.json());

  // Validate all teamIds exist and are own-club teams
  if (body.rules.length > 0) {
    const teamIds = body.rules.map((r) => r.teamId);
    const validTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(inArray(teams.id, teamIds), eq(teams.isOwnClub, true)));

    const validTeamIds = new Set(validTeams.map((t) => t.id));
    const invalidIds = teamIds.filter((id) => !validTeamIds.has(id));

    if (invalidIds.length > 0) {
      return c.json(
        { error: `Invalid or non-own-club team IDs: ${invalidIds.join(", ")}`, code: "VALIDATION_ERROR" },
        400,
      );
    }
  }

  const result = await updateRulesForReferee(id, body);
  return c.json(result);
});

export { refereeRulesRoutes };
```

- [ ] **Step 5: Mount routes in the route index**

In `apps/api/src/routes/index.ts`, add:

```typescript
import { refereeRulesRoutes } from "./admin/referee-rules.routes";
```

And add below the existing `refereeRoutes` line:
```typescript
routes.route("/admin", refereeRulesRoutes);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- src/routes/admin/referee-rules.routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin/referee-rules.routes.ts apps/api/src/routes/admin/referee-rules.schemas.ts apps/api/src/routes/admin/referee-rules.routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add admin endpoints for referee assignment rules"
```

---

## Chunk 3: Match List Filtering + Take Intent Guard

### Task 5: Add rule-based filtering to match list query

**Files:**
- Modify: `apps/api/src/services/referee/referee-match.service.ts`
- Modify: `apps/api/src/services/referee/referee-match.service.test.ts`

- [ ] **Step 1: Write tests for the new filtering behavior**

Add these test cases to `apps/api/src/services/referee/referee-match.service.test.ts`. The existing test file already mocks the DB and drizzle-orm. Add the `refereeAssignmentRules` table mock to the `@dragons/db/schema` mock:

```typescript
refereeAssignmentRules: {
  id: "rar.id",
  refereeId: "rar.refereeId",
  teamId: "rar.teamId",
  allowSr1: "rar.allowSr1",
  allowSr2: "rar.allowSr2",
},
```

Add `exists` to the drizzle-orm mock:
```typescript
exists: vi.fn((...args: unknown[]) => ({ exists: args })),
```

Add test cases verifying:
1. When `refereeId` is null, no rule filtering is applied
2. When referee has no rules, all matches are returned (permissive default)
3. When referee has rules, only matching home games are shown

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `pnpm --filter @dragons/api test -- src/services/referee/referee-match.service.test.ts`
Expected: New test cases FAIL.

- [ ] **Step 3: Modify `getMatchesWithOpenSlots` to apply rule filtering**

In `apps/api/src/services/referee/referee-match.service.ts`:

Add import:
```typescript
import { refereeAssignmentRules } from "@dragons/db/schema";
import { exists } from "drizzle-orm";
```

**IMPORTANT:** This code must be inserted BEFORE `const whereClause = and(...conditions)!` (line 62 of the existing service), so that both the main query and count query use the updated conditions.

After the existing `conditions` array is populated (around line 56) but BEFORE `whereClause` is assigned, add:

```typescript
// Rule-based filtering for own-club home games
// If refereeId is set and referee has rules, restrict own-club home games
// to only teams matching the rules. Federation-assigned open slots (srOpen)
// are always shown regardless of rules.
if (refereeId !== null) {
  const refRules = await db
    .select({ id: refereeAssignmentRules.id })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId))
    .limit(1);

  if (refRules.length > 0) {
    // Referee has rules — replace only the base visibility condition (index 0).
    // This preserves any leagueId/dateFrom/dateTo filters added at indices 1+.
    conditions[0] = or(
      // Federation-assigned open slots (always visible, unaffected by rules)
      or(
        eq(matches.sr1Open, true),
        eq(matches.sr2Open, true),
      ),
      // Own-club home games with a matching rule for the home team
      and(
        eq(leagues.ownClubRefs, true),
        eq(homeTeam.isOwnClub, true),
        exists(
          db
            .select({ id: refereeAssignmentRules.id })
            .from(refereeAssignmentRules)
            .where(
              and(
                eq(refereeAssignmentRules.refereeId, refereeId),
                eq(refereeAssignmentRules.teamId, homeTeam.id),
              ),
            ),
        ),
      ),
    )!;
  }
}
```

Since both the main select and the count query already share the same `whereClause` variable, both will automatically use the updated conditions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- src/services/referee/referee-match.service.test.ts`
Expected: PASS (all tests including existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-match.service.ts apps/api/src/services/referee/referee-match.service.test.ts
git commit -m "feat(api): filter match list by referee assignment rules"
```

---

### Task 6: Add take-intent guard for rule enforcement

**Files:**
- Modify: `apps/api/src/services/referee/referee-match.service.ts`
- Modify: `apps/api/src/services/referee/referee-match.service.test.ts`

- [ ] **Step 1: Write tests for the take-intent guard**

Add test cases to `apps/api/src/services/referee/referee-match.service.test.ts`:

1. Referee with no rules can take any slot on own-club home game (existing behavior preserved)
2. Referee with rules can take a slot matching their rule → success
3. Referee with rules tries to take a slot not matching their rule → 403
4. Referee with rules for team A tries to take slot on team B's home game → 403
5. Federation-assigned open slots are never blocked by rules

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `pnpm --filter @dragons/api test -- src/services/referee/referee-match.service.test.ts`
Expected: New guard tests FAIL.

- [ ] **Step 3: Add rule guard to `recordTakeIntent`**

In `apps/api/src/services/referee/referee-match.service.ts`:

**First**, add a static import at the top of the file (no circular dependency exists):
```typescript
import { hasAnyRules, getRuleForRefereeAndTeam } from "./referee-rules.service";
```

**Second**, modify the existing `recordTakeIntent` select query (around line 211) to also return the home team's internal ID. Add to the `.select({})` object:
```typescript
homeTeamId: homeTeam.id,
```

**Third**, after the existing `isOwnClubRefsMatch` check (around line 233), add:

```typescript
// Rule-based guard for own-club home games
if (isOwnClubRefsMatch) {
  const refHasRules = await hasAnyRules(refereeId);

  if (refHasRules) {
    const rule = await getRuleForRefereeAndTeam(refereeId, match.homeTeamId);

    if (!rule) {
      return { error: "Not eligible for this match", status: 403 };
    }

    const slotAllowed =
      (slotNumber === 1 && rule.allowSr1) ||
      (slotNumber === 2 && rule.allowSr2);

    if (!slotAllowed) {
      return { error: "Not eligible for this slot", status: 403 };
    }
  }
}
```

This uses `match.homeTeamId` directly from the existing select+join, avoiding an extra query. The `homeTeam` alias is already joined in `recordTakeIntent`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- src/services/referee/referee-match.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `pnpm --filter @dragons/api test`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/referee/referee-match.service.ts apps/api/src/services/referee/referee-match.service.test.ts
git commit -m "feat(api): add rule-based guard to take-intent for own-club home games"
```

---

## Chunk 4: Admin UI — Rules Dialog

### Task 7: Add referee rules dialog to admin frontend

**Files:**
- Create: `apps/web/src/components/admin/referees/referee-rules-dialog.tsx`
- Modify: `apps/web/src/components/admin/referees/referee-list-table.tsx`
- Modify: `apps/web/src/lib/swr-keys.ts`

- [ ] **Step 1: Add SWR key for rules**

Add to `apps/web/src/lib/swr-keys.ts`:
```typescript
refereeRules: (refereeId: number) => `/admin/referees/${refereeId}/rules`,
```

- [ ] **Step 2: Create the rules dialog component**

Create `apps/web/src/components/admin/referees/referee-rules-dialog.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import useSWR, { mutate } from "swr"
import { toast } from "sonner"
import { fetchAPI } from "@/lib/api"
import { apiFetcher } from "@/lib/swr"
import { SWR_KEYS } from "@/lib/swr-keys"

import { Button } from "@dragons/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select"
import { Checkbox } from "@dragons/ui/components/checkbox"
import { Trash2, Plus } from "lucide-react"

import type { RefereeListItem } from "./types"

interface Team {
  id: number
  name: string
  isOwnClub: boolean
}

interface RuleRow {
  teamId: number | null
  allowSr1: boolean
  allowSr2: boolean
}

interface RefereeRulesDialogProps {
  referee: RefereeListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RefereeRulesDialog({
  referee,
  open,
  onOpenChange,
}: RefereeRulesDialogProps) {
  const t = useTranslations("referees")
  const [rules, setRules] = useState<RuleRow[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Fetch own-club teams
  const { data: teamsData } = useSWR<{ items: Team[] }>(
    open ? SWR_KEYS.teams : null,
    apiFetcher,
  )
  const ownClubTeams = teamsData?.items?.filter((t) => t.isOwnClub) ?? []

  // Fetch existing rules
  const { data: rulesData } = useSWR(
    open && referee ? SWR_KEYS.refereeRules(referee.id) : null,
    apiFetcher,
  )

  // Populate form when rules data loads
  useEffect(() => {
    if (rulesData?.rules) {
      setRules(
        rulesData.rules.map((r: { teamId: number; allowSr1: boolean; allowSr2: boolean }) => ({
          teamId: r.teamId,
          allowSr1: r.allowSr1,
          allowSr2: r.allowSr2,
        })),
      )
    } else if (open) {
      setRules([])
    }
  }, [rulesData, open])

  function addRule() {
    setRules([...rules, { teamId: null, allowSr1: false, allowSr2: true }])
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index))
  }

  function updateRule(index: number, updates: Partial<RuleRow>) {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...updates } : r)))
  }

  // Teams already used in other rules (for filtering dropdowns)
  function usedTeamIds(excludeIndex: number): Set<number> {
    return new Set(
      rules
        .filter((_, i) => i !== excludeIndex)
        .map((r) => r.teamId)
        .filter((id): id is number => id !== null),
    )
  }

  async function handleSave() {
    if (!referee) return

    // Validate: all rules must have a team and at least one slot
    const validRules = rules.filter(
      (r) => r.teamId !== null && (r.allowSr1 || r.allowSr2),
    )

    setSubmitting(true)
    try {
      await fetchAPI(`/admin/referees/${referee.id}/rules`, {
        method: "PUT",
        body: JSON.stringify({
          rules: validRules.map((r) => ({
            teamId: r.teamId,
            allowSr1: r.allowSr1,
            allowSr2: r.allowSr2,
          })),
        }),
      })

      toast.success(t("rules.saved"))
      await mutate(SWR_KEYS.refereeRules(referee.id))
      onOpenChange(false)
    } catch {
      toast.error(t("rules.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("rules.title", {
              name: `${referee?.firstName ?? ""} ${referee?.lastName ?? ""}`.trim(),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("rules.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rules.map((rule, index) => {
            const used = usedTeamIds(index)
            const availableTeams = ownClubTeams.filter(
              (t) => !used.has(t.id) || t.id === rule.teamId,
            )

            return (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={rule.teamId?.toString() ?? ""}
                  onValueChange={(val) => updateRule(index, { teamId: Number(val) })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("rules.selectTeam")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id.toString()}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <label className="flex items-center gap-1 text-sm">
                  <Checkbox
                    checked={rule.allowSr1}
                    onCheckedChange={(checked) =>
                      updateRule(index, { allowSr1: checked === true })
                    }
                  />
                  SR1
                </label>

                <label className="flex items-center gap-1 text-sm">
                  <Checkbox
                    checked={rule.allowSr2}
                    onCheckedChange={(checked) =>
                      updateRule(index, { allowSr2: checked === true })
                    }
                  />
                  SR2
                </label>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRule(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}

          {ownClubTeams.length > rules.length && (
            <Button variant="outline" size="sm" onClick={addRule} className="w-full">
              <Plus className="mr-1 h-4 w-4" />
              {t("rules.addRule")}
            </Button>
          )}

          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("rules.noRules")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("rules.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? t("rules.saving") : t("rules.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Add Rules button to the referee list table**

Modify `apps/web/src/components/admin/referees/referee-list-table.tsx`:

Add imports:
```typescript
import { useState } from "react"
import { Settings2 } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import { RefereeRulesDialog } from "./referee-rules-dialog"
```

Add a new column at the end of the `getColumns` function (after the `apiId` column):
```typescript
{
  id: "actions",
  header: "",
  cell: ({ row }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => onRulesClick(row.original)}
    >
      <Settings2 className="h-4 w-4" />
    </Button>
  ),
  enableSorting: false,
},
```

Update the `getColumns` function signature to accept the callback:
```typescript
function getColumns(
  t: ReturnType<typeof useTranslations<"referees">>,
  onRulesClick: (referee: RefereeListItem) => void,
): ColumnDef<RefereeListItem, unknown>[]
```

Inside `RefereeListTable`, add state and dialog:
```typescript
const [rulesReferee, setRulesReferee] = useState<RefereeListItem | null>(null)
const columns = useMemo(() => getColumns(t, setRulesReferee), [t])
```

Add dialog before the closing fragment:
```tsx
<RefereeRulesDialog
  referee={rulesReferee}
  open={rulesReferee !== null}
  onOpenChange={(open) => { if (!open) setRulesReferee(null) }}
/>
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referees/referee-rules-dialog.tsx apps/web/src/components/admin/referees/referee-list-table.tsx apps/web/src/lib/swr-keys.ts
git commit -m "feat(web): add referee rules dialog to admin UI"
```

---

## Chunk 5: Translations + Final Verification

### Task 8: Add translation keys

**Files:**
- Check and modify the translation files used by the referees section.

- [ ] **Step 1: Find the translation files**

Look for translation files containing referee keys. They should be in `apps/web/messages/` or similar. Check the `useTranslations("referees")` namespace.

- [ ] **Step 2: Add translation keys**

Add the following keys under the `referees` namespace:

```json
{
  "rules": {
    "title": "Assignment Rules for {name}",
    "description": "No rules = referee sees all home games. Adding rules restricts visibility to only the specified teams and slots.",
    "selectTeam": "Select team...",
    "addRule": "Add Rule",
    "noRules": "No rules defined — referee sees all home games.",
    "save": "Save",
    "saving": "Saving...",
    "cancel": "Cancel",
    "saved": "Rules saved successfully",
    "saveFailed": "Failed to save rules"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/messages/
git commit -m "feat(web): add translation keys for referee rules"
```

---

### Task 9: Run full verification

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Builds successfully.

- [ ] **Step 5: Manual smoke test** (if dev environment available)

1. Start dev: `pnpm dev`
2. Navigate to `/admin/referees`
3. Click the settings icon on a referee row
4. Add a rule: select a team, check SR2
5. Save
6. Verify: log in as that referee and check match list is filtered

- [ ] **Step 6: Final commit if any adjustments were needed**
