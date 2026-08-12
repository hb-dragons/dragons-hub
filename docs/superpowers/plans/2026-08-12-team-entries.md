# Per-Season Team Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store a per-season, editable team↔league connection (`team_entries`) and make it the source of truth on every surface, replacing the unscoped standings-derived guess.

**Architecture:** New `team_entries` table (one row per squad per season, single nullable `league_id`). Entries are seeded when a season's tracked leagues are picked, reconciled by the sync from federation evidence, and edited via the existing admin teams endpoints. Club-facing fields (`custom_name`, `badge_color`, `estimated_game_duration`, `display_order`) move from `teams` to entries in two migrations (add + backfill first, column drop last) so every intermediate commit typechecks and passes tests.

**Tech Stack:** Drizzle ORM + hand-written backfill SQL, Hono + `hono-openapi` validators, Zod contracts in `@dragons/contracts`, PGlite integration tests (Vitest v4), Next.js admin UI with SWR.

**Spec:** `docs/superpowers/specs/2026-08-12-team-entries-design.md`

## Global Constraints

- Never add `Co-Authored-By` or any AI-crediting trailer to commits (CLAUDE.md).
- AGENTS.md tables (data model, endpoints, sync Execution Flow) must be updated **in the same commit** as the code they describe — `apps/api/src/test/docs-drift.test.ts` fails the build otherwise.
- Request schemas live only in `packages/contracts` (zod, domain-noun-prefixed, re-exported by name from `index.ts`); routes validate with `validator(target, schema, validationHook)`; never redeclare a schema in a route or the client.
- API integration tests run against real PGlite via `setupTestDb`/`resetTestDb` (`apps/api/src/test/setup-test-db.ts`); never mock `drizzle-orm` or `@dragons/db/schema`. PGlite starts empty each test — seed everything you assert on.
- Coverage thresholds ratchet; never lower one. Run the owning package's `coverage` script before finishing a task.
- `drizzle-kit push` is disabled; `db:generate` + `db:migrate` is the only schema path. Hand-written SQL goes into the generated migration between `--> statement-breakpoint` markers.
- No `any`; `consistent-type-imports` is an error (use `import type`).
- Markdown/prose must pass `pnpm check:ai-slop`.
- Skipped tests must cite an issue (`pnpm check:skipped-tests`).
- New tables use `serial` PKs with unique constraints on external ids; tests live next to source (`foo.ts` → `foo.test.ts`).

---

### Task 1: `team_entries` schema, migration, backfill

**Files:**
- Create: `packages/db/src/schema/team-entries.ts`
- Modify: `packages/db/src/schema/index.ts` (add export line)
- Create (generated, then hand-edited): `packages/db/drizzle/00XX_<generated-name>.sql`
- Modify: `AGENTS.md` (data-model table row)
- Test: `apps/api/src/services/admin/team-entries.migration.test.ts`

**Interfaces:**
- Consumes: existing `teams`, `seasons`, `leagues`, `standings`, `matches` schemas.
- Produces: `teamEntries` table export with columns `id, teamId, seasonId, leagueId, linkSource, customName, badgeColor, estimatedGameDuration, displayOrder, createdAt, updatedAt`; types `TeamEntry`, `NewTeamEntry`. Unique `team_entries_team_season_unique (team_id, season_id)`. Later tasks import `teamEntries` from `@dragons/db/schema`.

- [ ] **Step 1: Write the schema file**

```ts
// packages/db/src/schema/team-entries.ts
import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { teams } from "./teams";
import { seasons } from "./seasons";
import { leagues } from "./leagues";

/**
 * A Team entry: one club team fielded in one season (see CONTEXT.md).
 * Owns the club-facing team data for that season and the connected league.
 * `leagueId` NULL means "not connected". Exactly one league per entry —
 * cardinality is the single column, enforced by design (ADR 0004).
 */
export const teamEntries = pgTable(
  "team_entries",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    leagueId: integer("league_id").references(() => leagues.id),
    // 'seeded' | 'manual' — federation evidence supersedes both; the value
    // exists so the supersession of a manual link can be logged honestly.
    linkSource: varchar("link_source", { length: 10 }).notNull().default("seeded"),
    customName: varchar("custom_name", { length: 50 }),
    badgeColor: varchar("badge_color", { length: 20 }),
    estimatedGameDuration: integer("estimated_game_duration"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    teamSeasonUnique: unique("team_entries_team_season_unique").on(
      table.teamId,
      table.seasonId,
    ),
    seasonOrderIdx: index("team_entries_season_order_idx").on(
      table.seasonId,
      table.displayOrder,
    ),
  }),
);

export type TeamEntry = typeof teamEntries.$inferSelect;
export type NewTeamEntry = typeof teamEntries.$inferInsert;
```

- [ ] **Step 2: Export from the schema index**

In `packages/db/src/schema/index.ts`, after `export * from "./teams";` add:

```ts
export * from "./team-entries";
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: a new `packages/db/drizzle/00XX_*.sql` containing only `CREATE TABLE "team_entries" (...)`, the unique constraint, the index, and three FKs. Do NOT run `db:migrate` yet.

- [ ] **Step 4: Hand-add the backfill SQL to the generated migration**

Append to the generated file (after the generated statements, each separated by `--> statement-breakpoint`). This is the pattern of `0046_busy_hammerhead.sql` / `0032_early_sauron.sql` (generated DDL + hand-written backfill in one file):

```sql
--> statement-breakpoint
-- Backfill (spec 2026-08-12-team-entries-design.md):
-- 1) one entry per own-club squad per season from standings evidence,
--    preferring a committed league over a vorabliga (false < true in ASC order);
-- 2) supplement from match participation for squads a league table does not
--    list yet (early-season leagues: schedule published, table empty);
-- 3) copy club-facing fields onto the ACTIVE season's entries;
-- 4) copy color/duration/order (never custom_name) onto UPCOMING entries.
INSERT INTO "team_entries" ("team_id", "season_id", "league_id", "link_source")
SELECT DISTINCT ON (t.id, l.season_ref_id)
       t.id, l.season_ref_id, l.id, 'seeded'
FROM "teams" t
JOIN "standings" s ON s.team_api_id = t.api_team_permanent_id
JOIN "leagues" l ON l.id = s.league_id
WHERE t.is_own_club = true
ORDER BY t.id, l.season_ref_id, l.vorabliga ASC, l.id ASC;--> statement-breakpoint
INSERT INTO "team_entries" ("team_id", "season_id", "league_id", "link_source")
SELECT DISTINCT ON (t.id, l.season_ref_id)
       t.id, l.season_ref_id, l.id, 'seeded'
FROM "teams" t
JOIN "matches" m
  ON m.home_team_api_id = t.api_team_permanent_id
  OR m.guest_team_api_id = t.api_team_permanent_id
JOIN "leagues" l ON l.id = m.league_id
WHERE t.is_own_club = true
ORDER BY t.id, l.season_ref_id, l.vorabliga ASC, l.id ASC
ON CONFLICT ("team_id", "season_id") DO NOTHING;--> statement-breakpoint
UPDATE "team_entries" te
SET "custom_name" = t.custom_name,
    "badge_color" = t.badge_color,
    "estimated_game_duration" = t.estimated_game_duration,
    "display_order" = t.display_order
FROM "teams" t, "seasons" se
WHERE te.team_id = t.id AND te.season_id = se.id AND se.status = 'active';--> statement-breakpoint
UPDATE "team_entries" te
SET "badge_color" = t.badge_color,
    "estimated_game_duration" = t.estimated_game_duration,
    "display_order" = t.display_order
FROM "teams" t, "seasons" se
WHERE te.team_id = t.id AND te.season_id = se.id AND se.status = 'upcoming';
```

Note: `teams.custom_name` etc. still exist — they are dropped in Task 8, not here.

- [ ] **Step 5: Write the failing backfill test**

The PGlite harness replays migrations against an empty database, so the backfill is a no-op there. Test it the way `season.service.migration.test.ts` does: seed the pre-state, then execute the migration's hand-written statements read from the SQL file itself (no drift between test and migration).

```ts
// apps/api/src/services/admin/team-entries.migration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const DRIZZLE_DIR = path.resolve(import.meta.dirname, "../../../../../packages/db/drizzle");

/** The migration's hand-written statements, straight from the SQL file. */
function backfillStatements(): string[] {
  const file = readdirSync(DRIZZLE_DIR).find((f) => {
    if (!f.endsWith(".sql")) return false;
    const sql = readFileSync(path.join(DRIZZLE_DIR, f), "utf8");
    return sql.includes('INSERT INTO "team_entries"');
  });
  if (!file) throw new Error("team_entries backfill migration not found");
  return readFileSync(path.join(DRIZZLE_DIR, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.startsWith('INSERT INTO "team_entries"') || s.startsWith('UPDATE "team_entries"'));
}

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); });

async function seedSeason(name: string, status: string): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ($1, $2) RETURNING id`, [name, status]);
  return r.rows[0]!.id;
}

async function seedLeague(apiLigaId: number, name: string, seasonId: number, vorabliga = false): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, vorabliga, is_tracked)
     VALUES ($1, $1, $2, 2026, 's', $3, $4, true) RETURNING id`,
    [apiLigaId, name, seasonId, vorabliga]);
  return r.rows[0]!.id;
}

