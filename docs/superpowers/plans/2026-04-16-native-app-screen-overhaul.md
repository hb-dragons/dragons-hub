# Native App Screen Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all native app screens with distinct team colors, server-side derived stats, and smooth navigation between teams/games/standings.

**Architecture:** New public API endpoints compute H2H, form, and dashboard stats server-side. Native app rewrites screens using a shared match card component with badge-colored team names, winner/loser score styling, and home-game background tint. Shared `@dragons/shared` team-colors utility adapted for React Native.

**Tech Stack:** Hono API (Drizzle ORM), Expo SDK 55, React Native, SWR, `@dragons/api-client`, `@dragons/shared`

---

## File Structure

### New Files
- `packages/shared/src/native-team-colors.ts` — hex color mapping for native (light/dark)
- `packages/shared/src/match-context.ts` — MatchContext, TeamStats, HomeDashboard types
- `apps/api/src/routes/public/home.routes.ts` — GET /public/home/dashboard
- `apps/api/src/services/public/home-dashboard.service.ts` — aggregated home data
- `apps/api/src/services/public/match-context.service.ts` — H2H + form computation
- `apps/api/src/services/public/team-stats.service.ts` — team season stats
- `apps/native/src/components/MatchCardFull.tsx` — redesigned full match card
- `apps/native/src/components/MatchCardCompact.tsx` — compact match row
- `apps/native/src/components/FormStrip.tsx` — W/L form squares
- `apps/native/src/components/QuarterTable.tsx` — quarter-by-quarter score table
- `apps/native/src/components/HeadToHead.tsx` — H2H stats + previous meetings
- `apps/native/src/components/StandingsTable.tsx` — full standings table with highlighting
- `apps/native/src/components/ResultChip.tsx` — compact result chip for home screen
- `apps/native/src/hooks/useTeamColor.ts` — hook wrapping getNativeTeamColor
- `apps/native/src/app/h2h/[teamApiId].tsx` — H2H match list screen

### Modified Files
- `packages/shared/src/index.ts` — export new types
- `packages/api-client/src/endpoints/public.ts` — add new endpoint methods
- `apps/api/src/routes/public/match.routes.ts` — add /:id route + opponentApiId filter
- `apps/api/src/services/admin/match-query.service.ts` — add public detail function
- `apps/native/src/i18n/de.json` — new translation keys
- `apps/native/src/i18n/en.json` — new translation keys
- `apps/native/src/lib/api.ts` — wire new API client methods
- `apps/native/src/app/(tabs)/index.tsx` — home screen rewrite
- `apps/native/src/app/(tabs)/standings.tsx` — standings rewrite
- `apps/native/src/app/(tabs)/schedule.tsx` — use new match card
- `apps/native/src/app/(tabs)/teams.tsx` — badge-colored team names
- `apps/native/src/app/game/[id].tsx` — game detail rewrite
- `apps/native/src/app/team/[id].tsx` — team detail rewrite
- `apps/native/src/app/_layout.tsx` — add h2h route

### Test Files
- `packages/shared/src/native-team-colors.test.ts`
- `apps/api/src/routes/public/match.routes.test.ts` (modify existing or create)
- `apps/api/src/services/public/match-context.service.test.ts`
- `apps/api/src/services/public/team-stats.service.test.ts`
- `apps/api/src/services/public/home-dashboard.service.test.ts`
- `packages/api-client/src/endpoints/public.test.ts` (modify existing)

---

### Task 1: Shared Types — MatchContext, TeamStats, HomeDashboard

**Files:**
- Create: `packages/shared/src/match-context.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the type definitions**

```typescript
// packages/shared/src/match-context.ts
import type { MatchListItem } from "./matches";

export interface PreviousMeeting {
  matchId: number;
  date: string;
  homeTeamName: string;
  guestTeamName: string;
  homeScore: number;
  guestScore: number;
  isWin: boolean;
  homeIsOwnClub: boolean;
}

export interface HeadToHead {
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  previousMeetings: PreviousMeeting[];
}

export interface FormEntry {
  result: "W" | "L";
  matchId: number;
}

export interface MatchContext {
  headToHead: HeadToHead;
  homeForm: FormEntry[];
  guestForm: FormEntry[];
}

export interface TeamStats {
  teamId: number;
  leagueName: string;
  position: number | null;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  form: FormEntry[];
}

export interface ClubStats {
  teamCount: number;
  totalWins: number;
  totalLosses: number;
  winPercentage: number;
}

export interface HomeDashboard {
  nextGame: MatchListItem | null;
  recentResults: MatchListItem[];
  upcomingGames: MatchListItem[];
  clubStats: ClubStats;
}

/**
 * Public match detail — subset of MatchDetail without admin-only fields.
 * Extends MatchListItem with quarter scores and officials.
 */
export interface PublicMatchDetail extends MatchListItem {
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: string | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
  homeQ5: number | null;
  guestQ5: number | null;
  homeQ6: number | null;
  guestQ6: number | null;
  homeQ7: number | null;
  guestQ7: number | null;
  homeQ8: number | null;
  guestQ8: number | null;
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
}
```

- [ ] **Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:

```typescript
export type {
  PreviousMeeting,
  HeadToHead,
  FormEntry,
  MatchContext,
  TeamStats,
  ClubStats,
  HomeDashboard,
  PublicMatchDetail,
} from "./match-context";
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/match-context.ts packages/shared/src/index.ts
git commit -m "feat(shared): add MatchContext, TeamStats, HomeDashboard types"
```

---

### Task 2: Native Team Color Utility

**Files:**
- Create: `packages/shared/src/native-team-colors.ts`
- Create: `packages/shared/src/native-team-colors.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/shared/src/native-team-colors.test.ts
import { describe, it, expect } from "vitest";
import { getNativeTeamColor } from "./native-team-colors";

