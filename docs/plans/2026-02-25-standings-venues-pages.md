# Standings & Venues Admin Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add read-only Standings and Venues pages to the admin section, displaying synced basketball data with search, own-club highlighting, and Google Maps links.

**Architecture:** Two new vertical slices (API route + service + frontend page + component), following the exact patterns used by the existing referees and teams pages. Each page gets its own SWR key, i18n translations (de+en), and full test coverage.

**Tech Stack:** Hono routes, Drizzle ORM queries, Zod validation, Next.js server components with SWR hydration, DataTable (TanStack), Vitest + PGlite for tests.

---

### Task 1: Standings API — Service

**Files:**
- Create: `apps/api/src/services/admin/standings-admin.service.ts`

**Step 1: Create the service file**

```typescript
import { db } from "../../config/database";
import { standings, leagues, teams } from "@dragons/db/schema";
import { eq, asc } from "drizzle-orm";

export interface StandingItem {
  position: number;
  teamName: string;
  teamNameShort: string | null;
  isOwnClub: boolean;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  leaguePoints: number;
}

export interface LeagueStandings {
  leagueId: number;
  leagueName: string;
  seasonName: string;
  standings: StandingItem[];
}

export async function getStandings(): Promise<LeagueStandings[]> {
  const rows = await db
    .select({
      leagueId: leagues.id,
      leagueName: leagues.name,
      seasonName: leagues.seasonName,
      position: standings.position,
      teamName: teams.name,
      teamNameShort: teams.nameShort,
      isOwnClub: teams.isOwnClub,
      played: standings.played,
      won: standings.won,
      lost: standings.lost,
      pointsFor: standings.pointsFor,
      pointsAgainst: standings.pointsAgainst,
      pointsDiff: standings.pointsDiff,
      leaguePoints: standings.leaguePoints,
    })
    .from(standings)
    .innerJoin(leagues, eq(standings.leagueId, leagues.id))
    .innerJoin(teams, eq(standings.teamApiId, teams.apiTeamPermanentId))
    .where(eq(leagues.isTracked, true))
    .orderBy(asc(leagues.name), asc(standings.position));

  const grouped = new Map<number, LeagueStandings>();

  for (const row of rows) {
    let league = grouped.get(row.leagueId);
    if (!league) {
      league = {
        leagueId: row.leagueId,
        leagueName: row.leagueName,
        seasonName: row.seasonName,
        standings: [],
      };
      grouped.set(row.leagueId, league);
    }
    league.standings.push({
      position: row.position,
      teamName: row.teamName,
      teamNameShort: row.teamNameShort,
      isOwnClub: row.isOwnClub ?? false,
      played: row.played,
      won: row.won,
      lost: row.lost,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      pointsDiff: row.pointsDiff,
      leaguePoints: row.leaguePoints,
    });
  }

  return Array.from(grouped.values());
}
```

**Step 2: Run typecheck**

Run: `pnpm --filter @dragons/api exec tsc --noEmit`
Expected: PASS

---

### Task 2: Standings API — Service Tests

