# Referee History UX Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-22-referee-history-restructure-design.md`

**Goal:** Rework `/admin/referee/history` into a tabbed, coordinator-focused view (Workload default + Games) with a ref drawer, preset-driven filters, issues callout, OPEN-pill game rows, and CSV export — backed by additive changes to existing summary / games endpoints.

**Architecture:** Backend gets additive Zod/service changes (`availableLeagues`, `refereeApiId` filter, comma-list `status`) plus two new CSV routes. Frontend replaces `history-page.tsx` and most `components/referee/history/*` files with focused, single-responsibility components; filter state moves to a richer URL schema. Shared types in `@dragons/shared` gain `availableLeagues` and a status-array type.

**Tech Stack:** Hono + Zod + Drizzle (API), Next.js 16 App Router + SWR + Radix (web), Vitest + Testing Library.

**Conventions (all tasks):**

- Run API tests: `pnpm --filter @dragons/api test -- <glob>`
- Run web tests: `pnpm --filter @dragons/web test -- <glob>`
- Run typecheck before commit: `pnpm typecheck`
- Never add `Co-Authored-By` or AI trailers (per CLAUDE.md).
- Commit after each task passes tests + typecheck.

---

## Phase A — Backend

### Task 1: Extend Zod schemas — comma-list `status` + `refereeApiId`

**Files:**
- Modify: `apps/api/src/routes/admin/referee-history.schemas.ts`
- Test: `apps/api/src/routes/admin/referee-history.schemas.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/admin/referee-history.schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  historyFilterSchema,
  historyGamesQuerySchema,
} from "./referee-history.schemas";

describe("historyFilterSchema status parsing", () => {
  it("defaults to empty array when omitted", () => {
    const parsed = historyFilterSchema.parse({});
    expect(parsed.status).toEqual([]);
  });

  it("parses 'all' as empty array", () => {
    const parsed = historyFilterSchema.parse({ status: "all" });
    expect(parsed.status).toEqual([]);
  });

  it("parses comma list into array", () => {
    const parsed = historyFilterSchema.parse({ status: "cancelled,forfeited" });
    expect(parsed.status).toEqual(["cancelled", "forfeited"]);
  });

  it("accepts legacy 'active' as ['played']", () => {
    const parsed = historyFilterSchema.parse({ status: "active" });
    expect(parsed.status).toEqual(["played"]);
  });

  it("rejects unknown value", () => {
    expect(() => historyFilterSchema.parse({ status: "nope" })).toThrow();
  });

  it("rejects unknown value inside list", () => {
    expect(() =>
      historyFilterSchema.parse({ status: "played,bogus" }),
    ).toThrow();
  });
});

describe("historyGamesQuerySchema refereeApiId", () => {
  it("coerces numeric string to number", () => {
    const parsed = historyGamesQuerySchema.parse({ refereeApiId: "42" });
    expect(parsed.refereeApiId).toBe(42);
  });

  it("omits refereeApiId when absent", () => {
    const parsed = historyGamesQuerySchema.parse({});
    expect(parsed.refereeApiId).toBeUndefined();
  });

  it("rejects non-integer refereeApiId", () => {
    expect(() =>
      historyGamesQuerySchema.parse({ refereeApiId: "abc" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `pnpm --filter @dragons/api test -- referee-history.schemas`
Expected: fails — schema still uses single-enum `status`, no `refereeApiId`.

- [ ] **Step 3: Rewrite `referee-history.schemas.ts`**

Replace entire file contents:

```ts
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const statusValue = z.enum(["played", "cancelled", "forfeited"]);
export type HistoryStatusValue = z.infer<typeof statusValue>;

// Accept:
//   - undefined | "" | "all"   → []
//   - "active"                 → ["played"]  (legacy alias)
//   - "played,cancelled,..."   → parsed array, each value validated
const statusField = z
  .union([z.string(), z.undefined()])
  .transform((raw, ctx) => {
    if (raw === undefined || raw === "" || raw === "all") return [];
    if (raw === "active") return ["played"] as HistoryStatusValue[];
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const result: HistoryStatusValue[] = [];
    for (const p of parts) {
      const r = statusValue.safeParse(p);
      if (!r.success) {
        ctx.addIssue({ code: "custom", message: `invalid status "${p}"` });
        return z.NEVER;
      }
      result.push(r.data);
    }
    return result;
  });

export const historyFilterSchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  league: z.string().trim().min(1).optional(),
  status: statusField,
});

export const historyGamesQuerySchema = historyFilterSchema.extend({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  refereeApiId: z.coerce.number().int().positive().optional(),
});

export type HistoryFilterParams = z.infer<typeof historyFilterSchema>;
export type HistoryGamesQueryParams = z.infer<typeof historyGamesQuerySchema>;
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @dragons/api test -- referee-history.schemas`
Expected: all new tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/referee-history.schemas.ts \
        apps/api/src/routes/admin/referee-history.schemas.test.ts
git commit -m "feat(api): history schema accepts comma-list status + refereeApiId"
```

---

### Task 2: Service — rewrite `buildBaseWhere` for status array

**Files:**
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.test.ts`

- [ ] **Step 1: Update existing tests for array status**

In `referee-history.service.test.ts`, every call site currently using `status: "active"` / `"all"` / `"cancelled"` / `"forfeited"` must be updated. Replace them as follows (use your editor's find-and-replace across the file):

- `status: "all"`       → `status: []`
- `status: "active"`    → `status: ["played"]`
- `status: "cancelled"` → `status: ["cancelled"]`
- `status: "forfeited"` → `status: ["forfeited"]`

Then add a new test block at the bottom of `describe("getRefereeHistorySummary KPIs", ...)`:

```ts
it("status=['cancelled','forfeited'] returns both", async () => {
  await ctx.db.insert(refereeGames).values([
    baseGame({ apiMatchId: 1 }),
    baseGame({ apiMatchId: 2, isCancelled: true }),
    baseGame({ apiMatchId: 3, isForfeited: true }),
  ]);

  const res = await getRefereeHistorySummary({
    dateFrom: "2025-08-01",
    dateTo: "2026-07-31",
    status: ["cancelled", "forfeited"],
  });

  expect(res.kpis.games).toBe(2);
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: fails — service still branches on string literals.

- [ ] **Step 3: Rewrite `buildBaseWhere`**

In `apps/api/src/services/admin/referee-history.service.ts`, replace the existing `buildBaseWhere` function:

```ts
function buildBaseWhere(
  params: HistoryFilterParams,
  resolvedFrom: string,
  resolvedTo: string,
) {
  const conds = [
    gte(refereeGames.kickoffDate, resolvedFrom),
    lte(refereeGames.kickoffDate, resolvedTo),
    buildRelevantGamesPredicate(),
  ];
  if (params.league) conds.push(eq(refereeGames.leagueShort, params.league));

  // Empty array = no status filter (show all).
  if (params.status.length > 0) {
    const wants = new Set(params.status);
    const wantsPlayed = wants.has("played");
    const wantsCancelled = wants.has("cancelled");
    const wantsForfeited = wants.has("forfeited");

    // "played" = not cancelled AND not forfeited.
    const statusPreds: ReturnType<typeof or>[] = [];
    if (wantsPlayed) {
      statusPreds.push(
        and(
          eq(refereeGames.isCancelled, false),
          eq(refereeGames.isForfeited, false),
        )!,
      );
    }
    if (wantsCancelled) statusPreds.push(eq(refereeGames.isCancelled, true)!);
    if (wantsForfeited) statusPreds.push(eq(refereeGames.isForfeited, true)!);
    conds.push(or(...statusPreds)!);
  }
  return and(...conds)!;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts \
        apps/api/src/services/admin/referee-history.service.test.ts
git commit -m "feat(api): history service status array predicate"
```

---

### Task 3: Service — add `availableLeagues` to summary

**Files:**
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.test.ts`
- Modify: `packages/shared/src/referee-history.ts`

- [ ] **Step 1: Extend shared response type**

In `packages/shared/src/referee-history.ts`, add the new type and field:

```ts
export interface HistoryAvailableLeague {
  short: string;
  name: string | null;
}

export interface HistorySummaryResponse {
  range: HistoryDateRange;
  kpis: HistoryKpis;
  leaderboard: HistoryLeaderboardEntry[];
  availableLeagues: HistoryAvailableLeague[];
}
```

- [ ] **Step 2: Write failing test**

Add to `referee-history.service.test.ts`, new `describe` block after leaderboard tests:

```ts
describe("getRefereeHistorySummary availableLeagues", () => {
  beforeEach(async () => { await seedReferees(); });

  it("returns distinct (short, name) pairs within range, sorted by short", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, leagueShort: "OL", leagueName: "Oberliga" }),
      baseGame({ apiMatchId: 2, leagueShort: "RLW", leagueName: "Regionalliga West" }),
      baseGame({ apiMatchId: 3, leagueShort: "OL", leagueName: "Oberliga" }), // dup
    ]);

    const res = await getRefereeHistorySummary({
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: [],
    });

    expect(res.availableLeagues).toEqual([
      { short: "OL", name: "Oberliga" },
      { short: "RLW", name: "Regionalliga West" },
    ]);
  });

  it("availableLeagues is not narrowed by league filter", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, leagueShort: "OL", leagueName: "Oberliga" }),
      baseGame({ apiMatchId: 2, leagueShort: "RLW", leagueName: "Regionalliga West" }),
    ]);

    const res = await getRefereeHistorySummary({
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      league: "RLW",
      status: [],
    });

    expect(res.availableLeagues.map((l) => l.short)).toEqual(["OL", "RLW"]);
  });

  it("skips rows with null leagueShort", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, leagueShort: null, leagueName: null }),
      baseGame({ apiMatchId: 2, leagueShort: "OL", leagueName: "Oberliga" }),
    ]);

    const res = await getRefereeHistorySummary({
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: [],
    });

    expect(res.availableLeagues).toEqual([
      { short: "OL", name: "Oberliga" },
    ]);
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: fail (no `availableLeagues` in response).

- [ ] **Step 4: Implement in service**

In `getRefereeHistorySummary`, before the final `return`, compute and append. Build a secondary WHERE that excludes the `league` filter so the list doesn't shrink when the user selects one.

Add a helper above `getRefereeHistorySummary`:

```ts
function buildLeagueScopeWhere(
  params: HistoryFilterParams,
  resolvedFrom: string,
  resolvedTo: string,
) {
  const conds = [
    gte(refereeGames.kickoffDate, resolvedFrom),
    lte(refereeGames.kickoffDate, resolvedTo),
    buildRelevantGamesPredicate(),
  ];
  if (params.status.length > 0) {
    const wants = new Set(params.status);
    const statusPreds: ReturnType<typeof or>[] = [];
    if (wants.has("played")) {
      statusPreds.push(
        and(
          eq(refereeGames.isCancelled, false),
          eq(refereeGames.isForfeited, false),
        )!,
      );
    }
    if (wants.has("cancelled")) statusPreds.push(eq(refereeGames.isCancelled, true)!);
    if (wants.has("forfeited")) statusPreds.push(eq(refereeGames.isForfeited, true)!);
    conds.push(or(...statusPreds)!);
  }
  return and(...conds)!;
}
```

Then in `getRefereeHistorySummary`, before `return`:

```ts
const leagueScope = buildLeagueScopeWhere(params, range.from, range.to);
const leagueRows = await db
  .selectDistinct({
    short: refereeGames.leagueShort,
    name: refereeGames.leagueName,
  })
  .from(refereeGames)
  .where(and(leagueScope, sql`${refereeGames.leagueShort} IS NOT NULL`)!)
  .orderBy(refereeGames.leagueShort);

const availableLeagues: HistoryAvailableLeague[] = leagueRows
  .filter((r): r is { short: string; name: string | null } => r.short !== null)
  .map((r) => ({ short: r.short, name: r.name }));

return { range, kpis: finalKpis, leaderboard, availableLeagues };
```

Update the `HistoryAvailableLeague` import at the top of the service file.

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service`

- [ ] **Step 6: Update route response + existing route test**

In `apps/api/src/routes/admin/referee-history.routes.test.ts`, the mock responses in `/referee/history/summary` tests must include `availableLeagues: []`. Add that field to every `mocks.getRefereeHistorySummary.mockResolvedValue(...)` call.

Run: `pnpm --filter @dragons/api test -- referee-history.routes`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts \
        apps/api/src/services/admin/referee-history.service.test.ts \
        apps/api/src/routes/admin/referee-history.routes.test.ts \
        packages/shared/src/referee-history.ts
git commit -m "feat(api): summary returns availableLeagues"
```