async function seedTeam(permanentId: number, name: string, own = true, extras = ""): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club${extras ? ", " + extras.split("=")[0] : ""})
     VALUES ($1, 1, 1, $2, 100, $3${extras ? ", " + extras.split("=")[1] : ""}) RETURNING id`,
    [permanentId, name, own]);
  return r.rows[0]!.id;
}

describe("team_entries backfill", () => {
  it("creates one entry per own-club squad per season from standings, preferring committed leagues", async () => {
    const archived = await seedSeason("2025/26", "archived");
    const active = await seedSeason("2026/27", "active");
    const u14old = await seedLeague(1, "U14 Kreisliga", archived);
    const u16vorab = await seedLeague(2, "U16 Vorab", active, true);
    const u16real = await seedLeague(3, "U16 Bezirksliga", active, false);
    const squad = await seedTeam(1000, "Dragons U16");
    for (const leagueId of [u14old, u16vorab, u16real]) {
      await ctx.client.query(
        `INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 1000, 1)`, [leagueId]);
    }

    for (const sql of backfillStatements()) await ctx.client.exec(sql);

    const rows = await ctx.client.query<{ season_id: number; league_id: number }>(
      `SELECT season_id, league_id FROM team_entries WHERE team_id = $1 ORDER BY season_id`, [squad]);
    expect(rows.rows).toEqual([
      { season_id: archived, league_id: u14old },
      { season_id: active, league_id: u16real }, // committed beats vorabliga
    ]);
  });

  it("falls back to match participation when the league table is empty, and copies club fields per season status", async () => {
    const active = await seedSeason("2026/27", "active");
    const upcoming = await seedSeason("2027/28", "upcoming");
    const u10 = await seedLeague(4, "U10 Kreisliga", upcoming);
    const squadId = await seedTeam(2000, "Dragons U10");
    // No standings row — only a fixture names the squad.
    await ctx.client.query(
      `INSERT INTO matches (api_match_id, league_id, home_team_api_id, guest_team_api_id)
       VALUES (9, $1, 2000, 3000)`, [u10]);
    // Give the squad row club-facing fields to copy.
    await ctx.client.query(
      `UPDATE teams SET custom_name = 'U10', badge_color = 'green', estimated_game_duration = 60, display_order = 3
       WHERE id = $1`, [squadId]);
    // An active-season entry for the same squad, via standings in an active league.
    const activeLeague = await seedLeague(5, "U10 Mini", active);
    await ctx.client.query(
      `INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 2000, 1)`, [activeLeague]);

    for (const sql of backfillStatements()) await ctx.client.exec(sql);

    const rows = await ctx.client.query<{
      season_id: number; league_id: number; custom_name: string | null;
      badge_color: string | null; display_order: number;
    }>(
      `SELECT season_id, league_id, custom_name, badge_color, display_order
       FROM team_entries WHERE team_id = $1 ORDER BY season_id`, [squadId]);
    expect(rows.rows).toEqual([
      { season_id: active, league_id: activeLeague, custom_name: "U10", badge_color: "green", display_order: 3 },
      // Upcoming: color/duration/order carried, custom name deliberately NOT.
      { season_id: upcoming, league_id: u10, custom_name: null, badge_color: "green", display_order: 3 },
    ]);
  });

  it("creates no entries for non-own-club teams", async () => {
    const active = await seedSeason("2026/27", "active");
    const league = await seedLeague(6, "U12", active);
    await seedTeam(4000, "Rival U12", false);
    await ctx.client.query(
      `INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 4000, 1)`, [league]);

    for (const sql of backfillStatements()) await ctx.client.exec(sql);

    const rows = await ctx.client.query(`SELECT id FROM team_entries`);
    expect(rows.rows).toHaveLength(0);
  });
});
```

Adjust the `seedTeam` helper if the inline `extras` juggling reads poorly — a second plain UPDATE (as the second test does) is fine. Column NOT NULL defaults: `standings` requires `position` only (others default 0); `matches` requires `api_match_id` — check the real constraint list with `\d` via a throwaway query if an insert fails, and extend the seed INSERT rather than weakening the assertion.

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api test -- team-entries.migration`
Expected: FAIL — `team_entries` does not exist until the migration replays; the PGlite template cache key includes the migration hash, so the new file forces a rebuild. If it fails with "backfill migration not found" instead, Step 4 was not saved.

- [ ] **Step 7: Apply the migration locally and re-run**

Run: `pnpm --filter @dragons/db db:migrate` (local dev database), then `pnpm --filter @dragons/api test -- team-entries.migration`
Expected: PASS (all three tests).

- [ ] **Step 8: Add the AGENTS.md data-model row (docs-drift)**

In the AGENTS.md data-model table, directly under the `teams` row, add:

```md
| `teamEntries` | `packages/db/src/schema/team-entries.ts` | teamId FK + seasonId FK (unique pair), leagueId FK (nullable = not connected), linkSource (`seeded`\|`manual`), customName, badgeColor, estimatedGameDuration, displayOrder — the per-season Team entry; source of truth for team↔league (ADR 0004) |
```

Run: `pnpm --filter @dragons/api test -- docs-drift`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/team-entries.ts packages/db/src/schema/index.ts packages/db/drizzle AGENTS.md apps/api/src/services/admin/team-entries.migration.test.ts
git commit -m "feat(db): team_entries table with all-season backfill from standings and match evidence"
```

---

### Task 2: entry-based reads — `getOwnClubTeams(seasonId?)` + shared type

**Files:**
- Modify: `packages/shared/src/teams.ts`
- Modify: `apps/api/src/services/admin/team-admin.service.ts` (replace `getOwnClubTeams`)
- Modify: `apps/api/src/routes/admin/team.routes.ts` (query param)
- Create: `packages/contracts/src/team.ts` addition (`teamsListQuerySchema`), re-export in `packages/contracts/src/index.ts`
- Modify: `AGENTS.md` (`GET /admin/teams` row description)
- Test: `apps/api/src/services/admin/team-admin.service.test.ts` (extend)

**Interfaces:**
- Consumes: `teamEntries` from Task 1; `getActiveSeasonId()` from `./season.service`.
- Produces: `OwnClubTeam` reshaped as below (`id` becomes the **entry** id); `getOwnClubTeams(seasonId?: number): Promise<OwnClubTeam[]>`; `teamsListQuerySchema = z.object({ seasonId: z.coerce.number().int().positive().optional() })`. Tasks 5 and 9 rely on these exact names.

- [ ] **Step 1: Reshape the shared type**

```ts
// packages/shared/src/teams.ts — replace OwnClubTeam; keep TeamReorderItem as is for now
export interface OwnClubTeam {
  /** Team entry id (per season) — the id PATCH /admin/teams/:id addresses. */
  id: number;
  /** Squad id (teams.id), stable across seasons. */
  teamId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueId: number | null;
  leagueName: string | null;
  /** False when the connected league is no longer tracked — UI shows a warning. */
  leagueTracked: boolean;
  linkSource: "seeded" | "manual";
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}
```

`teams-table.tsx` keeps compiling: every field it reads (`id`, `name`, `customName`, `leagueName`, `estimatedGameDuration`, `badgeColor`) still exists.

- [ ] **Step 2: Add the list query contract**

In `packages/contracts/src/team.ts` add (mirrors `standingsListQuerySchema`):

```ts
export const teamsListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
});

export type TeamsListQuery = z.infer<typeof teamsListQuerySchema>;
```

Add `teamsListQuerySchema` and `type TeamsListQuery` to the team export block in `packages/contracts/src/index.ts`.

- [ ] **Step 3: Write the failing service test**

Append to `apps/api/src/services/admin/team-admin.service.test.ts` (it already has the PGlite harness with the `dbHolder` proxy mock of `../../config/database` — follow the file's existing `beforeAll`/`beforeEach` setup):

```ts
describe("getOwnClubTeams (entry-based)", () => {
  it("lists the requested season's entries with league name and tracked flag", async () => {
    const active = await seedSeason("2026/27", "active");   // reuse/create helpers as in Task 1's test
    const league = await seedLeague(10, "U16 Bezirksliga", active);
    const untracked = await seedLeague(11, "U16 Vorab", active, true);
    await ctx.client.query(`UPDATE leagues SET is_tracked = false WHERE id = $1`, [untracked]);
    const squadA = await seedTeam(1000, "Dragons U16");
    const squadB = await seedTeam(2000, "Dragons U12");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source, custom_name, display_order)
       VALUES ($1, $2, $3, 'seeded', 'U16', 1), ($4, $2, $5, 'manual', NULL, 0)`,
      [squadA, active, league, squadB, untracked]);

    const rows = await getOwnClubTeams(active);

    expect(rows.map((r) => ({ name: r.name, leagueName: r.leagueName, leagueTracked: r.leagueTracked, linkSource: r.linkSource }))).toEqual([
      { name: "Dragons U12", leagueName: "U16 Vorab", leagueTracked: false, linkSource: "manual" },
      { name: "Dragons U16", leagueName: "U16 Bezirksliga", leagueTracked: true, linkSource: "seeded" },
    ]);
  });

  it("defaults to the active season and returns [] when none is active", async () => {
    expect(await getOwnClubTeams()).toEqual([]);
  });

  it("regression #original-bug: cross-season standings cannot leak — an archived U14 league never shows on the active season's entry", async () => {
    const archived = await seedSeason("2025/26", "archived");
    const active = await seedSeason("2026/27", "active");
    const u14 = await seedLeague(20, "U14 Kreisliga", archived);
    const u16 = await seedLeague(21, "U16 Bezirksliga", active);
    const squad = await seedTeam(3000, "Dragons U16");
    // Standings history in BOTH leagues (the original bug's trigger)…
    await ctx.client.query(`INSERT INTO standings (league_id, team_api_id, position) VALUES ($1, 3000, 1), ($2, 3000, 1)`, [u14, u16]);
    // …but the entry pins the league.
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3)`, [squad, active, u16]);

    const rows = await getOwnClubTeams(active);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.leagueName).toBe("U16 Bezirksliga");
  });
});
```

Run: `pnpm --filter @dragons/api test -- team-admin.service`
Expected: FAIL (`leagueTracked`/entry columns unknown — old implementation still joins standings).

- [ ] **Step 4: Replace the implementation**

```ts
// apps/api/src/services/admin/team-admin.service.ts — new imports + getOwnClubTeams
import { teams, teamEntries, leagues } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { getActiveSeasonId } from "./season.service";

export async function getOwnClubTeams(seasonId?: number): Promise<OwnClubTeam[]> {
  const scopeId = seasonId !== undefined ? seasonId : await getActiveSeasonId();
  // No season to scope to means no entries; answering with an unscoped read is
  // exactly the bug this table replaced.
  if (scopeId === null) return [];

  const rows = await getDb()
    .select({
      id: teamEntries.id,
      teamId: teams.id,
      name: teams.name,
      nameShort: teams.nameShort,
      customName: teamEntries.customName,
      leagueId: teamEntries.leagueId,
      leagueName: leagues.name,
      leagueTracked: leagues.isTracked,
      linkSource: teamEntries.linkSource,
      estimatedGameDuration: teamEntries.estimatedGameDuration,
      badgeColor: teamEntries.badgeColor,
      displayOrder: teamEntries.displayOrder,
    })
    .from(teamEntries)
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .leftJoin(leagues, eq(teamEntries.leagueId, leagues.id))
    .where(and(eq(teamEntries.seasonId, scopeId), eq(teams.isOwnClub, true)));

  return rows
    .map((r) => ({
      ...r,
      linkSource: (r.linkSource === "manual" ? "manual" : "seeded") as "seeded" | "manual",
      leagueTracked: r.leagueId === null ? true : (r.leagueTracked ?? false),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}
```

(`leagueTracked: true` for unconnected entries — "no league" must not render the stale-league warning.)

- [ ] **Step 5: Wire the query param into the route**

In `apps/api/src/routes/admin/team.routes.ts` GET handler, mirror the standings route:

```ts
import { teamsListQuerySchema } from "@dragons/contracts";
// …
teamRoutes.get(
  "/teams",
  requirePermission("team", "view"),
  validator("query", teamsListQuerySchema, validationHook),
  describeRoute({
    description: "List own club team entries (defaults to the active season)",
    tags: ["Teams"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const teams = await getOwnClubTeams(c.req.valid("query").seasonId);
    return c.json(teams);
  },
);
```

- [ ] **Step 6: Update the old tests + AGENTS.md row, run the suite**

The existing `getOwnClubTeams` tests in `team-admin.service.test.ts` seed standings to produce league names — rewrite them to seed `team_entries` instead (delete the "no duplicate rows from multiple standings" test; the regression test from Step 3 replaces it). Change the AGENTS.md endpoint row to:

```md
| GET | `/admin/teams` | List own club team entries for a season (`?seasonId=`, defaults to active) |
```

Run: `pnpm --filter @dragons/api test -- team-admin && pnpm --filter @dragons/api test -- docs-drift && pnpm --filter @dragons/contracts test`
Expected: PASS.

- [ ] **Step 7: Typecheck the workspace and commit**

Run: `pnpm typecheck`
Expected: PASS (web still compiles — the type only gained fields).

```bash
git add packages/shared/src/teams.ts packages/contracts/src apps/api/src/services/admin/team-admin.service.ts apps/api/src/services/admin/team-admin.service.test.ts apps/api/src/routes/admin/team.routes.ts AGENTS.md
git commit -m "feat(api): season-scoped entry-based own-club team list"
```

---

### Task 3: shared roster-fetcher (extract from `getLeagueTeams`)

**Files:**
- Create: `apps/api/src/services/admin/league-roster.ts`
- Modify: `apps/api/src/services/admin/league-discovery.service.ts` (`getLeagueTeams` uses it)
- Test: `apps/api/src/services/admin/league-roster.test.ts`

**Interfaces:**
- Consumes: `sdkClient.getTabelle(ligaId)`, `sdkClient.getSpielplan(ligaId)`.
- Produces: `fetchLeagueRoster(ligaId: number): Promise<SdkTeamRef[]>` — deduped by `teamPermanentId`, table first, schedule fallback. Task 4 consumes it.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/admin/league-roster.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sync/sdk-client", () => ({
  sdkClient: { getTabelle: vi.fn(), getSpielplan: vi.fn() },
}));