**Files:**
- Create: `apps/api/src/services/admin/standings-admin.service.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

// --- Imports (after mocks) ---

import { getStandings } from "./standings-admin.service";

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE leagues (
    id SERIAL PRIMARY KEY,
    api_liga_id INTEGER NOT NULL UNIQUE,
    liga_nr INTEGER NOT NULL,
    name VARCHAR(150) NOT NULL,
    season_id INTEGER NOT NULL,
    season_name VARCHAR(100) NOT NULL,
    sk_name VARCHAR(100),
    ak_name VARCHAR(100),
    geschlecht VARCHAR(20),
    verband_id INTEGER,
    verband_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_tracked BOOLEAN DEFAULT TRUE,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discovered_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    api_team_permanent_id INTEGER NOT NULL UNIQUE,
    season_team_id INTEGER NOT NULL,
    team_competition_id INTEGER NOT NULL,
    name VARCHAR(150) NOT NULL,
    name_short VARCHAR(100),
    custom_name VARCHAR(50),
    club_id INTEGER NOT NULL,
    is_own_club BOOLEAN DEFAULT FALSE,
    verzicht BOOLEAN DEFAULT FALSE,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE standings (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id),
    team_api_id INTEGER NOT NULL REFERENCES teams(api_team_permanent_id),
    position INTEGER NOT NULL,
    played INTEGER NOT NULL DEFAULT 0,
    won INTEGER NOT NULL DEFAULT 0,
    lost INTEGER NOT NULL DEFAULT 0,
    points_for INTEGER NOT NULL DEFAULT 0,
    points_against INTEGER NOT NULL DEFAULT 0,
    points_diff INTEGER NOT NULL DEFAULT 0,
    league_points INTEGER NOT NULL DEFAULT 0,
    data_hash VARCHAR(64),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, team_api_id)
  );
`;