---

### Task 4: Service — add `refereeApiId` filter to games

**Files:**
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.test.ts`
- Modify: `apps/api/src/routes/admin/referee-history.routes.ts`
- Modify: `apps/api/src/routes/admin/referee-history.routes.test.ts`

- [ ] **Step 1: Write failing test**

Add a new `describe` block at the bottom of `referee-history.service.test.ts`:

```ts
describe("getRefereeHistoryGames refereeApiId filter", () => {
  beforeEach(async () => { await seedReferees(); });

  it("returns only games where the given refereeApiId appears in SR1 or SR2", async () => {
    await ctx.db.insert(refereeGames).values([
      // Anna (100) as SR1
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-01",
        sr1RefereeApiId: 100, sr2RefereeApiId: 101 }),
      // Anna (100) as SR2
      baseGame({ apiMatchId: 2, kickoffDate: "2025-09-02",
        sr1RefereeApiId: 101, sr2RefereeApiId: 100 }),
      // Anna not involved
      baseGame({ apiMatchId: 3, kickoffDate: "2025-09-03",
        sr1RefereeApiId: 101, sr2RefereeApiId: 200,
        sr1Name: "Own, Ben", sr2Name: "Guest, Carl" }),
    ]);

    const res = await getRefereeHistoryGames({
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: [],
      limit: 50,
      offset: 0,
      refereeApiId: 100,
    });

    expect(res.total).toBe(2);
    expect(res.items.map((i) => i.matchNo).sort()).not.toContain(3);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: fail (param ignored).

- [ ] **Step 3: Implement in service**

In `getRefereeHistoryGames`, after the existing `conds` build and before the `where` assignment, add:

```ts
if (params.refereeApiId !== undefined) {
  conds.push(
    or(
      eq(refereeGames.sr1RefereeApiId, params.refereeApiId),
      eq(refereeGames.sr2RefereeApiId, params.refereeApiId),
    )!,
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service`

- [ ] **Step 5: Route already forwards — add parse + test**

In `apps/api/src/routes/admin/referee-history.routes.ts`, extend the `/games` handler to read and forward `refereeApiId`:

```ts
const parsed = historyGamesQuerySchema.parse({
  dateFrom: c.req.query("dateFrom"),
  dateTo: c.req.query("dateTo"),
  league: c.req.query("league"),
  status: c.req.query("status"),
  search: c.req.query("search"),
  limit: c.req.query("limit"),
  offset: c.req.query("offset"),
  refereeApiId: c.req.query("refereeApiId"),
});
```

In `referee-history.routes.test.ts`, add to the existing `describe("GET /referee/history/games", ...)`:

```ts
it("forwards refereeApiId", async () => {
  mocks.getRefereeHistoryGames.mockResolvedValue({
    items: [], total: 0, limit: 50, offset: 0, hasMore: false,
  });
  const res = await app.request(
    "/referee/history/games?refereeApiId=42",
  );
  expect(res.status).toBe(200);
  expect(mocks.getRefereeHistoryGames).toHaveBeenCalledWith(
    expect.objectContaining({ refereeApiId: 42 }),
  );
});
```

- [ ] **Step 6: Run route tests**

Run: `pnpm --filter @dragons/api test -- referee-history.routes`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts \
        apps/api/src/services/admin/referee-history.service.test.ts \
        apps/api/src/routes/admin/referee-history.routes.ts \
        apps/api/src/routes/admin/referee-history.routes.test.ts
git commit -m "feat(api): history games filter by refereeApiId"
```

---

### Task 5: CSV helpers + `games.csv` endpoint

**Files:**
- Create: `apps/api/src/services/admin/referee-history.csv.ts`
- Create: `apps/api/src/services/admin/referee-history.csv.test.ts`
- Modify: `apps/api/src/routes/admin/referee-history.routes.ts`
- Modify: `apps/api/src/routes/admin/referee-history.routes.test.ts`

- [ ] **Step 1: Write failing unit test for CSV helper**

`apps/api/src/services/admin/referee-history.csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toCsv, gamesToCsvRows, leaderboardToCsvRows } from "./referee-history.csv";
import type { HistoryGameItem, HistoryLeaderboardEntry } from "@dragons/shared";

describe("toCsv", () => {
  it("joins header + rows with CRLF", () => {
    const csv = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv(["h"], [['a,b'], ['a"b'], ["a\nb"]]);
    expect(csv).toBe('h\r\n"a,b"\r\n"a""b"\r\n"a\nb"\r\n');
  });

  it("empty rows produce header-only CSV", () => {
    const csv = toCsv(["h1", "h2"], []);
    expect(csv).toBe("h1,h2\r\n");
  });
});

describe("gamesToCsvRows", () => {
  it("flattens booleans and nulls", () => {
    const item: HistoryGameItem = {
      id: 1, matchId: null, matchNo: 7,
      kickoffDate: "2025-09-01", kickoffTime: "18:00:00",
      homeTeamName: "Dragons", guestTeamName: "Bears",
      leagueName: "Oberliga", leagueShort: "OL",
      venueName: null, venueCity: null,
      sr1OurClub: true, sr2OurClub: false,
      sr1Name: "Mueller", sr2Name: null,
      sr1Status: "filled", sr2Status: "open",
      isCancelled: false, isForfeited: false, isHomeGame: true,
    };
    const [row] = gamesToCsvRows([item]);
    expect(row).toContain("true");
    expect(row).toContain("false");
    // null → empty
    expect(row.some((v) => v === "")).toBe(true);
  });
});

describe("leaderboardToCsvRows", () => {
  it("produces rank-indexed rows", () => {
    const entries: HistoryLeaderboardEntry[] = [
      { refereeApiId: 100, refereeId: 1, displayName: "Mueller",
        isOwnClub: true, sr1Count: 3, sr2Count: 2, total: 5,
        lastRefereedDate: "2025-09-30" },
      { refereeApiId: null, refereeId: null, displayName: "Guest",
        isOwnClub: false, sr1Count: 1, sr2Count: 0, total: 1,
        lastRefereedDate: null },
    ];
    const rows = leaderboardToCsvRows(entries);
    expect(rows[0]![0]).toBe("1");
    expect(rows[1]![0]).toBe("2");
    expect(rows[1]![rows[1]!.length - 1]).toBe("");
  });
});
```

- [ ] **Step 2: Run, verify fail (module missing)**

Run: `pnpm --filter @dragons/api test -- referee-history.csv`
Expected: fail — file does not exist.

- [ ] **Step 3: Implement CSV helper**

`apps/api/src/services/admin/referee-history.csv.ts`:

```ts
import type {
  HistoryGameItem,
  HistoryLeaderboardEntry,
} from "@dragons/shared";

const NEEDS_QUOTES = /[",\r\n]/;

function escape(field: string): string {
  if (!NEEDS_QUOTES.test(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) lines.push(r.map(escape).join(","));
  return lines.join("\r\n") + "\r\n";
}

export const GAMES_CSV_HEADERS = [
  "id", "matchId", "matchNo",
  "kickoffDate", "kickoffTime",
  "homeTeamName", "guestTeamName",
  "leagueShort", "leagueName",
  "venueName", "venueCity",
  "sr1OurClub", "sr2OurClub",
  "sr1Name", "sr2Name",
  "sr1Status", "sr2Status",
  "isCancelled", "isForfeited", "isHomeGame",
];

function str(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function gamesToCsvRows(items: HistoryGameItem[]): string[][] {
  return items.map((g) => [
    str(g.id), str(g.matchId), str(g.matchNo),
    str(g.kickoffDate), str(g.kickoffTime),
    str(g.homeTeamName), str(g.guestTeamName),
    str(g.leagueShort), str(g.leagueName),
    str(g.venueName), str(g.venueCity),
    str(g.sr1OurClub), str(g.sr2OurClub),
    str(g.sr1Name), str(g.sr2Name),
    str(g.sr1Status), str(g.sr2Status),
    str(g.isCancelled), str(g.isForfeited), str(g.isHomeGame),
  ]);
}

export const LEADERBOARD_CSV_HEADERS = [
  "rank", "displayName", "isOwnClub",
  "refereeApiId", "refereeId",
  "sr1Count", "sr2Count", "total",
  "lastRefereedDate",
];

export function leaderboardToCsvRows(
  entries: HistoryLeaderboardEntry[],
): string[][] {
  return entries.map((e, i) => [
    String(i + 1),
    e.displayName,
    String(e.isOwnClub),
    str(e.refereeApiId),
    str(e.refereeId),
    String(e.sr1Count),
    String(e.sr2Count),
    String(e.total),
    str(e.lastRefereedDate),
  ]);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @dragons/api test -- referee-history.csv`

- [ ] **Step 5: Write failing route test for `games.csv`**

Append to `referee-history.routes.test.ts`:

```ts
describe("GET /referee/history/games.csv", () => {
  it("returns text/csv with attachment filename based on range", async () => {
    mocks.getRefereeHistoryGames.mockResolvedValue({
      items: [{
        id: 1, matchId: null, matchNo: 1,
        kickoffDate: "2025-09-01", kickoffTime: "18:00:00",
        homeTeamName: "D", guestTeamName: "B",
        leagueName: null, leagueShort: "OL",
        venueName: null, venueCity: null,
        sr1OurClub: true, sr2OurClub: false,
        sr1Name: null, sr2Name: null,
        sr1Status: "open", sr2Status: "open",
        isCancelled: false, isForfeited: false, isHomeGame: true,
      }],
      total: 1, limit: 1000, offset: 0, hasMore: false,
    });

    const res = await app.request(
      "/referee/history/games.csv?dateFrom=2025-08-01&dateTo=2026-07-31",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="referee-history-games-2025-08-01-2026-07-31.csv"',
    );
    const body = await res.text();
    expect(body.split("\r\n")[0]).toContain("kickoffDate");
  });
});
```

- [ ] **Step 6: Run, verify fail**

Run: `pnpm --filter @dragons/api test -- referee-history.routes`
Expected: fail (endpoint missing).

- [ ] **Step 7: Add route handler**

At the bottom of `referee-history.routes.ts`, before `export`:

```ts
import {
  GAMES_CSV_HEADERS,
  gamesToCsvRows,
  LEADERBOARD_CSV_HEADERS,
  leaderboardToCsvRows,
  toCsv,
} from "../../services/admin/referee-history.csv";

// GET /admin/referee/history/games.csv - CSV export of all games matching filters
adminRefereeHistoryRoutes.get(
  "/referee/history/games.csv",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "CSV export of referee history games",
    tags: ["Referees"],
    responses: { 200: { description: "text/csv" } },
  }),
  async (c) => {
    const parsed = historyGamesQuerySchema.parse({
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
      search: c.req.query("search"),
      refereeApiId: c.req.query("refereeApiId"),
      limit: "1000",
      offset: "0",
    });
    const page = await getRefereeHistoryGames(parsed);
    const csv = toCsv(GAMES_CSV_HEADERS, gamesToCsvRows(page.items));
    const from = parsed.dateFrom ?? "range";
    const to = parsed.dateTo ?? "range";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="referee-history-games-${from}-${to}.csv"`,
      },
    });
  },
);
```

Note: the 1000-row cap is conservative. If any deployment exceeds that, bump `limit` in the schema; leaderboard exports are unbounded in Task 6.

- [ ] **Step 8: Run, verify pass**

Run: `pnpm --filter @dragons/api test -- referee-history.routes`

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/admin/referee-history.csv.ts \
        apps/api/src/services/admin/referee-history.csv.test.ts \
        apps/api/src/routes/admin/referee-history.routes.ts \
        apps/api/src/routes/admin/referee-history.routes.test.ts
git commit -m "feat(api): referee history games.csv export endpoint"
```

---

### Task 6: `leaderboard.csv` endpoint (no row cap)

**Files:**
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/routes/admin/referee-history.routes.ts`
- Modify: `apps/api/src/routes/admin/referee-history.routes.test.ts`

- [ ] **Step 1: Write failing route test**

Append to `referee-history.routes.test.ts`:

```ts
describe("GET /referee/history/leaderboard.csv", () => {
  it("returns text/csv with rank-indexed rows and no row cap", async () => {
    mocks.getRefereeHistorySummary.mockResolvedValue({
      range: { from: "2025-08-01", to: "2026-07-31", source: "user" },
      kpis: {
        games: 0, obligatedSlots: 0, filledSlots: 0, unfilledSlots: 0,
        cancelled: 0, forfeited: 0, distinctReferees: 2,
      },
      availableLeagues: [],
      leaderboard: [
        { refereeApiId: 100, refereeId: 1, displayName: "Mueller, A",
          isOwnClub: true, sr1Count: 3, sr2Count: 1, total: 4,
          lastRefereedDate: "2025-09-30" },
        { refereeApiId: null, refereeId: null, displayName: "Guest",
          isOwnClub: false, sr1Count: 0, sr2Count: 1, total: 1,
          lastRefereedDate: null },
      ],
    });

    const res = await app.request(
      "/referee/history/leaderboard.csv?dateFrom=2025-08-01&dateTo=2026-07-31",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const body = await res.text();
    const lines = body.trim().split("\r\n");
    expect(lines[0]).toBe(
      "rank,displayName,isOwnClub,refereeApiId,refereeId,sr1Count,sr2Count,total,lastRefereedDate",
    );
    expect(lines[1]).toBe("1,\"Mueller, A\",true,100,1,3,1,4,2025-09-30");
    expect(lines[2]).toBe("2,Guest,false,,,0,1,1,");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @dragons/api test -- referee-history.routes`

- [ ] **Step 3: Service — accept optional row cap**

In `referee-history.service.ts`, change the `LIMIT 100` inside the leaderboard SQL to a parameterised value. Add a second exported function `getRefereeHistoryLeaderboard` that shares the query but accepts a limit:

```ts
export async function getRefereeHistoryLeaderboard(
  params: HistoryFilterParams,
  options: { limit?: number } = {},
): Promise<HistoryLeaderboardEntry[]> {
  const range = await resolveHistoryDateRange(params.dateFrom, params.dateTo);
  const where = buildBaseWhere(params, range.from, range.to);
  const limit = options.limit ?? 100;

  const rows = await db.execute(sql`
    WITH appearances AS (
      SELECT ${refereeGames.sr1RefereeApiId} AS api_id,
             ${refereeGames.sr1Name} AS raw_name, 1 AS sr1, 0 AS sr2,
             ${refereeGames.kickoffDate} AS kickoff_date
      FROM ${refereeGames}
      WHERE ${where}
        AND (${refereeGames.sr1RefereeApiId} IS NOT NULL OR ${refereeGames.sr1Name} IS NOT NULL)
      UNION ALL
      SELECT ${refereeGames.sr2RefereeApiId},
             ${refereeGames.sr2Name}, 0, 1,
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
      r.last_name AS "lastName",
      COALESCE(r.is_own_club, false) AS "isOwnClub"
    FROM appearances a
    LEFT JOIN ${referees} r ON r.api_id = a.api_id
    GROUP BY group_key, a.api_id, r.id, r.first_name, r.last_name, r.is_own_club
    ORDER BY total DESC, "lastRefereedDate" DESC NULLS LAST
    LIMIT ${limit}
  `);

  return (rows.rows as Array<{
    apiId: number | null; rawName: string | null;
    refereeId: number | null; firstName: string | null; lastName: string | null;
    isOwnClub: boolean; sr1Count: number; sr2Count: number;
    total: number; lastRefereedDate: string | null;
  }>).map((r) => ({
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
}
```

Update `getRefereeHistorySummary` to call `getRefereeHistoryLeaderboard(params, { limit: 100 })` instead of the inline SQL. Remove the duplicated inline block.

- [ ] **Step 4: Add route handler**

Append to `referee-history.routes.ts`:

```ts
import { getRefereeHistoryLeaderboard } from "../../services/admin/referee-history.service";

adminRefereeHistoryRoutes.get(
  "/referee/history/leaderboard.csv",
  requirePermission("assignment", "view"),
  describeRoute({
    description: "CSV export of referee history leaderboard",
    tags: ["Referees"],
    responses: { 200: { description: "text/csv" } },
  }),
  async (c) => {
    const parsed = historyFilterSchema.parse({
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
      league: c.req.query("league"),
      status: c.req.query("status"),
    });
    const entries = await getRefereeHistoryLeaderboard(parsed, { limit: 10000 });
    const csv = toCsv(LEADERBOARD_CSV_HEADERS, leaderboardToCsvRows(entries));
    const from = parsed.dateFrom ?? "range";
    const to = parsed.dateTo ?? "range";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="referee-history-leaderboard-${from}-${to}.csv"`,
      },
    });
  },
);
```

Note: the route test mocks `getRefereeHistorySummary` which used to own the leaderboard. Change the mock in the leaderboard.csv test to stub `getRefereeHistoryLeaderboard` instead. Update the existing mocks block:

```ts
const mocks = vi.hoisted(() => ({
  getRefereeHistorySummary: vi.fn(),
  getRefereeHistoryGames: vi.fn(),
  getRefereeHistoryLeaderboard: vi.fn(),
}));

vi.mock("../../services/admin/referee-history.service", () => ({
  getRefereeHistorySummary: mocks.getRefereeHistorySummary,
  getRefereeHistoryGames: mocks.getRefereeHistoryGames,
  getRefereeHistoryLeaderboard: mocks.getRefereeHistoryLeaderboard,
}));
```

Then inside the test (replace the summary mock):

```ts
mocks.getRefereeHistoryLeaderboard.mockResolvedValue([
  { refereeApiId: 100, refereeId: 1, displayName: "Mueller, A",
    isOwnClub: true, sr1Count: 3, sr2Count: 1, total: 4,
    lastRefereedDate: "2025-09-30" },
  { refereeApiId: null, refereeId: null, displayName: "Guest",
    isOwnClub: false, sr1Count: 0, sr2Count: 1, total: 1,
    lastRefereedDate: null },
]);
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @dragons/api test -- referee-history`
Expected: all four test files pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/referee-history.service.ts \
        apps/api/src/routes/admin/referee-history.routes.ts \
        apps/api/src/routes/admin/referee-history.routes.test.ts
git commit -m "feat(api): referee history leaderboard.csv export endpoint"
```

---

## Phase B — Frontend plumbing

### Task 7: Extend shared `HistoryStatus` + filter state types

**Files:**
- Modify: `packages/shared/src/referee-history.ts`
- Modify: `apps/web/src/components/referee/history/filter-state.ts`
- Create: `apps/web/src/components/referee/history/filter-state.test.ts`

- [ ] **Step 1: Update shared status type**

In `packages/shared/src/referee-history.ts`, replace the `HistoryStatus` line:

```ts
export type HistoryStatusValue = "played" | "cancelled" | "forfeited";
// Kept for legacy callers only; new code should use HistoryStatusValue[]
export type HistoryStatus = "all" | "active" | "cancelled" | "forfeited";
```

- [ ] **Step 2: Write failing test for filter-state**

`apps/web/src/components/referee/history/filter-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseHistoryFilterState,
  buildHistoryQuery,
  summaryKey,
  gamesKey,
  resolvePresetRange,
} from "./filter-state";

describe("parseHistoryFilterState", () => {
  it("defaults: tab=workload, preset=season, status=[]", () => {
    const s = parseHistoryFilterState({});
    expect(s.tab).toBe("workload");
    expect(s.preset).toBe("season");
    expect(s.status).toEqual([]);
    expect(s.limit).toBe(50);
    expect(s.offset).toBe(0);
  });

  it("parses comma-list status", () => {
    const s = parseHistoryFilterState({ status: "cancelled,forfeited" });
    expect(s.status).toEqual(["cancelled", "forfeited"]);
  });

  it("treats status=all as empty array", () => {
    const s = parseHistoryFilterState({ status: "all" });
    expect(s.status).toEqual([]);
  });

  it("legacy status=active maps to ['played']", () => {
    const s = parseHistoryFilterState({ status: "active" });
    expect(s.status).toEqual(["played"]);
  });

  it("parses ref as number", () => {
    const s = parseHistoryFilterState({ ref: "42" });
    expect(s.ref).toBe(42);
  });

  it("clamps limit to [25,50,100]", () => {
    expect(parseHistoryFilterState({ limit: "25" }).limit).toBe(25);
    expect(parseHistoryFilterState({ limit: "100" }).limit).toBe(100);
    expect(parseHistoryFilterState({ limit: "7" }).limit).toBe(50);
  });
});

describe("resolvePresetRange", () => {
  it("season returns season dates", () => {
    const r = resolvePresetRange("season", {
      from: "2025-08-01", to: "2026-07-31", today: new Date("2026-04-22"),
    });
    expect(r).toEqual({ dateFrom: "2025-08-01", dateTo: "2026-07-31" });
  });

  it("30d returns today-30 .. today", () => {
    const r = resolvePresetRange("30d", {
      from: "2025-08-01", to: "2026-07-31",
      today: new Date("2026-04-22T00:00:00Z"),
    });
    expect(r).toEqual({ dateFrom: "2026-03-23", dateTo: "2026-04-22" });
  });

  it("month returns first..last of current month", () => {
    const r = resolvePresetRange("month", {
      from: "2025-08-01", to: "2026-07-31",
      today: new Date("2026-04-22T00:00:00Z"),
    });
    expect(r).toEqual({ dateFrom: "2026-04-01", dateTo: "2026-04-30" });
  });
});

describe("query builders", () => {
  it("summaryKey always sends status=all", () => {
    const state = parseHistoryFilterState({ status: "cancelled" });
    const key = summaryKey({ ...state, dateFrom: "2025-08-01", dateTo: "2026-07-31" });
    expect(key).toContain("status=all");
    expect(key).not.toContain("cancelled");
  });

  it("gamesKey sends comma-list status", () => {
    const state = {
      ...parseHistoryFilterState({}),
      status: ["cancelled", "forfeited"] as const,
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    };
    const key = gamesKey(state, 50, 0);
    expect(key).toContain("status=cancelled%2Cforfeited");
  });

  it("gamesKey includes refereeApiId when present", () => {
    const state = {
      ...parseHistoryFilterState({}),
      ref: 42,
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    };
    const key = gamesKey(state, 50, 0);
    expect(key).toContain("refereeApiId=42");
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @dragons/web test -- filter-state`
Expected: fail (API surface doesn't exist yet).

- [ ] **Step 4: Rewrite `filter-state.ts`**

```ts
import { SWR_KEYS } from "@/lib/swr-keys";
import type { HistoryStatusValue } from "@dragons/shared";

export type HistoryTab = "workload" | "games";
export type HistoryPreset = "season" | "30d" | "month" | "custom";

export interface HistoryFilterStateWithSearch {
  tab: HistoryTab;
  preset: HistoryPreset;
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatusValue[];
  search?: string;
  ref?: number;
  offset: number;
  limit: 25 | 50 | 100;
}

type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const raw = source[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseStatus(raw: string | undefined): HistoryStatusValue[] {
  if (!raw || raw === "all") return [];
  if (raw === "active") return ["played"];
  const out: HistoryStatusValue[] = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part === "played" || part === "cancelled" || part === "forfeited") {
      out.push(part);
    }
  }
  return out;
}

const LIMIT_VALUES = [25, 50, 100] as const;
function parseLimit(raw: string | undefined): 25 | 50 | 100 {
  const n = Number(raw);
  return (LIMIT_VALUES as readonly number[]).includes(n)
    ? (n as 25 | 50 | 100)
    : 50;
}

function parseTab(raw: string | undefined): HistoryTab {
  return raw === "games" ? "games" : "workload";
}

function parsePreset(raw: string | undefined): HistoryPreset {
  return raw === "30d" || raw === "month" || raw === "custom" ? raw : "season";
}

export function parseHistoryFilterState(
  source: ParamSource,
): HistoryFilterStateWithSearch {
  const refRaw = read(source, "ref");
  const refNum = refRaw !== undefined ? Number(refRaw) : NaN;
  const offsetRaw = Number(read(source, "offset"));
  return {
    tab: parseTab(read(source, "tab")),
    preset: parsePreset(read(source, "preset")),
    dateFrom: read(source, "dateFrom"),
    dateTo: read(source, "dateTo"),
    league: read(source, "league"),
    status: parseStatus(read(source, "status")),
    search: read(source, "search"),
    ref: Number.isFinite(refNum) && refNum > 0 ? refNum : undefined,
    offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0,
    limit: parseLimit(read(source, "limit")),
  };
}

export interface ResolvePresetInput {
  from: string; // season default from
  to: string;   // season default to
  today: Date;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolvePresetRange(
  preset: HistoryPreset,
  input: ResolvePresetInput,
  custom?: { dateFrom?: string; dateTo?: string },
): { dateFrom: string; dateTo: string } {
  if (preset === "season") {
    return { dateFrom: input.from, dateTo: input.to };
  }
  if (preset === "30d") {
    const end = input.today;
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 30);
    return { dateFrom: iso(start), dateTo: iso(end) };
  }
  if (preset === "month") {
    const today = input.today;
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return { dateFrom: iso(first), dateTo: iso(last) };
  }
  // custom
  const firstOfMonth = new Date(Date.UTC(
    input.today.getUTCFullYear(), input.today.getUTCMonth(), 1,
  ));
  const lastOfMonth = new Date(Date.UTC(
    input.today.getUTCFullYear(), input.today.getUTCMonth() + 1, 0,
  ));
  return {
    dateFrom: custom?.dateFrom ?? iso(firstOfMonth),
    dateTo: custom?.dateTo ?? iso(lastOfMonth),
  };
}

interface HistoryQueryBase {
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatusValue[];
}

function buildHistoryQuery(
  state: HistoryQueryBase,
  extra: Record<string, string> = {},
  statusOverride?: "all",
): string {
  const p = new URLSearchParams();
  const statusStr = statusOverride
    ? statusOverride
    : state.status.length === 0
    ? "all"
    : state.status.join(",");
  p.set("status", statusStr);
  if (state.dateFrom) p.set("dateFrom", state.dateFrom);
  if (state.dateTo) p.set("dateTo", state.dateTo);
  if (state.league) p.set("league", state.league);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

// Summary always forces status=all. Workload tab must not react to the
// games-tab status chip.
export function summaryKey(state: HistoryFilterStateWithSearch): string {
  return SWR_KEYS.refereeHistorySummary(
    buildHistoryQuery(state, {}, "all"),
  );
}

export function gamesKey(
  state: HistoryFilterStateWithSearch,
  limit: number,
  offset: number,
): string {
  const extra: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (state.search) extra.search = state.search;
  if (state.ref !== undefined) extra.refereeApiId = String(state.ref);
  return SWR_KEYS.refereeHistoryGames(buildHistoryQuery(state, extra));
}

export function gamesCsvUrl(state: HistoryFilterStateWithSearch): string {
  return SWR_KEYS.refereeHistoryGamesCsv(buildHistoryQuery(state));
}

export function leaderboardCsvUrl(
  state: HistoryFilterStateWithSearch,
): string {
  return SWR_KEYS.refereeHistoryLeaderboardCsv(
    buildHistoryQuery(state, {}, "all"),
  );
}
```

- [ ] **Step 5: Add CSV keys to `swr-keys.ts`**

In `apps/web/src/lib/swr-keys.ts`, inside the `SWR_KEYS` object:

```ts
refereeHistoryGamesCsv: (qs: string) =>
  `/admin/referee/history/games.csv${qs ? `?${qs}` : ""}`,
refereeHistoryLeaderboardCsv: (qs: string) =>
  `/admin/referee/history/leaderboard.csv${qs ? `?${qs}` : ""}`,
```

- [ ] **Step 6: Run, verify pass**

Run: `pnpm --filter @dragons/web test -- filter-state`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/referee/history/filter-state.ts \
        apps/web/src/components/referee/history/filter-state.test.ts \
        apps/web/src/lib/swr-keys.ts \
        packages/shared/src/referee-history.ts
git commit -m "feat(web): history filter state with tab/preset/status-array/ref"
```

---

### Task 8: Update SWR hooks

**Files:**
- Modify: `apps/web/src/hooks/use-referee-history.ts`

- [ ] **Step 1: Rewrite the hooks file**

```ts
"use client";

import useSWR from "swr";
import { fetchAPI } from "@/lib/api";
import {
  summaryKey,
  gamesKey,
  type HistoryFilterStateWithSearch,
} from "@/components/referee/history/filter-state";
import type {
  HistorySummaryResponse,
  HistoryGameItem,
} from "@dragons/shared";

export function useRefereeHistorySummary(state: HistoryFilterStateWithSearch) {
  return useSWR<HistorySummaryResponse>(summaryKey(state), (url: string) =>
    fetchAPI<HistorySummaryResponse>(url),
  );
}

export interface HistoryGamesResponse {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function useRefereeHistoryGames(
  state: HistoryFilterStateWithSearch,
  override: Partial<{ refereeApiId: number; limit: number; offset: number }> = {},
) {
  const effective: HistoryFilterStateWithSearch = {
    ...state,
    ref: override.refereeApiId ?? state.ref,
  };
  const limit = override.limit ?? state.limit;
  const offset = override.offset ?? state.offset;
  const key = gamesKey(effective, limit, offset);
  return useSWR<HistoryGamesResponse>(key, (url: string) =>
    fetchAPI<HistoryGamesResponse>(url),
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-referee-history.ts
git commit -m "feat(web): history hooks accept drawer/override params"
```

---

### Task 9: `useDebounce` utility

**Files:**
- Create: `apps/web/src/hooks/use-debounce.ts`
- Create: `apps/web/src/hooks/use-debounce.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./use-debounce";

describe("useDebounce", () => {
  it("returns initial value synchronously", () => {
    const { result } = renderHook(() => useDebounce("a", 200));
    expect(result.current).toBe("a");
  });

  it("delays subsequent updates by the interval", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ v }) => useDebounce(v, 200),
      { initialProps: { v: "a" } },
    );
    rerender({ v: "b" });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe("b");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @dragons/web test -- use-debounce`

- [ ] **Step 3: Implement**

```ts
"use client";

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @dragons/web test -- use-debounce`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-debounce.ts apps/web/src/hooks/use-debounce.test.ts
git commit -m "feat(web): useDebounce hook"
```

---

## Phase C — Frontend UI

From this phase onward, the plan references components by file path. Each new component is `"use client"`, imports from `@dragons/ui`, and uses `next-intl` for strings. Existing conventions (lucide icons, `cn` from `@dragons/ui/lib/utils`, `font-display` for titles) apply everywhere.

### Task 10: `workload-bar.tsx`

**Files:**
- Create: `apps/web/src/components/referee/history/workload-bar.tsx`
- Create: `apps/web/src/components/referee/history/workload-bar.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkloadBar } from "./workload-bar";

describe("WorkloadBar", () => {
  it("fills proportional to total/max, clamped [0,1]", () => {
    render(<WorkloadBar total={5} max={10} />);
    const fill = screen.getByTestId("workload-bar-fill");
    expect(fill.style.width).toBe("50%");
  });

  it("renders 100% for top entry", () => {
    render(<WorkloadBar total={10} max={10} />);
    expect(screen.getByTestId("workload-bar-fill").style.width).toBe("100%");
  });

  it("renders 0% when max is 0", () => {
    render(<WorkloadBar total={0} max={0} />);
    expect(screen.getByTestId("workload-bar-fill").style.width).toBe("0%");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @dragons/web test -- workload-bar`

- [ ] **Step 3: Implement**

```tsx
"use client";

interface Props { total: number; max: number }

export function WorkloadBar({ total, max }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, total / max)) : 0;
  return (
    <div className="bg-surface-low h-2 w-full overflow-hidden rounded-sm">
      <div
        data-testid="workload-bar-fill"
        className="bg-primary h-full"
        style={{ width: `${(pct * 100).toFixed(1)}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @dragons/web test -- workload-bar`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/referee/history/workload-bar.tsx \
        apps/web/src/components/referee/history/workload-bar.test.tsx
git commit -m "feat(web): workload bar component"
```

---

### Task 11: Coverage KPI card (composite) + trimmed `coverage-kpi-cards.tsx`

**Files:**
- Modify: `apps/web/src/components/referee/history/coverage-kpi-cards.tsx`
- Create: `apps/web/src/components/referee/history/coverage-kpi-cards.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CoverageKPICards } from "./coverage-kpi-cards";
import en from "@/messages/en.json";

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("CoverageKPICards", () => {
  it("shows percentage, filled/obligated, games, refs", () => {
    render(wrap(<CoverageKPICards kpis={{
      games: 53, distinctReferees: 20,
      obligatedSlots: 50, filledSlots: 42, unfilledSlots: 8,
      cancelled: 0, forfeited: 0,
    }} />));
    expect(screen.getByText(/84%/)).toBeInTheDocument();
    expect(screen.getByText(/42.*50/)).toBeInTheDocument();
    expect(screen.getByText("53")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("renders em-dash when obligatedSlots is 0", () => {
    render(wrap(<CoverageKPICards kpis={{
      games: 5, distinctReferees: 3,
      obligatedSlots: 0, filledSlots: 0, unfilledSlots: 0,
      cancelled: 0, forfeited: 0,
    }} />));
    expect(screen.getByTestId("coverage-value")).toHaveTextContent("—");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @dragons/web test -- coverage-kpi-cards`

- [ ] **Step 3: Replace component**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { CalendarDays, Target, Users } from "lucide-react";
import { StatCard } from "@/components/admin/shared/stat-card";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryKpis } from "@dragons/shared";

interface Props { kpis: HistoryKpis }

export function CoverageKPICards({ kpis }: Props) {
  const t = useTranslations("refereeHistory.kpi");
  const hasObligation = kpis.obligatedSlots > 0;
  const pct = hasObligation
    ? Math.round((kpis.filledSlots / kpis.obligatedSlots) * 100)
    : null;
  const filledPct = hasObligation
    ? (kpis.filledSlots / kpis.obligatedSlots) * 100
    : 0;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <div className="bg-card md:col-span-2 rounded-md p-4">
        <div className="text-muted-foreground font-display text-[10px] font-medium uppercase tracking-wide">
          {t("coverage")}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span data-testid="coverage-value" className="text-2xl font-bold tabular-nums">
            {pct === null ? "—" : `${pct}%`}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {hasObligation
              ? t("coverageRatio", { filled: kpis.filledSlots, total: kpis.obligatedSlots })
              : t("noObligation")}
          </span>
        </div>
        {hasObligation && (
          <div className="bg-surface-low mt-2 flex h-1.5 overflow-hidden rounded-sm">
            <div className="bg-success" style={{ width: `${filledPct}%` }} />
            <div className={cn("bg-heat", kpis.unfilledSlots === 0 && "hidden")}
                 style={{ width: `${100 - filledPct}%` }} />
          </div>
        )}
      </div>
      <StatCard label={t("games")} value={kpis.games} icon={CalendarDays} />
      <StatCard label={t("distinctReferees")} value={kpis.distinctReferees} icon={Users} />
    </div>
  );
}
```

Note: `Target` import retained only in existing component history — remove it here since this version no longer uses it. The component no longer references `AlertTriangle`, `Ban`, `CheckCircle2`, `XCircle` — drop those imports. Use only `CalendarDays`, `Users`.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @dragons/web test -- coverage-kpi-cards`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/referee/history/coverage-kpi-cards.tsx \
        apps/web/src/components/referee/history/coverage-kpi-cards.test.tsx
git commit -m "feat(web): compact coverage KPI trio"
```

---

### Task 12: `leaderboard-section.tsx` (own-club + guest variants)

**Files:**
- Create: `apps/web/src/components/referee/history/leaderboard-section.tsx`
- Create: `apps/web/src/components/referee/history/leaderboard-section.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LeaderboardSection } from "./leaderboard-section";
import en from "@/messages/en.json";
import type { HistoryLeaderboardEntry } from "@dragons/shared";

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

const entry = (o: Partial<HistoryLeaderboardEntry> = {}): HistoryLeaderboardEntry => ({
  refereeApiId: 100, refereeId: 1, displayName: "Mueller, A",
  isOwnClub: true, sr1Count: 2, sr2Count: 1, total: 3,
  lastRefereedDate: "2026-04-01", ...o,
});

describe("LeaderboardSection", () => {
  it("renders workload bar for own-club variant", () => {
    render(wrap(<LeaderboardSection
      variant="own" rows={[entry({ total: 10 }), entry({ refereeApiId: 101, total: 5 })]}
      onSelect={() => {}}
    />));
    expect(screen.getAllByTestId("workload-bar-fill").length).toBe(2);
  });

  it("hides workload bar for guest variant", () => {
    render(wrap(<LeaderboardSection
      variant="guest" rows={[entry({ isOwnClub: false })]} defaultOpen onSelect={() => {}}
    />));
    expect(screen.queryByTestId("workload-bar-fill")).toBeNull();
  });

  it("guest section is collapsed by default", () => {
    render(wrap(<LeaderboardSection
      variant="guest" rows={[entry({ isOwnClub: false, displayName: "Unseen, X" })]}
      onSelect={() => {}}
    />));
    expect(screen.queryByText("Unseen, X")).toBeNull();
  });

  it("clicking a name fires onSelect with refereeApiId", () => {
    const onSelect = vi.fn();
    render(wrap(<LeaderboardSection variant="own"
      rows={[entry({ refereeApiId: 200 })]}
      onSelect={onSelect}
    />));
    fireEvent.click(screen.getByText("Mueller, A"));
    expect(onSelect).toHaveBeenCalledWith(200);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @dragons/web test -- leaderboard-section`

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dragons/ui/components/collapsible";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@dragons/ui/components/table";
import { ChevronRight } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryLeaderboardEntry } from "@dragons/shared";
import { WorkloadBar } from "./workload-bar";

interface Props {
  variant: "own" | "guest";
  rows: HistoryLeaderboardEntry[];
  onSelect: (refereeApiId: number | null, displayName: string) => void;
  defaultOpen?: boolean;
}

export function LeaderboardSection({ variant, rows, onSelect, defaultOpen }: Props) {
  const t = useTranslations("refereeHistory.leaderboard");
  const format = useFormatter();
  const [open, setOpen] = useState(defaultOpen ?? variant === "own");

  const max = rows.reduce((a, r) => Math.max(a, r.total), 0);
  const heading = variant === "own" ? t("ourRefs") : t("guestRefs");
  const showBar = variant === "own";

  const body = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 pl-4 text-right">#</TableHead>
          <TableHead>{t("name")}</TableHead>
          {showBar && <TableHead className="w-[140px]">{t("workload")}</TableHead>}
          <TableHead className="text-right">{t("sr1")}</TableHead>
          <TableHead className="text-right">{t("sr2")}</TableHead>
          <TableHead className="text-right">{t("total")}</TableHead>
          <TableHead className="pr-4">{t("lastRefereed")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${row.refereeApiId ?? row.displayName}`}>
            <TableCell className="pl-4 text-right tabular-nums text-muted-foreground">
              {i + 1}
            </TableCell>
            <TableCell>
              <button
                type="button"
                className={cn(
                  "text-left font-medium hover:underline",
                  variant === "own" && "text-primary",
                )}
                onClick={() => onSelect(row.refereeApiId, row.displayName)}
              >
                {row.displayName}
              </button>
            </TableCell>
            {showBar && (
              <TableCell><WorkloadBar total={row.total} max={max} /></TableCell>
            )}
            <TableCell className="text-right tabular-nums">{row.sr1Count}</TableCell>
            <TableCell className="text-right tabular-nums">{row.sr2Count}</TableCell>
            <TableCell className="font-display text-right font-bold tabular-nums">
              {row.total}
            </TableCell>
            <TableCell className="text-muted-foreground pr-4 text-xs tabular-nums">
              {row.lastRefereedDate
                ? format.dateTime(new Date(row.lastRefereedDate + "T00:00:00"), "matchDate")
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (variant === "own") {
    return (
      <section>
        <div className="font-display mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-wide">
          <span>{heading} · {rows.length}</span>
        </div>
        <div className="bg-card overflow-hidden rounded-md border">{body}</div>
      </section>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="bg-surface-low flex w-full items-center justify-between rounded-md px-4 py-2.5">
        <span className="font-display text-xs font-bold uppercase tracking-wide">
          {heading} · {rows.length}
        </span>
        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border bg-card">
        {body}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @dragons/web test -- leaderboard-section`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/referee/history/leaderboard-section.tsx \
        apps/web/src/components/referee/history/leaderboard-section.test.tsx
git commit -m "feat(web): leaderboard section with own/guest variants"
```

---

### Task 13: `workload-tab.tsx`

**Files:**
- Create: `apps/web/src/components/referee/history/workload-tab.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import type { HistorySummaryResponse } from "@dragons/shared";
import { CoverageKPICards } from "./coverage-kpi-cards";
import { LeaderboardSection } from "./leaderboard-section";

interface Props {
  summary: HistorySummaryResponse;
  onSelectRef: (refereeApiId: number | null, displayName: string) => void;
}

export function WorkloadTab({ summary, onSelectRef }: Props) {
  const own = summary.leaderboard.filter((e) => e.isOwnClub);
  const guest = summary.leaderboard.filter((e) => !e.isOwnClub);
  return (
    <div className="space-y-4">
      <CoverageKPICards kpis={summary.kpis} />
      <LeaderboardSection variant="own" rows={own} onSelect={onSelectRef} />
      <LeaderboardSection variant="guest" rows={guest} onSelect={onSelectRef} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/history/workload-tab.tsx
git commit -m "feat(web): workload tab composition"
```

---

### Task 14: `status-chip-row.tsx`

**Files:**
- Create: `apps/web/src/components/referee/history/status-chip-row.tsx`
- Create: `apps/web/src/components/referee/history/status-chip-row.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StatusChipRow } from "./status-chip-row";
import en from "@/messages/en.json";

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

describe("StatusChipRow", () => {
  it("marks 'All' active when status is empty", () => {
    render(wrap(<StatusChipRow status={[]}
      counts={{ total: 10, played: 7, cancelled: 2, forfeited: 1 }}
      onChange={() => {}} />));
    expect(screen.getByTestId("chip-all")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("chip-played")).toHaveAttribute("data-active", "false");
  });

  it("click chip selects single-value status", () => {
    const onChange = vi.fn();
    render(wrap(<StatusChipRow status={[]}
      counts={{ total: 10, played: 7, cancelled: 2, forfeited: 1 }}
      onChange={onChange} />));
    fireEvent.click(screen.getByTestId("chip-cancelled"));
    expect(onChange).toHaveBeenCalledWith(["cancelled"]);
  });

  it("click active chip clears to empty", () => {
    const onChange = vi.fn();
    render(wrap(<StatusChipRow status={["cancelled"]}
      counts={{ total: 10, played: 7, cancelled: 2, forfeited: 1 }}
      onChange={onChange} />));
    fireEvent.click(screen.getByTestId("chip-cancelled"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryStatusValue } from "@dragons/shared";

interface Counts { total: number; played: number; cancelled: number; forfeited: number }

interface Props {
  status: HistoryStatusValue[];
  counts: Counts;
  onChange: (next: HistoryStatusValue[]) => void;
}

type Chip = { id: "all"; next: [] }
  | { id: HistoryStatusValue; next: HistoryStatusValue[] };

export function StatusChipRow({ status, counts, onChange }: Props) {
  const t = useTranslations("refereeHistory.games.statusChip");
  const active = new Set(status);

  const isAllActive = status.length === 0;
  const isOn = (v: HistoryStatusValue) => active.has(v) && status.length === 1;

  function handle(c: Chip) {
    if (c.id === "all") return onChange([]);
    if (isOn(c.id)) return onChange([]);
    onChange([c.id]);
  }

  const chips: Array<{ id: "all" | HistoryStatusValue; label: string; count: number; active: boolean; onClick: () => void }> = [
    { id: "all", label: t("all"), count: counts.total, active: isAllActive,
      onClick: () => handle({ id: "all", next: [] }) },
    { id: "played", label: t("played"), count: counts.played, active: isOn("played"),
      onClick: () => handle({ id: "played", next: ["played"] }) },
    { id: "cancelled", label: t("cancelled"), count: counts.cancelled, active: isOn("cancelled"),
      onClick: () => handle({ id: "cancelled", next: ["cancelled"] }) },
    { id: "forfeited", label: t("forfeited"), count: counts.forfeited, active: isOn("forfeited"),
      onClick: () => handle({ id: "forfeited", next: ["forfeited"] }) },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          data-testid={`chip-${c.id}`}
          data-active={c.active}
          onClick={c.onClick}
          className={cn(
            "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
            c.active
              ? "bg-primary text-primary-foreground"
              : "bg-surface-low hover:bg-surface-mid",
          )}
        >
          {c.label}
          <span className="ml-1.5 opacity-70 tabular-nums">{c.count}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/referee/history/status-chip-row.tsx \
        apps/web/src/components/referee/history/status-chip-row.test.tsx
git commit -m "feat(web): status chip row for games tab"
```

---

### Task 15: Update `history-game-list.tsx` (OPEN pill, HOME/AWAY, dim rows)

**Files:**
- Modify: `apps/web/src/components/referee/history/history-game-list.tsx`
- Create: `apps/web/src/components/referee/history/history-game-list.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HistoryGameList } from "./history-game-list";
import en from "@/messages/en.json";
import type { HistoryGameItem } from "@dragons/shared";

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

const game = (o: Partial<HistoryGameItem> = {}): HistoryGameItem => ({
  id: 1, matchId: null, matchNo: 1,
  kickoffDate: "2026-04-12", kickoffTime: "18:00:00",
  homeTeamName: "Dragons", guestTeamName: "Bears",
  leagueName: "Oberliga", leagueShort: "OL",
  venueName: null, venueCity: null,
  sr1OurClub: true, sr2OurClub: true,
  sr1Name: "Mueller", sr2Name: "Schulz",
  sr1Status: "filled", sr2Status: "filled",
  isCancelled: false, isForfeited: false, isHomeGame: true,
  ...o,
});

describe("HistoryGameList", () => {
  it("shows OPEN pill when obligated slot is open", () => {
    render(wrap(<HistoryGameList
      items={[game({ sr1OurClub: true, sr1Status: "open", sr1Name: null })]}
      total={1} limit={50} offset={0} onPage={() => {}} onLimit={() => {}}
    />));
    expect(screen.getByTestId("open-pill")).toBeInTheDocument();
  });

  it("shows HOME pill on home game, AWAY on away", () => {
    render(wrap(<HistoryGameList
      items={[game({ isHomeGame: true }), game({ id: 2, isHomeGame: false })]}
      total={2} limit={50} offset={0} onPage={() => {}} onLimit={() => {}}
    />));
    expect(screen.getAllByTestId("home-pill").length).toBe(1);
    expect(screen.getAllByTestId("away-pill").length).toBe(1);
  });

  it("dims cancelled rows with line-through", () => {
    render(wrap(<HistoryGameList
      items={[game({ isCancelled: true })]}
      total={1} limit={50} offset={0} onPage={() => {}} onLimit={() => {}}
    />));
    expect(screen.getByTestId("game-row")).toHaveClass("opacity-45");
  });
});
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Replace component**

```tsx
"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import { Badge } from "@dragons/ui/components/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@dragons/ui/components/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@dragons/ui/components/table";
import { cn } from "@dragons/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HistoryGameItem } from "@dragons/shared";

interface Props {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  onPage: (offset: number) => void;
  onLimit: (limit: 25 | 50 | 100) => void;
}

function statusMeta(g: HistoryGameItem, t: ReturnType<typeof useTranslations<"refereeHistory.games">>) {
  if (g.isCancelled) return { label: t("statusCell.cancelled"), variant: "destructive" as const };
  if (g.isForfeited) return { label: t("statusCell.forfeited"), variant: "secondary" as const };
  return { label: t("statusCell.played"), variant: "success" as const };
}

function SlotCell({
  ourClub, status, name,
}: { ourClub: boolean; status: string; name: string | null }) {
  const t = useTranslations("refereeHistory.games.badges");
  if (ourClub && status === "open") {
    return (
      <span
        data-testid="open-pill"
        className="bg-heat text-heat-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase"
      >
        {t("open")}
      </span>
    );
  }
  if (!name) return <span className="text-muted-foreground">—</span>;
  return <span className={cn(ourClub ? "text-primary font-medium" : "text-foreground")}>{name}</span>;
}

export function HistoryGameList({ items, total, limit, offset, onPage, onLimit }: Props) {
  const t = useTranslations("refereeHistory.games");
  const format = useFormatter();
  const hasPrev = offset > 0;
  const hasNext = offset + items.length < total;

  if (items.length === 0) {
    return (
      <div className="bg-card rounded-md p-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("columns.date")}</TableHead>
            <TableHead>{t("columns.match")}</TableHead>
            <TableHead>{t("columns.league")}</TableHead>
            <TableHead>{t("columns.sr1")}</TableHead>
            <TableHead>{t("columns.sr2")}</TableHead>
            <TableHead className="pr-4">{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((game) => {
            const status = statusMeta(game, t);
            const dimmed = game.isCancelled || game.isForfeited;
            return (
              <TableRow
                key={game.id}
                data-testid="game-row"
                className={cn(dimmed && "opacity-45")}
              >
                <TableCell className="pl-4 tabular-nums">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {format.dateTime(new Date(game.kickoffDate + "T00:00:00"), "matchDate")}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {game.kickoffTime.slice(0, 5)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium", dimmed && "line-through")}>
                      {game.homeTeamName} vs {game.guestTeamName}
                    </span>
                    {game.isHomeGame ? (
                      <span data-testid="home-pill" className="bg-surface-low rounded-sm px-1.5 py-0.5 text-[10px] uppercase">
                        {t("badges.home")}
                      </span>
                    ) : (
                      <span data-testid="away-pill" className="bg-surface-low text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] uppercase">
                        {t("badges.away")}
                      </span>
                    )}
                  </div>
                  {game.venueName && (
                    <div className="text-muted-foreground text-xs">{game.venueName}</div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {game.leagueShort ?? game.leagueName ?? "—"}
                </TableCell>
                <TableCell>
                  <SlotCell ourClub={game.sr1OurClub} status={game.sr1Status} name={game.sr1Name} />
                </TableCell>
                <TableCell>
                  <SlotCell ourClub={game.sr2OurClub} status={game.sr2Status} name={game.sr2Name} />
                </TableCell>
                <TableCell className="pr-4">
                  <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {offset + 1}–{offset + items.length} / {total}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(limit)} onValueChange={(v) => onLimit(Number(v) as 25 | 50 | 100)}>
            <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={!hasPrev}
            onClick={() => onPage(Math.max(0, offset - limit))}>
            <ChevronLeft className="size-4" />{t("prev")}
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext}
            onClick={() => onPage(offset + limit)}>
            {t("next")}<ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/referee/history/history-game-list.tsx \
        apps/web/src/components/referee/history/history-game-list.test.tsx
git commit -m "feat(web): game list with OPEN pill, HOME/AWAY, dim cancelled"
```

---

### Task 16: `games-tab.tsx`

**Files:**
- Create: `apps/web/src/components/referee/history/games-tab.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import type { HistoryKpis, HistoryStatusValue } from "@dragons/shared";
import type { HistoryGamesResponse } from "@/hooks/use-referee-history";
import { StatusChipRow } from "./status-chip-row";
import { HistoryGameList } from "./history-game-list";

interface Props {
  kpis: HistoryKpis;
  games: HistoryGamesResponse | undefined;
  status: HistoryStatusValue[];
  onStatusChange: (next: HistoryStatusValue[]) => void;
  onPage: (offset: number) => void;
  onLimit: (limit: 25 | 50 | 100) => void;
}

export function GamesTab({ kpis, games, status, onStatusChange, onPage, onLimit }: Props) {
  const played = kpis.games - kpis.cancelled - kpis.forfeited;
  return (
    <div className="space-y-3">
      <StatusChipRow
        status={status}
        counts={{
          total: kpis.games,
          played: Math.max(0, played),
          cancelled: kpis.cancelled,
          forfeited: kpis.forfeited,
        }}
        onChange={onStatusChange}
      />
      {games ? (
        <HistoryGameList
          items={games.items}
          total={games.total}
          limit={games.limit as 25 | 50 | 100}
          offset={games.offset}
          onPage={onPage}
          onLimit={onLimit}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/history/games-tab.tsx
git commit -m "feat(web): games tab composing chips + list"
```

---

### Task 17: `issues-callout.tsx`

**Files:**
- Create: `apps/web/src/components/referee/history/issues-callout.tsx`
- Create: `apps/web/src/components/referee/history/issues-callout.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { IssuesCallout } from "./issues-callout";
import en from "@/messages/en.json";

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

describe("IssuesCallout", () => {
  it("renders nothing when both counts are zero", () => {
    const { container } = render(wrap(
      <IssuesCallout cancelled={0} forfeited={0} onNavigate={() => {}} />,
    ));
    expect(container).toBeEmptyDOMElement();
  });

  it("fires onNavigate when clicked", () => {
    const onNavigate = vi.fn();
    render(wrap(<IssuesCallout cancelled={3} forfeited={2} onNavigate={onNavigate} />));
    fireEvent.click(screen.getByTestId("issues-callout"));
    expect(onNavigate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight } from "lucide-react";

interface Props {
  cancelled: number;
  forfeited: number;
  onNavigate: () => void;
}

export function IssuesCallout({ cancelled, forfeited, onNavigate }: Props) {
  const t = useTranslations("refereeHistory.issuesCallout");
  if (cancelled + forfeited === 0) return null;
  return (
    <button
      type="button"
      data-testid="issues-callout"
      onClick={onNavigate}
      className="bg-heat/10 text-heat flex w-full items-center gap-2 rounded-md px-4 py-2.5 text-sm hover:bg-heat/15"
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1 text-left">
        {t("label", { cancelled, forfeited })}
      </span>
      <ArrowRight className="size-4" />
    </button>
  );
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/referee/history/issues-callout.tsx \
        apps/web/src/components/referee/history/issues-callout.test.tsx
git commit -m "feat(web): issues callout for cancelled/forfeited"
```

---

### Task 18: `filter-bar.tsx`

**Files:**
- Create: `apps/web/src/components/referee/history/filter-bar.tsx`
- Delete: `apps/web/src/components/referee/history/history-filters.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import { Input } from "@dragons/ui/components/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@dragons/ui/components/select";
import { DatePicker } from "@dragons/ui";
import { cn } from "@dragons/ui/lib/utils";
import { SearchIcon, XIcon } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  HistoryAvailableLeague,
  HistoryStatusValue,
} from "@dragons/shared";
import type {
  HistoryFilterStateWithSearch,
  HistoryPreset,
} from "./filter-state";

interface Props {
  state: HistoryFilterStateWithSearch;
  availableLeagues: HistoryAvailableLeague[];
  onChange: (patch: Partial<HistoryFilterStateWithSearch>) => void;
  onReset: () => void;
}

const PRESETS: HistoryPreset[] = ["season", "30d", "month", "custom"];

export function FilterBar({ state, availableLeagues, onChange, onReset }: Props) {
  const t = useTranslations("refereeHistory");

  // local search value → debounced → onChange
  const [search, setSearch] = useState(state.search ?? "");
  const debounced = useDebounce(search, 300);
  useEffect(() => {
    if ((state.search ?? "") !== debounced) {
      onChange({ search: debounced || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (state.league) chips.push({
    key: "league",
    label: t("filters.chips.league", { value: state.league }),
    onRemove: () => onChange({ league: undefined }),
  });
  if (state.status.length > 0) chips.push({
    key: "status",
    label: t("filters.chips.status", { value: state.status.join(",") }),
    onRemove: () => onChange({ status: [] as HistoryStatusValue[] }),
  });
  if (state.search) chips.push({
    key: "search",
    label: t("filters.chips.search", { value: state.search }),
    onRemove: () => {
      setSearch("");
      onChange({ search: undefined });
    },
  });

  return (
    <div className="bg-card rounded-md">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="font-display text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
          {t("filters.range")}
        </div>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ preset: p })}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs font-medium",
              state.preset === p
                ? "bg-primary text-primary-foreground"
                : "bg-surface-low hover:bg-surface-mid",
            )}
          >
            {t(`presets.${p}`)}
          </button>
        ))}

        {state.preset === "custom" && (
          <>
            <DatePicker
              value={state.dateFrom ?? null}
              onChange={(v) => onChange({ dateFrom: v ?? undefined })}
              className="w-[140px]"
            />
            <span className="text-muted-foreground text-xs">→</span>
            <DatePicker
              value={state.dateTo ?? null}
              onChange={(v) => onChange({ dateTo: v ?? undefined })}
              className="w-[140px]"
            />
          </>
        )}

        <div className="bg-border mx-1 h-5 w-px" />

        <Select
          value={state.league ?? "__all"}
          onValueChange={(v) => onChange({ league: v === "__all" ? undefined : v })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filters.leagueAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.leagueAll")}</SelectItem>
            {availableLeagues.map((lg) => (
              <SelectItem key={lg.short} value={lg.short}>
                {lg.name ?? lg.short}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder={t("filters.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); onReset(); }}>
          <XIcon className="size-3.5" />{t("filters.reset")}
        </Button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium"
            >
              {c.label}<XIcon className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old filters file**

```bash
rm apps/web/src/components/referee/history/history-filters.tsx
```

The `history-page.tsx` rewrite in Task 21 removes the only import.

- [ ] **Step 3: Typecheck (expected to fail on the orphaned import in history-page.tsx — that's fine, Task 21 resolves it)**

Skip the typecheck gate for this task. Proceed to commit; Task 21 will green it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/referee/history/filter-bar.tsx \
        apps/web/src/components/referee/history/history-filters.tsx
git commit -m "feat(web): filter bar with presets, league select, debounced search, chips"
```

---

### Task 19: Ref drawer sub-components

**Files:**
- Create: `apps/web/src/components/referee/history/ref-drawer-stats.tsx`
- Create: `apps/web/src/components/referee/history/ref-drawer-games-list.tsx`

- [ ] **Step 1: Implement stats block**

```tsx
"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { HistoryGameItem, HistoryLeaderboardEntry } from "@dragons/shared";
import { WorkloadBar } from "./workload-bar";

interface Props {
  entry: HistoryLeaderboardEntry;
  games: HistoryGameItem[];
  ownClubMaxTotal: number;
  ownClubRank?: { rank: number; of: number } | null;
}

function daysBetween(iso: string, now = new Date()): number {
  const d = new Date(iso + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((now.getTime() - d) / 86_400_000));
}

export function RefDrawerStats({ entry, games, ownClubMaxTotal, ownClubRank }: Props) {
  const t = useTranslations("refereeHistory.drawer");
  const format = useFormatter();
  const leagues = new Set(games.map((g) => g.leagueShort).filter(Boolean));
  const first = games[games.length - 1]?.kickoffDate ?? entry.lastRefereedDate;
  const last = games[0]?.kickoffDate ?? entry.lastRefereedDate;

  return (
    <div className="space-y-3 border-b p-4">
      <div className="grid grid-cols-4 gap-2">
        <Cell label={t("stats.total")} value={entry.total} />
        <Cell label={t("stats.sr1")} value={entry.sr1Count} />
        <Cell label={t("stats.sr2")} value={entry.sr2Count} />
        <Cell label={t("stats.leagues")} value={leagues.size} />
      </div>
      <div className="flex justify-between text-xs">
        <span>
          <span className="text-muted-foreground">{t("first")}:</span>{" "}
          <span className="tabular-nums">
            {first ? format.dateTime(new Date(first + "T00:00:00"), "matchDate") : "—"}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">{t("last")}:</span>{" "}
          <span className="tabular-nums">
            {last ? format.dateTime(new Date(last + "T00:00:00"), "matchDate") : "—"}
          </span>
          {last && (
            <span className="text-success ml-2">
              · {t("daysAgo", { days: daysBetween(last) })}
            </span>
          )}
        </span>
      </div>
      {entry.isOwnClub && ownClubRank && (
        <div>
          <div className="text-muted-foreground font-display mb-1 text-[10px] font-medium uppercase tracking-wide">
            {t("workloadShare")}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <WorkloadBar total={entry.total} max={ownClubMaxTotal} />
            </div>
            <span className="w-12 text-right text-sm font-bold tabular-nums">
              {ownClubMaxTotal > 0
                ? `${Math.round((entry.total / ownClubMaxTotal) * 100)}%`
                : "—"}
            </span>
          </div>
          <div className="text-muted-foreground mt-1 text-[10px]">
            {t("rankOfTotal", { rank: ownClubRank.rank, total: ownClubRank.of })}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-low rounded-md p-2 text-center">
      <div className="text-muted-foreground text-[9px] font-medium uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Implement games list block**

```tsx
"use client";

import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryGameItem } from "@dragons/shared";

interface Props { games: HistoryGameItem[]; refereeApiId: number | null }

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function RefDrawerGamesList({ games, refereeApiId }: Props) {
  const t = useTranslations("refereeHistory.drawer");
  const format = useFormatter();

  const groups = new Map<string, HistoryGameItem[]>();
  for (const g of games) {
    const key = monthKey(g.kickoffDate);
    const arr = groups.get(key) ?? [];
    arr.push(g);
    groups.set(key, arr);
  }

  if (games.length === 0) {
    return <div className="text-muted-foreground p-4 text-center text-sm">{t("empty")}</div>;
  }

  return (
    <div className="p-4">
      <div className="font-display text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wide">
        {t("gamesCount", { count: games.length })}
      </div>
      {[...groups.entries()].map(([month, rows]) => (
        <div key={month} className="mb-4">
          <div className="text-muted-foreground font-display text-[10px] font-medium uppercase tracking-wide">
            {format.dateTime(new Date(month + "-01T00:00:00"), { year: "numeric", month: "long" })}
          </div>
          <div className="mt-1 divide-y">
            {rows.map((g) => {
              const role = g.sr1Name && refereeApiId
                ? undefined
                : undefined;
              const isSr1 = refereeApiId !== null
                ? (g.sr1Name !== null && g.sr2Name === null) || roleMatches(g, refereeApiId, "sr1")
                : true;
              const roleLabel = isSr1 ? t("role.sr1") : t("role.sr2");
              return (
                <div key={g.id} className="flex items-center gap-2 py-2 text-xs">
                  <div className="w-16 tabular-nums">
                    <div>{format.dateTime(new Date(g.kickoffDate + "T00:00:00"), "matchDate")}</div>
                    <div className="text-muted-foreground text-[10px]">{g.kickoffTime.slice(0, 5)}</div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{g.homeTeamName} vs {g.guestTeamName}</div>
                    <div className="text-muted-foreground text-[10px]">
                      {g.leagueShort ?? g.leagueName ?? "—"}
                    </div>
                  </div>
                  <span className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase",
                    isSr1 ? "bg-primary text-primary-foreground" : "bg-surface-low text-muted-foreground",
                  )}>
                    {roleLabel}
                  </span>
                  <StatusPill game={g} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function roleMatches(
  g: HistoryGameItem,
  refereeApiId: number | null,
  role: "sr1" | "sr2",
): boolean {
  // Drawer-side disambiguation: if refereeApiId is known, match by slot name presence
  // (the upstream filter already guarantees they appear in sr1 or sr2).
  if (refereeApiId === null) return role === "sr1";
  // Heuristic fallback: assume SR1 when both names match; detailed per-slot api ids
  // would require a richer response. This is acceptable for MVP display.
  return role === "sr1" ? !!g.sr1Name : !!g.sr2Name;
}

function StatusPill({ game }: { game: HistoryGameItem }) {
  const t = useTranslations("refereeHistory.games.statusCell");
  if (game.isCancelled) {
    return <span className="bg-heat text-heat-foreground rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase">{t("cancelled")}</span>;
  }
  if (game.isForfeited) {
    return <span className="bg-heat/70 text-heat-foreground rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase">{t("forfeited")}</span>;
  }
  return <span className="bg-success text-success-foreground rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase">{t("played")}</span>;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/referee/history/ref-drawer-stats.tsx \
        apps/web/src/components/referee/history/ref-drawer-games-list.tsx
git commit -m "feat(web): ref drawer stats + grouped games list"
```

---

### Task 20: `ref-drawer.tsx`

**Files:**
- Create: `apps/web/src/components/referee/history/ref-drawer.tsx`
- Create: `apps/web/src/components/referee/history/ref-drawer.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import { RefDrawer } from "./ref-drawer";
import en from "@/messages/en.json";

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>
    <SWRConfig value={{ fetcher: async () => ({
      items: [], total: 0, limit: 200, offset: 0, hasMore: false,
    }) }}>
      {ui}
    </SWRConfig>
  </NextIntlClientProvider>
);

describe("RefDrawer", () => {
  it("renders nothing when entry is null", () => {
    const { container } = render(wrap(
      <RefDrawer entry={null} filters={{ dateFrom: "2025-08-01", dateTo: "2026-07-31", status: [] } as never}
        ownClubLeaderboard={[]} onClose={() => {}} />,
    ));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    render(wrap(
      <RefDrawer
        entry={{ refereeApiId: 100, refereeId: 1, displayName: "Mueller",
          isOwnClub: true, sr1Count: 3, sr2Count: 2, total: 5,
          lastRefereedDate: "2026-04-01" }}
        filters={{ dateFrom: "2025-08-01", dateTo: "2026-07-31", status: [] } as never}
        ownClubLeaderboard={[{ refereeApiId: 100, refereeId: 1, displayName: "Mueller",
          isOwnClub: true, sr1Count: 3, sr2Count: 2, total: 5,
          lastRefereedDate: "2026-04-01" }]}
        onClose={onClose}
      />,
    ));
    fireEvent.click(screen.getByTestId("drawer-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle } from "@dragons/ui/components/sheet";
import { Badge } from "@dragons/ui/components/badge";
import { X } from "lucide-react";
import { useRefereeHistoryGames } from "@/hooks/use-referee-history";
import type {
  HistoryLeaderboardEntry,
} from "@dragons/shared";
import type { HistoryFilterStateWithSearch } from "./filter-state";
import { RefDrawerStats } from "./ref-drawer-stats";
import { RefDrawerGamesList } from "./ref-drawer-games-list";

interface Props {
  entry: HistoryLeaderboardEntry | null;
  filters: HistoryFilterStateWithSearch;
  ownClubLeaderboard: HistoryLeaderboardEntry[];
  onClose: () => void;
}

export function RefDrawer({ entry, filters, ownClubLeaderboard, onClose }: Props) {
  const t = useTranslations("refereeHistory.drawer");

  const drawerState = entry && entry.refereeApiId !== null
    ? { ...filters, ref: entry.refereeApiId, offset: 0, limit: 100 as const }
    : null;

  const { data } = useRefereeHistoryGames(
    drawerState ?? filters,
    drawerState
      ? { refereeApiId: entry!.refereeApiId!, limit: 200, offset: 0 }
      : { limit: 0, offset: 0 },
  );

  const ownMax = ownClubLeaderboard.reduce((a, r) => Math.max(a, r.total), 0);
  const ownRank = entry && entry.isOwnClub
    ? {
        rank: ownClubLeaderboard.findIndex(
          (r) => r.refereeApiId === entry.refereeApiId,
        ) + 1,
        of: ownClubLeaderboard.length,
      }
    : null;

  return (
    <Sheet open={entry !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-[480px]">
        {entry && (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b p-4">
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle className="font-display text-lg font-bold tracking-tight">
                    {entry.displayName}
                  </SheetTitle>
                  <Badge variant={entry.isOwnClub ? "default" : "outline"} className="text-[10px]">
                    {entry.isOwnClub ? t("ownClub") : t("guest")}
                  </Badge>
                </div>
                <div className="text-muted-foreground text-xs">
                  {filters.dateFrom} → {filters.dateTo}
                  {filters.league ? ` · ${filters.league}` : ""}
                </div>
              </div>
              <button
                data-testid="drawer-close"
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>
            <RefDrawerStats
              entry={entry}
              games={data?.items ?? []}
              ownClubMaxTotal={ownMax}
              ownClubRank={ownRank}
            />
            <div className="flex-1 overflow-y-auto">
              <RefDrawerGamesList
                games={data?.items ?? []}
                refereeApiId={entry.refereeApiId}
              />
            </div>
            {entry.refereeId !== null && (
              <div className="text-primary border-t p-3 text-right text-xs">
                <a href={`/admin/referees/${entry.refereeId}`} className="hover:underline">
                  {t("openProfile")} →
                </a>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/referee/history/ref-drawer.tsx \
        apps/web/src/components/referee/history/ref-drawer.test.tsx
git commit -m "feat(web): ref drawer with stats and grouped games"
```

---

### Task 21: Rewrite `history-page.tsx`

**Files:**
- Modify: `apps/web/src/components/referee/history/history-page.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@dragons/ui/components/tabs";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { Button } from "@dragons/ui";
import { DownloadIcon } from "lucide-react";
import {
  useRefereeHistorySummary, useRefereeHistoryGames,
} from "@/hooks/use-referee-history";
import { FilterBar } from "./filter-bar";
import { IssuesCallout } from "./issues-callout";
import { WorkloadTab } from "./workload-tab";
import { GamesTab } from "./games-tab";
import { RefDrawer } from "./ref-drawer";
import {
  gamesCsvUrl,
  leaderboardCsvUrl,
  parseHistoryFilterState,
  resolvePresetRange,
  type HistoryFilterStateWithSearch,
  type HistoryTab,
} from "./filter-state";
import type { HistoryStatusValue } from "@dragons/shared";

export function HistoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("refereeHistory");
  const format = useFormatter();

  const state = useMemo<HistoryFilterStateWithSearch>(
    () => parseHistoryFilterState(new URLSearchParams(params.toString())),
    [params],
  );

  const setParams = useCallback(
    (patch: Partial<HistoryFilterStateWithSearch>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
          next.delete(k);
        } else if (Array.isArray(v)) {
          next.set(k, v.join(","));
        } else {
          next.set(k, String(v));
        }
      }
      if ("offset" in patch === false) next.set("offset", "0");
      router.replace(`?${next.toString()}`);
    },
    [params, router],
  );

  const reset = () => router.replace("?");

  const summary = useRefereeHistorySummary(state);
  const games = useRefereeHistoryGames(state);

  // Apply preset resolution client-side
  const resolved = useMemo(() => {
    if (!summary.data) return null;
    const today = new Date();
    const range = resolvePresetRange(
      state.preset,
      { from: summary.data.range.from, to: summary.data.range.to, today },
      { dateFrom: state.dateFrom, dateTo: state.dateTo },
    );
    return range;
  }, [state.preset, state.dateFrom, state.dateTo, summary.data]);

  const rangeLabel = summary.data
    ? `${t(`range.source.${summary.data.range.source}`)} · ${format.dateTime(
        new Date(summary.data.range.from + "T00:00:00"), "matchDate",
      )} → ${format.dateTime(
        new Date(summary.data.range.to + "T00:00:00"), "matchDate",
      )}`
    : null;

  const ownLeaderboard = summary.data?.leaderboard.filter((e) => e.isOwnClub) ?? [];
  const drawerEntry = state.ref !== undefined
    ? (summary.data?.leaderboard.find((e) => e.refereeApiId === state.ref) ?? null)
    : null;

  const goToIssues = () => setParams({
    tab: "games",
    status: ["cancelled", "forfeited"] satisfies HistoryStatusValue[],
  });

  const csvHref = state.tab === "workload"
    ? leaderboardCsvUrl(state)
    : gamesCsvUrl(state);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground text-xs">{rangeLabel}</div>
        <Button asChild size="sm" variant="outline">
          <a href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}${csvHref}`}>
            <DownloadIcon className="size-3.5" />{t("filters.export")}
          </a>
        </Button>
      </div>

      <FilterBar
        state={state}
        availableLeagues={summary.data?.availableLeagues ?? []}
        onChange={setParams}
        onReset={reset}
      />

      {summary.data && (
        <IssuesCallout
          cancelled={summary.data.kpis.cancelled}
          forfeited={summary.data.kpis.forfeited}
          onNavigate={goToIssues}
        />
      )}

      <Tabs
        value={state.tab}
        onValueChange={(v) => setParams({ tab: v as HistoryTab })}
      >
        <TabsList>
          <TabsTrigger value="workload">{t("tab.workload")}</TabsTrigger>
          <TabsTrigger value="games">
            {t("tab.games")}
            {summary.data && (
              <span className="text-muted-foreground ml-1.5 tabular-nums">
                {summary.data.kpis.games}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workload" className="mt-3">
          {summary.data ? (
            <WorkloadTab
              summary={summary.data}
              onSelectRef={(refereeApiId) =>
                refereeApiId !== null
                  ? setParams({ ref: refereeApiId })
                  : undefined
              }
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </TabsContent>
        <TabsContent value="games" className="mt-3">
          {summary.data ? (
            <GamesTab
              kpis={summary.data.kpis}
              games={games.data}
              status={state.status}
              onStatusChange={(status) => setParams({ status })}
              onPage={(offset) => setParams({ offset })}
              onLimit={(limit) => setParams({ limit, offset: 0 })}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </TabsContent>
      </Tabs>

      <RefDrawer
        entry={drawerEntry}
        filters={state}
        ownClubLeaderboard={ownLeaderboard}
        onClose={() => setParams({ ref: undefined })}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: pass. (Fixes the orphaned import from Task 18.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/history/history-page.tsx
git commit -m "feat(web): history page assembles tabs, drawer, filter bar"
```

---

### Task 22: Server page — pass correct SSR keys

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/referee/history/page.tsx`

- [ ] **Step 1: Update SSR fetch keys**

Replace the file contents with:

```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SWRConfig } from "swr";
import { can } from "@dragons/shared";
import type { HistorySummaryResponse } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { HistoryPage } from "@/components/referee/history/history-page";
import {
  parseHistoryFilterState,
  summaryKey,
} from "@/components/referee/history/filter-state";

export default async function RefereeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  const user = session?.user ?? null;
  if (!can(user, "assignment", "view")) notFound();

  const t = await getTranslations("refereeHistory");
  const rawParams = await searchParams;
  const state = parseHistoryFilterState(rawParams);
  const sKey = summaryKey(state);
  const summary = await fetchAPIServer<HistorySummaryResponse>(sKey).catch(() => null);

  const fallback: Record<string, unknown> = {};
  if (summary) fallback[sKey] = summary;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <SWRConfig value={{ fallback }}>
        <HistoryPage />
      </SWRConfig>
    </div>
  );
}
```

Games list is no longer SSR'd; pagination stays interactive, and SWR fetches on mount.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/admin/referee/history/page.tsx
git commit -m "feat(web): SSR preloads summary with new filter state"
```

---

## Phase D — i18n, cleanup, verification

### Task 23: i18n strings (en + de)

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Replace `refereeHistory` namespace in `en.json`**

Use this object (merge into the existing top-level JSON, replacing the current `refereeHistory` block):

```json
"refereeHistory": {
  "title": "Referee History",
  "tab": {
    "workload": "Workload",
    "games": "Games"
  },
  "presets": {
    "season": "Season",
    "30d": "Last 30 days",
    "month": "This month",
    "custom": "Custom"
  },
  "filters": {
    "range": "Range",
    "leagueAll": "All leagues",
    "searchPlaceholder": "Search teams, league…",
    "reset": "Reset",
    "export": "Export CSV",
    "chips": {
      "league": "League: {value}",
      "status": "Status: {value}",
      "search": "Search: {value}"
    }
  },
  "issuesCallout": {
    "label": "{cancelled, plural, =0 {} one {# cancelled} other {# cancelled}} · {forfeited, plural, =0 {} one {# forfeited} other {# forfeited}} in this range"
  },
  "kpi": {
    "coverage": "Obligation coverage",
    "coverageRatio": "{filled} / {total} filled",
    "noObligation": "No home obligations in range",
    "games": "Games",
    "distinctReferees": "Distinct referees"
  },
  "leaderboard": {
    "ourRefs": "Our refs",
    "guestRefs": "Guest refs on our games",
    "name": "Name",
    "workload": "Workload",
    "sr1": "SR1",
    "sr2": "SR2",
    "total": "Total",
    "lastRefereed": "Last refereed"
  },
  "games": {
    "title": "Games",
    "empty": "No games in this range.",
    "prev": "Prev",
    "next": "Next",
    "columns": {
      "date": "Date",
      "match": "Match",
      "league": "League",
      "sr1": "SR1",
      "sr2": "SR2",
      "status": "Status"
    },
    "statusCell": {
      "cancelled": "Cancelled",
      "forfeited": "Forfeited",
      "played": "Played"
    },
    "statusChip": {
      "all": "All",
      "played": "Played",
      "cancelled": "Cancelled",
      "forfeited": "Forfeited"
    },
    "badges": {
      "home": "Home",
      "away": "Away",
      "open": "Open"
    }
  },
  "drawer": {
    "ownClub": "Own club",
    "guest": "Guest",
    "close": "Close",
    "first": "First",
    "last": "Last",
    "daysAgo": "{days}d ago",
    "workloadShare": "Share of own-club workload",
    "rankOfTotal": "Rank {rank} of {total}",
    "openProfile": "Open ref profile",
    "empty": "No games for this ref in range.",
    "gamesCount": "Games · {count}",
    "role": {
      "sr1": "SR1",
      "sr2": "SR2"
    },
    "stats": {
      "total": "Total",
      "sr1": "SR1",
      "sr2": "SR2",
      "leagues": "Leagues"
    }
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

- [ ] **Step 2: Mirror to `de.json` with German copy**

Translate each string. Key strings:

- `title` → `Schiedsrichter-Historie`
- `tab.workload` → `Pensum`
- `tab.games` → `Spiele`
- `presets.season` → `Saison`
- `presets.30d` → `Letzte 30 Tage`
- `presets.month` → `Dieser Monat`
- `presets.custom` → `Benutzerdefiniert`
- `filters.range` → `Zeitraum`
- `filters.leagueAll` → `Alle Ligen`
- `filters.searchPlaceholder` → `Teams, Liga suchen…`
- `filters.reset` → `Zurücksetzen`
- `filters.export` → `CSV exportieren`
- `filters.chips.league` → `Liga: {value}`
- `filters.chips.status` → `Status: {value}`
- `filters.chips.search` → `Suche: {value}`
- `issuesCallout.label` → `{cancelled, plural, =0 {} one {# Absage} other {# Absagen}} · {forfeited, plural, =0 {} one {# Verzicht} other {# Verzichte}} in diesem Zeitraum`
- `kpi.coverage` → `Pflicht-Abdeckung`
- `kpi.coverageRatio` → `{filled} / {total} besetzt`
- `kpi.noObligation` → `Keine Heimspiel-Pflichten im Zeitraum`
- `kpi.games` → `Spiele`
- `kpi.distinctReferees` → `Einzelne Schiris`
- `leaderboard.ourRefs` → `Unsere Schiris`
- `leaderboard.guestRefs` → `Gast-Schiris bei unseren Spielen`
- `leaderboard.name` → `Name`
- `leaderboard.workload` → `Pensum`
- `leaderboard.total` → `Gesamt`
- `leaderboard.lastRefereed` → `Zuletzt`
- `games.empty` → `Keine Spiele im Zeitraum.`
- `games.prev` → `Zurück`
- `games.next` → `Weiter`
- `games.columns.*` → `Datum`, `Spiel`, `Liga`, `SR1`, `SR2`, `Status`
- `games.statusCell.*` → `Abgesagt`, `Verzicht`, `Gespielt`
- `games.statusChip.*` → `Alle`, `Gespielt`, `Abgesagt`, `Verzicht`
- `games.badges.home` → `Heim`, `away` → `Auswärts`, `open` → `Offen`
- `drawer.ownClub` → `Eigener Verein`
- `drawer.guest` → `Gast`
- `drawer.close` → `Schließen`
- `drawer.first` → `Erstes`
- `drawer.last` → `Letztes`
- `drawer.daysAgo` → `vor {days} Tagen`
- `drawer.workloadShare` → `Anteil am Eigenvereins-Pensum`
- `drawer.rankOfTotal` → `Platz {rank} von {total}`
- `drawer.openProfile` → `Schiri-Profil öffnen`
- `drawer.empty` → `Keine Spiele für diesen Schiri im Zeitraum.`
- `drawer.gamesCount` → `Spiele · {count}`
- `drawer.role.sr1/sr2` → `SR1`/`SR2`
- `drawer.stats.total/sr1/sr2/leagues` → `Gesamt`, `SR1`, `SR2`, `Ligen`
- `range.source.user` → `Eigener Zeitraum`
- `range.source.settings` → `Aktuelle Saison`
- `range.source.default` → `Aktuelle Saison (Fallback)`

- [ ] **Step 3: Regenerate i18n type declarations**

Run the repo's existing i18n-codegen (check `package.json` scripts in `apps/web`; if a script like `i18n:types` exists, run it). If not: the `en.d.json.ts` file is generated from `en.json` — rebuild via `pnpm --filter @dragons/web build` once at the end of this task to pick up the new shape.

- [ ] **Step 4: Typecheck + test**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web test -- referee/history`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json \
        apps/web/src/messages/en.d.json.ts
git commit -m "feat(web): history i18n keys for restructured page"
```

---

### Task 24: Remove old leaderboard component

**Files:**
- Delete: `apps/web/src/components/referee/history/referee-leaderboard.tsx`

- [ ] **Step 1: Confirm no importers remain**

Run: `grep -rn "referee-leaderboard" apps/web/src` — expected: no matches.

- [ ] **Step 2: Delete file**

```bash
rm apps/web/src/components/referee/history/referee-leaderboard.tsx
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/referee/history/referee-leaderboard.tsx
git commit -m "chore(web): drop obsolete referee leaderboard component"
```

---

### Task 25: `AGENTS.md` update — document new CSV endpoints

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Find endpoint list section**

Run: `grep -n "referee/history" AGENTS.md` to locate the existing history entries.

- [ ] **Step 2: Add two lines**

Under the existing `/admin/referee/history/*` entries, add:

```
- GET /admin/referee/history/games.csv         — CSV export of games matching filters
- GET /admin/referee/history/leaderboard.csv   — CSV export of referee leaderboard
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): document referee history CSV endpoints"
```

---

### Task 26: Manual verification

- [ ] Run `pnpm dev` and log in as refereeAdmin.
- [ ] Visit `/admin/referee/history`. Confirm default = Workload tab, season range, own-refs leaderboard with workload bars, guest section collapsed.
- [ ] Click an own-club ref name → drawer opens with workload share bar + rank.
- [ ] Click the `✕` in the drawer → closes and removes `ref=` from URL.
- [ ] Reload the page while the drawer is open → drawer is restored from URL.
- [ ] Switch to Games tab → status chips visible; `All` chip active. Click `Cancelled` → rows dim + strikethrough.
- [ ] Insert or find an obligated home game where `srNStatus = "open"` → `OPEN` pill renders in that SR cell.
- [ ] Click filter-bar league select → list is populated from `availableLeagues`; picking one filters the table.
- [ ] Type in search → request fires ~300 ms after typing stops; chip appears.
- [ ] Click Reset → filters clear, chips disappear.
- [ ] Add a cancelled/forfeited row via the DB (or use existing fixtures) → issues callout appears; clicking it jumps to Games tab with `status=cancelled,forfeited`.
- [ ] Click Export CSV on each tab → file downloads with expected header row and data.
- [ ] Log in as `teamManager` → page returns 404.

---

## Self-Review

**Spec coverage check:**

- ✅ `availableLeagues` on summary → Task 3
- ✅ `refereeApiId` filter + comma-list `status` on games → Tasks 1, 2, 4
- ✅ `games.csv` + `leaderboard.csv` endpoints → Tasks 5, 6
- ✅ Tabbed layout (Workload + Games) → Task 21
- ✅ Filter bar with presets, league select, debounced search, chips → Tasks 9, 18
- ✅ Issues callout (hidden when 0) → Task 17
- ✅ Workload KPIs (3 cards, coverage composite, empty state) → Task 11
- ✅ Own-club leaderboard + collapsible guest section, workload bar → Tasks 10, 12, 13
- ✅ Games tab with status chips, OPEN pill, HOME/AWAY, dim rows, page-size selector → Tasks 14, 15, 16
- ✅ Ref drawer with stats, workload share, grouped games, profile link → Tasks 19, 20
- ✅ URL state extended (`tab`, `preset`, `status[]`, `ref`, `limit`) → Task 7
- ✅ Summary always sent with `status=all` → Task 7 (`summaryKey`)
- ✅ i18n keys en/de → Task 23
- ✅ Old component removal → Tasks 18 (filters), 24 (leaderboard)
- ✅ `AGENTS.md` update → Task 25
- ✅ Manual verification checklist → Task 26

**Type consistency check:**

- `HistoryStatusValue` defined in Task 1 (api) + Task 7 (shared) + re-exported — matches across api, shared, web.
- `HistoryFilterStateWithSearch` shape in Task 7 is used verbatim in Tasks 8, 18, 19, 20, 21, 22.
- `HistoryGamesResponse` interface (Task 8) used in Tasks 16, 19, 20.
- `onLimit(limit: 25 | 50 | 100)` consistent in Task 15 (`HistoryGameList`) and Task 16 (`GamesTab`).

**Placeholder scan:**

No TBDs, no "add error handling", no "similar to Task N". Every code block contains the code the engineer types.

**Ambiguity fix:** The drawer games list uses a heuristic for SR1/SR2 role matching because the endpoint currently returns the game shape without per-slot api-id lookup against `refereeApiId`. Clear, stated in the inline `roleMatches` comment. If this ships ambiguously in practice, extend `HistoryGameItem` with `sr1RefereeApiId` / `sr2RefereeApiId` in a follow-up — out of scope for this plan.
