# Web-Native Parity: API Client Migration & Public Detail Pages

**Date:** 2026-04-17
**Status:** Approved
**Scope:** Migrate web public pages to `@dragons/api-client`, add game/team/H2H detail pages, enrich home page

## Context

The native app (Expo) uses `@dragons/api-client` with typed endpoint methods (`publicApi.getMatches()`, `publicApi.getHomeDashboard()`, etc.). The web app (Next.js) uses a hand-rolled `fetchAPI()` wrapper with raw URL strings. The native app also has detail pages (game, team, H2H) that the web lacks entirely.

This spec brings web public pages to parity with native so both apps can evolve together.

## Decisions

- **Data fetching:** Pure SSR via async server components (no client-side SWR for public pages)
- **Component sharing:** Types and API client shared via packages. Rendering is platform-specific (Tailwind for web, React Native StyleSheet for native)
- **Route group:** All new pages live in `(public)` alongside existing public pages
- **Existing code:** `fetchAPI`/`api.server.ts`/`swr.ts` stay untouched for admin pages. Only public pages migrate.

## 1. Extend `@dragons/api-client`

### Change: Add `credentials` option

Add optional `credentials` field to `ApiClientOptions`:

```typescript
// packages/api-client/src/client.ts
export interface ApiClientOptions {
  baseUrl: string;
  auth?: AuthStrategy;
  fetchFn?: typeof fetch;
  credentials?: RequestCredentials; // NEW
}
```

Pass through in `request()`:

```typescript
const response = await this.fetchFn(url, {
  method,
  headers,
  credentials: this.credentials, // NEW
  body: body !== undefined ? JSON.stringify(body) : undefined,
});
```