let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM standings");
  await client.exec("DELETE FROM teams");
  await client.exec("DELETE FROM leagues");
  await client.exec("ALTER SEQUENCE standings_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE teams_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE leagues_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function insertLeague(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_liga_id: 1,
    liga_nr: 4102,
    name: "Kreisliga A",
    season_id: 1,
    season_name: "2025/26",
    is_tracked: true,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO leagues (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertTeam(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_team_permanent_id: 1000,
    season_team_id: 1,
    team_competition_id: 1,
    name: "Dragons Herren 1",
    club_id: 100,
    is_own_club: false,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO teams (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertStanding(leagueId: number, teamApiId: number, overrides: Record<string, unknown> = {}) {
  const defaults = {
    league_id: leagueId,
    team_api_id: teamApiId,
    position: 1,
    played: 10,
    won: 8,
    lost: 2,
    points_for: 800,
    points_against: 700,
    points_diff: 100,
    league_points: 16,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO standings (${cols.join(", ")}) VALUES (${placeholders})`,
    vals,
  );
}

// --- Tests ---

describe("getStandings", () => {
  it("returns empty array when no standings exist", async () => {
    const result = await getStandings();
    expect(result).toEqual([]);
  });

  it("returns standings grouped by league", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertTeam({ api_team_permanent_id: 2000, name: "Team B", season_team_id: 2, team_competition_id: 2 });
    await insertStanding(leagueId, 1000, { position: 1 });
    await insertStanding(leagueId, 2000, { position: 2 });

    const result = await getStandings();

    expect(result).toHaveLength(1);
    expect(result[0]!.leagueName).toBe("Kreisliga A");
    expect(result[0]!.standings).toHaveLength(2);
    expect(result[0]!.standings[0]!.position).toBe(1);
    expect(result[0]!.standings[1]!.position).toBe(2);
  });

  it("only returns tracked leagues", async () => {
    const trackedId = await insertLeague({ api_liga_id: 1, name: "Tracked League", is_tracked: true });
    await insertLeague({ api_liga_id: 2, liga_nr: 4103, name: "Untracked League", is_tracked: false });
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertStanding(trackedId, 1000);

    const result = await getStandings();

    expect(result).toHaveLength(1);
    expect(result[0]!.leagueName).toBe("Tracked League");
  });

  it("includes isOwnClub flag from teams", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Dragons", is_own_club: true });
    await insertTeam({ api_team_permanent_id: 2000, name: "Opponents", is_own_club: false, season_team_id: 2, team_competition_id: 2 });
    await insertStanding(leagueId, 1000, { position: 1 });
    await insertStanding(leagueId, 2000, { position: 2 });

    const result = await getStandings();

    expect(result[0]!.standings[0]!.isOwnClub).toBe(true);
    expect(result[0]!.standings[1]!.isOwnClub).toBe(false);
  });

  it("orders standings by position within each league", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Team C" });
    await insertTeam({ api_team_permanent_id: 2000, name: "Team A", season_team_id: 2, team_competition_id: 2 });
    await insertTeam({ api_team_permanent_id: 3000, name: "Team B", season_team_id: 3, team_competition_id: 3 });
    await insertStanding(leagueId, 1000, { position: 3 });
    await insertStanding(leagueId, 2000, { position: 1 });
    await insertStanding(leagueId, 3000, { position: 2 });

    const result = await getStandings();

    expect(result[0]!.standings.map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it("includes all stats fields", async () => {
    const leagueId = await insertLeague();
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertStanding(leagueId, 1000, {
      position: 1,
      played: 10,
      won: 8,
      lost: 2,
      points_for: 800,
      points_against: 700,
      points_diff: 100,
      league_points: 16,
    });

    const result = await getStandings();
    const standing = result[0]!.standings[0]!;

    expect(standing).toMatchObject({
      position: 1,
      played: 10,
      won: 8,
      lost: 2,
      pointsFor: 800,
      pointsAgainst: 700,
      pointsDiff: 100,
      leaguePoints: 16,
    });
  });

  it("includes season name in league data", async () => {
    const leagueId = await insertLeague({ season_name: "2025/26" });
    await insertTeam({ api_team_permanent_id: 1000, name: "Team A" });
    await insertStanding(leagueId, 1000);

    const result = await getStandings();

    expect(result[0]!.seasonName).toBe("2025/26");
  });

  it("groups multiple leagues separately", async () => {
    const league1 = await insertLeague({ api_liga_id: 1, name: "Liga A" });
    const league2 = await insertLeague({ api_liga_id: 2, liga_nr: 4103, name: "Liga B" });
    await insertTeam({ api_team_permanent_id: 1000, name: "Team 1" });
    await insertTeam({ api_team_permanent_id: 2000, name: "Team 2", season_team_id: 2, team_competition_id: 2 });
    await insertStanding(league1, 1000, { position: 1 });
    await insertStanding(league2, 2000, { position: 1 });

    const result = await getStandings();

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.leagueName).sort()).toEqual(["Liga A", "Liga B"]);
  });
});
```

**Step 2: Run tests**

Run: `pnpm --filter @dragons/api test -- standings-admin.service.test`
Expected: All tests PASS

---

### Task 3: Standings API — Route, Schema, Route Tests

**Files:**
- Create: `apps/api/src/routes/admin/standings.routes.ts`
- Create: `apps/api/src/routes/admin/standings.routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

**Step 1: Create the route file**

```typescript
// apps/api/src/routes/admin/standings.routes.ts
import { Hono } from "hono";
import { getStandings } from "../../services/admin/standings-admin.service";

const standingsRoutes = new Hono();

// GET /admin/standings - List standings grouped by tracked league
standingsRoutes.get("/standings", async (c) => {
  const result = await getStandings();
  return c.json(result);
});

export { standingsRoutes };
```

**Step 2: Register the route in index.ts**

Add to `apps/api/src/routes/index.ts`:
```typescript
import { standingsRoutes } from "./admin/standings.routes";
// ...
routes.route("/admin", standingsRoutes);
```

**Step 3: Create route tests**

```typescript
// apps/api/src/routes/admin/standings.routes.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getStandings: vi.fn(),
}));

vi.mock("../../services/admin/standings-admin.service", () => ({
  getStandings: mocks.getStandings,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { standingsRoutes } from "./standings.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", standingsRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /standings", () => {
  it("returns empty array when no standings exist", async () => {
    mocks.getStandings.mockResolvedValue([]);

    const res = await app.request("/standings");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
    expect(mocks.getStandings).toHaveBeenCalledOnce();
  });

  it("returns standings grouped by league", async () => {
    const data = [
      {
        leagueId: 1,
        leagueName: "Kreisliga A",
        seasonName: "2025/26",
        standings: [
          {
            position: 1,
            teamName: "Dragons Herren 1",
            teamNameShort: "Dragons H1",
            isOwnClub: true,
            played: 10,
            won: 8,
            lost: 2,
            pointsFor: 800,
            pointsAgainst: 700,
            pointsDiff: 100,
            leaguePoints: 16,
          },
        ],
      },
    ];
    mocks.getStandings.mockResolvedValue(data);

    const res = await app.request("/standings");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(data);
  });
});
```

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- standings.routes.test`
Expected: All tests PASS

---

### Task 4: Venues API — Extend Service with List Endpoint

**Files:**
- Modify: `apps/api/src/services/admin/venue-admin.service.ts`

**Step 1: Add `getVenues` function**

Add to the existing file, below `searchVenues`:

```typescript
export interface VenueListItem {
  id: number;
  apiId: number;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
}

export async function getVenues(): Promise<VenueListItem[]> {
  const rows = await db
    .select({
      id: venues.id,
      apiId: venues.apiId,
      name: venues.name,
      street: venues.street,
      postalCode: venues.postalCode,
      city: venues.city,
      latitude: venues.latitude,
      longitude: venues.longitude,
    })
    .from(venues)
    .orderBy(asc(venues.name));

  return rows;
}
```

Also add `asc` to the drizzle-orm imports at the top.

**Step 2: Run typecheck**

Run: `pnpm --filter @dragons/api exec tsc --noEmit`
Expected: PASS

---

### Task 5: Venues API — Service Tests for getVenues

**Files:**
- Modify: `apps/api/src/services/admin/venue-admin.service.test.ts`

**Step 1: Add import of `getVenues` and new tests**

Add `getVenues` to the import line. Then add a new `describe` block after the existing `searchVenues` tests:

```typescript
describe("getVenues", () => {
  it("returns empty array when no venues exist", async () => {
    const result = await getVenues();
    expect(result).toEqual([]);
  });

  it("returns all venues ordered by name", async () => {
    await insertVenue({ api_id: 1, name: "Zeppelin Halle", city: "Munich" });
    await insertVenue({ api_id: 2, name: "Arena Berlin", city: "Berlin" });

    const result = await getVenues();

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Arena Berlin");
    expect(result[1]!.name).toBe("Zeppelin Halle");
  });

  it("includes all address fields", async () => {
    await insertVenue({
      api_id: 1,
      name: "Sporthalle",
      street: "Hauptstr. 1",
      postal_code: "53604",
      city: "Bad Honnef",
      latitude: 50.6451234,
      longitude: 7.2276543,
    });

    const result = await getVenues();

    expect(result[0]).toMatchObject({
      name: "Sporthalle",
      street: "Hauptstr. 1",
      postalCode: "53604",
      city: "Bad Honnef",
    });
    expect(result[0]!.latitude).not.toBeNull();
    expect(result[0]!.longitude).not.toBeNull();
  });

  it("returns null for missing optional fields", async () => {
    await insertVenue({ api_id: 1, name: "Halle", city: null });

    const result = await getVenues();

    expect(result[0]!.street).toBeNull();
    expect(result[0]!.postalCode).toBeNull();
    expect(result[0]!.city).toBeNull();
    expect(result[0]!.latitude).toBeNull();
    expect(result[0]!.longitude).toBeNull();
  });

  it("includes apiId field", async () => {
    await insertVenue({ api_id: 42, name: "Test Halle" });

    const result = await getVenues();

    expect(result[0]!.apiId).toBe(42);
  });
});
```

**Step 2: Run tests**

Run: `pnpm --filter @dragons/api test -- venue-admin.service.test`
Expected: All tests PASS

---

### Task 6: Venues API — Route and Route Tests

**Files:**
- Modify: `apps/api/src/routes/admin/venue.routes.ts`
- Modify: `apps/api/src/routes/admin/venue.routes.test.ts`

**Step 1: Add list route to venue.routes.ts**

Add `getVenues` to the import and add a new route BEFORE the search route:

```typescript
import { searchVenues, getVenues } from "../../services/admin/venue-admin.service";

// GET /admin/venues - List all venues
venueRoutes.get("/venues", async (c) => {
  const result = await getVenues();
  return c.json(result);
});
```

**Step 2: Add route tests**

Add `getVenues` mock to the hoisted mocks and add tests:

```typescript
const mocks = vi.hoisted(() => ({
  searchVenues: vi.fn(),
  getVenues: vi.fn(),
}));

vi.mock("../../services/admin/venue-admin.service", () => ({
  searchVenues: mocks.searchVenues,
  getVenues: mocks.getVenues,
}));
```

Add a new describe block:

```typescript
describe("GET /venues", () => {
  it("returns all venues", async () => {
    const venueList = [
      { id: 1, apiId: 100, name: "Arena Berlin", street: "Str. 1", postalCode: "10115", city: "Berlin", latitude: "52.5200000", longitude: "13.4050000" },
      { id: 2, apiId: 200, name: "Sporthalle Mitte", street: null, postalCode: null, city: "Hamburg", latitude: null, longitude: null },
    ];
    mocks.getVenues.mockResolvedValue(venueList);

    const res = await app.request("/venues");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(venueList);
    expect(mocks.getVenues).toHaveBeenCalledOnce();
  });

  it("returns empty array when no venues exist", async () => {
    mocks.getVenues.mockResolvedValue([]);

    const res = await app.request("/venues");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });
});
```

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- venue.routes.test`
Expected: All tests PASS

---

### Task 7: i18n Translations

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

**Step 1: Add to en.json**

Add nav keys and section keys:

In `"nav"` section add:
```json
"standings": "Standings",
"venues": "Venues"
```

Add new top-level sections:
```json
"standings": {
  "title": "Standings",
  "description": "League standings for tracked leagues",
  "empty": "No standings data available",
  "season": "Season: {season}",
  "columns": {
    "position": "#",
    "team": "Team",
    "played": "P",
    "won": "W",
    "lost": "L",
    "pointsFor": "PF",
    "pointsAgainst": "PA",
    "pointsDiff": "+/-",
    "leaguePoints": "Pts"
  }
},
"venues": {
  "title": "Venues",
  "description": "All venues from synced match data",
  "empty": "No venues found",
  "searchPlaceholder": "Search venues...",
  "openMap": "Open in Maps",
  "columns": {
    "name": "Name",
    "street": "Street",
    "postalCode": "Postal Code",
    "city": "City",
    "map": "Map"
  }
}
```

**Step 2: Add to de.json**

In `"nav"` section add:
```json
"standings": "Tabellen",
"venues": "Hallen"
```

Add new top-level sections:
```json
"standings": {
  "title": "Tabellen",
  "description": "Tabellenstände der verfolgten Ligen",
  "empty": "Keine Tabellendaten vorhanden",
  "season": "Saison: {season}",
  "columns": {
    "position": "#",
    "team": "Team",
    "played": "Sp",
    "won": "S",
    "lost": "N",
    "pointsFor": "PF",
    "pointsAgainst": "PA",
    "pointsDiff": "+/-",
    "leaguePoints": "Pkt"
  }
},
"venues": {
  "title": "Hallen",
  "description": "Alle Hallen aus den synchronisierten Spieldaten",
  "empty": "Keine Hallen gefunden",
  "searchPlaceholder": "Hallen suchen...",
  "openMap": "In Karten öffnen",
  "columns": {
    "name": "Name",
    "street": "Straße",
    "postalCode": "PLZ",
    "city": "Stadt",
    "map": "Karte"
  }
}
```

---

### Task 8: SWR Keys & Header Navigation

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts`
- Modify: `apps/web/src/components/admin/header.tsx`

**Step 1: Add SWR keys**

Add to the `SWR_KEYS` object:
```typescript
standings: "/admin/standings",
venues: "/admin/venues",
```

**Step 2: Add nav links**

Add to the `navLinks` array in header.tsx (after referees, before teams):
```typescript
{ href: "/admin/standings" as const, labelKey: "nav.standings" as const },
{ href: "/admin/venues" as const, labelKey: "nav.venues" as const },
```

---

### Task 9: Standings Frontend — Page & Component

**Files:**
- Create: `apps/web/src/app/[locale]/admin/standings/page.tsx`
- Create: `apps/web/src/components/admin/standings/standings-view.tsx`
- Create: `apps/web/src/components/admin/standings/types.ts`

**Step 1: Create types file**

```typescript
// apps/web/src/components/admin/standings/types.ts
export interface StandingItem {
  position: number;
  teamName: string;
  teamNameShort: string | null;
  isOwnClub: boolean;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  leaguePoints: number;
}

export interface LeagueStandings {
  leagueId: number;
  leagueName: string;
  seasonName: string;
  standings: StandingItem[];
}
```

**Step 2: Create standings-view component**

```typescript
// apps/web/src/components/admin/standings/standings-view.tsx
"use client"

import { useTranslations } from "next-intl"
import useSWR from "swr"
import { apiFetcher } from "@/lib/swr"
import { SWR_KEYS } from "@/lib/swr-keys"
import { Trophy } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table"
import { cn } from "@dragons/ui/lib/utils"

import type { LeagueStandings } from "./types"

export function StandingsView() {
  const t = useTranslations("standings")
  const { data: leagues } = useSWR<LeagueStandings[]>(SWR_KEYS.standings, apiFetcher)

  const leagueList = leagues ?? []

  if (leagueList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Trophy className="mb-2 h-8 w-8" />
        <p>{t("empty")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {leagueList.map((league) => (
        <div key={league.leagueId} className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">{league.leagueName}</h2>
            <p className="text-sm text-muted-foreground">
              {t("season", { season: league.seasonName })}
            </p>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">{t("columns.position")}</TableHead>
                  <TableHead>{t("columns.team")}</TableHead>
                  <TableHead className="w-12 text-center">{t("columns.played")}</TableHead>
                  <TableHead className="w-12 text-center">{t("columns.won")}</TableHead>
                  <TableHead className="w-12 text-center">{t("columns.lost")}</TableHead>
                  <TableHead className="w-16 text-center">{t("columns.pointsFor")}</TableHead>
                  <TableHead className="w-16 text-center">{t("columns.pointsAgainst")}</TableHead>
                  <TableHead className="w-16 text-center">{t("columns.pointsDiff")}</TableHead>
                  <TableHead className="w-16 text-center font-bold">{t("columns.leaguePoints")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {league.standings.map((standing) => (
                  <TableRow
                    key={`${league.leagueId}-${standing.position}`}
                    className={cn(standing.isOwnClub && "bg-primary/5 font-medium")}
                  >
                    <TableCell className="text-center tabular-nums">{standing.position}</TableCell>
                    <TableCell className={cn(standing.isOwnClub && "font-semibold")}>
                      {standing.teamName}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{standing.played}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.won}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.lost}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.pointsFor}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.pointsAgainst}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.pointsDiff}</TableCell>
                    <TableCell className="text-center tabular-nums font-bold">{standing.leaguePoints}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Step 3: Create page**

```typescript
// apps/web/src/app/[locale]/admin/standings/page.tsx
import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { StandingsView } from "@/components/admin/standings/standings-view";
import type { LeagueStandings } from "@/components/admin/standings/types";

export default async function StandingsPage() {
  const t = await getTranslations();
  let data: LeagueStandings[] | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<LeagueStandings[]>("/admin/standings");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("standings.title")}</h1>
        <p className="text-muted-foreground">{t("standings.description")}</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.standings]: data } }}>
          <StandingsView />
        </SWRConfig>
      )}
    </div>
  );
}
```

---

### Task 10: Venues Frontend — Page & Component

**Files:**
- Create: `apps/web/src/app/[locale]/admin/venues/page.tsx`
- Create: `apps/web/src/components/admin/venues/venue-list-table.tsx`
- Create: `apps/web/src/components/admin/venues/types.ts`

**Step 1: Create types file**

```typescript
// apps/web/src/components/admin/venues/types.ts
export interface VenueListItem {
  id: number;
  apiId: number;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
}
```

**Step 2: Create venue-list-table component**

```typescript
// apps/web/src/components/admin/venues/venue-list-table.tsx
"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { apiFetcher } from "@/lib/swr"
import { SWR_KEYS } from "@/lib/swr-keys"
import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { MapPin, SearchIcon } from "lucide-react"
import { Input } from "@dragons/ui/components/input"

