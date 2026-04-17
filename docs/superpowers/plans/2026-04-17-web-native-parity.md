# Web-Native Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate web public pages to `@dragons/api-client` and add game/team/H2H detail pages + enriched home page to match native app.

**Architecture:** Extend `ApiClient` with `credentials` option, create server/client helpers in web, migrate existing pages, then build three new detail pages as SSR server components following the Dragon's Lair design system.

**Tech Stack:** Next.js 16 (App Router, server components), `@dragons/api-client`, `@dragons/shared` types, next-intl, Tailwind CSS 4, Dragon's Lair design tokens.

**Spec:** `docs/superpowers/specs/2026-04-17-web-native-parity-design.md`

---

## File Structure

### Modified
- `packages/api-client/src/client.ts` — add `credentials` option to `ApiClientOptions` and pass through in `request()`
- `packages/api-client/src/client.test.ts` — test `credentials` passthrough
- `apps/web/package.json` — add `@dragons/api-client` workspace dependency
- `apps/web/src/app/[locale]/(public)/page.tsx` — rewrite home page to use `HomeDashboard` endpoint
- `apps/web/src/app/[locale]/(public)/schedule/page.tsx` — migrate to api-client
- `apps/web/src/app/[locale]/(public)/standings/page.tsx` — migrate to api-client, add team links
- `apps/web/src/app/[locale]/(public)/teams/page.tsx` — migrate to api-client, add team links
- `apps/web/src/components/public/schedule/schedule-view.tsx` �� use client-side `publicApi`
- `apps/web/src/components/public/schedule/calendar-view.tsx` — use client-side `publicApi`
- `apps/web/src/messages/en.json` — new i18n keys
- `apps/web/src/messages/de.json` — new i18n keys

### Created
- `apps/web/src/lib/api-client.ts` — client-side api-client with `credentials: "include"`
- `apps/web/src/lib/api-client.server.ts` — server-side api-client factory
- `apps/web/src/app/[locale]/(public)/game/[id]/page.tsx` — game detail page
- `apps/web/src/app/[locale]/(public)/team/[id]/page.tsx` — team detail page
- `apps/web/src/app/[locale]/(public)/h2h/[teamApiId]/page.tsx` — H2H page

---

## Task 1: Extend `ApiClient` with `credentials` option

**Files:**
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/client.test.ts`

- [ ] **Step 1: Write failing test for credentials passthrough**

Add to `packages/api-client/src/client.test.ts` inside the existing `describe("ApiClient")` block:

```typescript
it("passes credentials option to fetch when set", async () => {
  const fetchFn = mockFetch(200, {});
  const client = new ApiClient({ baseUrl, fetchFn, credentials: "include" });

  await client.get("/items");

  expect(fetchFn).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ credentials: "include" }),
  );
});

it("omits credentials from fetch when not set", async () => {
  const fetchFn = mockFetch(200, {});
  const client = new ApiClient({ baseUrl, fetchFn });

  await client.get("/items");

  const callOptions = fetchFn.mock.calls[0]![1]!;
  expect(callOptions).not.toHaveProperty("credentials");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api-client test`

Expected: First test fails — `credentials` not passed through. Second test should pass (it already doesn't have `credentials`).

- [ ] **Step 3: Implement credentials in ApiClient**

In `packages/api-client/src/client.ts`, add `credentials` to the interface and constructor:

```typescript
export interface ApiClientOptions {
  baseUrl: string;
  auth?: AuthStrategy;
  fetchFn?: typeof fetch;
  credentials?: RequestCredentials;
}
```

Add the field to the class:

```typescript
private readonly credentials?: RequestCredentials;
```

Set it in constructor:

```typescript
this.credentials = options.credentials;
```

Update the `request()` method's fetch call — replace the existing `this.fetchFn(url, { ... })` call:

```typescript
const init: RequestInit = {
  method,
  headers,
  body: body !== undefined ? JSON.stringify(body) : undefined,
};
if (this.credentials) {
  init.credentials = this.credentials;
}
const response = await this.fetchFn(url, init);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api-client test`

Expected: All tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/client.ts packages/api-client/src/client.test.ts
git commit -m "feat(api-client): add credentials option to ApiClient"
```

---

## Task 2: Create web API client helpers and add dependency

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/api-client.server.ts`

- [ ] **Step 1: Add `@dragons/api-client` dependency to web**

In `apps/web/package.json`, add to `dependencies`:

```json
"@dragons/api-client": "workspace:*",
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`

- [ ] **Step 3: Create server-side helper**

Create `apps/web/src/lib/api-client.server.ts`:

```typescript
import "server-only";
import { ApiClient, publicEndpoints } from "@dragons/api-client";

export function getPublicApi() {
  const baseUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001";
  const client = new ApiClient({ baseUrl });
  return publicEndpoints(client);
}
```

- [ ] **Step 4: Create client-side helper**

Create `apps/web/src/lib/api-client.ts`:

```typescript
import { ApiClient, publicEndpoints } from "@dragons/api-client";

const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  credentials: "include",
});

export const publicApi = publicEndpoints(apiClient);
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm --filter @dragons/web typecheck`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/api-client.ts apps/web/src/lib/api-client.server.ts
git commit -m "feat(web): add api-client helpers for server and client usage"
```

---

## Task 3: Migrate existing public pages to api-client

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/standings/page.tsx`
- Modify: `apps/web/src/app/[locale]/(public)/teams/page.tsx`
- Modify: `apps/web/src/app/[locale]/(public)/schedule/page.tsx`
- Modify: `apps/web/src/components/public/schedule/schedule-view.tsx`
- Modify: `apps/web/src/components/public/schedule/calendar-view.tsx`

- [ ] **Step 1: Migrate standings page**

In `apps/web/src/app/[locale]/(public)/standings/page.tsx`:

Replace the import and fetch:

```typescript
// REMOVE:
import { fetchAPI } from "@/lib/api";