import { sdkClient } from "../sync/sdk-client";
import { fetchLeagueRoster } from "./league-roster";

const ref = (teamPermanentId: number, teamname = `T${teamPermanentId}`) => ({
  teamPermanentId, teamname, teamnameSmall: teamname, seasonTeamId: 1,
  teamCompetitionId: 1, clubId: 100, verzicht: false,
});

beforeEach(() => vi.clearAllMocks());

describe("fetchLeagueRoster", () => {
  it("reads the table when it has entries", async () => {
    vi.mocked(sdkClient.getTabelle).mockResolvedValue([{ team: ref(1) }, { team: ref(2) }] as never);
    const roster = await fetchLeagueRoster(42);
    expect(roster.map((r) => r.teamPermanentId)).toEqual([1, 2]);
    expect(sdkClient.getSpielplan).not.toHaveBeenCalled();
  });

  it("falls back to the schedule when the table is empty, deduping both slots", async () => {
    vi.mocked(sdkClient.getTabelle).mockResolvedValue([] as never);
    vi.mocked(sdkClient.getSpielplan).mockResolvedValue([
      { homeTeam: ref(1), guestTeam: ref(2) },
      { homeTeam: ref(2), guestTeam: null },
    ] as never);
    const roster = await fetchLeagueRoster(42);
    expect(roster.map((r) => r.teamPermanentId)).toEqual([1, 2]);
  });
});
```

Run: `pnpm --filter @dragons/api test -- league-roster`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement**

```ts
// apps/api/src/services/admin/league-roster.ts
import { sdkClient } from "../sync/sdk-client";
import type { SdkTeamRef } from "@dragons/sdk";

/**
 * The teams a federation league lists: the table names the roster even for a
 * vorabliga; an early-season league may publish only its schedule, so fall
 * back to the fixtures' team slots. Deduped by teamPermanentId.
 */