import { DataTable } from "@/components/ui/data-table"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

import type { VenueListItem } from "./types"

function getMapUrl(venue: VenueListItem): string {
  if (venue.latitude && venue.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`;
  }
  const parts = [venue.name, venue.street, venue.postalCode, venue.city]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}

function getColumns(t: ReturnType<typeof useTranslations<"venues">>): ColumnDef<VenueListItem, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.name")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.name}</span>
      ),
      meta: { label: t("columns.name") },
    },
    {
      accessorKey: "street",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.street")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.street ?? ""}</span>
      ),
      meta: { label: t("columns.street") },
    },
    {
      accessorKey: "postalCode",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.postalCode")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.postalCode ?? ""}</span>
      ),
      meta: { label: t("columns.postalCode") },
    },
    {
      accessorKey: "city",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.city")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.city ?? ""}</span>
      ),
      meta: { label: t("columns.city") },
    },
    {
      id: "map",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.map")} />
      ),
      cell: ({ row }) => (
        <a
          href={getMapUrl(row.original)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          title={t("openMap")}
        >
          <MapPin className="h-4 w-4" />
        </a>
      ),
      enableSorting: false,
      meta: { label: t("columns.map") },
    },
  ]
}

const venueGlobalFilterFn: FilterFn<VenueListItem> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = (filterValue as string).toLowerCase()
  if (!search) return true

  const name = row.original.name.toLowerCase()
  const street = (row.original.street ?? "").toLowerCase()
  const city = (row.original.city ?? "").toLowerCase()
  const postalCode = (row.original.postalCode ?? "").toLowerCase()

  return (
    name.includes(search) ||
    street.includes(search) ||
    city.includes(search) ||
    postalCode.includes(search)
  )
}

export function VenueListTable() {
  const t = useTranslations("venues")
  const { data: venueList } = useSWR<VenueListItem[]>(SWR_KEYS.venues, apiFetcher)
  const columns = useMemo(() => getColumns(t), [t])

  const allItems = venueList ?? []

  return (
    <DataTable
      columns={columns}
      data={allItems}
      globalFilterFn={venueGlobalFilterFn}
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MapPin className="mb-2 h-8 w-8" />
          <p>{t("empty")}</p>
        </div>
      }
    >
      {(table) => (
        <DataTableToolbar table={table}>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={(table.getState().globalFilter as string) ?? ""}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              className="h-8 w-[150px] pl-8 lg:w-[250px]"
            />
          </div>
        </DataTableToolbar>
      )}
    </DataTable>
  )
}
```

**Step 3: Create page**

```typescript
// apps/web/src/app/[locale]/admin/venues/page.tsx
import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { VenueListTable } from "@/components/admin/venues/venue-list-table";
import type { VenueListItem } from "@/components/admin/venues/types";

export default async function VenuesPage() {
  const t = await getTranslations();
  let data: VenueListItem[] | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<VenueListItem[]>("/admin/venues");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("venues.title")}</h1>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.venues]: data } }}>
          <VenueListTable />
        </SWRConfig>
      )}
    </div>
  );
}
```

---

### Task 11: Run Full Test Suite & Verify

**Step 1: Run all API tests**

Run: `pnpm --filter @dragons/api test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

---