// ADD:
import { getPublicApi } from "@/lib/api-client.server";
```

Replace the fetch call:

```typescript
// REMOVE:
const standings = await fetchAPI<LeagueStandings[]>(
  "/public/standings",
).catch(() => []);

// ADD:
const standings = await getPublicApi()
  .getStandings()
  .catch(() => []);
```

- [ ] **Step 2: Migrate teams page**

In `apps/web/src/app/[locale]/(public)/teams/page.tsx`:

Replace imports:

```typescript
// REMOVE:
import { fetchAPI } from "@/lib/api";

// REMOVE the local PublicTeam interface entirely

// ADD:
import { getPublicApi } from "@/lib/api-client.server";
import type { PublicTeam } from "@dragons/api-client";
```

Replace the fetch call:

```typescript
// REMOVE:
const teams = await fetchAPI<PublicTeam[]>("/public/teams").catch(() => []);

// ADD:
const teams = await getPublicApi().getTeams().catch(() => []);
```

- [ ] **Step 3: Migrate schedule server page**

In `apps/web/src/app/[locale]/(public)/schedule/page.tsx`:

Replace imports:

```typescript
// REMOVE:
import { fetchAPI } from "@/lib/api";
import type { MatchListItem } from "@dragons/shared";

// ADD:
import { getPublicApi } from "@/lib/api-client.server";
```

Replace the two fetch calls. Replace the teams fetch:

```typescript
// REMOVE:
const allTeams = await fetchAPI<PublicTeamWithClubFlag[]>(
  "/public/teams",
).catch(() => []);

// ADD:
const allTeams = await getPublicApi().getTeams().catch(() => []);
```

Replace the matches fetch. Build `MatchQueryParams` instead of `URLSearchParams`:

```typescript
// REMOVE the URLSearchParams block and fetchAPI call (lines ~30-48)

// ADD:
import type { MatchQueryParams } from "@dragons/api-client";

// Then in the function body, after teamParam and view resolution:
const matchParams: MatchQueryParams = {};
if (teamParam) {
  matchParams.teamApiId = Number(teamParam);
}

if (view === "calendar") {
  matchParams.dateFrom = toDateString(monthStart);
  matchParams.dateTo = toDateString(getMonthEnd(new Date()));
} else {
  matchParams.dateFrom = toDateString(saturday);
  matchParams.dateTo = toDateString(getSunday(saturday));
}

const matchData = await getPublicApi()
  .getMatches(matchParams)
  .catch(() => ({ items: [] }));