export async function fetchLeagueRoster(ligaId: number): Promise<SdkTeamRef[]> {
  const refs: SdkTeamRef[] = [];
  const table = await sdkClient.getTabelle(ligaId);
  if (table.length > 0) {
    for (const entry of table) refs.push(entry.team);
  } else {
    const matches = await sdkClient.getSpielplan(ligaId);
    for (const m of matches) {
      if (m.homeTeam) refs.push(m.homeTeam);
      if (m.guestTeam) refs.push(m.guestTeam);
    }
  }
  const byId = new Map<number, SdkTeamRef>();
  for (const ref of refs) {
    if (ref.teamPermanentId && !byId.has(ref.teamPermanentId)) byId.set(ref.teamPermanentId, ref);
  }
  return [...byId.values()];
}
```

- [ ] **Step 3: Refactor `getLeagueTeams` onto it**

In `league-discovery.service.ts`, replace the body of `getLeagueTeams` (the `refs` collection block, lines ~184-194) with:

```ts
import { fetchLeagueRoster } from "./league-roster";
// …
export async function getLeagueTeams(ligaId: number): Promise<LeagueTeamsResponse> {
  const ownClubId = (await getClubConfig())?.clubId ?? null;
  const refs = await fetchLeagueRoster(ligaId);
  const teams = refs.map((ref) => {
    const clubId = ref.clubId ?? null;
    return {
      teamPermanentId: ref.teamPermanentId,
      name: ref.teamname,
      clubId,
      isOwnClub: clubId !== null && ownClubId !== null && clubId === ownClubId,
    };
  });
  return { teams };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm --filter @dragons/api test -- league-roster league-discovery`
Expected: PASS (existing `league-discovery.service.test.ts` untouched behavior).

```bash
git add apps/api/src/services/admin/league-roster.ts apps/api/src/services/admin/league-roster.test.ts apps/api/src/services/admin/league-discovery.service.ts
git commit -m "refactor(api): extract shared league roster fetcher"
```

---

### Task 4: seeding at league-picking time

**Files:**
- Create: `apps/api/src/services/admin/team-entry-seeding.service.ts`
- Modify: `apps/api/src/services/admin/league-discovery.service.ts` (`setSeasonLeagues` calls seeding after its transaction)
- Modify: `packages/shared/src/leagues.ts` (`SetSeasonLeaguesResult` gains seeding counts)
- Test: `apps/api/src/services/admin/team-entry-seeding.service.test.ts`

**Interfaces:**
- Consumes: `fetchLeagueRoster` (Task 3), `getClubConfig`, `teamEntries` (Task 1).
- Produces: `seedSeasonTeamEntries(seasonId: number, apiLigaIds: number[]): Promise<{ entriesSeeded: number; rosterFailures: number[] }>`. `SetSeasonLeaguesResult` becomes `{ tracked: number; untracked: number; entriesSeeded: number; rosterFailures: number[] }`. Task 6 reuses `upsertEntryFromEvidence` exported from the seeding service.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/services/admin/team-entry-seeding.service.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
vi.mock("./league-roster", () => ({ fetchLeagueRoster: vi.fn() }));

import { fetchLeagueRoster } from "./league-roster";
import { seedSeasonTeamEntries } from "./team-entry-seeding.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });

const ref = (teamPermanentId: number, teamname: string, clubId: number) => ({
  teamPermanentId, teamname, teamnameSmall: teamname, seasonTeamId: 7,
  teamCompetitionId: 8, clubId, verzicht: false,
});

// seedSeason/seedLeague/seedTeam helpers exactly as in Task 1's test file.
// Additionally seed the club id the service reads:
async function seedClubConfig(clubId: number) {
  await ctx.client.query(
    `INSERT INTO app_settings (key, value) VALUES ('club_id', $1)`, [String(clubId)]);
}

describe("seedSeasonTeamEntries", () => {
  it("creates squad rows and entries for own-club teams found in the roster", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const league = await seedLeague(30, "U10 Kreisliga", season);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9000, "Dragons U10", 100), ref(9001, "Rivals", 200)]);

    const result = await seedSeasonTeamEntries(season, [30]);

    expect(result).toEqual({ entriesSeeded: 1, rosterFailures: [] });
    const entries = await ctx.client.query<{ league_id: number; link_source: string }>(
      `SELECT te.league_id, te.link_source FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 9000`);
    expect(entries.rows).toEqual([{ league_id: league, link_source: "seeded" }]);
    // The brand-new squad row exists and is own-club:
    const squad = await ctx.client.query<{ is_own_club: boolean }>(
      `SELECT is_own_club FROM teams WHERE api_team_permanent_id = 9000`);
    expect(squad.rows[0]!.is_own_club).toBe(true);
  });

  it("carries forward color/duration/order from the squad's latest previous entry, not the name", async () => {
    await seedClubConfig(100);
    const old = await seedSeason("2025/26", "active");
    const next = await seedSeason("2026/27", "upcoming");
    const oldLeague = await seedLeague(31, "U14", old);
    const newLeague = await seedLeague(32, "U16", next);
    const squad = await seedTeam(9100, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, custom_name, badge_color, estimated_game_duration, display_order)
       VALUES ($1, $2, $3, 'U14', 'red', 80, 4)`, [squad, old, oldLeague]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9100, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [32]);

    const entry = await ctx.client.query<{ custom_name: string | null; badge_color: string | null; estimated_game_duration: number | null; display_order: number; league_id: number }>(
      `SELECT custom_name, badge_color, estimated_game_duration, display_order, league_id
       FROM team_entries WHERE team_id = $1 AND season_id = $2`, [squad, next]);
    expect(entry.rows[0]).toEqual({
      custom_name: null, badge_color: "red", estimated_game_duration: 80, display_order: 4, league_id: newLeague,
    });
  });

  it("does not clobber an existing entry's fields, only refreshes the seeded link", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const a = await seedLeague(33, "U16 Vorab", season, true);
    const b = await seedLeague(34, "U16 Bezirksliga", season);
    const squad = await seedTeam(9200, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, custom_name, link_source)
       VALUES ($1, $2, $3, 'Sechzehn', 'seeded')`, [squad, season, a]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9200, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(season, [34]);

    const entry = await ctx.client.query<{ league_id: number; custom_name: string }>(
      `SELECT league_id, custom_name FROM team_entries WHERE team_id = $1 AND season_id = $2`, [squad, season]);
    expect(entry.rows[0]).toEqual({ league_id: b, custom_name: "Sechzehn" });
  });

  it("reports roster failures per league and keeps going", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    await seedLeague(35, "U12 A", season);
    const okLeague = await seedLeague(36, "U12 B", season);
    vi.mocked(fetchLeagueRoster)
      .mockRejectedValueOnce(new Error("federation down"))
      .mockResolvedValueOnce([ref(9300, "Dragons U12", 100)]);

    const result = await seedSeasonTeamEntries(season, [35, 36]);

    expect(result.rosterFailures).toEqual([35]);
    expect(result.entriesSeeded).toBe(1);
    const entries = await ctx.client.query(`SELECT id FROM team_entries WHERE league_id = $1`, [okLeague]);
    expect(entries.rows).toHaveLength(1);
  });
});
```

Run: `pnpm --filter @dragons/api test -- team-entry-seeding`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the seeding service**

```ts
// apps/api/src/services/admin/team-entry-seeding.service.ts
import { getDb } from "../../config/database";
import { teams, teamEntries, leagues } from "@dragons/db/schema";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { seasons } from "@dragons/db/schema";
import { fetchLeagueRoster } from "./league-roster";
import { getClubConfig } from "./settings.service";
import type { SdkTeamRef } from "@dragons/sdk";
import { logger } from "../../config/logger";

const log = logger.child({ service: "team-entry-seeding" });

export interface SeedResult {
  entriesSeeded: number;
  rosterFailures: number[];
}

/** Squad upsert for a roster ref — the same shape teams.sync writes, minus hash bookkeeping. */
async function upsertSquad(ref: SdkTeamRef, isOwn: boolean): Promise<number> {
  const [row] = await getDb()
    .insert(teams)
    .values({
      apiTeamPermanentId: ref.teamPermanentId,
      seasonTeamId: ref.seasonTeamId,
      teamCompetitionId: ref.teamCompetitionId,
      name: ref.teamname,
      nameShort: ref.teamnameSmall || null,
      clubId: ref.clubId,
      isOwnClub: isOwn,
      verzicht: ref.verzicht,
    })
    .onConflictDoUpdate({
      target: teams.apiTeamPermanentId,
      set: { isOwnClub: isOwn, updatedAt: new Date() },
    })
    .returning({ id: teams.id });
  if (!row) throw new Error(`Squad upsert returned no row for ${ref.teamPermanentId}`);
  return row.id;
}

/**
 * Point a squad's entry for a season at a league, creating the entry (with
 * carry-forward) if it does not exist. Used by seeding and by the sync
 * (Task 6). Returns what happened so callers can log supersessions.
 */
export async function upsertEntryFromEvidence(
  teamId: number,
  seasonId: number,
  leagueId: number,
): Promise<{ action: "created" | "moved" | "unchanged"; previousSource: "seeded" | "manual" | null }> {
  const db = getDb();
  const [existing] = await db
    .select({ id: teamEntries.id, leagueId: teamEntries.leagueId, linkSource: teamEntries.linkSource })
    .from(teamEntries)
    .where(and(eq(teamEntries.teamId, teamId), eq(teamEntries.seasonId, seasonId)));

  if (!existing) {
    // Carry-forward from the squad's latest previous entry (color, duration,
    // order — deliberately never the custom name; see ADR 0004).
    const [previous] = await db
      .select({
        badgeColor: teamEntries.badgeColor,
        estimatedGameDuration: teamEntries.estimatedGameDuration,
        displayOrder: teamEntries.displayOrder,
      })
      .from(teamEntries)
      .innerJoin(seasons, eq(teamEntries.seasonId, seasons.id))
      .where(eq(teamEntries.teamId, teamId))
      .orderBy(desc(seasons.createdAt))
      .limit(1);

    const displayOrder =
      previous?.displayOrder ??
      ((await db
        .select({ max: sql<number | null>`MAX(${teamEntries.displayOrder})` })
        .from(teamEntries)
        .where(eq(teamEntries.seasonId, seasonId)))[0]?.max ?? -1) + 1;

    await db.insert(teamEntries).values({
      teamId,
      seasonId,
      leagueId,
      linkSource: "seeded",
      badgeColor: previous?.badgeColor ?? null,
      estimatedGameDuration: previous?.estimatedGameDuration ?? null,
      displayOrder,
    });
    return { action: "created", previousSource: null };
  }

  if (existing.leagueId === leagueId) return { action: "unchanged", previousSource: null };

  await db
    .update(teamEntries)
    .set({ leagueId, linkSource: "seeded", updatedAt: new Date() })
    .where(eq(teamEntries.id, existing.id));
  return {
    action: "moved",
    previousSource: existing.linkSource === "manual" ? "manual" : "seeded",
  };
}

export async function seedSeasonTeamEntries(
  seasonId: number,
  apiLigaIds: number[],
): Promise<SeedResult> {
  const result: SeedResult = { entriesSeeded: 0, rosterFailures: [] };
  const ownClubId = (await getClubConfig())?.clubId ?? null;
  if (ownClubId === null || apiLigaIds.length === 0) return result;

  const leagueRows = apiLigaIds.length
    ? await getDb()
        .select({ id: leagues.id, apiLigaId: leagues.apiLigaId })
        .from(leagues)
        .where(and(eq(leagues.seasonRefId, seasonId), inArray(leagues.apiLigaId, apiLigaIds)))
    : [];
  const dbIdByLigaId = new Map(leagueRows.map((l) => [l.apiLigaId, l.id]));

  for (const ligaId of apiLigaIds) {
    const leagueDbId = dbIdByLigaId.get(ligaId);
    if (leagueDbId === undefined) continue;
    let roster: SdkTeamRef[];
    try {
      roster = await fetchLeagueRoster(ligaId);
    } catch (error) {
      log.warn({ ligaId, err: error }, "Roster fetch failed during seeding; sync will repair");
      result.rosterFailures.push(ligaId);
      continue;
    }
    for (const ref of roster) {
      if (ref.clubId !== ownClubId) continue;
      const teamId = await upsertSquad(ref, true);
      const outcome = await upsertEntryFromEvidence(teamId, seasonId, leagueDbId);
      if (outcome.action !== "unchanged") result.entriesSeeded++;
    }
  }
  return result;
}
```

- [ ] **Step 3: Run the seeding tests**

Run: `pnpm --filter @dragons/api test -- team-entry-seeding`
Expected: PASS.

- [ ] **Step 4: Wire into `setSeasonLeagues` and extend the result type**

In `packages/shared/src/leagues.ts` find `SetSeasonLeaguesResult` and extend it:

```ts
export interface SetSeasonLeaguesResult {
  tracked: number;
  untracked: number;
  entriesSeeded: number;
  rosterFailures: number[];
}
```

In `league-discovery.service.ts`, after the tracking transaction in `setSeasonLeagues` (after `const untrackedCount = await getDb().transaction(...)`) add:

```ts
import { seedSeasonTeamEntries } from "./team-entry-seeding.service";
// …
const seeding = await seedSeasonTeamEntries(seasonId, keepIds);
return {
  tracked: selected.length,
  untracked: untrackedCount,
  entriesSeeded: seeding.entriesSeeded,
  rosterFailures: seeding.rosterFailures,
};
```

Fix the existing `setSeasonLeagues` tests in `league-discovery.service.test.ts`: they now need `fetchLeagueRoster` mocked (`vi.mock("./league-roster", …)` returning `[]`) and the two new fields asserted (`entriesSeeded: 0, rosterFailures: []`).

- [ ] **Step 5: Run, typecheck, commit**

Run: `pnpm --filter @dragons/api test -- league-discovery team-entry-seeding && pnpm typecheck`
Expected: PASS. (`SetSeasonLeaguesResult` gaining required fields only affects the API producer; the web wizard reads `tracked`/`untracked` and keeps compiling.)

```bash
git add apps/api/src/services/admin/team-entry-seeding.service.ts apps/api/src/services/admin/team-entry-seeding.service.test.ts apps/api/src/services/admin/league-discovery.service.ts apps/api/src/services/admin/league-discovery.service.test.ts packages/shared/src/leagues.ts
git commit -m "feat(api): seed team entries when a season's tracked leagues are picked"
```

---

### Task 5: entry-based writes — PATCH league link + season-scoped reorder (contracts + client + web call sites, atomic)

**Files:**
- Modify: `packages/contracts/src/team.ts` (+ index re-exports)
- Modify: `apps/api/src/services/admin/team-admin.service.ts` (`updateTeamEntry`, `reorderTeamEntries`)
- Modify: `apps/api/src/routes/admin/team.routes.ts`
- Modify: `packages/shared/src/teams.ts` (`TeamReorderItem` stays; nothing new)
- Modify: `packages/api-client/src/endpoints/team.ts` + `team.contract.test.ts`
- Modify: `apps/web/src/app/[locale]/admin/teams/teams-table.tsx` (only the two call sites; UI columns change in Task 9)
- Modify: `AGENTS.md` (PATCH + PUT endpoint rows)
- Test: `apps/api/src/services/admin/team-admin.service.test.ts` (extend)

**Interfaces:**
- Consumes: `teamEntries`, `OwnClubTeam` (Task 2).
- Produces:
  - `teamUpdateBodySchema` gains `leagueId: z.number().int().positive().nullable().optional()`.
  - `teamReorderBodySchema` becomes `z.strictObject({ seasonId: z.coerce.number().int().positive().optional(), entryIds: z.array(z.number().int().positive()).min(1) })`.
  - `updateTeamEntry(entryId: number, data: { customName?: string | null; estimatedGameDuration?: number | null; badgeColor?: string | null; leagueId?: number | null }): Promise<OwnClubTeam | null>` — throws `TeamLeagueMismatchError` (new, in `team-admin.errors.ts`) when `leagueId` names a league outside the entry's season; mapped to 400 like `TeamReorderError`.
  - `reorderTeamEntries(entryIds: number[], seasonId?: number): Promise<TeamReorderItem[]>`.
  - Client: `update(entryId, body)` unchanged signature; `reorder({ seasonId?, entryIds })`.

- [ ] **Step 1: Write the failing service tests**

Append to `team-admin.service.test.ts`:

```ts
describe("updateTeamEntry", () => {
  it("sets the league link manually and reports the season's league name", async () => {
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(40, "U10 Kreisliga", season);
    const squad = await seedTeam(5000, "Dragons U10");
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [squad, season]);

    const updated = await updateTeamEntry(entry.rows[0]!.id, { leagueId: league });

    expect(updated?.leagueName).toBe("U10 Kreisliga");
    expect(updated?.linkSource).toBe("manual");
  });

  it("clears the link with leagueId null", async () => {
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(41, "U10", season);
    const squad = await seedTeam(5001, "Dragons U10");
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3) RETURNING id`,
      [squad, season, league]);

    const updated = await updateTeamEntry(entry.rows[0]!.id, { leagueId: null });
    expect(updated?.leagueId).toBeNull();
    expect(updated?.leagueName).toBeNull();
  });

  it("rejects a league from another season", async () => {
    const season = await seedSeason("2026/27", "active");
    const other = await seedSeason("2025/26", "archived");
    const foreign = await seedLeague(42, "Old U10", other);
    const squad = await seedTeam(5002, "Dragons U10");
    const entry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [squad, season]);

    await expect(updateTeamEntry(entry.rows[0]!.id, { leagueId: foreign }))
      .rejects.toThrow(TeamLeagueMismatchError);
  });
});