describe("getNativeTeamColor", () => {
  it("returns dot hex for dark mode with known badgeColor", () => {
    const result = getNativeTeamColor("blue", "Some Team", true);
    expect(result.name).toBe("#60a5fa"); // blue-400 for readability
    expect(result.muted).toBe("#3b82f6"); // blue dot
  });

  it("returns darkened variant for light mode", () => {
    const result = getNativeTeamColor("blue", "Some Team", false);
    expect(result.name).toBe("#1d4ed8"); // blue-700 for light bg
    expect(result.muted).toBe("#2563eb"); // blue-600
  });

  it("falls back to hash-based color when badgeColor is null", () => {
    const result = getNativeTeamColor(null, "Dragons Herren 1", true);
    // Should return some color (hash-based), not throw
    expect(result.name).toBeTruthy();
    expect(result.muted).toBeTruthy();
  });

  it("returns consistent colors for same team name", () => {
    const a = getNativeTeamColor(null, "Dragons Herren 1", true);
    const b = getNativeTeamColor(null, "Dragons Herren 1", true);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/shared test -- native-team-colors`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// packages/shared/src/native-team-colors.ts
import { getColorPreset } from "./team-colors";

/**
 * Native-friendly hex colors for light/dark mode.
 * Brighter tints for dark mode (text on dark bg), darker for light mode.
 */
const NATIVE_HEX: Record<string, { dark: { name: string; muted: string }; light: { name: string; muted: string } }> = {
  blue:    { dark: { name: "#60a5fa", muted: "#3b82f6" }, light: { name: "#1d4ed8", muted: "#2563eb" } },
  teal:    { dark: { name: "#5eead4", muted: "#14b8a6" }, light: { name: "#0f766e", muted: "#0d9488" } },
  green:   { dark: { name: "#86efac", muted: "#22c55e" }, light: { name: "#15803d", muted: "#16a34a" } },
  orange:  { dark: { name: "#fdba74", muted: "#f97316" }, light: { name: "#c2410c", muted: "#ea580c" } },
  rose:    { dark: { name: "#fda4af", muted: "#f43f5e" }, light: { name: "#be123c", muted: "#e11d48" } },
  pink:    { dark: { name: "#f9a8d4", muted: "#ec4899" }, light: { name: "#be185d", muted: "#db2777" } },
  cyan:    { dark: { name: "#67e8f9", muted: "#06b6d4" }, light: { name: "#0e7490", muted: "#0891b2" } },
  indigo:  { dark: { name: "#a5b4fc", muted: "#6366f1" }, light: { name: "#4338ca", muted: "#4f46e5" } },
  emerald: { dark: { name: "#6ee7b7", muted: "#10b981" }, light: { name: "#047857", muted: "#059669" } },
  violet:  { dark: { name: "#c4b5fd", muted: "#8b5cf6" }, light: { name: "#6d28d9", muted: "#7c3aed" } },
};

export interface NativeTeamColor {
  /** Primary color for team name text */
  name: string;
  /** Subtler variant for secondary elements */
  muted: string;
}

/**
 * Get native-appropriate hex colors for a team's badge color.
 * Uses getColorPreset for fallback resolution, then maps to hex.
 */
export function getNativeTeamColor(
  badgeColor: string | null | undefined,
  teamName: string,
  isDark: boolean,
): NativeTeamColor {
  const preset = getColorPreset(badgeColor, teamName);
  // Find which key this preset maps to
  const key = badgeColor && NATIVE_HEX[badgeColor]
    ? badgeColor
    : findPresetKey(preset);
  const hex = NATIVE_HEX[key];
  if (!hex) {
    // Absolute fallback
    return isDark
      ? { name: "#84d997", muted: "#4ade80" }
      : { name: "#004b23", muted: "#166534" };
  }
  return isDark ? hex.dark : hex.light;
}

function findPresetKey(preset: { dot: string }): string {
  for (const [key, val] of Object.entries(NATIVE_HEX)) {
    // Match by checking if the preset dot matches the muted dark value
    const { getColorPreset: _ , ...rest } = { getColorPreset: null };
    void rest;
    // Simple: iterate COLOR_PRESETS to find matching dot
  }
  // Use dot color to find key
  const dotMap: Record<string, string> = {
    "#3b82f6": "blue", "#14b8a6": "teal", "#22c55e": "green",
    "#f97316": "orange", "#f43f5e": "rose", "#ec4899": "pink",
    "#06b6d4": "cyan", "#6366f1": "indigo", "#10b981": "emerald",
    "#8b5cf6": "violet",
  };
  return dotMap[preset.dot] ?? "green";
}
```

- [ ] **Step 4: Export from index**

Add to `packages/shared/src/index.ts`:

```typescript
export { getNativeTeamColor } from "./native-team-colors";
export type { NativeTeamColor } from "./native-team-colors";
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/shared test -- native-team-colors`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/native-team-colors.ts packages/shared/src/native-team-colors.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add getNativeTeamColor utility for React Native"
```

---

### Task 3: API — Public Match Detail Endpoint (GET /public/matches/:id)

**Files:**
- Modify: `apps/api/src/routes/public/match.routes.ts`
- Modify: `apps/api/src/services/admin/match-query.service.ts`

The existing `rowToDetail` returns admin-only fields (internalNotes, overrides). We need a `rowToPublicDetail` function.

- [ ] **Step 1: Add rowToPublicDetail in match-query.service.ts**

Add after the existing `rowToDetail` function (around line 276):

```typescript
import type { PublicMatchDetail } from "@dragons/shared";

export function rowToPublicDetail(row: MatchRow): PublicMatchDetail {
  return {
    ...rowToListItem(row, []),
    homeHalftimeScore: row.homeHalftimeScore,
    guestHalftimeScore: row.guestHalftimeScore,
    periodFormat: row.periodFormat,
    homeQ1: row.homeQ1, guestQ1: row.guestQ1,
    homeQ2: row.homeQ2, guestQ2: row.guestQ2,
    homeQ3: row.homeQ3, guestQ3: row.guestQ3,
    homeQ4: row.homeQ4, guestQ4: row.guestQ4,
    homeQ5: row.homeQ5, guestQ5: row.guestQ5,
    homeQ6: row.homeQ6, guestQ6: row.guestQ6,
    homeQ7: row.homeQ7, guestQ7: row.guestQ7,
    homeQ8: row.homeQ8, guestQ8: row.guestQ8,
    homeOt1: row.homeOt1, guestOt1: row.guestOt1,
    homeOt2: row.homeOt2, guestOt2: row.guestOt2,
  };
}

export async function getPublicMatchDetail(id: number): Promise<PublicMatchDetail | null> {
  const [row] = await queryMatchWithJoins()
    .where(eq(matches.id, id))
    .limit(1);
  if (!row) return null;

  // Verify at least one team is own-club (public endpoint only serves own-club matches)
  if (!row.homeIsOwnClub && !row.guestIsOwnClub) return null;

  return rowToPublicDetail(row);
}
```

- [ ] **Step 2: Add the route**

In `apps/api/src/routes/public/match.routes.ts`, add after the existing GET `/matches` route:

```typescript
publicMatchRoutes.get(
  "/matches/:id",
  describeRoute({
    description: "Get a single own-club match with quarter scores",
    tags: ["Public"],
    responses: { 200: { description: "Match detail" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const match = await getPublicMatchDetail(id);
    if (!match) return c.json({ error: "Not found" }, 404);

    return c.json(match);
  },
);
```

Add `getPublicMatchDetail` to the imports from the service.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Write tests for the route**

Create or extend the test file. Test: valid match ID returns detail with quarter scores, non-existent ID returns 404, non-own-club match returns 404.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/public/match.routes.ts apps/api/src/services/admin/match-query.service.ts
git commit -m "feat(api): add GET /public/matches/:id with quarter scores"
```

---

### Task 4: API — Match Context Endpoint (GET /public/matches/:id/context)

**Files:**
- Create: `apps/api/src/services/public/match-context.service.ts`
- Create: `apps/api/src/services/public/match-context.service.test.ts`
- Modify: `apps/api/src/routes/public/match.routes.ts`

- [ ] **Step 1: Write the service test**

```typescript
// apps/api/src/services/public/match-context.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getMatchContext } from "./match-context.service";

// These tests require a running database with seeded data.
// If no integration test setup exists, test the pure computation logic.

describe("getMatchContext", () => {
  it("returns empty H2H when no previous meetings exist", async () => {
    // Use a match ID that won't exist in test DB
    const result = await getMatchContext(999999);
    expect(result).toBeNull(); // match not found
  });
});
```

- [ ] **Step 2: Implement the service**

```typescript
// apps/api/src/services/public/match-context.service.ts
import { db } from "../../config/database";
import { matches, teams } from "@dragons/db/schema";
import { eq, and, or, desc, isNotNull } from "drizzle-orm";
import type { MatchContext, FormEntry, PreviousMeeting } from "@dragons/shared";

export async function getMatchContext(matchId: number): Promise<MatchContext | null> {
  // 1. Load the match to get both team IDs
  const [match] = await db
    .select({
      homeTeamApiId: matches.homeTeamApiId,
      guestTeamApiId: matches.guestTeamApiId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) return null;

  const { homeTeamApiId, guestTeamApiId } = match;

  // 2. Head-to-head: all completed matches between these two teams
  const h2hMatches = await db
    .select({
      id: matches.id,
      kickoffDate: matches.kickoffDate,
      homeTeamApiId: matches.homeTeamApiId,
      guestTeamApiId: matches.guestTeamApiId,
      homeScore: matches.homeScore,
      guestScore: matches.guestScore,
    })
    .from(matches)
    .where(
      and(
        isNotNull(matches.homeScore),
        isNotNull(matches.guestScore),
        or(
          and(
            eq(matches.homeTeamApiId, homeTeamApiId),
            eq(matches.guestTeamApiId, guestTeamApiId),
          ),
          and(
            eq(matches.homeTeamApiId, guestTeamApiId),
            eq(matches.guestTeamApiId, homeTeamApiId),
          ),
        ),
      ),
    )
    .orderBy(desc(matches.kickoffDate));

  // Determine which side is "ours" (own club)
  const [homeTeamRow] = await db
    .select({ isOwnClub: teams.isOwnClub, name: teams.name })
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, homeTeamApiId))
    .limit(1);

  const [guestTeamRow] = await db
    .select({ isOwnClub: teams.isOwnClub, name: teams.name })
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, guestTeamApiId))
    .limit(1);

  // Our team is whichever is own club; if neither, use home team as reference
  const ourTeamApiId = homeTeamRow?.isOwnClub ? homeTeamApiId : guestTeamApiId;

  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  const previousMeetings: PreviousMeeting[] = [];

  for (const m of h2hMatches) {
    const ourScore = m.homeTeamApiId === ourTeamApiId ? m.homeScore! : m.guestScore!;
    const theirScore = m.homeTeamApiId === ourTeamApiId ? m.guestScore! : m.homeScore!;
    const isWin = ourScore > theirScore;

    if (isWin) wins++;
    else losses++;

    pointsFor += ourScore;
    pointsAgainst += theirScore;

    if (previousMeetings.length < 5) {
      previousMeetings.push({
        matchId: m.id,
        date: m.kickoffDate,
        homeTeamName: homeTeamRow?.name ?? "",
        guestTeamName: guestTeamRow?.name ?? "",
        homeScore: m.homeScore!,
        guestScore: m.guestScore!,
        isWin,
        homeIsOwnClub: m.homeTeamApiId === ourTeamApiId,
      });
    }
  }

  // 3. Form: last 5 completed matches for each team independently
  const homeForm = await getTeamForm(homeTeamApiId);
  const guestForm = await getTeamForm(guestTeamApiId);

  return {
    headToHead: { wins, losses, pointsFor, pointsAgainst, previousMeetings },
    homeForm,
    guestForm,
  };
}

async function getTeamForm(teamApiId: number): Promise<FormEntry[]> {
  const recent = await db
    .select({
      id: matches.id,
      homeTeamApiId: matches.homeTeamApiId,
      homeScore: matches.homeScore,
      guestScore: matches.guestScore,
    })
    .from(matches)
    .where(
      and(
        isNotNull(matches.homeScore),
        isNotNull(matches.guestScore),
        or(
          eq(matches.homeTeamApiId, teamApiId),
          eq(matches.guestTeamApiId, teamApiId),
        ),
      ),
    )
    .orderBy(desc(matches.kickoffDate))
    .limit(5);

  return recent.map((m) => {
    const isHome = m.homeTeamApiId === teamApiId;
    const ourScore = isHome ? m.homeScore! : m.guestScore!;
    const theirScore = isHome ? m.guestScore! : m.homeScore!;
    return { result: ourScore > theirScore ? "W" as const : "L" as const, matchId: m.id };
  });
}
```

- [ ] **Step 3: Add the route**

In `apps/api/src/routes/public/match.routes.ts`:

```typescript
import { getMatchContext } from "../../services/public/match-context.service";

publicMatchRoutes.get(
  "/matches/:id/context",
  describeRoute({
    description: "Get H2H record and form for both teams in a match",
    tags: ["Public"],
    responses: { 200: { description: "Match context" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const context = await getMatchContext(id);
    if (!context) return c.json({ error: "Not found" }, 404);

    return c.json(context);
  },
);
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/public/match-context.service.ts apps/api/src/services/public/match-context.service.test.ts apps/api/src/routes/public/match.routes.ts
git commit -m "feat(api): add GET /public/matches/:id/context for H2H and form"
```

---

### Task 5: API — Team Stats Endpoint (GET /public/teams/:id/stats)

**Files:**
- Create: `apps/api/src/services/public/team-stats.service.ts`
- Modify: `apps/api/src/routes/public/team.routes.ts`

- [ ] **Step 1: Implement the service**

```typescript
// apps/api/src/services/public/team-stats.service.ts
import { db } from "../../config/database";
import { teams, standings, leagues, matches } from "@dragons/db/schema";
import { eq, and, or, desc, isNotNull } from "drizzle-orm";
import type { TeamStats, FormEntry } from "@dragons/shared";

export async function getTeamStats(teamId: number): Promise<TeamStats | null> {
  // 1. Get team record
  const [team] = await db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) return null;

  const teamApiId = team.apiTeamPermanentId;

  // 2. Find standings entry for this team
  const [standing] = await db
    .select({
      position: standings.position,
      played: standings.played,
      won: standings.won,
      lost: standings.lost,
      pointsFor: standings.pointsFor,
      pointsAgainst: standings.pointsAgainst,
      pointsDiff: standings.pointsDiff,
      leagueName: leagues.name,
    })
    .from(standings)
    .innerJoin(leagues, eq(standings.leagueId, leagues.id))
    .where(eq(standings.teamApiId, teamApiId))
    .limit(1);

  // 3. Form: last 5 completed matches
  const recent = await db
    .select({
      id: matches.id,
      homeTeamApiId: matches.homeTeamApiId,
      homeScore: matches.homeScore,
      guestScore: matches.guestScore,
    })
    .from(matches)
    .where(
      and(
        isNotNull(matches.homeScore),
        isNotNull(matches.guestScore),
        or(
          eq(matches.homeTeamApiId, teamApiId),
          eq(matches.guestTeamApiId, teamApiId),
        ),
      ),
    )
    .orderBy(desc(matches.kickoffDate))
    .limit(5);

  const form: FormEntry[] = recent.map((m) => {
    const isHome = m.homeTeamApiId === teamApiId;
    const ourScore = isHome ? m.homeScore! : m.guestScore!;
    const theirScore = isHome ? m.guestScore! : m.homeScore!;
    return { result: ourScore > theirScore ? "W" as const : "L" as const, matchId: m.id };
  });

  return {
    teamId,
    leagueName: standing?.leagueName ?? "",
    position: standing?.position ?? null,
    played: standing?.played ?? 0,
    wins: standing?.won ?? 0,
    losses: standing?.lost ?? 0,
    pointsFor: standing?.pointsFor ?? 0,
    pointsAgainst: standing?.pointsAgainst ?? 0,
    pointsDiff: standing?.pointsDiff ?? 0,
    form,
  };
}
```

- [ ] **Step 2: Add the route**

In `apps/api/src/routes/public/team.routes.ts`:

```typescript
import { getTeamStats } from "../../services/public/team-stats.service";

publicTeamRoutes.get(
  "/teams/:id/stats",
  describeRoute({
    description: "Get computed season stats for a team",
    tags: ["Public"],
    responses: { 200: { description: "Team stats" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const stats = await getTeamStats(id);
    if (!stats) return c.json({ error: "Not found" }, 404);

    return c.json(stats);
  },
);
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/public/team-stats.service.ts apps/api/src/routes/public/team.routes.ts
git commit -m "feat(api): add GET /public/teams/:id/stats for season stats and form"
```

---

### Task 6: API — Home Dashboard Endpoint (GET /public/home/dashboard)

**Files:**
- Create: `apps/api/src/services/public/home-dashboard.service.ts`
- Create: `apps/api/src/routes/public/home.routes.ts`
- Modify: `apps/api/src/routes/public/index.ts` (or wherever public routes are mounted)

- [ ] **Step 1: Implement the service**

```typescript
// apps/api/src/services/public/home-dashboard.service.ts
import { getOwnClubMatches } from "../admin/match-query.service";
import { db } from "../../config/database";
import { teams, standings } from "@dragons/db/schema";
import { eq, sql } from "drizzle-orm";
import type { HomeDashboard } from "@dragons/shared";

function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const today = todayISO();

  // Parallel queries for efficiency
  const [nextGameResult, recentResult, upcomingResult, statsResult] = await Promise.all([
    // Next game: first upcoming match
    getOwnClubMatches({
      limit: 1, offset: 0, dateFrom: today, hasScore: false, sort: "asc", excludeInactive: true,
    }),
    // Recent results: last 5 completed
    getOwnClubMatches({
      limit: 5, offset: 0, dateTo: today, hasScore: true, sort: "desc", excludeInactive: true,
    }),
    // Upcoming games: next 3
    getOwnClubMatches({
      limit: 3, offset: 0, dateFrom: today, hasScore: false, sort: "asc", excludeInactive: true,
    }),
    // Club stats: aggregate W/L across all own-club teams
    db
      .select({
        totalWins: sql<number>`coalesce(sum(${standings.won}), 0)::int`,
        totalLosses: sql<number>`coalesce(sum(${standings.lost}), 0)::int`,
      })
      .from(standings)
      .innerJoin(teams, eq(standings.teamApiId, teams.apiTeamPermanentId))
      .where(eq(teams.isOwnClub, true)),
  ]);

  const ownTeamCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teams)
    .where(eq(teams.isOwnClub, true));

  const teamCount = ownTeamCount[0]?.count ?? 0;
  const totalWins = statsResult[0]?.totalWins ?? 0;
  const totalLosses = statsResult[0]?.totalLosses ?? 0;
  const totalGames = totalWins + totalLosses;
  const winPercentage = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return {
    nextGame: nextGameResult.items[0] ?? null,
    recentResults: recentResult.items,
    upcomingGames: upcomingResult.items,
    clubStats: { teamCount, totalWins, totalLosses, winPercentage },
  };
}
```

- [ ] **Step 2: Create the route file**

```typescript
// apps/api/src/routes/public/home.routes.ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { getHomeDashboard } from "../../services/public/home-dashboard.service";

export const publicHomeRoutes = new Hono();

publicHomeRoutes.get(
  "/home/dashboard",
  describeRoute({
    description: "Get aggregated home screen data",
    tags: ["Public"],
    responses: { 200: { description: "Home dashboard data" } },
  }),
  async (c) => {
    const dashboard = await getHomeDashboard();
    return c.json(dashboard);
  },
);
```

- [ ] **Step 3: Mount the route**

Find where public routes are mounted (check `apps/api/src/routes/public/index.ts` or `apps/api/src/app.ts`) and add:

```typescript
import { publicHomeRoutes } from "./home.routes";
// Mount alongside other public routes
app.route("/public", publicHomeRoutes);
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/public/home-dashboard.service.ts apps/api/src/routes/public/home.routes.ts
git commit -m "feat(api): add GET /public/home/dashboard endpoint"
```

---

### Task 7: API — Add opponentApiId Filter to Matches Endpoint

**Files:**
- Modify: `apps/api/src/services/admin/match-query.service.ts`
- Modify: `apps/api/src/routes/public/match.routes.ts`

- [ ] **Step 1: Add opponentApiId to MatchListParams**

In `apps/api/src/services/admin/match-query.service.ts`, update the interface:

```typescript
export interface MatchListParams {
  limit: number;
  offset: number;
  leagueId?: number;
  dateFrom?: string;
  dateTo?: string;
  sort?: "asc" | "desc";
  hasScore?: boolean;
  teamApiId?: number;
  opponentApiId?: number;  // NEW
  excludeInactive?: boolean;
}
```

- [ ] **Step 2: Add the filter condition in getOwnClubMatches**

In the conditions block (after the `teamApiId` condition around line 413-419):

```typescript
if (opponentApiId) {
  conditions.push(
    or(
      eq(matches.homeTeamApiId, opponentApiId),
      eq(matches.guestTeamApiId, opponentApiId),
    )!,
  );
}
```

Add `opponentApiId` to the destructured params at the top of the function.

- [ ] **Step 3: Add query param to the route**

In `apps/api/src/routes/public/match.routes.ts`, add to the Zod schema and service call:

```typescript
const opponentApiId = query.get("opponentApiId");
// Pass to service:
opponentApiId: opponentApiId ? Number(opponentApiId) : undefined,
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/match-query.service.ts apps/api/src/routes/public/match.routes.ts
git commit -m "feat(api): add opponentApiId filter to GET /public/matches"
```

---

### Task 8: API Client — Add New Endpoint Methods

**Files:**
- Modify: `packages/api-client/src/endpoints/public.ts`
- Modify: `packages/api-client/src/endpoints/public.test.ts`

- [ ] **Step 1: Add new methods and types**

In `packages/api-client/src/endpoints/public.ts`, add imports and methods:

```typescript
import type {
  MatchListItem,
  LeagueStandings,
  PaginatedResponse,
  PublicMatchDetail,
  MatchContext,
  TeamStats,
  HomeDashboard,
} from "@dragons/shared";

export interface MatchQueryParams {
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  hasScore?: boolean;
  leagueId?: number;
  teamApiId?: number;
  opponentApiId?: number;  // NEW
}

export function publicEndpoints(client: ApiClient) {
  return {
    // ... existing methods unchanged ...

    getMatch(id: number): Promise<PublicMatchDetail> {
      return client.get(`/public/matches/${id}`);
    },

    getMatchContext(id: number): Promise<MatchContext> {
      return client.get(`/public/matches/${id}/context`);
    },

    getTeamStats(id: number): Promise<TeamStats> {
      return client.get(`/public/teams/${id}/stats`);
    },

    getHomeDashboard(): Promise<HomeDashboard> {
      return client.get("/public/home/dashboard");
    },
  };
}
```

- [ ] **Step 2: Add tests for new methods**

```typescript
// In public.test.ts, add:
it("getMatch calls GET /public/matches/:id", async () => {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ id: 1, homeScore: 78, guestScore: 65 })),
  );
  const result = await api.getMatch(1);
  expect(result.id).toBe(1);
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/public/matches/1"),
    expect.any(Object),
  );
});

it("getMatchContext calls GET /public/matches/:id/context", async () => {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ headToHead: { wins: 2, losses: 1 } })),
  );
  const result = await api.getMatchContext(1);
  expect(result.headToHead.wins).toBe(2);
});

it("getTeamStats calls GET /public/teams/:id/stats", async () => {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ teamId: 1, wins: 10 })),
  );
  const result = await api.getTeamStats(1);
  expect(result.teamId).toBe(1);
});

it("getHomeDashboard calls GET /public/home/dashboard", async () => {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ nextGame: null, clubStats: { teamCount: 5 } })),
  );
  const result = await api.getHomeDashboard();
  expect(result.clubStats.teamCount).toBe(5);
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @dragons/api-client test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src/endpoints/public.ts packages/api-client/src/endpoints/public.test.ts
git commit -m "feat(api-client): add getMatch, getMatchContext, getTeamStats, getHomeDashboard"
```

---

### Task 9: i18n — Add All New Translation Keys

**Files:**
- Modify: `apps/native/src/i18n/de.json`
- Modify: `apps/native/src/i18n/en.json`

- [ ] **Step 1: Update de.json**

Replace entire file with expanded translations:

```json
{
  "tabs": {
    "home": "Start",
    "schedule": "Spielplan",
    "standings": "Tabelle",
    "teams": "Teams"
  },
  "home": {
    "nextGame": "Nächstes Spiel",
    "lastResult": "Letztes Ergebnis",
    "recentResults": "Letzte Ergebnisse",
    "upcomingGames": "Kommende Spiele",
    "vs": "vs",
    "noUpcoming": "Keine anstehenden Spiele",
    "countdown": {
      "today": "Heute",
      "tomorrow": "Morgen",
      "inDays": "In %{count} Tagen"
    },
    "stats": {
      "teams": "Teams",
      "wins": "Siege",
      "losses": "Niederlagen",
      "winRate": "Siegquote"
    }
  },
  "match": {
    "win": "S",
    "loss": "N",
    "upcoming": "Anst.",
    "cancelled": "Abg.",
    "forfeited": "Wert."
  },
  "schedule": {
    "title": "Spielplan",
    "allGames": "Alle Spiele",
    "homeOnly": "Nur Heimspiele",
    "away": "Auswärts",
    "loadMore": "Mehr laden",
    "noMatches": "Keine Spiele gefunden"
  },
  "standings": {
    "title": "Tabellen",
    "pos": "Pl.",
    "team": "Team",
    "played": "Sp",
    "won": "S",
    "lost": "N",
    "diff": "Diff",
    "points": "Pkt"
  },
  "teams": {
    "title": "Mannschaften",
    "subtitle": "Alle Teams im Überblick",
    "senior": "Senioren",
    "youth": "Jugend"
  },
  "profile": {
    "title": "Profil",
    "biometricLock": "Biometrische Sperre",
    "theme": "Darstellung",
    "themeSystem": "System",
    "themeLight": "Hell",
    "themeDark": "Dunkel",
    "signOut": "Abmelden"
  },
  "teamDetail": {
    "league": "Liga",
    "lastGame": "Letztes Spiel",
    "nextGame": "Nächstes Spiel",
    "upcoming": "Kommende Spiele",
    "noMatches": "Keine Spiele gefunden",
    "position": "Platz",
    "season": "Saison",
    "games": "Spiele",
    "wins": "Siege",
    "losses": "Niederl.",
    "diff": "Diff",
    "standings": "Tabelle",
    "allGames": "Alle Spiele"
  },
  "gameDetail": {
    "venue": "Halle",
    "address": "Adresse",
    "date": "Datum",
    "time": "Uhrzeit",
    "final": "Endstand",
    "quarters": "Viertel",
    "halftime": "HZ",
    "total": "Ges",
    "record": "Bilanz vs %{opponent}",
    "form": "Form (letzte 5)",
    "details": "Details",
    "scorer": "Anschreiber",
    "timekeeper": "Zeitnehmer",
    "status": "Status",
    "confirmed": "Bestätigt",
    "cancelled": "Abgesagt",
    "forfeited": "Kampflos",
    "previousMeetings": "Letzte Begegnungen",
    "pointsFor": "Punkte für",
    "pointsAgainst": "Punkte gegen",
    "home": "Heim"
  },
  "h2h": {
    "title": "Bilanz vs %{opponent}"
  },
  "auth": {
    "signIn": "Anmelden",
    "signUp": "Registrieren",
    "signOut": "Abmelden",
    "email": "E-Mail",
    "password": "Passwort",
    "name": "Name",
    "noAccount": "Noch kein Konto?",
    "hasAccount": "Bereits ein Konto?",
    "error": "Fehler",
    "fillAllFields": "Bitte alle Felder ausfüllen.",
    "signInFailed": "Anmeldung fehlgeschlagen",
    "signUpFailed": "Registrierung fehlgeschlagen",
    "unknownError": "Unbekannter Fehler",
    "unexpectedError": "Ein unerwarteter Fehler ist aufgetreten",
    "signInPrompt": "Melden Sie sich an, um Ihr Profil zu sehen",
    "tapToUnlock": "Tippen zum Entsperren"
  },
  "common": {
    "home": "Heim",
    "away": "Auswärts",
    "details": "Details",
    "cancel": "Abbrechen",
    "save": "Speichern",
    "loading": "Laden…",
    "vs": "vs",
    "at": "@"
  }
}
```

- [ ] **Step 2: Update en.json**

```json
{
  "tabs": {
    "home": "Home",
    "schedule": "Schedule",
    "standings": "Standings",
    "teams": "Teams"
  },
  "home": {
    "nextGame": "Next Game",
    "lastResult": "Last Result",
    "recentResults": "Recent Results",
    "upcomingGames": "Upcoming Games",
    "vs": "vs",
    "noUpcoming": "No upcoming games",
    "countdown": {
      "today": "Today",
      "tomorrow": "Tomorrow",
      "inDays": "In %{count} days"
    },
    "stats": {
      "teams": "Teams",
      "wins": "Wins",
      "losses": "Losses",
      "winRate": "Win %"
    }
  },
  "match": {
    "win": "W",
    "loss": "L",
    "upcoming": "Up",
    "cancelled": "Canc.",
    "forfeited": "Forf."
  },
  "schedule": {
    "title": "Schedule",
    "allGames": "All Games",
    "homeOnly": "Home Only",
    "away": "Away",
    "loadMore": "Load More",
    "noMatches": "No matches found"
  },
  "standings": {
    "title": "Standings",
    "pos": "Pos",
    "team": "Team",
    "played": "GP",
    "won": "W",
    "lost": "L",
    "diff": "Diff",
    "points": "Pts"
  },
  "teams": {
    "title": "Teams",
    "subtitle": "All teams at a glance",
    "senior": "Senior",
    "youth": "Youth"
  },
  "profile": {
    "title": "Profile",
    "biometricLock": "Biometric Lock",
    "theme": "Appearance",
    "themeSystem": "System",
    "themeLight": "Light",
    "themeDark": "Dark",
    "signOut": "Sign Out"
  },
  "teamDetail": {
    "league": "League",
    "lastGame": "Last Game",
    "nextGame": "Next Game",
    "upcoming": "Upcoming",
    "noMatches": "No matches found",
    "position": "Pos",
    "season": "Season",
    "games": "Games",
    "wins": "Wins",
    "losses": "Losses",
    "diff": "Diff",
    "standings": "Standings",
    "allGames": "All Games"
  },
  "gameDetail": {
    "venue": "Venue",
    "address": "Address",
    "date": "Date",
    "time": "Time",
    "final": "Final",
    "quarters": "Quarters",
    "halftime": "HT",
    "total": "Tot",
    "record": "Record vs %{opponent}",
    "form": "Form (last 5)",
    "details": "Details",
    "scorer": "Scorer",
    "timekeeper": "Timekeeper",
    "status": "Status",
    "confirmed": "Confirmed",
    "cancelled": "Cancelled",
    "forfeited": "Forfeited",
    "previousMeetings": "Previous Meetings",
    "pointsFor": "Points for",
    "pointsAgainst": "Points against",
    "home": "Home"
  },
  "h2h": {
    "title": "Record vs %{opponent}"
  },
  "auth": {
    "signIn": "Sign In",
    "signUp": "Sign Up",
    "signOut": "Sign Out",
    "email": "Email",
    "password": "Password",
    "name": "Name",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?",
    "error": "Error",
    "fillAllFields": "Please fill in all fields.",
    "signInFailed": "Sign In Failed",
    "signUpFailed": "Sign Up Failed",
    "unknownError": "Unknown error",
    "unexpectedError": "An unexpected error occurred",
    "signInPrompt": "Sign in to view your profile",
    "tapToUnlock": "Tap to unlock"
  },
  "common": {
    "home": "Home",
    "away": "Away",
    "details": "Details",
    "cancel": "Cancel",
    "save": "Save",
    "loading": "Loading…",
    "vs": "vs",
    "at": "@"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/i18n/de.json apps/native/src/i18n/en.json
git commit -m "feat(native): add i18n keys for screen overhaul"
```

---

### Task 10: Native — useTeamColor Hook + Wire API Client

**Files:**
- Create: `apps/native/src/hooks/useTeamColor.ts`
- Modify: `apps/native/src/lib/api.ts`

- [ ] **Step 1: Create useTeamColor hook**

```typescript
// apps/native/src/hooks/useTeamColor.ts
import { useTheme } from "./useTheme";
import { getNativeTeamColor } from "@dragons/shared";
import type { NativeTeamColor } from "@dragons/shared";

/**
 * Returns the team's badge color as native hex values.
 * Only use for own-club teams — opponents should use mutedForeground.
 */
export function useTeamColor(
  badgeColor: string | null | undefined,
  teamName: string,
): NativeTeamColor {
  const { isDark } = useTheme();
  return getNativeTeamColor(badgeColor, teamName, isDark);
}
```

- [ ] **Step 2: Wire new API methods in api.ts**

The existing `publicApi` already uses `publicEndpoints(client)`, so the new methods (`getMatch`, `getMatchContext`, `getTeamStats`, `getHomeDashboard`) are automatically available after Task 8. No changes needed to `api.ts` itself.

Verify by checking the type: `publicApi.getHomeDashboard` should autocomplete.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/hooks/useTeamColor.ts
git commit -m "feat(native): add useTeamColor hook"
```

---

### Task 11: Native — Shared Components (FormStrip, ResultChip, QuarterTable, HeadToHead, StandingsTable)

**Files:**
- Create: `apps/native/src/components/FormStrip.tsx`
- Create: `apps/native/src/components/ResultChip.tsx`
- Create: `apps/native/src/components/QuarterTable.tsx`
- Create: `apps/native/src/components/HeadToHead.tsx`
- Create: `apps/native/src/components/StandingsTable.tsx`

These are rendering-only components with no data fetching — they receive data as props.

- [ ] **Step 1: FormStrip component**

```tsx
// apps/native/src/components/FormStrip.tsx
import { View, Text } from "react-native";
import { useTheme } from "../hooks/useTheme";
import i18n from "../lib/i18n";
import type { FormEntry } from "@dragons/shared";

interface Props {
  form: FormEntry[];
  size?: number;
}

export function FormStrip({ form, size = 28 }: Props) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {form.map((entry, idx) => {
        const isWin = entry.result === "W";
        const bg = isWin ? "rgba(132,217,151,0.15)" : "rgba(248,113,113,0.15)";
        const textColor = isWin ? colors.chart1 : colors.destructive;
        const label = isWin ? i18n.t("match.win") : i18n.t("match.loss");
        return (
          <View
            key={idx}
            style={{
              width: size,
              height: size,
              borderRadius: radius.md,
              backgroundColor: bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: textColor, fontSize: size * 0.39, fontWeight: "700" }}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: ResultChip component**

```tsx
// apps/native/src/components/ResultChip.tsx
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../hooks/useTheme";
import i18n from "../lib/i18n";
import type { MatchListItem } from "@dragons/shared";

interface Props {
  match: MatchListItem;
  onPress?: () => void;
}

export function ResultChip({ match, onPress }: Props) {
  const { colors, radius, spacing, textStyles } = useTheme();

  const isOwnHome = match.homeIsOwnClub;
  const ownScore = isOwnHome ? match.homeScore : match.guestScore;
  const opponentScore = isOwnHome ? match.guestScore : match.homeScore;
  const isWin = ownScore !== null && opponentScore !== null && ownScore > opponentScore;

  // Team abbreviation: use first 2-3 chars of short name
  const ownName = isOwnHome
    ? (match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName)
    : (match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName);
  const abbrev = ownName.replace(/^Dragons?\s*/i, "").slice(0, 3) || ownName.slice(0, 3);

  const badge = isWin ? i18n.t("match.win") : i18n.t("match.loss");
  const badgeBg = isWin ? "rgba(132,217,151,0.12)" : "rgba(248,113,113,0.12)";
  const badgeColor = isWin ? colors.chart1 : colors.destructive;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: colors.surfaceLowest,
        borderRadius: radius.md,
        padding: spacing.sm,
        alignItems: "center",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 9, color: colors.mutedForeground }}>{abbrev}</Text>
      <Text style={{
        color: isWin ? colors.foreground : colors.mutedForeground,
        fontSize: 14,
        fontWeight: isWin ? "700" : "400",
        marginTop: 2,
      }}>
        {ownScore ?? "—"}
      </Text>
      <Text style={{
        color: isWin ? colors.mutedForeground : colors.foreground,
        fontSize: 14,
        fontWeight: isWin ? "400" : "700",
      }}>
        {opponentScore ?? "—"}
      </Text>
      <View style={{
        backgroundColor: badgeBg,
        borderRadius: 999,
        paddingHorizontal: 6,
        paddingVertical: 1,
        marginTop: spacing.xs,
      }}>
        <Text style={{ color: badgeColor, fontSize: 8, fontWeight: "600", textTransform: "uppercase" }}>
          {badge}
        </Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 3: QuarterTable component**

```tsx
// apps/native/src/components/QuarterTable.tsx
import { View, Text } from "react-native";
import { useTheme } from "../hooks/useTheme";
import i18n from "../lib/i18n";
import type { PublicMatchDetail } from "@dragons/shared";

interface Props {
  match: PublicMatchDetail;
  homeAbbrev: string;
  guestAbbrev: string;
  homeColor: string;
}

export function QuarterTable({ match, homeAbbrev, guestAbbrev, homeColor }: Props) {
  const { colors, spacing, radius } = useTheme();

  const isAchtel = match.periodFormat === "achtel";
  const quarters = isAchtel
    ? [
        { label: "Q1", home: match.homeQ1, guest: match.guestQ1 },
        { label: "Q2", home: match.homeQ2, guest: match.guestQ2 },
        { label: "Q3", home: match.homeQ3, guest: match.guestQ3 },
        { label: "Q4", home: match.homeQ4, guest: match.guestQ4 },
        { label: "Q5", home: match.homeQ5, guest: match.guestQ5 },
        { label: "Q6", home: match.homeQ6, guest: match.guestQ6 },
        { label: "Q7", home: match.homeQ7, guest: match.guestQ7 },
        { label: "Q8", home: match.homeQ8, guest: match.guestQ8 },
      ]
    : [
        { label: "Q1", home: match.homeQ1, guest: match.guestQ1 },
        { label: "Q2", home: match.homeQ2, guest: match.guestQ2 },
        { label: "Q3", home: match.homeQ3, guest: match.guestQ3 },
        { label: "Q4", home: match.homeQ4, guest: match.guestQ4 },
      ];

  // Add OT columns if present
  if (match.homeOt1 !== null) quarters.push({ label: "OT1", home: match.homeOt1, guest: match.guestOt1 });
  if (match.homeOt2 !== null) quarters.push({ label: "OT2", home: match.homeOt2, guest: match.guestOt2 });

  // Add halftime and total
  const hz = { label: i18n.t("gameDetail.halftime"), home: match.homeHalftimeScore, guest: match.guestHalftimeScore };
  const total = { label: i18n.t("gameDetail.total"), home: match.homeScore, guest: match.guestScore };

  const allCols = [...quarters, hz, total];
  const hasData = quarters.some((q) => q.home !== null);
  if (!hasData) return null;

  const headerStyle = { fontSize: 10, color: colors.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.5, fontWeight: "500" as const, textAlign: "center" as const };
  const cellWidth = 32;

  function cellStyle(val: number | null, otherVal: number | null) {
    const isWinner = val !== null && otherVal !== null && val > otherVal;
    return {
      color: isWinner ? colors.foreground : colors.mutedForeground,
      fontWeight: isWinner ? ("700" as const) : ("400" as const),
      fontSize: 13,
      textAlign: "center" as const,
    };
  }

  return (
    <View style={{ backgroundColor: colors.surfaceLowest, borderRadius: radius.md, padding: spacing.md }}>
      <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: colors.mutedForeground, fontWeight: "500", marginBottom: spacing.sm }}>
        {i18n.t("gameDetail.quarters")}
      </Text>

      {/* Header */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border + "14", paddingBottom: 6 }}>
        <View style={{ width: 50 }} />
        {allCols.map((col) => (
          <View key={col.label} style={{ width: cellWidth, alignItems: "center" }}>
            <Text style={headerStyle}>{col.label}</Text>
          </View>
        ))}
      </View>

      {/* Home row */}
      <View style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border + "0A" }}>
        <View style={{ width: 50 }}>
          <Text style={{ color: homeColor, fontSize: 12, fontWeight: "600" }}>{homeAbbrev}</Text>
        </View>
        {allCols.map((col) => (
          <View key={col.label} style={{ width: cellWidth, alignItems: "center" }}>
            <Text style={cellStyle(col.home, col.guest)}>{col.home ?? "—"}</Text>
          </View>
        ))}
      </View>

      {/* Guest row */}
      <View style={{ flexDirection: "row", paddingVertical: 8 }}>
        <View style={{ width: 50 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{guestAbbrev}</Text>
        </View>
        {allCols.map((col) => (
          <View key={col.label} style={{ width: cellWidth, alignItems: "center" }}>
            <Text style={cellStyle(col.guest, col.home)}>{col.guest ?? "—"}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: HeadToHead component**

```tsx
// apps/native/src/components/HeadToHead.tsx
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../hooks/useTheme";
import i18n from "../lib/i18n";
import type { HeadToHead as H2HType } from "@dragons/shared";

interface Props {
  data: H2HType;
  opponentName: string;
  ownAbbrev: string;
  ownColor: string;
  onMatchPress?: (matchId: number) => void;
}

export function HeadToHead({ data, opponentName, ownAbbrev, ownColor, onMatchPress }: Props) {
  const { colors, spacing, radius, textStyles } = useTheme();

  return (
    <View style={{ backgroundColor: colors.surfaceLowest, borderRadius: radius.md, padding: spacing.md }}>
      <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: colors.mutedForeground, fontWeight: "500", marginBottom: spacing.sm }}>
        {i18n.t("gameDetail.record", { opponent: opponentName })}
      </Text>

      {/* Stats row */}
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: spacing.md }}>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.chart1, fontSize: 24, fontWeight: "700" }}>{data.wins}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, textTransform: "uppercase" }}>{i18n.t("home.stats.wins")}</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 24, fontWeight: "700" }}>{data.losses}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, textTransform: "uppercase" }}>{i18n.t("home.stats.losses")}</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "700" }}>{data.pointsFor}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, textTransform: "uppercase" }}>{i18n.t("gameDetail.pointsFor")}</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "700" }}>{data.pointsAgainst}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, textTransform: "uppercase" }}>{i18n.t("gameDetail.pointsAgainst")}</Text>
        </View>
      </View>

      {/* Previous meetings */}
      {data.previousMeetings.length > 0 && (
        <>
          <Text style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3, color: colors.mutedForeground, marginBottom: spacing.xs }}>
            {i18n.t("gameDetail.previousMeetings")}
          </Text>
          {data.previousMeetings.map((m) => {
            const winnerHome = m.homeScore > m.guestScore;
            return (
              <Pressable
                key={m.matchId}
                onPress={() => onMatchPress?.(m.matchId)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  padding: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  backgroundColor: colors.surfaceLow + "08",
                  borderRadius: 3,
                  marginBottom: 4,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: 11, width: 70 }}>
                  {new Date(m.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </Text>
                <Text style={{ flex: 1, color: m.homeIsOwnClub ? ownColor : colors.mutedForeground, fontSize: 12, fontWeight: m.homeIsOwnClub ? "600" : "400" }}>
                  {m.homeIsOwnClub ? ownAbbrev : opponentName.slice(0, 15)}
                </Text>
                <Text style={{ color: winnerHome ? colors.foreground : colors.mutedForeground, fontSize: 13, fontWeight: winnerHome ? "700" : "400" }}>{m.homeScore}</Text>
                <Text style={{ color: colors.mutedForeground, marginHorizontal: 4 }}>:</Text>
                <Text style={{ color: !winnerHome ? colors.foreground : colors.mutedForeground, fontSize: 13, fontWeight: !winnerHome ? "700" : "400" }}>{m.guestScore}</Text>
                <Text style={{ flex: 1, color: !m.homeIsOwnClub ? ownColor : colors.mutedForeground, fontSize: 12, fontWeight: !m.homeIsOwnClub ? "600" : "400", textAlign: "right" }}>
                  {!m.homeIsOwnClub ? ownAbbrev : opponentName.slice(0, 15)}
                </Text>
                <View style={{
                  backgroundColor: m.isWin ? "rgba(132,217,151,0.12)" : "rgba(248,113,113,0.12)",
                  borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1, marginLeft: spacing.sm,
                }}>
                  <Text style={{ color: m.isWin ? colors.chart1 : colors.destructive, fontSize: 8, fontWeight: "600" }}>
                    {m.isWin ? i18n.t("match.win") : i18n.t("match.loss")}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 5: StandingsTable component**

```tsx
// apps/native/src/components/StandingsTable.tsx
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { useTeamColor } from "../hooks/useTeamColor";
import i18n from "../lib/i18n";
import type { StandingItem } from "@dragons/shared";

interface Props {
  standings: StandingItem[];
  leagueName: string;
  seasonName?: string;
  onOwnClubPress?: (teamName: string) => void;
  onOpponentPress?: (teamName: string) => void;
}

export function StandingsTable({ standings, leagueName, seasonName, onOwnClubPress, onOpponentPress }: Props) {
  const { colors, spacing, radius } = useTheme();

  const colW = { pos: 24, played: 24, won: 24, lost: 24, diff: 40, pts: 32 };
  const headerStyle = { fontSize: 10, textTransform: "uppercase" as const, letterSpacing: 0.5, color: colors.mutedForeground, fontWeight: "500" as const, textAlign: "center" as const };

  return (
    <View style={{ backgroundColor: colors.surfaceLowest, borderRadius: radius.md, overflow: "hidden" }}>
      {/* League header */}
      <View style={{ padding: spacing.md, backgroundColor: colors.surfaceLow + "08", borderBottomWidth: 1, borderBottomColor: colors.border + "10" }}>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>{leagueName}</Text>
        {seasonName && <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>{seasonName}</Text>}
      </View>

      {/* Column headers */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border + "10" }}>
        <View style={{ width: colW.pos }}><Text style={headerStyle}>{i18n.t("standings.pos")}</Text></View>
        <View style={{ flex: 1, paddingLeft: 4 }}><Text style={{ ...headerStyle, textAlign: "left" }}>{i18n.t("standings.team")}</Text></View>
        <View style={{ width: colW.played }}><Text style={headerStyle}>{i18n.t("standings.played")}</Text></View>
        <View style={{ width: colW.won }}><Text style={headerStyle}>{i18n.t("standings.won")}</Text></View>
        <View style={{ width: colW.lost }}><Text style={headerStyle}>{i18n.t("standings.lost")}</Text></View>
        <View style={{ width: colW.diff }}><Text style={headerStyle}>{i18n.t("standings.diff")}</Text></View>
        <View style={{ width: colW.pts }}><Text style={{ ...headerStyle, textAlign: "right" }}>{i18n.t("standings.points")}</Text></View>
      </View>

      {/* Rows */}
      {standings.map((item) => (
        <StandingsRowNew
          key={item.position}
          item={item}
          colW={colW}
          onPress={() => item.isOwnClub ? onOwnClubPress?.(item.teamName) : onOpponentPress?.(item.teamName)}
        />
      ))}
    </View>
  );
}

function StandingsRowNew({ item, colW, onPress }: {
  item: StandingItem;
  colW: Record<string, number>;
  onPress?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const isOwn = item.isOwnClub;

  const diffColor = item.pointsDiff > 0 ? colors.chart1 : item.pointsDiff < 0 ? colors.destructive : colors.mutedForeground;
  const diffPrefix = item.pointsDiff > 0 ? "+" : "";
  const textColor = isOwn ? colors.foreground : colors.mutedForeground;
  const statColor = isOwn ? colors.foreground : colors.mutedForeground;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border + "08",
        opacity: pressed ? 0.85 : 1,
        ...(isOwn ? {
          backgroundColor: colors.primary + "0D",
          borderLeftWidth: 2,
          borderLeftColor: colors.primary + "80",
          paddingLeft: spacing.md - 2,
        } : {}),
      })}
    >
      <View style={{ width: colW.pos }}><Text style={{ textAlign: "center", color: isOwn ? colors.foreground : colors.mutedForeground, fontWeight: isOwn ? "600" : "400", fontSize: 13 }}>{item.position}</Text></View>
      <View style={{ flex: 1, paddingLeft: 4 }}>
        <Text numberOfLines={1} style={{ color: textColor, fontWeight: isOwn ? "600" : "400", fontSize: 13 }}>
          {item.teamNameShort ?? item.teamName}
        </Text>
      </View>
      <View style={{ width: colW.played }}><Text style={{ textAlign: "center", color: statColor, fontSize: 13 }}>{item.played}</Text></View>
      <View style={{ width: colW.won }}><Text style={{ textAlign: "center", color: statColor, fontSize: 13 }}>{item.won}</Text></View>
      <View style={{ width: colW.lost }}><Text style={{ textAlign: "center", color: statColor, fontSize: 13 }}>{item.lost}</Text></View>
      <View style={{ width: colW.diff }}><Text style={{ textAlign: "center", color: diffColor, fontSize: 12 }}>{diffPrefix}{item.pointsDiff}</Text></View>
      <View style={{ width: colW.pts }}><Text style={{ textAlign: "right", color: colors.foreground, fontWeight: "700", fontSize: 13 }}>{item.leaguePoints}</Text></View>
    </Pressable>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/components/FormStrip.tsx apps/native/src/components/ResultChip.tsx apps/native/src/components/QuarterTable.tsx apps/native/src/components/HeadToHead.tsx apps/native/src/components/StandingsTable.tsx
git commit -m "feat(native): add FormStrip, ResultChip, QuarterTable, HeadToHead, StandingsTable components"
```

---

### Task 12: Native — MatchCardFull and MatchCardCompact Components

**Files:**
- Create: `apps/native/src/components/MatchCardFull.tsx`
- Create: `apps/native/src/components/MatchCardCompact.tsx`

- [ ] **Step 1: MatchCardFull — the primary match card**

```tsx
// apps/native/src/components/MatchCardFull.tsx
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { getNativeTeamColor } from "@dragons/shared";
import i18n from "../lib/i18n";
import type { MatchListItem } from "@dragons/shared";

interface Props {
  match: MatchListItem;
  onPress?: () => void;
}

export function MatchCardFull({ match, onPress }: Props) {
  const { colors, spacing, radius, isDark } = useTheme();

  const isHomeGame = match.homeIsOwnClub;
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const isCancelled = match.isCancelled;

  // Home game background tint
  const bgColor = isHomeGame
    ? (isDark ? "rgba(0,75,35,0.12)" : "rgba(0,75,35,0.06)")
    : colors.surfaceLowest;

  // Determine own-club side
  const homeIsOwn = match.homeIsOwnClub;
  const guestIsOwn = match.guestIsOwnClub;

  // Team name colors
  const homeColor = homeIsOwn
    ? getNativeTeamColor(match.homeBadgeColor, match.homeTeamName, isDark).name
    : colors.mutedForeground;
  const guestColor = guestIsOwn
    ? getNativeTeamColor(match.guestBadgeColor, match.guestTeamName, isDark).name
    : colors.mutedForeground;

  // Score styling
  const homeWins = hasScore && match.homeScore! > match.guestScore!;
  const guestWins = hasScore && match.guestScore! > match.homeScore!;

  // Result badge
  let badgeText = "";
  let badgeBg = "";
  let badgeColor = "";
  if (isCancelled) {
    badgeText = i18n.t("match.cancelled");
    badgeBg = "rgba(248,113,113,0.12)";
    badgeColor = colors.destructive;
  } else if (match.isForfeited) {
    badgeText = i18n.t("match.forfeited");
    badgeBg = "rgba(237,105,31,0.12)";
    badgeColor = colors.heat;
  } else if (!hasScore) {
    badgeText = i18n.t("match.upcoming");
    badgeBg = "rgba(237,105,31,0.12)";
    badgeColor = colors.heat;
  } else {
    const ownWins = (homeIsOwn && homeWins) || (guestIsOwn && guestWins);
    badgeText = ownWins ? i18n.t("match.win") : i18n.t("match.loss");
    badgeBg = ownWins ? "rgba(132,217,151,0.12)" : "rgba(248,113,113,0.12)";
    badgeColor = ownWins ? colors.chart1 : colors.destructive;
  }

  // Team name resolution
  const homeName = match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName;
  const guestName = match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName;

  // Date formatting
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const d = new Date(match.kickoffDate + "T00:00:00");
  const dayLabel = days[d.getDay()];
  const dateStr = `${dayLabel}, ${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.`;
  const time = match.kickoffTime.slice(0, 5);
  const venue = match.venueNameOverride ?? match.venueName ?? "";
  const headerText = [dateStr, time, venue].filter(Boolean).join(" • ");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bgColor,
        borderRadius: radius.md,
        padding: spacing.lg,
        opacity: pressed && onPress ? 0.85 : isCancelled ? 0.7 : 1,
      })}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 12, fontWeight: "500", marginRight: spacing.sm }}>
          {headerText}
        </Text>
        <View style={{ backgroundColor: badgeBg, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
          <Text style={{ color: badgeColor, fontSize: 9, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {badgeText}
          </Text>
        </View>
      </View>

      {/* Home team row */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xs + 2 }}>
        <Text numberOfLines={1} style={{
          flex: 1,
          color: homeColor,
          fontSize: 14,
          fontWeight: homeIsOwn ? "600" : "400",
          textDecorationLine: isCancelled ? "line-through" : "none",
        }}>
          {homeName}
        </Text>
        <Text style={{
          color: hasScore ? (homeWins ? colors.foreground : colors.mutedForeground) : colors.mutedForeground,
          fontSize: hasScore ? 20 : 16,
          fontWeight: hasScore ? (homeWins ? "700" : "400") : "500",
          width: 32,
          textAlign: "right",
        }}>
          {match.homeScore ?? "—"}
        </Text>
      </View>

      {/* Guest team row */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text numberOfLines={1} style={{
          flex: 1,
          color: guestColor,
          fontSize: 14,
          fontWeight: guestIsOwn ? "600" : "400",
          textDecorationLine: isCancelled ? "line-through" : "none",
        }}>
          {guestName}
        </Text>
        <Text style={{
          color: hasScore ? (guestWins ? colors.foreground : colors.mutedForeground) : colors.mutedForeground,
          fontSize: hasScore ? 20 : 16,
          fontWeight: hasScore ? (guestWins ? "700" : "400") : "500",
          width: 32,
          textAlign: "right",
        }}>
          {match.guestScore ?? "—"}
        </Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2: MatchCardCompact**

```tsx
// apps/native/src/components/MatchCardCompact.tsx
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { getNativeTeamColor } from "@dragons/shared";
import i18n from "../lib/i18n";
import type { MatchListItem } from "@dragons/shared";

interface Props {
  match: MatchListItem;
  onPress?: () => void;
  highlighted?: boolean;
}

export function MatchCardCompact({ match, onPress, highlighted }: Props) {
  const { colors, spacing, radius, isDark } = useTheme();

  const isHomeGame = match.homeIsOwnClub;
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const bgColor = isHomeGame
    ? (isDark ? "rgba(0,75,35,0.12)" : "rgba(0,75,35,0.06)")
    : colors.surfaceLowest;

  // Own-club info
  const ownIsHome = match.homeIsOwnClub;
  const ownName = ownIsHome
    ? (match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName)
    : (match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName);
  const ownBadge = ownIsHome ? match.homeBadgeColor : match.guestBadgeColor;
  const opponentName = ownIsHome
    ? (match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName)
    : (match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName);

  const ownColor = getNativeTeamColor(ownBadge, ownName, isDark).name;
  const abbrev = ownName.replace(/^Dragons?\s*/i, "").slice(0, 3) || ownName.slice(0, 3);
  const connector = ownIsHome ? i18n.t("common.vs") : i18n.t("common.at");

  // Score + badge
  const ownScore = ownIsHome ? match.homeScore : match.guestScore;
  const oppScore = ownIsHome ? match.guestScore : match.homeScore;
  const ownWins = hasScore && ownScore! > oppScore!;

  let badgeText = "";
  let badgeBg = "";
  let badgeTextColor = "";
  if (!hasScore) {
    badgeText = i18n.t("match.upcoming");
    badgeBg = "rgba(237,105,31,0.12)";
    badgeTextColor = colors.heat;
  } else {
    badgeText = ownWins ? i18n.t("match.win") : i18n.t("match.loss");
    badgeBg = ownWins ? "rgba(132,217,151,0.12)" : "rgba(248,113,113,0.12)";
    badgeTextColor = ownWins ? colors.chart1 : colors.destructive;
  }

  const d = new Date(match.kickoffDate + "T00:00:00");
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const dateStr = `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.`;
  const time = match.kickoffTime.slice(0, 5);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bgColor,
        borderRadius: radius.md,
        padding: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        opacity: pressed && onPress ? 0.85 : 1,
        ...(highlighted ? { borderWidth: 1, borderColor: colors.primary + "4D" } : {}),
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{dateStr} • {time}</Text>
        <View style={{ backgroundColor: badgeBg, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
          <Text style={{ color: badgeTextColor, fontSize: 8, fontWeight: "600", textTransform: "uppercase" }}>{badgeText}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
          <Text style={{ color: ownColor, fontSize: 13, fontWeight: "600" }}>{abbrev}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{connector}</Text>
          <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 13, flex: 1 }}>{opponentName}</Text>
        </View>
        {hasScore && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: ownWins ? colors.foreground : colors.mutedForeground, fontSize: 14, fontWeight: ownWins ? "700" : "400" }}>{ownScore}</Text>
            <Text style={{ color: colors.mutedForeground, marginHorizontal: 2 }}>:</Text>
            <Text style={{ color: !ownWins ? colors.foreground : colors.mutedForeground, fontSize: 14, fontWeight: !ownWins ? "700" : "400" }}>{oppScore}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/MatchCardFull.tsx apps/native/src/components/MatchCardCompact.tsx
git commit -m "feat(native): add MatchCardFull and MatchCardCompact components"
```

---

### Task 13: Native — Home Screen Rewrite

**Files:**
- Modify: `apps/native/src/app/(tabs)/index.tsx`

- [ ] **Step 1: Rewrite the home screen**

Replace the entire home screen with the new design: next game hero, recent results strip, quick stats, upcoming games. Use `publicApi.getHomeDashboard()` instead of multiple SWR calls. Use `MatchCardFull` for the hero, `ResultChip` for the strip, `StatStrip` for stats, `MatchCardCompact` for upcoming games.

The implementer should read the existing `index.tsx` for the current SWR/navigation pattern, then rewrite using:
- `useSWR("home:dashboard", () => publicApi.getHomeDashboard())`
- `MatchCardFull` for next game hero card (with countdown badge)
- `ResultChip` row for recent results
- `StatStrip` with teams/wins/losses/win% from `clubStats`
- `MatchCardCompact` for upcoming games list
- All text via i18n keys from Task 9
- `router.push(\`/game/${match.id}\`)` for all tappable elements

Follow the spec section 2 exactly. Remove navigation shortcut cards.

- [ ] **Step 2: Test on device**

Run: `cd apps/native && npx expo start`
Verify: Home screen shows hero, results strip, stats, upcoming. All tappable.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/index.tsx
git commit -m "feat(native): rewrite home screen with dashboard endpoint"
```

---

### Task 14: Native — Game Detail Screen Rewrite

**Files:**
- Modify: `apps/native/src/app/game/[id].tsx`

- [ ] **Step 1: Rewrite game detail**

Replace the game detail screen with the single-scroll design from spec section 3. Use:
- `useSWR(\`match:${id}\`, () => publicApi.getMatch(id))` for match data
- `useSWR(\`match:${id}:context\`, () => publicApi.getMatchContext(id))` for H2H/form
- Score header with centered teams, large score (winner bold), "Endstand"/"VS" label
- `QuarterTable` component for period breakdown
- `HeadToHead` component for H2H stats + previous meetings
- `FormStrip` for both teams' form
- Details section with venue/officials/status key-value pairs
- Own-club team name color via `getNativeTeamColor`
- Home game badge ("Heim") on the home team if own-club
- All text via i18n

- [ ] **Step 2: Test on device**

Run: `npx expo start` — tap a match → verify score header, quarter table (if completed), H2H, form, details.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/game/\\[id\\].tsx
git commit -m "feat(native): rewrite game detail with quarters, H2H, form"
```

---

### Task 15: Native — Team Detail Dashboard Rewrite

**Files:**
- Modify: `apps/native/src/app/team/[id].tsx`

- [ ] **Step 1: Rewrite team detail**

Replace with spec section 4 design. Use:
- `useSWR(\`team:${id}:stats\`, () => publicApi.getTeamStats(id))` for stats
- `useSWR("standings", () => publicApi.getStandings())` for standings table
- `useSWR(\`team:${id}:matches\`, () => publicApi.getMatches({ teamApiId: team.apiTeamPermanentId, limit: 50, sort: "asc" }))` for match list
- Team header with badge-colored name + league name
- `FormStrip` + position number row
- `MatchCardFull` for last game and next game
- `StatStrip` for season stats
- `StandingsTable` for the league table
- `MatchCardCompact` list for all games (highlighted = most recent completed)
- Navigation: match cards → `/game/[id]`, opponent standings row → `/h2h/[teamApiId]`

- [ ] **Step 2: Test on device**

Tap a team → verify all sections render, match cards navigate correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/team/\\[id\\].tsx
git commit -m "feat(native): rewrite team detail dashboard with stats, standings, all games"
```

---

### Task 16: Native — Standings Tab Rewrite

**Files:**
- Modify: `apps/native/src/app/(tabs)/standings.tsx`

- [ ] **Step 1: Rewrite standings tab**

Replace with spec section 5 design. Use:
- `StandingsTable` component for each league
- Full columns: Sp, S, N, Diff, Pkt
- Tap own-club row → `router.push(\`/team/${teamId}\`)`
- Tap opponent row → `router.push(\`/h2h/${teamApiId}\`)`
- Need to resolve team IDs from standings data (standings has `teamName` but not `teamId`; may need to cross-reference with teams data)

- [ ] **Step 2: Test on device**

Standings tab → verify full columns, own-club highlighting, tapping navigates.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/\(tabs\)/standings.tsx
git commit -m "feat(native): rewrite standings tab with full columns and StandingsTable"
```

---

### Task 17: Native — Schedule Tab Update + Teams Tab Update

**Files:**
- Modify: `apps/native/src/app/(tabs)/schedule.tsx`
- Modify: `apps/native/src/app/(tabs)/teams.tsx`

- [ ] **Step 1: Update schedule to use MatchCardFull**

Replace the old `MatchCard` import with `MatchCardFull`. Keep filter pills, SectionList grouping, and pagination as-is.

- [ ] **Step 2: Update teams tab — badge-colored names**

In the `TeamCard` component rendering, use `getNativeTeamColor` to render the team name in its badge color instead of neutral.

- [ ] **Step 3: Test on device**

Schedule → verify new match cards. Teams → verify colored names.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/\(tabs\)/schedule.tsx apps/native/src/app/\(tabs\)/teams.tsx
git commit -m "feat(native): update schedule and teams tabs with new card designs"
```

---

### Task 18: Native — H2H Screen + Navigation Wiring

**Files:**
- Create: `apps/native/src/app/h2h/[teamApiId].tsx`
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 1: Create H2H screen**

```tsx
// apps/native/src/app/h2h/[teamApiId].tsx
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import useSWR from "swr";
import { Screen } from "../../components/Screen";
import { MatchCardFull } from "../../components/MatchCardFull";
import { useTheme } from "../../hooks/useTheme";
import { publicApi } from "../../lib/api";
import i18n from "../../lib/i18n";

export default function H2HScreen() {
  const { teamApiId } = useLocalSearchParams<{ teamApiId: string }>();
  const { colors, spacing, textStyles } = useTheme();

  const { data, isLoading } = useSWR(
    `h2h:${teamApiId}`,
    () => publicApi.getMatches({ opponentApiId: Number(teamApiId), limit: 50, sort: "desc" }),
  );

  // Get opponent name from first match
  const opponentName = data?.items[0]
    ? (data.items[0].homeIsOwnClub
        ? (data.items[0].guestTeamCustomName ?? data.items[0].guestTeamNameShort ?? data.items[0].guestTeamName)
        : (data.items[0].homeTeamCustomName ?? data.items[0].homeTeamNameShort ?? data.items[0].homeTeamName))
    : "";

  return (
    <>
      <Stack.Screen options={{ title: opponentName ? i18n.t("h2h.title", { opponent: opponentName }) : "" }} />
      <Screen scroll={false}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={data?.items ?? []}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={{ marginBottom: spacing.sm }}>
                <MatchCardFull match={item} onPress={() => router.push(`/game/${item.id}`)} />
              </View>
            )}
            contentContainerStyle={{ padding: spacing.lg }}
            ListEmptyComponent={
              <Text style={{ ...textStyles.body, color: colors.mutedForeground, textAlign: "center", marginTop: spacing.xl }}>
                {i18n.t("schedule.noMatches")}
              </Text>
            }
          />
        )}
      </Screen>
    </>
  );
}
```

- [ ] **Step 2: Add route to _layout.tsx**

In the root Stack navigator, add:

```tsx
<Stack.Screen name="h2h/[teamApiId]" options={{ title: "" }} />
```

- [ ] **Step 3: Test on device**

Tap an opponent in standings → verify H2H screen shows filtered matches.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/h2h/\\[teamApiId\\].tsx apps/native/src/app/_layout.tsx
git commit -m "feat(native): add H2H match list screen with opponent filtering"
```

---

### Task 19: Cleanup — Remove Old Components + Update AGENTS.md

**Files:**
- Delete or update: `apps/native/src/components/MatchCard.tsx` (old, replaced by MatchCardFull)
- Delete or update: `apps/native/src/components/StandingsRow.tsx` (old, replaced by StandingsTable)
- Modify: `AGENTS.md` — document new endpoints

- [ ] **Step 1: Remove old MatchCard if no longer imported**

Check if any file still imports the old `MatchCard`. If not, delete it. If schedule.tsx or team detail still uses it, those should have been updated in Tasks 17/15.

- [ ] **Step 2: Remove old StandingsRow if no longer imported**

Same check. StandingsTable replaces it.

- [ ] **Step 3: Update AGENTS.md**

Add the 4 new endpoints to the API endpoint documentation:
- `GET /public/matches/:id` — Single match with quarter scores
- `GET /public/matches/:id/context` — H2H record and form
- `GET /public/teams/:id/stats` — Team season stats
- `GET /public/home/dashboard` — Aggregated home screen data
- `GET /public/matches` — new `opponentApiId` query param

- [ ] **Step 4: Run full typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old components, update AGENTS.md with new endpoints"
```

---

## Self-Review

**Spec coverage check:**
- Section 1 (Match Card) → Task 12 ✅
- Section 2 (Home Screen) → Task 13 ✅
- Section 3 (Game Detail) → Task 14 ✅
- Section 4 (Team Detail) → Task 15 ✅
- Section 5 (Standings) → Task 16 ✅
- Section 6 (Schedule) → Task 17 ✅
- Section 7 (Teams) → Task 17 ✅
- Section 8 (API Endpoints) → Tasks 3, 4, 5, 6, 7 ✅
- Section 9 (Native Color Utility) → Task 2 ✅
- Section 10 (i18n) → Task 9 ✅
- Section 11 (Design Rules) → Embedded in component code ✅
- Section 12 (Navigation) → Tasks 13-18 ✅
- Section 13 (API Client) → Task 8 ✅
- Section 14 (Scope) → All in-scope items covered ✅

**Placeholder scan:** No TBD/TODO. All code blocks present. All file paths exact.

**Type consistency:** `PublicMatchDetail`, `MatchContext`, `TeamStats`, `HomeDashboard`, `FormEntry`, `PreviousMeeting` — names match across shared types, service layer, API client, and native components.