```

Remove the `apiBaseUrl` prop — client components will import `publicApi` directly. Remove from the `SchedulePageClient` props:

```typescript
// REMOVE this line:
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// REMOVE apiBaseUrl from the SchedulePageClient JSX props
```

- [ ] **Step 4: Migrate schedule-view client component**

In `apps/web/src/components/public/schedule/schedule-view.tsx`:

Add import for client-side api:

```typescript
import { publicApi } from "@/lib/api-client";
```

Remove `apiBaseUrl` from `ScheduleViewProps` interface and destructured props.

Replace the `fetchMatches` callback body — replace the `fetch(...)` call:

```typescript
const fetchMatches = useCallback(
  async (sat: Date, teamApiId: number | null) => {
    const sun = getSunday(sat);
    setLoading(true);
    try {
      const data = await publicApi.getMatches({
        dateFrom: toDateString(sat),
        dateTo: toDateString(sun),
        ...(teamApiId ? { teamApiId } : {}),
      });
      setMatches(data.items ?? []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  },
  [],
);
```

- [ ] **Step 5: Migrate calendar-view client component**

In `apps/web/src/components/public/schedule/calendar-view.tsx`:

Add import:

```typescript
import { publicApi } from "@/lib/api-client";
```

Remove `apiBaseUrl` from the `CalendarViewProps` interface and destructured props.

Find the `fetch(...)` call for loading matches and replace with `publicApi.getMatches(...)`. The pattern will be similar to step 4 — replace the raw fetch with:

```typescript
const data = await publicApi.getMatches({
  dateFrom: toDateString(start),
  dateTo: toDateString(end),
  ...(teamApiId ? { teamApiId } : {}),
});
```

- [ ] **Step 6: Update SchedulePageClient to remove apiBaseUrl prop**

The `SchedulePageClient` component passes `apiBaseUrl` down to `ScheduleView` and `CalendarView`. Remove this prop from the `SchedulePageClient` interface and stop passing it to children. Check `apps/web/src/components/public/schedule/schedule-page-client.tsx` for the prop definition and remove it.

- [ ] **Step 7: Verify typecheck and dev server**

Run: `pnpm --filter @dragons/web typecheck`

Then start dev server and verify all 4 public pages still load:

Run: `pnpm --filter @dragons/web dev`

Check: `/standings`, `/teams`, `/schedule`, `/` (home — will migrate in next task)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/[locale]/'(public)'/standings/page.tsx \
       apps/web/src/app/[locale]/'(public)'/teams/page.tsx \
       apps/web/src/app/[locale]/'(public)'/schedule/page.tsx \
       apps/web/src/components/public/schedule/schedule-view.tsx \
       apps/web/src/components/public/schedule/calendar-view.tsx \
       apps/web/src/components/public/schedule/schedule-page-client.tsx
git commit -m "refactor(web): migrate public pages to @dragons/api-client"
```

---

## Task 4: Add i18n keys for home enrichment and detail pages

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Add English i18n keys**

In `apps/web/src/messages/en.json`, add the following keys inside the existing `"public"` object (after the existing keys like `"instructionOutlook"`):

```json
"countdown": {
  "today": "Today",
  "tomorrow": "Tomorrow",
  "inDays": "In {count} days"
},
"stats": {
  "teams": "Teams",
  "wins": "Wins",
  "losses": "Losses",
  "winRate": "Win %"
},
"gameDetail": {
  "final": "Final",
  "quarters": "Quarters",
  "halftime": "HT",
  "overtime": "OT",
  "total": "Total",
  "headToHead": "Head to Head",
  "viewAllH2H": "View all meetings",
  "form": "Form",
  "details": "Details",
  "venue": "Venue",
  "address": "Address",
  "scorer": "Scorer",
  "timekeeper": "Timekeeper",
  "status": "Status",
  "confirmed": "Confirmed",
  "cancelled": "Cancelled",
  "forfeited": "Forfeited",
  "win": "W",
  "loss": "L",
  "record": "Record",
  "ptsFor": "Pts For",
  "ptsAgainst": "Pts Against",
  "noData": "No match data available"
},
"teamDetail": {
  "form": "Form",
  "seasonStats": "Season Stats",
  "gamesPlayed": "GP",
  "wins": "W",
  "losses": "L",
  "pointsDiff": "+/-",
  "leaguePosition": "League Position",
  "standings": "Standings",
  "recentGames": "Recent Games",
  "noTeam": "Team not found"
},
"h2h": {
  "title": "Head to Head vs {opponent}",
  "noMatches": "No matches found"
}
```

- [ ] **Step 2: Add German i18n keys**

In `apps/web/src/messages/de.json`, add inside the existing `"public"` object:

```json
"countdown": {
  "today": "Heute",
  "tomorrow": "Morgen",
  "inDays": "In {count} Tagen"
},
"stats": {
  "teams": "Teams",
  "wins": "Siege",
  "losses": "Niederl.",
  "winRate": "Quote"
},
"gameDetail": {
  "final": "Endergebnis",
  "quarters": "Viertel",
  "halftime": "HZ",
  "overtime": "VL",
  "total": "Gesamt",
  "headToHead": "Direkter Vergleich",
  "viewAllH2H": "Alle Begegnungen",
  "form": "Form",
  "details": "Details",
  "venue": "Halle",
  "address": "Adresse",
  "scorer": "Anschreiber",
  "timekeeper": "Zeitnehmer",
  "status": "Status",
  "confirmed": "Bestätigt",
  "cancelled": "Abgesagt",
  "forfeited": "Kampflos",
  "win": "S",
  "loss": "N",
  "record": "Bilanz",
  "ptsFor": "Pkt. dafür",
  "ptsAgainst": "Pkt. dagegen",
  "noData": "Keine Spieldaten verfügbar"
},
"teamDetail": {
  "form": "Form",
  "seasonStats": "Saison-Statistik",
  "gamesPlayed": "Sp",
  "wins": "S",
  "losses": "N",
  "pointsDiff": "+/-",
  "leaguePosition": "Tabellenplatz",
  "standings": "Tabelle",
  "recentGames": "Letzte Spiele",
  "noTeam": "Team nicht gefunden"
},
"h2h": {
  "title": "Direkter Vergleich vs {opponent}",
  "noMatches": "Keine Spiele gefunden"
}
```

- [ ] **Step 3: Verify i18n check**

Run: `pnpm --filter @dragons/web i18n:check`

Expected: No missing keys between en and de.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add i18n keys for home enrichment and detail pages"
```

---

## Task 5: Enrich home page with HomeDashboard endpoint

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/page.tsx`

- [ ] **Step 1: Rewrite home page**

Replace the entire content of `apps/web/src/app/[locale]/(public)/page.tsx` with:

```tsx
import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import { CalendarDays, Trophy, Users, Home } from "lucide-react";
import type { MatchListItem } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";

function getTeamName(match: MatchListItem, side: "home" | "guest") {
  if (side === "home")
    return resolveTeamName({
      customName: match.homeTeamCustomName,
      nameShort: match.homeTeamNameShort,
      name: match.homeTeamName,
    });
  return resolveTeamName({
    customName: match.guestTeamCustomName,
    nameShort: match.guestTeamNameShort,
    name: match.guestTeamName,
  });
}

function getCountdown(kickoffDate: string, t: (key: string, values?: Record<string, unknown>) => string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const game = new Date(kickoffDate + "T00:00:00");
  game.setHours(0, 0, 0, 0);
  const days = Math.round((game.getTime() - today.getTime()) / 86400000);
  if (days === 0) return t("countdown.today");
  if (days === 1) return t("countdown.tomorrow");
  return t("countdown.inDays", { count: days });
}

export default async function HomePage() {
  const t = await getTranslations("public");
  const format = await getFormatter();

  const dashboard = await getPublicApi()
    .getHomeDashboard()
    .catch(() => null);

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{t("noMatches")}</p>
      </div>
    );
  }

  const { nextGame, recentResults, upcomingGames, clubStats } = dashboard;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="flex flex-col items-center gap-2 pt-8 pb-4 text-center">
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight md:text-5xl">
          Dragons
        </h1>
        <p className="text-muted-foreground text-sm">Basketball</p>
      </section>

      {/* Next Game */}
      {nextGame && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("nextMatch")}
            </p>
            <span className="rounded-4xl bg-heat/10 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide text-heat">
              {getCountdown(nextGame.kickoffDate, t)}
            </span>
          </div>
          <Link href={`/game/${nextGame.id}`} className="block">
            <div className="rounded-md bg-card p-5 transition-colors hover:bg-surface-high">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-right">
                  <p className={`font-semibold ${nextGame.homeIsOwnClub ? "text-primary" : ""}`}>
                    {getTeamName(nextGame, "home")}
                  </p>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  {t("vs")}
                </span>
                <div className="flex-1">
                  <p className={`font-semibold ${nextGame.guestIsOwnClub ? "text-primary" : ""}`}>
                    {getTeamName(nextGame, "guest")}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-0.5 text-center">
                {nextGame.kickoffDate && (
                  <p className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(nextGame.kickoffDate + "T12:00:00"), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {nextGame.kickoffTime && ` · ${nextGame.kickoffTime.slice(0, 5)}`}
                  </p>
                )}
                {nextGame.leagueName && (
                  <p className="text-xs text-muted-foreground">{nextGame.leagueName}</p>
                )}
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  {nextGame.homeIsOwnClub && <Home className="h-3 w-3" />}
                  {nextGame.venueNameOverride ?? nextGame.venueName ?? ""}
                </p>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Recent Results */}
      {recentResults.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("recentResults")}
          </p>
          <div className="flex gap-2">
            {recentResults.slice(0, 5).map((match) => {
              const isOwnHome = match.homeIsOwnClub;
              const ownScore = isOwnHome ? match.homeScore : match.guestScore;
              const oppScore = isOwnHome ? match.guestScore : match.homeScore;
              const isWin = ownScore !== null && oppScore !== null && ownScore > oppScore;
              const opponent = getTeamName(match, isOwnHome ? "guest" : "home");
              return (
                <Link key={match.id} href={`/game/${match.id}`} className="flex-1">
                  <div className={`rounded-md bg-card p-2 text-center border-l-2 ${isWin ? "border-l-primary" : "border-l-destructive"}`}>
                    <p className="text-xs text-muted-foreground truncate">{opponent}</p>
                    <p className="font-display text-sm font-bold tabular-nums">
                      {ownScore}:{oppScore}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Club Stats */}
      <section className="rounded-md bg-surface-low p-4">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="font-display text-2xl font-bold">{clubStats.teamCount}</p>
            <p className="text-xs text-muted-foreground">{t("stats.teams")}</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-primary">{clubStats.totalWins}</p>
            <p className="text-xs text-muted-foreground">{t("stats.wins")}</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-destructive">{clubStats.totalLosses}</p>
            <p className="text-xs text-muted-foreground">{t("stats.losses")}</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold">{Math.round(clubStats.winPercentage)}%</p>
            <p className="text-xs text-muted-foreground">{t("stats.winRate")}</p>
          </div>
        </div>
      </section>

      {/* Upcoming Games */}
      {upcomingGames.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("upcomingMatches")}
          </p>
          <div className="space-y-2">
            {upcomingGames.slice(0, 3).map((match) => (
              <Link key={match.id} href={`/game/${match.id}`} className="block">
                <div className="flex items-center gap-3 rounded-md bg-card p-3 transition-colors hover:bg-surface-high">
                  <div className="w-12 text-center shrink-0">
                    <p className="font-display text-xs font-semibold text-muted-foreground">
                      {format.dateTime(new Date(match.kickoffDate + "T12:00:00"), {
                        weekday: "short",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {match.kickoffTime?.slice(0, 5)}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      <span className={match.homeIsOwnClub ? "text-primary" : ""}>
                        {getTeamName(match, "home")}
                      </span>
                      {" "}
                      <span className="text-muted-foreground">{t("vs")}</span>
                      {" "}
                      <span className={match.guestIsOwnClub ? "text-primary" : ""}>
                        {getTeamName(match, "guest")}
                      </span>
                    </p>
                    {match.leagueName && (
                      <p className="text-xs text-muted-foreground truncate">{match.leagueName}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/schedule">
          <div className="flex flex-col items-center gap-2 rounded-md bg-card p-4 transition-colors hover:bg-surface-high">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("schedule")}</p>
          </div>
        </Link>
        <Link href="/standings">
          <div className="flex flex-col items-center gap-2 rounded-md bg-card p-4 transition-colors hover:bg-surface-high">
            <Trophy className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("standings")}</p>
          </div>
        </Link>
        <Link href="/teams" className="col-span-2">
          <div className="flex flex-col items-center gap-2 rounded-md bg-card p-4 transition-colors hover:bg-surface-high">
            <Users className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("teams")}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 3: Start dev server and verify home page**

Run: `pnpm --filter @dragons/web dev`

Check the home page loads with all sections: next game with countdown badge, recent results chips, club stats strip, upcoming games, and navigation cards.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/'(public)'/page.tsx
git commit -m "feat(web): enrich home page with HomeDashboard endpoint"
```

---

## Task 6: Build game detail page

**Files:**
- Create: `apps/web/src/app/[locale]/(public)/game/[id]/page.tsx`

- [ ] **Step 1: Create game detail page**

Create `apps/web/src/app/[locale]/(public)/game/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import type { PublicMatchDetail, MatchContext, FormEntry } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";
import { cn } from "@dragons/ui/lib/utils";

function resolveName(match: PublicMatchDetail, side: "home" | "guest") {
  if (side === "home")
    return resolveTeamName({ customName: match.homeTeamCustomName, nameShort: match.homeTeamNameShort, name: match.homeTeamName });
  return resolveTeamName({ customName: match.guestTeamCustomName, nameShort: match.guestTeamNameShort, name: match.guestTeamName });
}

function FormStrip({ form, t }: { form: FormEntry[]; t: (key: string) => string }) {
  return (
    <div className="flex gap-1">
      {form.slice(0, 5).map((entry, i) => (
        <div
          key={i}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold",
            entry.result === "W"
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {entry.result === "W" ? t("gameDetail.win") : t("gameDetail.loss")}
        </div>
      ))}
    </div>
  );
}

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (!numId || numId <= 0) notFound();

  const t = await getTranslations("public");
  const format = await getFormatter();
  const api = getPublicApi();

  const [match, context] = await Promise.all([
    api.getMatch(numId).catch(() => null),
    api.getMatchContext(numId).catch(() => null),
  ]);

  if (!match) notFound();

  const homeName = resolveName(match, "home");
  const guestName = resolveName(match, "guest");
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const homeWon = hasScore && match.homeScore! > match.guestScore!;
  const guestWon = hasScore && match.guestScore! > match.homeScore!;
  const venueName = match.venueNameOverride || match.venueName;
  const addressParts = [
    match.venueStreet,
    [match.venuePostalCode, match.venueCity].filter(Boolean).join(" "),
  ].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  // Build quarter data
  const quarters: { label: string; home: number | null; guest: number | null }[] = [];
  const qPairs = [
    ["Q1", match.homeQ1, match.guestQ1],
    ["Q2", match.homeQ2, match.guestQ2],
    ["Q3", match.homeQ3, match.guestQ3],
    ["Q4", match.homeQ4, match.guestQ4],
    ["Q5", match.homeQ5, match.guestQ5],
    ["Q6", match.homeQ6, match.guestQ6],
    ["Q7", match.homeQ7, match.guestQ7],
    ["Q8", match.homeQ8, match.guestQ8],
  ] as const;
  for (const [label, home, guest] of qPairs) {
    if (home !== null || guest !== null) {
      quarters.push({ label, home, guest });
    }
  }
  if (match.homeOt1 !== null || match.guestOt1 !== null) {
    quarters.push({ label: "OT1", home: match.homeOt1, guest: match.guestOt1 });
  }
  if (match.homeOt2 !== null || match.guestOt2 !== null) {
    quarters.push({ label: "OT2", home: match.homeOt2, guest: match.guestOt2 });
  }
  const hasHalftime = match.homeHalftimeScore !== null;
  const hasQuarters = quarters.length > 0;

  // Opponent for H2H link
  const opponentApiId = match.homeIsOwnClub ? match.guestTeamApiId : match.homeTeamApiId;

  return (
    <div className="space-y-4">
      {/* Score Card */}
      <div className={cn(
        "rounded-md bg-card p-6",
        match.homeIsOwnClub && "bg-primary/5",
      )}>
        <p className="text-center text-xs text-muted-foreground mb-4">
          {format.dateTime(new Date(match.kickoffDate + "T12:00:00"), {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
          {match.kickoffTime && ` · ${match.kickoffTime.slice(0, 5)}`}
          {venueName && ` · ${venueName}`}
        </p>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <p className={cn(
              "font-display text-lg font-semibold",
              match.homeIsOwnClub ? "text-primary" : "text-muted-foreground",
            )}>
              {match.homeIsOwnClub ? homeName : match.homeTeamName}
            </p>
          </div>

          <div className="text-center px-4">
            {hasScore ? (
              <div className="flex items-center gap-2">
                <span className={cn(
                  "font-display text-4xl font-bold",
                  homeWon ? "text-foreground" : "text-muted-foreground",
                )}>
                  {match.homeScore}
                </span>
                <span className="text-muted-foreground text-lg">:</span>
                <span className={cn(
                  "font-display text-4xl font-bold",
                  guestWon ? "text-foreground" : "text-muted-foreground",
                )}>
                  {match.guestScore}
                </span>
              </div>
            ) : (
              <span className="font-display text-xl text-muted-foreground">VS</span>
            )}
          </div>

          <div className="flex-1 text-center">
            <p className={cn(
              "font-display text-lg font-semibold",
              match.guestIsOwnClub ? "text-primary" : "text-muted-foreground",
            )}>
              {match.guestIsOwnClub ? guestName : match.guestTeamName}
            </p>
          </div>
        </div>

        {hasScore && (
          <p className="mt-2 text-center font-display text-xs font-medium uppercase tracking-wider text-primary">
            {t("gameDetail.final")}
          </p>
        )}

        {/* Status badges */}
        {(match.isCancelled || match.isForfeited) && (
          <div className="mt-3 flex justify-center gap-2">
            {match.isCancelled && (
              <span className="rounded-4xl bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                {t("gameDetail.cancelled")}
              </span>
            )}
            {match.isForfeited && (
              <span className="rounded-4xl bg-heat/10 px-3 py-1 text-xs font-semibold text-heat">
                {t("gameDetail.forfeited")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quarter Table */}
      {hasQuarters && (
        <div className="overflow-x-auto rounded-md bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-low">
                <th className="px-3 py-2 text-left font-display text-xs font-medium uppercase tracking-wide text-muted-foreground" />
                {quarters.map((q) => (
                  <th key={q.label} className="px-2 py-2 text-center font-display text-xs font-medium uppercase tracking-wide text-muted-foreground w-10">
                    {q.label}
                  </th>
                ))}
                {hasHalftime && (
                  <th className="px-2 py-2 text-center font-display text-xs font-medium uppercase tracking-wide text-muted-foreground w-10">
                    {t("gameDetail.halftime")}
                  </th>
                )}
                <th className="px-2 py-2 text-center font-display text-xs font-medium uppercase tracking-wide text-muted-foreground w-12">
                  {t("gameDetail.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-surface-high">
                <td className={cn("px-3 py-2 font-medium", match.homeIsOwnClub && "text-primary")}>
                  {homeName}
                </td>
                {quarters.map((q) => (
                  <td key={q.label} className="px-2 py-2 text-center tabular-nums">{q.home ?? "-"}</td>
                ))}
                {hasHalftime && (
                  <td className="px-2 py-2 text-center tabular-nums font-medium">{match.homeHalftimeScore}</td>
                )}
                <td className="px-2 py-2 text-center tabular-nums font-bold">{match.homeScore ?? "-"}</td>
              </tr>
              <tr className="hover:bg-surface-high">
                <td className={cn("px-3 py-2 font-medium", match.guestIsOwnClub && "text-primary")}>
                  {guestName}
                </td>
                {quarters.map((q) => (
                  <td key={q.label} className="px-2 py-2 text-center tabular-nums">{q.guest ?? "-"}</td>
                ))}
                {hasHalftime && (
                  <td className="px-2 py-2 text-center tabular-nums font-medium">{match.guestHalftimeScore}</td>
                )}
                <td className="px-2 py-2 text-center tabular-nums font-bold">{match.guestScore ?? "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Head to Head */}
      {context && context.headToHead.previousMeetings.length > 0 && (
        <section className="rounded-md bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("gameDetail.headToHead")}
            </p>
            <Link
              href={`/h2h/${opponentApiId}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("gameDetail.viewAllH2H")}
            </Link>
          </div>
          <div className="flex gap-6 mb-4">
            <div className="text-center">
              <p className="font-display text-2xl font-bold">{context.headToHead.wins}</p>
              <p className="text-xs text-muted-foreground">{t("gameDetail.win")}</p>
            </div>
            <div className="text-center">
              <p className="font-display text-2xl font-bold">{context.headToHead.losses}</p>
              <p className="text-xs text-muted-foreground">{t("gameDetail.loss")}</p>
            </div>
            <div className="text-center">
              <p className="font-display text-2xl font-bold tabular-nums">{context.headToHead.pointsFor}</p>
              <p className="text-xs text-muted-foreground">{t("gameDetail.ptsFor")}</p>
            </div>
            <div className="text-center">
              <p className="font-display text-2xl font-bold tabular-nums">{context.headToHead.pointsAgainst}</p>
              <p className="text-xs text-muted-foreground">{t("gameDetail.ptsAgainst")}</p>
            </div>
          </div>
          <div className="space-y-1">
            {context.headToHead.previousMeetings.slice(0, 5).map((m) => (
              <Link key={m.matchId} href={`/game/${m.matchId}`} className="block">
                <div className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-high",
                  "border-l-2",
                  m.isWin ? "border-l-primary" : "border-l-destructive",
                )}>
                  <span className="text-xs text-muted-foreground w-20">
                    {format.dateTime(new Date(m.date + "T12:00:00"), { day: "numeric", month: "short", year: "2-digit" })}
                  </span>
                  <span className="flex-1 truncate text-xs">
                    {m.homeTeamName} vs {m.guestTeamName}
                  </span>
                  <span className="font-display text-sm font-bold tabular-nums">
                    {m.homeScore}:{m.guestScore}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Form */}
      {context && (context.homeForm.length > 0 || context.guestForm.length > 0) && (
        <section className="rounded-md bg-card p-5">
          <p className="mb-3 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("gameDetail.form")}
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={cn(
                "w-20 truncate text-sm font-semibold",
                match.homeIsOwnClub ? "text-primary" : "text-muted-foreground",
              )}>
                {match.homeIsOwnClub ? homeName : guestName}
              </span>
              <FormStrip form={match.homeIsOwnClub ? context.homeForm : context.guestForm} t={t} />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-20 truncate text-sm text-muted-foreground">
                {match.homeIsOwnClub ? guestName : homeName}
              </span>
              <FormStrip form={match.homeIsOwnClub ? context.guestForm : context.homeForm} t={t} />
            </div>
          </div>
        </section>
      )}

      {/* Details */}
      <section className="rounded-md bg-card p-5">
        <p className="mb-3 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("gameDetail.details")}
        </p>
        <dl className="space-y-2 text-sm">
          {venueName && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("gameDetail.venue")}</dt>
              <dd className="text-right">{venueName}</dd>
            </div>
          )}
          {address && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("gameDetail.address")}</dt>
              <dd className="text-right max-w-[60%]">{address}</dd>
            </div>
          )}
          {match.anschreiber && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("gameDetail.scorer")}</dt>
              <dd>{match.anschreiber}</dd>
            </div>
          )}
          {match.zeitnehmer && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("gameDetail.timekeeper")}</dt>
              <dd>{match.zeitnehmer}</dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{t("gameDetail.status")}</dt>
            <dd className="flex gap-2">
              {match.isConfirmed && (
                <span className="rounded-4xl bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {t("gameDetail.confirmed")}
                </span>
              )}
              {match.isCancelled && (
                <span className="rounded-4xl bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                  {t("gameDetail.cancelled")}
                </span>
              )}
              {match.isForfeited && (
                <span className="rounded-4xl bg-heat/10 px-3 py-1 text-xs font-semibold text-heat">
                  {t("gameDetail.forfeited")}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 3: Start dev server and verify**

Run: `pnpm --filter @dragons/web dev`

Navigate to `/game/1` (use a valid match ID from the database). Verify: score card, quarter table, H2H section, form strips, details section all render.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/'(public)'/game/
git commit -m "feat(web): add game detail page"
```

---

## Task 7: Build team detail page

**Files:**
- Create: `apps/web/src/app/[locale]/(public)/team/[id]/page.tsx`

- [ ] **Step 1: Create team detail page**

Create `apps/web/src/app/[locale]/(public)/team/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import type { MatchListItem, LeagueStandings, StandingItem, FormEntry } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";
import { cn } from "@dragons/ui/lib/utils";

function FormStrip({ form, t }: { form: FormEntry[]; t: (key: string) => string }) {
  return (
    <div className="flex gap-1">
      {form.slice(0, 5).map((entry, i) => (
        <div
          key={i}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold",
            entry.result === "W"
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {entry.result === "W" ? t("gameDetail.win") : t("gameDetail.loss")}
        </div>
      ))}
    </div>
  );
}

function getMatchTeamName(match: MatchListItem, side: "home" | "guest") {
  if (side === "home")
    return resolveTeamName({ customName: match.homeTeamCustomName, nameShort: match.homeTeamNameShort, name: match.homeTeamName });
  return resolveTeamName({ customName: match.guestTeamCustomName, nameShort: match.guestTeamNameShort, name: match.guestTeamName });
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (!numId || numId <= 0) notFound();

  const t = await getTranslations("public");
  const format = await getFormatter();
  const api = getPublicApi();

  // Step 1: fetch teams to resolve apiTeamPermanentId
  const teams = await api.getTeams().catch(() => []);
  const team = teams.find((t) => t.id === numId);
  if (!team) notFound();

  const teamDisplayName = team.customName ?? team.nameShort ?? team.name;

  // Step 2: parallel fetches
  const [stats, matchesData, standings] = await Promise.all([
    api.getTeamStats(team.id).catch(() => null),
    api.getMatches({ teamApiId: team.apiTeamPermanentId, limit: 100, sort: "asc" }).catch(() => ({ items: [] })),
    api.getStandings().catch(() => []),
  ]);

  const allMatches = matchesData.items ?? [];
  const pastMatches = allMatches.filter((m) => m.homeScore !== null && m.guestScore !== null);
  const recentGames = [...pastMatches].reverse().slice(0, 10);

  // Find league standings for this team
  let leagueStandings: LeagueStandings | null = null;
  for (const league of standings) {
    for (const standing of league.standings) {
      if (
        standing.teamName.includes(team.name) ||
        (team.nameShort && standing.teamName.includes(team.nameShort))
      ) {
        leagueStandings = league;
        break;
      }
    }
    if (leagueStandings) break;
  }

  return (
    <div className="space-y-4">
      {/* Team Header */}
      <section className="rounded-md bg-card p-6">
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight">
          {teamDisplayName}
        </h1>
        {stats && stats.leagueName && (
          <p className="text-sm text-muted-foreground mt-1">{stats.leagueName}</p>
        )}
      </section>

      {/* Form Strip */}
      {stats && stats.form.length > 0 && (
        <section className="rounded-md bg-card p-5">
          <p className="mb-3 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("teamDetail.form")}
          </p>
          <FormStrip form={stats.form} t={t} />
        </section>
      )}

      {/* Season Stats */}
      {stats && (
        <section className="rounded-md bg-surface-low p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("teamDetail.seasonStats")}
            </p>
            {stats.position !== null && (
              <span className="rounded-4xl bg-primary/10 px-3 py-1 font-display text-sm font-bold text-primary">
                #{stats.position}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="font-display text-2xl font-bold">{stats.played}</p>
              <p className="text-xs text-muted-foreground">{t("teamDetail.gamesPlayed")}</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-primary">{stats.wins}</p>
              <p className="text-xs text-muted-foreground">{t("teamDetail.wins")}</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-destructive">{stats.losses}</p>
              <p className="text-xs text-muted-foreground">{t("teamDetail.losses")}</p>
            </div>
            <div>
              <p className={cn(
                "font-display text-2xl font-bold",
                stats.pointsDiff > 0 ? "text-primary" : stats.pointsDiff < 0 ? "text-destructive" : "",
              )}>
                {stats.pointsDiff > 0 ? `+${stats.pointsDiff}` : stats.pointsDiff}
              </p>
              <p className="text-xs text-muted-foreground">{t("teamDetail.pointsDiff")}</p>
            </div>
          </div>
        </section>
      )}

      {/* League Standings */}
      {leagueStandings && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("teamDetail.standings")} — {leagueStandings.leagueName}
          </p>
          <div className="overflow-x-auto rounded-md bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-low">
                  <th className="px-3 py-2 text-left font-display text-xs font-medium uppercase tracking-wide text-muted-foreground w-8">#</th>
                  <th className="px-3 py-2 text-left font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">Team</th>
                  <th className="px-2 py-2 text-center font-display text-xs font-medium uppercase tracking-wide text-muted-foreground w-12">W-L</th>
                  <th className="px-2 py-2 text-center font-display text-xs font-medium uppercase tracking-wide text-muted-foreground w-12">
                    {t("teamDetail.pointsDiff")}
                  </th>
                  <th className="px-2 py-2 text-center font-display text-xs font-medium uppercase tracking-wide text-muted-foreground w-10">Pts</th>
                </tr>
              </thead>
              <tbody>
                {leagueStandings.standings.map((row) => {
                  const isCurrentTeam = row.teamName.includes(team.name) ||
                    (team.nameShort && row.teamName.includes(team.nameShort));
                  return (
                    <tr key={row.position} className={cn(
                      "hover:bg-surface-high",
                      isCurrentTeam && "border-l-2 border-l-primary/50 bg-primary/5",
                    )}>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{row.position}</td>
                      <td className={cn("px-3 py-2.5 font-medium", isCurrentTeam && "text-primary font-semibold")}>
                        {row.teamNameShort ?? row.teamName}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{row.won}-{row.lost}</td>
                      <td className={cn(
                        "px-2 py-2.5 text-center tabular-nums",
                        row.pointsDiff > 0 ? "text-primary" : row.pointsDiff < 0 ? "text-destructive" : "",
                      )}>
                        {row.pointsDiff > 0 ? `+${row.pointsDiff}` : row.pointsDiff}
                      </td>
                      <td className="px-2 py-2.5 text-center font-semibold tabular-nums">{row.leaguePoints}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent Games */}
      {recentGames.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("teamDetail.recentGames")}
          </p>
          <div className="space-y-2">
            {recentGames.map((match) => {
              const isOwnHome = match.homeTeamApiId === team.apiTeamPermanentId;
              const ownScore = isOwnHome ? match.homeScore : match.guestScore;
              const oppScore = isOwnHome ? match.guestScore : match.homeScore;
              const isWin = ownScore !== null && oppScore !== null && ownScore > oppScore;
              return (
                <Link key={match.id} href={`/game/${match.id}`} className="block">
                  <div className={cn(
                    "flex items-center gap-3 rounded-md bg-card p-3 transition-colors hover:bg-surface-high border-l-2",
                    isWin ? "border-l-primary" : "border-l-destructive",
                  )}>
                    <div className="w-14 text-center shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {format.dateTime(new Date(match.kickoffDate + "T12:00:00"), {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getMatchTeamName(match, "home")} vs {getMatchTeamName(match, "guest")}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <span className="font-display text-sm font-bold tabular-nums">
                        {match.homeScore}:{match.guestScore}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 3: Start dev server and verify**

Run: `pnpm --filter @dragons/web dev`

Navigate to `/team/1` (use a valid team ID). Verify: header, form strip, season stats, standings table, recent games all render.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/'(public)'/team/
git commit -m "feat(web): add team detail page"
```

---

## Task 8: Build H2H page

**Files:**
- Create: `apps/web/src/app/[locale]/(public)/h2h/[teamApiId]/page.tsx`

- [ ] **Step 1: Create H2H page**

Create `apps/web/src/app/[locale]/(public)/h2h/[teamApiId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import type { MatchListItem } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";
import { cn } from "@dragons/ui/lib/utils";

function getMatchTeamName(match: MatchListItem, side: "home" | "guest") {
  if (side === "home")
    return resolveTeamName({ customName: match.homeTeamCustomName, nameShort: match.homeTeamNameShort, name: match.homeTeamName });
  return resolveTeamName({ customName: match.guestTeamCustomName, nameShort: match.guestTeamNameShort, name: match.guestTeamName });
}

export default async function H2HPage({
  params,
}: {
  params: Promise<{ teamApiId: string }>;
}) {
  const { teamApiId } = await params;
  const numId = Number(teamApiId);
  if (!numId || numId <= 0) notFound();

  const t = await getTranslations("public");
  const format = await getFormatter();
  const api = getPublicApi();

  const matchesData = await api
    .getMatches({ opponentApiId: numId, limit: 100, sort: "desc" })
    .catch(() => ({ items: [] }));

  const matches = matchesData.items ?? [];

  // Derive opponent name from first match
  let opponentName = "";
  if (matches.length > 0) {
    const first = matches[0]!;
    if (first.homeIsOwnClub) {
      opponentName = getMatchTeamName(first, "guest");
    } else {
      opponentName = getMatchTeamName(first, "home");
    }
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{t("h2h.noMatches")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold uppercase tracking-tight">
        {t("h2h.title", { opponent: opponentName })}
      </h1>

      <div className="space-y-2">
        {matches.map((match) => {
          const hasScore = match.homeScore !== null && match.guestScore !== null;
          const isOwnHome = match.homeIsOwnClub;
          const ownScore = isOwnHome ? match.homeScore : match.guestScore;
          const oppScore = isOwnHome ? match.guestScore : match.homeScore;
          const isWin = hasScore && ownScore! > oppScore!;

          return (
            <Link key={match.id} href={`/game/${match.id}`} className="block">
              <div className={cn(
                "flex items-center gap-3 rounded-md bg-card p-3 transition-colors hover:bg-surface-high",
                hasScore && "border-l-2",
                hasScore && (isWin ? "border-l-primary" : "border-l-destructive"),
              )}>
                <div className="w-20 shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(match.kickoffDate + "T12:00:00"), {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <span className={match.homeIsOwnClub ? "text-primary" : ""}>
                      {getMatchTeamName(match, "home")}
                    </span>
                    {" "}
                    <span className="text-muted-foreground">{t("vs")}</span>
                    {" "}
                    <span className={match.guestIsOwnClub ? "text-primary" : ""}>
                      {getMatchTeamName(match, "guest")}
                    </span>
                  </p>
                </div>
                <div className="shrink-0">
                  {hasScore ? (
                    <span className="font-display text-sm font-bold tabular-nums">
                      {match.homeScore}:{match.guestScore}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("vs")}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`

- [ ] **Step 3: Start dev server and verify**

Run: `pnpm --filter @dragons/web dev`

Navigate to a H2H page from a game detail (click "View all meetings" in the H2H section). Verify the match list renders with dates, teams, scores, and win/loss indicators.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/'(public)'/h2h/
git commit -m "feat(web): add head-to-head page"
```

---

## Task 9: Add entity cross-linking to existing pages

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/standings/page.tsx`
- Modify: `apps/web/src/app/[locale]/(public)/teams/page.tsx`
- Modify: `apps/web/src/components/public/schedule/match-card.tsx`

- [ ] **Step 1: Add team links to standings page**

In `apps/web/src/app/[locale]/(public)/standings/page.tsx`, the `StandingsRow` component currently renders team names as plain text. We need to check if there's a way to link to team detail. Since `StandingItem` doesn't have a `teamId`, we can't directly link. Skip team links in standings for now — the data model would need to include team IDs in standings first.

Instead, focus on match card links. Check if the schedule's `MatchCard` component already links somewhere.

- [ ] **Step 2: Check and update schedule match card**

Read `apps/web/src/components/public/schedule/match-card.tsx` to check if it already links to game detail. If it renders a plain `<div>`, wrap it in a `<Link href={/game/${match.id}}>`. If it already uses a link or `onClick`, update the target.

In the `MatchCard` component, ensure the outer element is wrapped with:

```tsx
import { Link } from "@/lib/navigation";

// Wrap the card:
<Link href={`/game/${match.id}`} className="block">
  {/* existing card content */}
</Link>
```

- [ ] **Step 3: Add team links to teams page**

In `apps/web/src/app/[locale]/(public)/teams/page.tsx`, wrap own-club team cards with links to team detail. The `PublicTeam` type from `@dragons/api-client` has an `id` field:

```tsx
import { Link } from "@/lib/navigation";

// For own-club teams, wrap with link:
<Link key={team.id} href={`/team/${team.id}`}>
  <div className="rounded-md bg-primary/5 p-4 transition-colors hover:bg-surface-high border-l-2 border-l-primary/50">
    {/* existing content */}
  </div>
</Link>
```

Update styling: replace `rounded-xl border-2 border-mint-shade/30 bg-mint-tint/5` with design-system-compliant `rounded-md bg-primary/5 border-l-2 border-l-primary/50`.

- [ ] **Step 4: Verify typecheck and dev server**

Run: `pnpm --filter @dragons/web typecheck`

Start dev server and verify:
- Schedule match cards link to `/game/[id]`
- Own-club team cards link to `/team/[id]`
- All links navigate correctly

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/'(public)'/teams/page.tsx \
       apps/web/src/components/public/schedule/match-card.tsx
git commit -m "feat(web): add cross-linking between public pages"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run typecheck across entire monorepo**

Run: `pnpm typecheck`

Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: No errors.

- [ ] **Step 3: Run API client tests**

Run: `pnpm --filter @dragons/api-client test`

Expected: All tests pass including the new credentials tests.

- [ ] **Step 4: Run AI slop check**

Run: `pnpm check:ai-slop`

Expected: No violations.

- [ ] **Step 5: Start dev server and smoke test all pages**

Run: `pnpm dev`

Verify these pages load without errors:
- Home (`/`) — countdown badge, recent results, stats, upcoming games
- Schedule (`/schedule`) — matches load, match cards link to game detail
- Standings (`/standings`) — tables render
- Teams (`/teams`) — own-club teams link to team detail
- Game Detail (`/game/[id]`) — score card, quarters, H2H, form, details
- Team Detail (`/team/[id]`) — header, stats, standings, recent games
- H2H (`/h2h/[teamApiId]`) — match list with scores and links

- [ ] **Step 6: Commit any remaining fixes**

If any fixes were needed during verification, commit them with an appropriate message.