describe("reorderTeamEntries", () => {
  it("reorders exactly the season's entries", async () => {
    const season = await seedSeason("2026/27", "active");
    const a = await seedTeam(5100, "A");
    const b = await seedTeam(5101, "B");
    const rows = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, display_order)
       VALUES ($1, $3, 0), ($2, $3, 1) RETURNING id`, [a, b, season]);
    const [ea, eb] = rows.rows.map((r) => r.id);

    const result = await reorderTeamEntries([eb!, ea!], season);
    expect(result.map((r) => r.id)).toEqual([eb, ea]);
  });

  it("rejects a set that does not exactly match the season's entries", async () => {
    const season = await seedSeason("2026/27", "active");
    const a = await seedTeam(5102, "A");
    const rows = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`, [a, season]);
    await expect(reorderTeamEntries([rows.rows[0]!.id, 99999], season))
      .rejects.toThrow(TeamReorderError);
  });
});
```

Run: `pnpm --filter @dragons/api test -- team-admin.service`
Expected: FAIL — functions not exported.

- [ ] **Step 2: Implement service + error**

Add to `team-admin.errors.ts`:

```ts
export class TeamLeagueMismatchError extends Error {
  constructor(entryId: number, leagueId: number) {
    super(`League ${leagueId} does not belong to the season of entry ${entryId}`);
    this.name = "TeamLeagueMismatchError";
  }
}
```

Register it in `apps/api/src/middleware/error.ts` next to `TeamReorderError`'s 400 mapping (same pattern, code `"LEAGUE_SEASON_MISMATCH"`).

In `team-admin.service.ts`, replace `updateTeam` with `updateTeamEntry` and `reorderOwnClubTeams` with `reorderTeamEntries`:

```ts
export async function updateTeamEntry(
  entryId: number,
  data: {
    customName?: string | null;
    estimatedGameDuration?: number | null;
    badgeColor?: string | null;
    leagueId?: number | null;
  },
): Promise<OwnClubTeam | null> {
  const db = getDb();
  const [entry] = await db
    .select({ id: teamEntries.id, seasonId: teamEntries.seasonId })
    .from(teamEntries)
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .where(and(eq(teamEntries.id, entryId), eq(teams.isOwnClub, true)));
  if (!entry) return null;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.customName !== undefined) set.customName = data.customName;
  if (data.estimatedGameDuration !== undefined) set.estimatedGameDuration = data.estimatedGameDuration;
  if (data.badgeColor !== undefined) set.badgeColor = data.badgeColor;
  if (data.leagueId !== undefined) {
    if (data.leagueId !== null) {
      const [league] = await db
        .select({ id: leagues.id })
        .from(leagues)
        .where(and(eq(leagues.id, data.leagueId), eq(leagues.seasonRefId, entry.seasonId)));
      if (!league) throw new TeamLeagueMismatchError(entryId, data.leagueId);
    }
    set.leagueId = data.leagueId;
    set.linkSource = "manual";
  }

  await db.update(teamEntries).set(set).where(eq(teamEntries.id, entryId));
  const [row] = await getOwnClubTeamsById(entryId, entry.seasonId);
  return row ?? null;
}

/** One entry, in the exact OwnClubTeam shape the list uses. */
async function getOwnClubTeamsById(entryId: number, seasonId: number): Promise<OwnClubTeam[]> {
  const all = await getOwnClubTeams(seasonId);
  return all.filter((t) => t.id === entryId);
}

export async function reorderTeamEntries(
  entryIds: number[],
  seasonId?: number,
): Promise<TeamReorderItem[]> {
  const unique = new Set(entryIds);
  if (unique.size !== entryIds.length) throw TeamReorderError.duplicateTeamId();

  const scopeId = seasonId !== undefined ? seasonId : await getActiveSeasonId();
  if (scopeId === null) throw TeamReorderError.invalidTeamSet();

  return await getDb().transaction(async (tx) => {
    const own = await tx
      .select({ id: teamEntries.id })
      .from(teamEntries)
      .innerJoin(teams, eq(teamEntries.teamId, teams.id))
      .where(and(eq(teamEntries.seasonId, scopeId), eq(teams.isOwnClub, true)));
    const ownIds = new Set(own.map((t) => t.id));
    if (ownIds.size !== entryIds.length || entryIds.some((id) => !ownIds.has(id))) {
      throw TeamReorderError.invalidTeamSet();
    }

    const cases = entryIds
      .map((id, idx) => sql`WHEN ${id} THEN ${idx}::integer`)
      .reduce((acc, frag) => sql`${acc} ${frag}`);
    await tx
      .update(teamEntries)
      .set({ displayOrder: sql`CASE ${teamEntries.id} ${cases} END`, updatedAt: new Date() })
      .where(inArray(teamEntries.id, entryIds));

    const updated = await tx
      .select({ id: teamEntries.id, name: teams.name, displayOrder: teamEntries.displayOrder })
      .from(teamEntries)
      .innerJoin(teams, eq(teamEntries.teamId, teams.id))
      .where(inArray(teamEntries.id, entryIds));
    return updated.sort((a, b) => a.displayOrder - b.displayOrder);
  });
}
```

Keep exports coherent: delete the old `updateTeam`/`reorderOwnClubTeams` and update the route imports in the same commit.

- [ ] **Step 3: Contracts**

```ts
// packages/contracts/src/team.ts — final state
import { z } from "zod";
import { idParamSchema } from "./common";

export const teamIdParamSchema = idParamSchema;

export const teamsListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
});

export type TeamsListQuery = z.infer<typeof teamsListQuerySchema>;

export const teamUpdateBodySchema = z.strictObject({
  customName: z.string().max(50).nullable().optional(),
  estimatedGameDuration: z.number().int().positive().nullable().optional(),
  badgeColor: z.string().max(20).nullable().optional(),
  leagueId: z.number().int().positive().nullable().optional(),
});

export type TeamUpdateBody = z.infer<typeof teamUpdateBodySchema>;

export const teamReorderBodySchema = z.strictObject({
  seasonId: z.coerce.number().int().positive().optional(),
  entryIds: z.array(z.number().int().positive()).min(1),
});