No breaking changes. Native is unaffected (doesn't set `credentials`).

### Tests

Update `client.test.ts` to verify `credentials` is passed through to fetch when set, and omitted when not set.

## 2. Web API Client Helpers

Two new files in `apps/web/src/lib/`:

### `api-client.ts` (client-side, for future SWR usage)

```typescript
import { ApiClient, publicEndpoints } from "@dragons/api-client";

const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  credentials: "include",
});

export const publicApi = publicEndpoints(apiClient);
```

### `api-client.server.ts` (server-side, for SSR)

```typescript
import "server-only";
import { ApiClient, publicEndpoints } from "@dragons/api-client";

export function getPublicApi() {
  const baseUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const client = new ApiClient({ baseUrl });
  return publicEndpoints(client);
}
```

Factory function (not singleton) because server components are request-scoped. Public endpoints don't need auth cookies.

### Dependency

Add `@dragons/api-client` to `apps/web/package.json` workspace dependencies.

## 3. Migrate Existing Public Pages

Replace raw `fetchAPI` calls with typed `publicApi` methods from `api-client.server.ts`.

### Home (`(public)/page.tsx`)

**Before:** Two `fetchAPI("/public/matches?...")` calls for next match and last result.

**After:** Single `getPublicApi().getHomeDashboard()` call returning `HomeDashboard` type.

### Schedule (`(public)/schedule/page.tsx`)

**Before:** `fetchAPI("/public/teams")` and `fetchAPI("/public/matches?${queryParams}")`.

**After:** `getPublicApi().getTeams()` and `getPublicApi().getMatches(params)`.

Client-side schedule/calendar views also need migration: replace `fetch('${apiBaseUrl}/public/matches?...')` with the client-side `publicApi` from `api-client.ts`.

### Standings (`(public)/standings/page.tsx`)

**Before:** `fetchAPI<LeagueStandings[]>("/public/standings")`.

**After:** `getPublicApi().getStandings()`.

### Teams (`(public)/teams/page.tsx`)

**Before:** `fetchAPI<PublicTeam[]>("/public/teams")`.

**After:** `getPublicApi().getTeams()`. Import `PublicTeam` type from `@dragons/api-client` instead of local interface.

## 4. Home Page Enrichment

Replace the simple next-match + last-result layout with the full dashboard matching native.

### Data

`getPublicApi().getHomeDashboard()` returns:

```typescript
interface HomeDashboard {
  nextGame: MatchListItem | null;
  recentResults: MatchListItem[];  // last 5
  upcomingGames: MatchListItem[];  // next 3
  clubStats: {
    teamCount: number;
    totalWins: number;
    totalLosses: number;
    winPercentage: number;
  };
}
```

### Sections

1. **Hero** (keep existing Dragons title)

2. **Next game card** — match card with countdown badge:
   - Countdown logic: compare kickoff date to today → "Today" / "Tomorrow" / "In X days"
   - Links to `/game/[id]`
   - Show home/away team names, date, time, venue, league

3. **Recent results** — horizontal row of up to 5 compact result chips:
   - Each chip: opponent short name + score + W/L color indicator
   - Links to `/game/[id]`

4. **Club stats strip** — 4-stat horizontal row:
   - Teams | Wins (green) | Losses (red) | Win Rate
   - Uses `bg-surface-low` background, `font-display` for values

5. **Upcoming games** — up to 3 compact match cards:
   - Date, time, home/away teams, league
   - Links to `/game/[id]`

6. **Navigation cards** (keep existing grid)

### Design tokens

- Countdown badge: `bg-heat/10 text-heat font-display text-xs uppercase`
- Stats strip: `bg-surface-low rounded-md` container, `font-display text-2xl font-bold` values
- Result chips: `bg-card rounded-md` with left color bar (`border-l-2 border-l-primary` for win, `border-l-destructive` for loss)

## 5. Game Detail Page

### Route

`apps/web/src/app/[locale]/(public)/game/[id]/page.tsx`

### Data

Two parallel server-side fetches:

```typescript
const api = getPublicApi();
const [match, context] = await Promise.all([
  api.getMatch(Number(id)),
  api.getMatchContext(Number(id)),
]);
```

- `match: PublicMatchDetail` — scores, quarters, venue, officials, status
- `context: MatchContext` — H2H record, form for both teams

### Sections

1. **Score card** — centered layout:
   - Home team name (left) — score — Guest team name (right)
   - If no score yet: "VS" placeholder
   - Date, time below score
   - Status badge if cancelled/forfeited
   - Own-club team name in `text-primary`

2. **Quarter table** — responsive table:
   - Columns: Team, Q1, Q2, Q3, Q4, (Q5-Q8 for Achtel), OT1, OT2, HT, Total
   - Only show columns that have data
   - Rows: home team, guest team
   - `bg-surface-low` header, `font-display text-xs uppercase` headers

3. **Head-to-Head summary** — card with:
   - Record: "W-L" from own club's perspective
   - Points for/against averages
   - Last 5 meetings as compact rows (date, score, W/L)
   - Link to full H2H page: `/h2h/[opponentApiId]`

4. **Form** — side-by-side for both teams:
   - 5 colored boxes per team (green W, red L)
   - Team name above each strip
   - Uses `bg-primary` for win, `bg-destructive` for loss

5. **Details card** — venue and officials:
   - Venue name and address
   - Scorer (Anschreiber), Timekeeper (Zeitnehmer)
   - Only show fields that have values

### Design

- Score text: `font-display text-4xl font-bold`
- Team names: `font-display text-lg font-semibold`
- Cards: `bg-card rounded-md` with tonal surface layering (no borders)
- Quarter table follows design system table conventions

## 6. Team Detail Page

### Route

`apps/web/src/app/[locale]/(public)/team/[id]/page.tsx`

### Data

`TeamStats` contains `teamId` (internal) but not `apiTeamPermanentId`. The matches endpoint requires `teamApiId` (which maps to `apiTeamPermanentId`). Same pattern as native: fetch teams list first, find team by ID, then fetch stats and matches in parallel.

```typescript
const api = getPublicApi();

// Step 1: get teams to resolve apiTeamPermanentId
const teams = await api.getTeams();
const team = teams.find((t) => t.id === Number(id));
if (!team) notFound();

// Step 2: parallel fetches using the resolved apiTeamPermanentId
const [stats, matchesData, standings] = await Promise.all([
  api.getTeamStats(team.id),
  api.getMatches({ teamApiId: team.apiTeamPermanentId, limit: 100, sort: "asc" }),
  api.getStandings(),
]);
```

- `team: PublicTeam` — team metadata (name, apiTeamPermanentId, badgeColor, etc.)
- `stats: TeamStats` — season record, point differential, league position
- `matchesData: PaginatedResponse<MatchListItem>` — all matches for this team
- `standings: LeagueStandings[]` — to find and display this team's league table

### Sections

1. **Team header** — name, league name, season, badge color accent

2. **Form strip** — last 5 games as W/L colored boxes

3. **Season stats** — 4-stat grid:
   - Games Played | Wins | Losses | Point Diff (+/-)
   - League position badge (e.g., "#3")

4. **League standings table** — filtered to this team's league:
   - Same table style as `/standings` page
   - Current team row highlighted with `border-l-2 border-l-primary/50 bg-primary/5`

5. **Recent games** — list of match cards:
   - Sorted by date descending
   - Each links to `/game/[id]`
   - Highlight last completed game

## 7. H2H Page

### Route

`apps/web/src/app/[locale]/(public)/h2h/[teamApiId]/page.tsx`

### Data

```typescript
const api = getPublicApi();
const matches = await api.getMatches({
  opponentApiId: Number(teamApiId),
  limit: 100,
  sort: "desc",
});
```

### Sections

1. **Header** — "Head to Head vs [Opponent Name]"
   - Opponent name derived from the first match in the list

2. **Match list** — all historical matches sorted by date descending:
   - Each match card: date, home vs guest, score, W/L indicator
   - Links to `/game/[id]`

## 8. Entity Navigation (Cross-linking)

Add links across all public pages once detail pages exist:

| Source | Element | Destination |
|---|---|---|
| Home: next game card | Card press | `/game/[id]` |
| Home: recent result chips | Chip press | `/game/[id]` |
| Home: upcoming game cards | Card press | `/game/[id]` |
| Schedule: match cards | Card press | `/game/[id]` |
| Standings: team name | Team name click | `/team/[id]` |
| Game detail: H2H section | "View all" link | `/h2h/[opponentApiId]` |
| Game detail: H2H match rows | Row press | `/game/[id]` |
| Team detail: match cards | Card press | `/game/[id]` |
| H2H: match cards | Card press | `/game/[id]` |

## 9. i18n Keys

New keys needed in `apps/web/src/messages/{de,en}.json` under a `public` namespace:

### Home enrichment
- `countdown.today`, `countdown.tomorrow`, `countdown.inDays`
- `recentResults`, `upcomingGames`
- `stats.teams`, `stats.wins`, `stats.losses`, `stats.winRate`
- `noUpcoming`

### Game detail
- `gameDetail.score`, `gameDetail.quarters`, `gameDetail.halftime`, `gameDetail.overtime`, `gameDetail.total`
- `gameDetail.headToHead`, `gameDetail.viewAll`
- `gameDetail.form`, `gameDetail.venue`, `gameDetail.address`
- `gameDetail.scorer`, `gameDetail.timekeeper`
- `gameDetail.confirmed`, `gameDetail.cancelled`, `gameDetail.forfeited`
- `gameDetail.win`, `gameDetail.loss`

### Team detail
- `teamDetail.form`, `teamDetail.seasonStats`
- `teamDetail.gamesPlayed`, `teamDetail.wins`, `teamDetail.losses`, `teamDetail.pointDiff`
- `teamDetail.leaguePosition`, `teamDetail.standings`
- `teamDetail.recentGames`

### H2H
- `h2h.title` (with interpolation for opponent name)
- `h2h.record`, `h2h.pointsFor`, `h2h.pointsAgainst`

## 10. Implementation Order

1. Extend `@dragons/api-client` with `credentials` option
2. Add `@dragons/api-client` dependency to web, create helper files
3. Migrate existing 4 public pages to use typed api-client
4. Enrich home page with `HomeDashboard` endpoint
5. Build game detail page
6. Build team detail page
7. Build H2H page
8. Add cross-linking navigation across all pages
9. Add i18n keys (incrementally with each page)

Each step validates the previous. Steps 5-7 are independent of each other and could be parallelized.

## Files Changed/Created

### Modified
- `packages/api-client/src/client.ts` — add `credentials` option
- `packages/api-client/src/client.test.ts` — test credentials passthrough
- `apps/web/package.json` — add `@dragons/api-client` dependency
- `apps/web/src/app/[locale]/(public)/page.tsx` — home page enrichment
- `apps/web/src/app/[locale]/(public)/schedule/page.tsx` — api-client migration
- `apps/web/src/app/[locale]/(public)/standings/page.tsx` — api-client migration
- `apps/web/src/app/[locale]/(public)/teams/page.tsx` — api-client migration
- `apps/web/src/components/public/schedule/schedule-view.tsx` — client-side api-client
- `apps/web/src/components/public/schedule/calendar-view.tsx` — client-side api-client
- `apps/web/src/messages/en.json` — new i18n keys
- `apps/web/src/messages/de.json` — new i18n keys

### Created
- `apps/web/src/lib/api-client.ts` — client-side api-client instance
- `apps/web/src/lib/api-client.server.ts` — server-side api-client factory
- `apps/web/src/app/[locale]/(public)/game/[id]/page.tsx` — game detail page
- `apps/web/src/app/[locale]/(public)/team/[id]/page.tsx` — team detail page
- `apps/web/src/app/[locale]/(public)/h2h/[teamApiId]/page.tsx` — H2H page

### Not Changed
- `apps/web/src/lib/api.ts` — kept for admin pages
- `apps/web/src/lib/api.server.ts` — kept for admin pages
- `apps/web/src/lib/swr.ts` — kept for admin pages
- `apps/web/src/lib/swr-keys.ts` — kept for admin pages
- All admin page files — untouched