export type TeamReorderBody = z.infer<typeof teamReorderBodySchema>;
```

Update the index re-export block to include `teamsListQuerySchema` / `TeamsListQuery` (if not already from Task 2).

- [ ] **Step 4: Route, client, web call sites**

Route (`team.routes.ts`): PATCH handler now calls `updateTeamEntry(id, body)`; PUT handler:

```ts
const { seasonId, entryIds } = c.req.valid("json");
return c.json(await reorderTeamEntries(entryIds, seasonId));
```

Client (`packages/api-client/src/endpoints/team.ts`):

```ts
import type { OwnClubTeam, TeamReorderItem } from "@dragons/shared";
import type { TeamUpdateBody, TeamReorderBody, TeamsListQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function teamEndpoints(client: ApiClient) {
  return {
    list(query?: TeamsListQuery): Promise<OwnClubTeam[]> {
      return client.get("/admin/teams", query);
    },
    update(entryId: number, body: TeamUpdateBody): Promise<OwnClubTeam> {
      return client.patch(`/admin/teams/${entryId}`, body);
    },
    reorder(body: TeamReorderBody): Promise<TeamReorderItem[]> {
      return client.put("/admin/teams/order", body);
    },
  };
}
```

Web call sites in `teams-table.tsx` (minimal edits, full UI in Task 9):
- `api.teams.reorder({ teamIds: … })` → `api.teams.reorder({ entryIds: reordered.map((t) => t.id) })`.

Contract test (`team.contract.test.ts`): update the reorder test body to `{ entryIds: [3, 1, 2] }`, add one case with `{ seasonId: 5, entryIds: [1] }`, and one `update` case including `leagueId: 12` plus one with `leagueId: null`.

- [ ] **Step 5: AGENTS.md endpoint rows**

```md
| PATCH | `/admin/teams/:id` | Update a team entry (custom name, color, duration, connected league) |
| PUT | `/admin/teams/order` | Reorder a season's team entries (`seasonId` optional, defaults to active) |
```

- [ ] **Step 6: Run everything and commit**

Run: `pnpm --filter @dragons/api test && pnpm --filter @dragons/api-client test && pnpm --filter @dragons/contracts test && pnpm typecheck`
Expected: PASS across all three plus workspace typecheck (web compiles — only the reorder body shape changed and it was updated).

```bash
git add packages/contracts/src apps/api/src/services/admin/team-admin.service.ts apps/api/src/services/admin/team-admin.errors.ts apps/api/src/middleware/error.ts apps/api/src/routes/admin/team.routes.ts packages/api-client/src/endpoints/team.ts packages/api-client/src/endpoints/team.contract.test.ts apps/web/src/app/[locale]/admin/teams/teams-table.tsx apps/api/src/services/admin/team-admin.service.test.ts AGENTS.md
git commit -m "feat(api): editable per-entry league link and season-scoped reorder"
```

---

### Task 6: sync reconciliation + newest-season-wins name fix

**Files:**
- Modify: `apps/api/src/services/sync/data-fetcher.ts` (`LeagueFetchedData` gains `seasonRefId`, `seasonStatus`; `collectUniqueTeams` orders by season recency)
- Create: `apps/api/src/services/sync/team-entries.sync.ts`
- Modify: `apps/api/src/services/sync/index.ts` (call `syncTeamEntriesFromData` after `syncStandingsFromData`)
- Modify: `AGENTS.md` Execution Flow block
- Test: `apps/api/src/services/sync/team-entries.sync.test.ts`, extend `apps/api/src/services/sync/data-fetcher.test.ts`

**Interfaces:**
- Consumes: `LeagueFetchedData` (extended), `upsertEntryFromEvidence` (Task 4), `getClubConfig`, `SyncLogger`.
- Produces: `syncTeamEntriesFromData(leagueData: LeagueFetchedData[], logger?: SyncLogger): Promise<TeamEntriesSyncResult>` where `TeamEntriesSyncResult = { total: number; created: number; moved: number; unchanged: number; supersededManual: number; errors: string[]; durationMs: number }`.

- [ ] **Step 1: Extend `LeagueFetchedData` and the fetch query**

In `data-fetcher.ts`:

```ts
export interface LeagueFetchedData {
  leagueApiId: number;
  leagueDbId: number | null;
  leagueName: string | null;
  seasonRefId: number | null;
  seasonStatus: "active" | "upcoming" | null;
  vorabliga: boolean;
  spielplan: SdkSpielplanMatch[];
  tabelle: SdkTabelleEntry[];
  gameDetails: Map<number, SdkGetGameResponse>;
}
```

The tracked-league query adds the columns:

```ts
const trackedLeagues = await getDb()
  .select({
    id: leagues.id,
    apiLigaId: leagues.apiLigaId,
    name: leagues.name,
    seasonRefId: leagues.seasonRefId,
    seasonStatus: seasons.status,
    vorabliga: leagues.vorabliga,
  })
  .from(leagues)
  .innerJoin(seasons, eq(leagues.seasonRefId, seasons.id))
  .where(and(eq(leagues.isTracked, true), inArray(seasons.status, ["active", "upcoming"])));
```

Thread the three new values through `fetchLeagueData(...)` into the returned object (plain parameter additions).

- [ ] **Step 2: Failing test for newest-season-wins**

Append to `data-fetcher.test.ts` (it already unit-tests `collectUniqueTeams` — follow its fixture style; if it only tests via `fetchAllSyncData`, export `collectUniqueTeams` for testing):

```ts
it("keeps the upcoming season's team ref when the same squad appears in both seasons", () => {
  const refActive = { teamPermanentId: 77, teamname: "Dragons U14", teamnameSmall: "U14", seasonTeamId: 1, teamCompetitionId: 1, clubId: 100, verzicht: false };
  const refUpcoming = { ...refActive, teamname: "Dragons U16", teamnameSmall: "U16" };
  const mk = (status: "active" | "upcoming", team: typeof refActive): LeagueFetchedData => ({
    leagueApiId: status === "active" ? 1 : 2, leagueDbId: 1, leagueName: "L",
    seasonRefId: 1, seasonStatus: status, vorabliga: false,
    spielplan: [], tabelle: [{ team } as never], gameDetails: new Map(),
  });
  // Upcoming listed FIRST — the sort must win, not array order.
  const teams = collectUniqueTeams([mk("upcoming", refUpcoming), mk("active", refActive)]);
  expect(teams.get(77)!.teamname).toBe("Dragons U16");
});
```

Run: `pnpm --filter @dragons/api test -- data-fetcher`
Expected: FAIL (active ref wins by iteration order).

- [ ] **Step 3: Make `collectUniqueTeams` season-aware**

```ts
const SEASON_RANK: Record<string, number> = { active: 0, upcoming: 1 };

export function collectUniqueTeams(allData: LeagueFetchedData[]): Map<number, SdkTeamRef> {
  const teams = new Map<number, SdkTeamRef>();
  // Last write wins, so order oldest season first: the newest season's data
  // overwrites, never the reverse. This is the wrong-name fix from the
  // 2026-08-12 team-entries spec.
  const ordered = [...allData].sort(
    (a, b) => (SEASON_RANK[a.seasonStatus ?? "active"] ?? 0) - (SEASON_RANK[b.seasonStatus ?? "active"] ?? 0),
  );
  for (const data of ordered) {
    // …existing spielplan + tabelle loops unchanged…
  }
  return teams;
}
```

Run: `pnpm --filter @dragons/api test -- data-fetcher`
Expected: PASS.

- [ ] **Step 4: Failing tests for entry reconciliation**

```ts
// apps/api/src/services/sync/team-entries.sync.test.ts
// PGlite harness + dbHolder mock exactly as in team-entry-seeding.service.test.ts.
// Mock ../admin/settings.service? No — seed app_settings club_id instead (real code path).

import { syncTeamEntriesFromData } from "./team-entries.sync";
import type { LeagueFetchedData } from "./data-fetcher";

const ref = (teamPermanentId: number, teamname: string, clubId: number) => ({
  teamPermanentId, teamname, teamnameSmall: teamname, seasonTeamId: 1,
  teamCompetitionId: 1, clubId, verzicht: false,
});

function leagueData(overrides: Partial<LeagueFetchedData>): LeagueFetchedData {
  return {
    leagueApiId: 0, leagueDbId: null, leagueName: null, seasonRefId: null,
    seasonStatus: "active", vorabliga: false, spielplan: [], tabelle: [],
    gameDetails: new Map(), ...overrides,
  };
}

describe("syncTeamEntriesFromData", () => {
  it("creates an entry for an own-club squad found in a league's table", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(50, "U10", season);
    const squad = await seedTeam(6000, "Dragons U10");

    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 50, leagueDbId: league, seasonRefId: season, tabelle: [{ team: ref(6000, "Dragons U10", 100) } as never] }),
    ]);

    expect(res.created).toBe(1);
    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: league }]);
  });

  it("supersedes a manual link on positive evidence and counts it", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const manualLeague = await seedLeague(51, "U10 alt", season);
    const evidenceLeague = await seedLeague(52, "U10 real", season);
    const squad = await seedTeam(6001, "Dragons U10");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source)
       VALUES ($1, $2, $3, 'manual')`, [squad, season, manualLeague]);

    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 52, leagueDbId: evidenceLeague, seasonRefId: season, tabelle: [{ team: ref(6001, "Dragons U10", 100) } as never] }),
    ]);

    expect(res.moved).toBe(1);
    expect(res.supersededManual).toBe(1);
    const rows = await ctx.client.query(`SELECT league_id, link_source FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: evidenceLeague, link_source: "seeded" }]);
  });

  it("prefers a committed league over a vorabliga when one squad appears in both in the same season and run", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const vorab = await seedLeague(53, "U16 Vorab", season, true);
    const committed = await seedLeague(54, "U16 Bezirksliga", season, false);
    const squad = await seedTeam(6002, "Dragons U16");

    await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 54, leagueDbId: committed, seasonRefId: season, vorabliga: false, tabelle: [{ team: ref(6002, "Dragons U16", 100) } as never] }),
      leagueData({ leagueApiId: 53, leagueDbId: vorab, seasonRefId: season, vorabliga: true, tabelle: [{ team: ref(6002, "Dragons U16", 100) } as never] }),
    ]);

    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: committed }]);
  });

  it("touches nothing without evidence (a manual gap-filler sticks)", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(55, "U10", season);
    const squad = await seedTeam(6003, "Dragons U10");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source)
       VALUES ($1, $2, $3, 'manual')`, [squad, season, league]);

    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 56, leagueDbId: null, seasonRefId: season }),
    ]);

    expect(res.total).toBe(0);
    const rows = await ctx.client.query(`SELECT link_source FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ link_source: "manual" }]);
  });
});
```

Run: `pnpm --filter @dragons/api test -- team-entries.sync`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `team-entries.sync.ts`**

```ts
// apps/api/src/services/sync/team-entries.sync.ts
import { getClubConfig } from "../admin/settings.service";
import { upsertEntryFromEvidence } from "../admin/team-entry-seeding.service";
import { getDb } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { inArray } from "drizzle-orm";
import type { LeagueFetchedData } from "./data-fetcher";
import type { SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";

const log = logger.child({ service: "team-entries-sync" });

export interface TeamEntriesSyncResult {
  total: number;
  created: number;
  moved: number;
  unchanged: number;
  supersededManual: number;
  errors: string[];
  durationMs: number;
}

/**
 * Reconcile team entries from federation evidence. One squad appearing in two
 * of a season's leagues in one run resolves committed-beats-vorabliga (spec
 * 2026-08-12); evidence beats a manual link and the supersession is logged.
 */
export async function syncTeamEntriesFromData(
  leagueData: LeagueFetchedData[],
  syncLogger?: SyncLogger,
): Promise<TeamEntriesSyncResult> {
  const startedAt = Date.now();
  const result: TeamEntriesSyncResult = {
    total: 0, created: 0, moved: 0, unchanged: 0, supersededManual: 0, errors: [], durationMs: 0,
  };

  const ownClubId = (await getClubConfig())?.clubId ?? null;
  if (ownClubId === null) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // evidence: (seasonRefId, teamPermanentId) -> chosen league
  const evidence = new Map<string, { leagueDbId: number; vorabliga: boolean; permanentId: number; seasonRefId: number }>();
  for (const data of leagueData) {
    if (data.leagueDbId === null || data.seasonRefId === null) continue;
    const permanentIds = new Set<number>();
    for (const entry of data.tabelle) {
      if (entry.team?.teamPermanentId && entry.team.clubId === ownClubId) permanentIds.add(entry.team.teamPermanentId);
    }
    for (const m of data.spielplan) {
      for (const side of [m.homeTeam, m.guestTeam]) {
        if (side?.teamPermanentId && side.clubId === ownClubId) permanentIds.add(side.teamPermanentId);
      }
    }
    for (const pid of permanentIds) {
      const key = `${data.seasonRefId}:${pid}`;
      const existing = evidence.get(key);
      // committed (vorabliga=false) beats vorabliga; first committed wins ties.
      if (!existing || (existing.vorabliga && !data.vorabliga)) {
        evidence.set(key, { leagueDbId: data.leagueDbId, vorabliga: data.vorabliga, permanentId: pid, seasonRefId: data.seasonRefId });
      }
    }
  }

  if (evidence.size === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const permanentIds = [...new Set([...evidence.values()].map((e) => e.permanentId))];
  const squadRows = await getDb()
    .select({ id: teams.id, apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(inArray(teams.apiTeamPermanentId, permanentIds));
  const squadIdByPermanent = new Map(squadRows.map((t) => [t.apiTeamPermanentId, t.id]));

  for (const e of evidence.values()) {
    const teamId = squadIdByPermanent.get(e.permanentId);
    if (teamId === undefined) continue; // squad row lands via teams.sync in the same run
    result.total++;
    try {
      const outcome = await upsertEntryFromEvidence(teamId, e.seasonRefId, e.leagueDbId);
      if (outcome.action === "created") result.created++;
      else if (outcome.action === "moved") {
        result.moved++;
        if (outcome.previousSource === "manual") {
          result.supersededManual++;
          await syncLogger?.log({
            entityType: "team",
            entityId: String(e.permanentId),
            action: "updated",
            message: `Federation evidence superseded a manual league link (team ${e.permanentId} -> league ${e.leagueDbId})`,
          });
        }
      } else result.unchanged++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Entry reconcile failed for team ${e.permanentId}: ${message}`);
      log.error({ err: error, permanentId: e.permanentId }, "Entry reconcile failed");
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
```

Run: `pnpm --filter @dragons/api test -- team-entries.sync`
Expected: PASS. (If the `syncLogger.log` action value `"updated"` is not in the logger's accepted union, use the union's closest member — read `sync-logger.ts` for the exact type.)

- [ ] **Step 6: Call it from `fullSync` + document the stage**

In `apps/api/src/services/sync/index.ts`, immediately after `const standingsRes = await syncStandingsFromData(...)` (entries need the squad rows the teams upsert just committed):

```ts
import { syncTeamEntriesFromData } from "./team-entries.sync";
// …
const teamEntriesRes = await syncTeamEntriesFromData(syncData.leagueData, syncLogger);
allErrors.push(...teamEntriesRes.errors);
if (teamEntriesRes.supersededManual > 0) {
  await logStep(`Superseded ${teamEntriesRes.supersededManual} manual league links with federation evidence`);
}
```

AGENTS.md Execution Flow: inside the Step 3 block, after the `syncStandingsFromData(leagueData)` lines, add:

```md
  then:
  - syncTeamEntriesFromData(leagueData)
    Reconciles per-season team entries (team_entries) from federation
    evidence: creates missing entries, moves links (committed beats
    vorabliga), supersedes manual links and logs the supersession
```

Run: `pnpm --filter @dragons/api test -- docs-drift index`
Expected: PASS — docs-drift derives the stage list from `fullSync` in call order.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/sync/data-fetcher.ts apps/api/src/services/sync/data-fetcher.test.ts apps/api/src/services/sync/team-entries.sync.ts apps/api/src/services/sync/team-entries.sync.test.ts apps/api/src/services/sync/index.ts AGENTS.md
git commit -m "feat(sync): reconcile team entries from federation evidence; newest season wins team names"
```

---

### Task 7: public surfaces read entries

**Files:**
- Modify: `apps/api/src/services/public/team-list.service.ts`
- Modify: `apps/api/src/services/public/team-stats.service.ts`
- Test: `apps/api/src/services/public/team-list.service.test.ts`, `apps/api/src/services/public/team-stats.service.test.ts` (extend both)

**Interfaces:**
- Consumes: `teamEntries`, `withActiveSeason` (existing `season-scope.ts`).
- Produces: `listPublicTeams()` returns the active season's entries joined with squads — **same JSON keys as today's `Team` rows** (`id`, `name`, `nameShort`, `customName`, `badgeColor`, `estimatedGameDuration`, `displayOrder`, `isOwnClub`, …) with `id` remaining the **squad id** so `/public/teams/:id/stats` URLs stay stable. Non-own-club teams keep being listed (they have no entries): own-club rows come from entries, others from `teams` as before.

- [ ] **Step 1: Failing tests**

Extend `team-list.service.test.ts`:

```ts
it("lists own-club teams from the active season's entries with entry-owned fields", async () => {
  const active = await seedSeason("2026/27", "active");
  const squadWith = await seedTeam(7000, "Dragons U16");     // has an entry
  await seedTeam(7001, "Dragons Retired");                    // own club, no entry this season
  const rival = await seedTeam(7002, "Rivals", false);        // never entries
  await ctx.client.query(
    `INSERT INTO team_entries (team_id, season_id, custom_name, badge_color, display_order)
     VALUES ($1, $2, 'U16', 'red', 2)`, [squadWith, active]);

  const rows = await listPublicTeams();

  const ownRows = rows.filter((r) => r.isOwnClub);
  expect(ownRows.map((r) => r.name)).toEqual(["Dragons U16"]); // no-entry squad is not fielded
  expect(ownRows[0]).toMatchObject({ id: squadWith, customName: "U16", badgeColor: "red", displayOrder: 2 });
  expect(rows.some((r) => r.id === rival)).toBe(true);         // non-own teams unaffected
});
```

Extend `team-stats.service.test.ts`:

```ts
it("names the entry's league even before any standings row exists", async () => {
  const active = await seedSeason("2026/27", "active");
  const league = await seedLeague(60, "U10 Kreisliga", active);
  const squad = await seedTeam(7100, "Dragons U10");
  await ctx.client.query(
    `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3)`, [squad, active, league]);

  const stats = await getTeamStats(squad);

  expect(stats?.leagueName).toBe("U10 Kreisliga");
  expect(stats?.position).toBeNull();
  expect(stats?.played).toBe(0);
});
```

Run: `pnpm --filter @dragons/api test -- team-list team-stats`
Expected: FAIL.

- [ ] **Step 2: Implement `listPublicTeams`**

```ts
// apps/api/src/services/public/team-list.service.ts
import { asc, desc, eq, and, ne } from "drizzle-orm";
import { teams, teamEntries } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { withActiveSeason } from "../season-scope";

/**
 * Public team list. Own-club rows are the active season's team entries (a
 * squad without an entry is not fielded this season and is not listed);
 * entry-owned fields override the squad row. Non-own-club rows come straight
 * from `teams` as before. `id` stays the squad id — /public/teams/:id/stats
 * URLs must not change meaning.
 */
export async function listPublicTeams() {
  const others = await getDb()
    .select()
    .from(teams)
    .where(eq(teams.isOwnClub, false))
    .orderBy(asc(teams.name));

  const own = await withActiveSeason(async (seasonId) => {
    const rows = await getDb()
      .select({
        team: teams,
        customName: teamEntries.customName,
        badgeColor: teamEntries.badgeColor,
        estimatedGameDuration: teamEntries.estimatedGameDuration,
        displayOrder: teamEntries.displayOrder,
      })
      .from(teamEntries)
      .innerJoin(teams, eq(teamEntries.teamId, teams.id))
      .where(and(eq(teamEntries.seasonId, seasonId), eq(teams.isOwnClub, true)))
      .orderBy(asc(teamEntries.displayOrder), asc(teams.name));
    return rows.map((r) => ({
      ...r.team,
      customName: r.customName,
      badgeColor: r.badgeColor,
      estimatedGameDuration: r.estimatedGameDuration,
      displayOrder: r.displayOrder,
    }));
  }, [] as Awaited<ReturnType<typeof othersShape>>);

  return [...own, ...others.map((t) => ({ ...t, customName: null, badgeColor: null, estimatedGameDuration: null, displayOrder: 0 }))];
}
```

Note on types: after Task 8 drops the four columns, `Team` no longer carries them, so this service **declares** them on the way out. To keep one commit green now (columns still exist) and stay green after Task 8, spread `r.team` first and assign the entry fields after, exactly as above, and give `others` explicit nulls. Define the return element type once at the top of the file:

```ts
import type { Team } from "@dragons/db/schema";
export type PublicTeam = Team & {
  customName: string | null;
  badgeColor: string | null;
  estimatedGameDuration: number | null;
  displayOrder: number;
};
```

and type both branches with it (replace the `othersShape` placeholder trick above by annotating `withActiveSeason<PublicTeam[]>`).

- [ ] **Step 3: Implement the `team-stats` switch**

In `team-stats.service.ts`, inside `withActiveSeason`, replace the standings-derived league lookup: first resolve the entry, then read the standings row via the entry's league:

```ts
const [entry] = await getDb()
  .select({ leagueId: teamEntries.leagueId, leagueName: leagues.name })
  .from(teamEntries)
  .innerJoin(teams, eq(teamEntries.teamId, teams.id))
  .leftJoin(leagues, eq(teamEntries.leagueId, leagues.id))
  .where(and(eq(teams.apiTeamPermanentId, apiId), eq(teamEntries.seasonId, seasonId)))
  .limit(1);

const [standing] = entry?.leagueId
  ? await getDb()
      .select({
        position: standings.position,
        played: standings.played,
        won: standings.won,
        lost: standings.lost,
        pointsFor: standings.pointsFor,
        pointsAgainst: standings.pointsAgainst,
        pointsDiff: standings.pointsDiff,
      })
      .from(standings)
      .where(and(eq(standings.teamApiId, apiId), eq(standings.leagueId, entry.leagueId)))
      .limit(1)
  : [];
```

and in the return object: `leagueName: entry?.leagueName ?? ""` (existing fallback semantics), all standings fields defaulting exactly as before. For a non-own-club team (no entry) keep the old behavior: if `entry` is undefined, fall back to the previous season-scoped standings join verbatim (copy the old block into an `else` branch) — rivals' stats pages keep working.

- [ ] **Step 4: Run, commit**

Run: `pnpm --filter @dragons/api test -- team-list team-stats && pnpm typecheck`
Expected: PASS.

```bash
git add apps/api/src/services/public/team-list.service.ts apps/api/src/services/public/team-list.service.test.ts apps/api/src/services/public/team-stats.service.ts apps/api/src/services/public/team-stats.service.test.ts
git commit -m "feat(api): public team list and stats read the season's team entries"
```

---

### Task 8: drop moved columns from `teams` (second migration) + simplify `teams.sync`

**Files:**
- Modify: `packages/db/src/schema/teams.ts` (remove `customName`, `badgeColor`, `estimatedGameDuration`, `displayOrder`, and the `teams_own_order_idx` index)
- Create (generated): `packages/db/drizzle/00XX_*.sql` (DROP COLUMN × 4, DROP INDEX)
- Modify: `apps/api/src/services/sync/teams.sync.ts` (delete all displayOrder bookkeeping)
- Delete: `apps/api/src/services/sync/teams.sync.display-order.test.ts`
- Modify: `apps/api/src/services/admin/team-entry-seeding.service.ts` (squad upsert loses no fields — verify it never wrote the dropped ones)
- Modify: `AGENTS.md` (`teams` data-model row)
- Test: existing suites

**Interfaces:**
- Consumes: everything switched off the old columns in Tasks 2–7.
- Produces: `teams` = federation-owned facts only. `syncTeamsFromData` shrinks: no `getMaxOwnDisplayOrder`, no `flippingToOwnIds`, no corrective displayOrder pass — the corrective pass reduces to the two `isOwnClub` UPDATEs.

- [ ] **Step 1: Grep for stragglers first**

Run: `grep -rn "customName\|badgeColor\|estimatedGameDuration\|displayOrder" apps/api/src packages/db/src apps/web/src packages/shared/src --include="*.ts" --include="*.tsx" | grep -v test | grep -v teamEntries | grep -v team_entries | grep -v OwnClubTeam | grep -v PublicTeam`
Expected: hits only in `teams.sync.ts` (to be removed this task), web files reading `OwnClubTeam`/`PublicTeam` fields (fine — those types keep the fields), and `team-colors` helpers (value-level, fine). Any hit still selecting `teams.customName` etc. from the DB is a Task 2–7 omission — fix it before dropping.

- [ ] **Step 2: Edit `teams.ts` schema**

Remove the four column definitions and `ownOrderIdx`. Keep `clubIdIdx`.

- [ ] **Step 3: Simplify `teams.sync.ts`**

Delete: `getMaxOwnDisplayOrder`, `nextOrder`, `flippingToOwnIds`, the `displayOrder` record field, the `displayOrder` CASE line in the upsert `set`, and the whole "assign max+1 / orderOnlyUpdates" half of the corrective pass. What remains of the corrective pass:

```ts
if (ownClubId > 0) {
  const marked = await getDb()
    .update(teams)
    .set({ isOwnClub: true, updatedAt: now })
    .where(and(eq(teams.clubId, ownClubId), eq(teams.isOwnClub, false)))
    .returning({ id: teams.id });
  const unmarked = await getDb()
    .update(teams)
    .set({ isOwnClub: false, updatedAt: now })
    .where(and(ne(teams.clubId, ownClubId), eq(teams.isOwnClub, true)))
    .returning({ id: teams.id });
  if (marked.length > 0 || unmarked.length > 0) {
    log.info({ marked: marked.length, unmarked: unmarked.length }, "Corrected isOwnClub");
  }
}
```

Delete `teams.sync.display-order.test.ts` (its subject no longer exists — display order is entry-owned and covered by Task 5's reorder tests). Update `teams.sync.test.ts` expectations that mention displayOrder.

- [ ] **Step 4: Generate + inspect the migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: `ALTER TABLE "teams" DROP COLUMN` × 4 and `DROP INDEX "teams_own_order_idx"`. **Inspect before migrating** — drizzle must not have queued anything else. Then `pnpm --filter @dragons/db db:migrate`.

- [ ] **Step 5: AGENTS.md teams row**

```md
| `teams` | `packages/db/src/schema/teams.ts` | apiTeamPermanentId (unique), name, clubId, isOwnClub, dataHash — the Squad (federation identity); club-facing fields live on `teamEntries` |
```

- [ ] **Step 6: Full API suite + workspace typecheck, commit**

Run: `pnpm --filter @dragons/api test && pnpm typecheck && pnpm --filter @dragons/api coverage`
Expected: PASS; coverage at or above thresholds.

```bash
git add packages/db/src/schema/teams.ts packages/db/drizzle apps/api/src/services/sync/teams.sync.ts apps/api/src/services/sync/teams.sync.test.ts AGENTS.md
git rm apps/api/src/services/sync/teams.sync.display-order.test.ts
git commit -m "feat(db): move club-facing team fields to team_entries; drop from teams"
```

---

### Task 9: admin teams UI — season selector, league select, warning badge

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/teams/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`
- Modify: `apps/web/src/lib/swr-keys.ts`, `apps/web/src/lib/swr-queries.ts`
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json`
- Test: `apps/web/src/app/[locale]/admin/teams/teams-table.test.tsx` (new)

**Interfaces:**
- Consumes: `api.teams.list({ seasonId? })`, `api.teams.update(entryId, { …, leagueId })`, `api.teams.reorder({ seasonId?, entryIds })`, `api.seasons.getLeagues(seasonId)` for the dropdown options, `SeasonContextSelect`.
- Produces: nothing downstream.

- [ ] **Step 1: SWR keys + queries become season-aware**

`swr-keys.ts` (mirror `standings`):

```ts
teams: (seasonId?: number) =>
  seasonId === undefined ? "/admin/teams" : `/admin/teams?seasonId=${seasonId}`,
```

`swr-queries.ts`:

```ts
teams: (seasonId?: number) => ({
  key: SWR_KEYS.teams(seasonId),
  fetcher: () => api.teams.list(seasonId === undefined ? undefined : { seasonId }),
}),
```

Fix the two existing `SWR_KEYS.teams` value usages in `teams-table.tsx` to `SWR_KEYS.teams(seasonId)` as part of Step 3, and `page.tsx`'s `sq.teams()` stays (active season default). Any other `queries.teams()` call sites found by `grep -rn "queries.teams\|SWR_KEYS.teams" apps/web/src` get the no-arg form (active season) — update them mechanically.

- [ ] **Step 2: i18n keys**

`en.json` `teams` namespace — add:

```json
"leagueNotConnected": "Not connected",
"leagueUntracked": "League no longer tracked",
"columns.linkSource" stays out — not displayed.
```

Concretely, the namespace becomes (unchanged keys omitted here but kept in the file):

```json
"leagueNotConnected": "Not connected",
"leagueUntracked": "League no longer tracked"
```

`de.json`:

```json
"leagueNotConnected": "Nicht verknüpft",
"leagueUntracked": "Liga wird nicht mehr verfolgt"
```

(`pnpm lint` runs the i18n check; both locales must stay in step.)

- [ ] **Step 3: Rework `teams-table.tsx`**

State + data wiring at the top of `TeamsTable`:

```tsx
const [seasonId, setSeasonId] = useState<number | undefined>(undefined);
const teamsQ = queries.teams(seasonId);
const { data: teams } = useSWR(teamsQ.key, teamsQ.fetcher);
const seasonsQ = queries.seasons();
const { data: seasons } = useSWR(seasonsQ.key, seasonsQ.fetcher);
const resolvedSeasonId = seasonId ?? seasons?.find((s) => s.status === "active")?.id;
const leaguesQ = resolvedSeasonId !== undefined ? {
  key: `/admin/seasons/${resolvedSeasonId}/leagues`,
  fetcher: () => api.seasons.getLeagues(resolvedSeasonId),
} : null;
const { data: trackedLeagues } = useSWR(leaguesQ?.key ?? null, leaguesQ?.fetcher ?? null);
```

Header: render `<SeasonContextSelect value={seasonId} onChange={setSeasonId} />` next to the reorder button (import from `@/components/admin/seasons/season-context-select`).

League cell (replaces the static `{team.leagueName ?? "—"}`):

```tsx
<TableCell>
  <div className="flex items-center gap-2">
    <Select
      value={leagueDraft === null ? "none" : String(leagueDraft)}
      onValueChange={(v) => onLeagueChange(team.id, v === "none" ? null : Number(v))}
      disabled={interactiveDisabled}
    >
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder={t("teams.leagueNotConnected")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("teams.leagueNotConnected")}</SelectItem>
        {(trackedLeagues?.leagues ?? []).map((l) => (
          <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
        ))}
        {/* An untracked-but-connected league must stay selectable-as-current */}
        {team.leagueId !== null && !team.leagueTracked ? (
          <SelectItem value={String(team.leagueId)}>{team.leagueName}</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
    {!team.leagueTracked ? (
      <span className="text-xs text-destructive" title={t("teams.leagueUntracked")}>⚠ {t("teams.leagueUntracked")}</span>
    ) : null}
  </div>
</TableCell>
```

Wire `leagueDraft` exactly like `colorDrafts` (a `Record<number, number | null>` keyed by entry id, `getLeagueDraft(team)` falling back to `team.leagueId`, included in `isDirty`, cleared on save). `save()` adds `leagueId: getLeagueDraft(team)` to the PATCH body. `handleDragEnd` sends `api.teams.reorder({ seasonId, entryIds: reordered.map((t) => t.id) })` and mutates `SWR_KEYS.teams(seasonId)`. `TeamRowProps` gains `leagueDraft: number | null`, `trackedLeagues: { id: number; name: string }[]`, `onLeagueChange: (id: number, value: number | null) => void`.

Note the tracked-leagues response shape: `api.seasons.getLeagues` returns `TrackedLeaguesResponse` = `{ leagueNumbers, leagues: { id, ligaNr, apiLigaId, name, seasonName, ownClubRefs }[] }` — the dropdown uses `id` (the DB id, which is what `teamUpdateBodySchema.leagueId` addresses) and `name`.

- [ ] **Step 4: Component test**

```tsx
// apps/web/src/app/[locale]/admin/teams/teams-table.test.tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OwnClubTeam } from "@dragons/shared";

const entry: OwnClubTeam = {
  id: 1, teamId: 10, name: "Dragons U16", nameShort: "U16", customName: null,
  leagueId: 5, leagueName: "U16 Vorab", leagueTracked: false, linkSource: "seeded",
  estimatedGameDuration: null, badgeColor: null, displayOrder: 0,
};

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (key === null) return { data: undefined, mutate: vi.fn() };
    if (String(key).startsWith("/admin/teams")) return { data: [entry], mutate: vi.fn() };
    if (String(key).startsWith("/admin/seasons/")) return { data: { leagueNumbers: [], leagues: [{ id: 6, ligaNr: 1, apiLigaId: 60, name: "U16 Bezirksliga", seasonName: "s", ownClubRefs: false }] }, mutate: vi.fn() };
    return { data: [{ id: 9, name: "2026/27", status: "active" }], mutate: vi.fn() };
  },
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: { teams: { update: vi.fn(), reorder: vi.fn() }, seasons: { getLeagues: vi.fn() } } }));

import { TeamsTable } from "./teams-table";
import en from "@/messages/en.json";

afterEach(() => cleanup());

function renderTable() {
  return render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={en}>
      <TeamsTable canManage={true} />
    </NextIntlClientProvider>,
  );
}

describe("TeamsTable league column", () => {
  it("shows the untracked-league warning for a stale connection", () => {
    renderTable();
    expect(screen.getByText(/League no longer tracked/)).toBeInTheDocument();
  });

  it("offers the season's tracked leagues plus 'Not connected'", () => {
    renderTable();
    // The select trigger renders the current value; options render on open —
    // assert the trigger shows the connected (untracked) league name.
    expect(screen.getByText("U16 Vorab")).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @dragons/web test -- teams-table`
Expected: FAIL before Step 3 is complete, PASS after. (Remember the repo rule: never pair Testing Library `waitFor` with `vi.useFakeTimers()` — this test needs neither.)

- [ ] **Step 5: Lint, typecheck, i18n, commit**

Run: `pnpm --filter @dragons/web lint && pnpm --filter @dragons/web test && pnpm typecheck`
Expected: PASS.

```bash
git add apps/web/src/app/[locale]/admin/teams apps/web/src/lib/swr-keys.ts apps/web/src/lib/swr-queries.ts apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): season-scoped teams page with editable league connection"
```

---

### Task 10: full verification, follow-up issue, wrap-up

**Files:**
- No source changes expected; fixes only if verification fails.

- [ ] **Step 1: Full pipeline locally**

Run, in order:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm check:ai-slop
pnpm check:skipped-tests
pnpm check:coverage-scripts
```
Expected: all PASS. Coverage must not dip below any package threshold — if `apps/api` dips, the missing branches are almost certainly in `team-entries.sync.ts` error paths or `team-entry-seeding.service.ts` carry-forward branches; add targeted tests rather than restructuring.

- [ ] **Step 2: Verify the regression test catches the original bug (revert check)**

Temporarily `git stash` nothing — instead check out the pre-change `getOwnClubTeams` body into the working tree (`git show <task-2-commit>^:apps/api/src/services/admin/team-admin.service.ts` for reference), or simpler: change the entry-based query's `where` to drop the `seasonId` predicate and run `pnpm --filter @dragons/api test -- team-admin.service`. Expected: the regression test FAILS. Restore, re-run. Expected: PASS. (Do not commit the temporary edit.)

- [ ] **Step 3: File the follow-up issue (liga-ID reuse)**

Per `docs/agents/issue-tracker.md` conventions, on `hb-dragons/dragons-hub`. Body via `--body-file` (backticks in `-c` strings vanish — see repo memory):

```bash
cat > /tmp/claude-1000/liga-id-reuse-issue.md <<'EOF'
`setSeasonLeagues` upserts leagues on `api_liga_id` alone and writes `seasonRefId` in the update branch (`apps/api/src/services/admin/league-discovery.service.ts`). If the federation ever reuses a liga ID from an earlier season, selecting it during onboarding silently moves the old season's league row — with its matches and standings — into the new season, corrupting both seasons' scoping.

Fix direction: make the upsert target `(api_liga_id, season_ref_id)` (requires a new unique constraint and a data audit for existing cross-season rows), or refuse the update branch when the existing row's `season_ref_id` differs and surface a conflict to the admin.

Found during the team-entries design (spec `docs/superpowers/specs/2026-08-12-team-entries-design.md`, decision 10; ADR 0004).
EOF
gh issue create --repo hb-dragons/dragons-hub \
  --title "setSeasonLeagues can steal a league row across seasons when the federation reuses a liga ID" \
  --label needs-triage \
  --body-file /tmp/claude-1000/liga-id-reuse-issue.md
```

- [ ] **Step 4: Deployment note for the operator**

After deploy: open the new season in the wizard, re-save its league selection (this seeds entries via the roster fetch), or trigger a manual sync. Verify the teams page shows every squad connected to this season's league, then correct any gap via the new league dropdown.

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A && git commit -m "test: close coverage gaps from team-entries verification"
```
(Skip if Step 1 passed clean.)

---

## Plan Self-Review (performed at authoring time)

- **Spec coverage:** schema (T1), seeding at league-picking (T3+T4), reconciliation + supersession log + vorabliga rule + name fix (T6), API contract (T2+T5), admin UI incl. selector/select/warning (T9), public surfaces (T7), migration + backfill all seasons + field copy + column drop (T1+T8), tests incl. the pinned regression (T2/T10), AGENTS.md obligations (T1/T2/T5/T6/T8), follow-up issue (T10). Untracked-league warning: T2 (`leagueTracked`) + T9 (badge). Manual-creation exclusion: no create endpoint added anywhere.
- **Type consistency:** `OwnClubTeam.id` = entry id everywhere from T2 on; client `update(entryId, …)`; reorder body `{ seasonId?, entryIds }` in contracts (T5), client (T5), web (T5/T9). `upsertEntryFromEvidence` defined T4, consumed T6. `LeagueFetchedData.seasonRefId/seasonStatus/vorabliga` defined T6 before use in T6's sync module.
- **Known judgment calls for the implementer:** the `syncLogger.log` action union (T6 Step 5) and the exact NOT NULL columns of `matches`/`standings` in seed helpers (T1) must be read from the code at execution time — both are flagged inline where they occur.
