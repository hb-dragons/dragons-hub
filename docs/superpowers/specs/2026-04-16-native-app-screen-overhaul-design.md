# Native App Screen Overhaul — Design Spec

**Goal:** Redesign all native app screens for a polished public-facing experience with distinct team identity, derived match statistics, and smooth navigation flow between teams, games, and standings.

**Architecture:** Server-side computed stats via new API endpoints. Native app stays a thin rendering layer. Shared `team-colors.ts` color presets drive team identity across all screens. All text i18n'd (de/en).

**Tech Stack:** Expo SDK 55, React Native, SWR for data fetching, existing Dragon's Lair design tokens, Hono API with Drizzle ORM for new endpoints.

---

## 1. Match Card Component

The match card is the most-used component — appears on home, schedule, team detail, and as compact rows. Two variants: **full** (schedule list, team detail last/next game) and **compact** (home upcoming list, team detail all-games list).

### Full Match Card

```
┌─────────────────────────────────────────────┐
│ Sa, 12.04. • 19:30 • Sporthalle Misburg  [S]│
│                                              │
│ Dragons Herren 1                          78 │
│ TSV Hannover                              65 │
└──────────────────────────────────────────────┘
```

**Layout rules:**
- Header row: date (abbreviated weekday + DD.MM.), time, venue name on the left. Result badge on the right.
- Team rows: team name left-aligned, score right-aligned. One row per team (home team first, guest second).
- No footer. No league/matchday line.
- No dots or icons next to team names.

**Home game indicator:**
- Home game: card background = `primary` at 12% opacity (dark: `rgba(0,75,35,0.12)`, light: `rgba(0,75,35,0.06)`).
- Away game: card background = `surfaceLowest` (neutral).
- No left border on match cards.

**Own-club team name:**
- Rendered in the team's `badgeColor` from the color presets (e.g., Herren 1 = blue → `#93bbfc` dark, `#2563eb` light).
- Font weight: 600 (semiBold).
- Opponent team name: `mutedForeground`, regular weight.

**Score styling:**
- Winner score: `foreground` color, font weight 700.
- Loser score: `mutedForeground` (e.g., `#555` dark), font weight 400.
- No score yet: em dash `—`, muted, smaller font size.

**Result badge:**
- Win: green tint background, green text. `S` (de) / `W` (en).
- Loss: red tint background, red text. `N` (de) / `L` (en).
- Upcoming: heat tint background, heat text. `Anst.` (de) / `Up` (en).
- Cancelled: red tint, `Abg.` (de) / `Canc.` (en). Card at reduced opacity (0.7), team names with strikethrough.
- Forfeited: heat tint, `Wert.` (de) / `Forf.` (en).
- All badges: pill shape, uppercase, label font style, letter-spacing 0.5.

**Team name resolution:** `customName > nameShort > name` (same as current).

**Badge color resolution:** Use `getColorPreset(badgeColor, teamName)` from `@dragons/shared`. For native, map the preset's `dot` hex value to a light/dark mode tint. Opponent teams get no color treatment regardless of whether they have a `badgeColor`.

### Compact Match Row

Used in home screen upcoming list and team detail all-games list.

```
┌──────────────────────────────────────────┐
│ DRA vs TSV Hannover     Sa, 12.04. 19:30 │
│                                    78:65 [S]│
└──────────────────────────────────────────┘
```

- Single card, smaller padding.
- Team abbreviation for own-club (bold, badge-colored), full name for opponent.
- `vs` for home games, `@` for away games.
- Score + result badge on the right side.
- Same home-game background tint rule applies.

---

## 2. Home Screen

Sections in scroll order:

### 2a. Header
Unchanged: "HANOVER DRAGONS" title + avatar button.

### 2b. Next Game Hero
- Large centered layout: own-club team name (badge-colored) left, "VS" center, opponent name right.
- "Nächstes Spiel" / "Next Game" label badge (heat variant) top-left.
- Countdown text top-right: "In 3 Tagen" / "In 3 days", or "Heute" / "Today", or "Morgen" / "Tomorrow".
- Date, time, venue centered below the VS layout, separated by a subtle divider.
- Home-game background tint applies.
- Tappable → game detail.

### 2c. Recent Results Strip
- Section label: "Letzte Ergebnisse" / "Recent Results".
- Horizontal row of 5 compact result chips (equal width, flex: 1).
- Each chip: team abbreviation (top, muted small text), our score (winner styling), opponent score (loser styling), S/N badge at bottom.
- Tappable → game detail for that match.
- Data source: last 5 completed matches across all own-club teams, sorted by date descending.

### 2d. Quick Stats
- Horizontal stat strip: Teams count, Siege/Wins (green), Niederlagen/Losses (red), Siegquote/Win % (neutral).
- Aggregated across all own-club teams for the current season.
- Background: `surfaceLow`.

### 2e. Upcoming Games
- Section label: "Kommende Spiele" / "Upcoming Games".
- 3 compact match rows showing the next 3 matches across all teams.
- Each row: own-club abbreviation (badge-colored) + vs/@ + opponent + date/time right-aligned.
- Home-game background tint applies.
- Tappable → game detail.

### Removed from current home screen
- Navigation shortcut cards (Schedule, Standings) — tab bar handles this.
- "Last Result" as a separate large card — replaced by the results strip.

---

## 3. Game Detail Screen

Single scroll, no tabs or segmented controls.

### 3a. Score Header
- Date, time, venue as muted text centered at top.
- Teams centered: own-club name (badge-colored, semiBold) left, opponent (neutral) right.
- Large score between them: winner bold/bright, loser muted. Colon separator.
- "Endstand" / "Final" label below score (primary color, small caps).
- "Heim" / "Home" badge on the home team side (if own-club is home).
- For upcoming games: "VS" in place of score, no Endstand label.

### 3b. Quarter Breakdown
- Section label: "Viertel" / "Quarters".
- Table with columns: team abbreviation, Q1, Q2, Q3, Q4, HZ (halftime), Ges (total).
- Own-club row: badge-colored abbreviation, semiBold.
- Per-cell winner highlighting: the team that won that quarter gets bold/bright score, loser gets muted.
- Halftime column: computed as Q1+Q2, muted styling.
- Total column: same winner/loser styling as the main score.
- Supports Q1-Q8 format (achtel) and OT1/OT2 columns when present.
- Only shown for completed games with quarter data.

### 3c. Head-to-Head
- Section label: "Bilanz vs {opponent}" / "Record vs {opponent}".
- Stat row: Siege/Wins (green), Niederlagen/Losses (neutral), Punkte für/Points for, Punkte gegen/Points against.
- Previous meetings list: date, home team, score (winner bold), away team, S/N badge. Most recent first. Max 5 entries.
- Each meeting row tappable → that game's detail.
- Data source: new API endpoint, computed server-side from all historical matches between these two teams (across all seasons).

### 3d. Form (Last 5)
- Section label: "Form (letzte 5)" / "Form (last 5)".
- Two rows: own-club and opponent.
- Each row: team abbreviation (badge-colored for own-club), then 5 squares showing S/N with green/red tinted background.
- Most recent result on the left.

### 3e. Details
- Section label: "Details".
- Key-value rows: Halle/Venue, Adresse/Address, divider, Anschreiber/Scorer, Zeitnehmer/Timekeeper, divider, Status badge (Bestätigt/Confirmed, Abgesagt/Cancelled, etc.).
- Only show officials if they exist (not null).

---

## 4. Team Detail Dashboard

Single scroll.

### 4a. Team Header
- Team name in badge color, large (screenTitle style but not uppercase).
- League name below in muted text.

### 4b. Form + Position Row
- Left: form strip (last 5 results as S/N squares, same style as game detail).
- Right: large position number (e.g., "#2") with "Platz" / "Pos" label below.

### 4c. Last Game
- Section label: "Letztes Spiel" / "Last Game".
- Full match card. Tappable → game detail.

### 4d. Next Game
- Section label: "Nächstes Spiel" / "Next Game".
- Full match card with countdown badge ("In 14 T." / "In 14 d."). Tappable → game detail.

### 4e. Season Stats
- Stat strip: Spiele/Games, Siege/Wins (green), Niederlagen/Losses (red), Diff (point differential, color-coded: positive green, negative red).
- Computed for this team's current season only.

### 4f. Standings
- Section label: "Tabelle — {league name}" / "Standings — {league name}".
- Full league table embedded in the team detail.
- Columns: #, Team, Sp (played), S (wins), N (losses), Diff (color-coded), Pkt (points, bold).
- Own-club row: primary tint background (5% opacity) + 2px left border (primary 50% opacity). Team name in badge color, bold. Stat values brighter.
- Other rows: neutral styling. Tappable → shows our H2H match history against that opponent (navigate to a filtered match list or inline expansion).

### 4g. All Games
- Section label: "Alle Spiele" / "All Games".
- Compact match rows for all games this season, chronological.
- Past games show scores + S/N badge. Future games show "Anst." badge.
- The most recently played game gets a subtle outline (primary at 30% opacity) to mark where "now" is in the timeline.

---

## 5. Standings Tab

### Layout
- Screen title: "Tabellen" / "Standings".
- Each tracked league rendered as a separate card.
- Card header: league name (bold) + season (muted).
- Table columns: # (position), Team, Sp (played), S (wins), N (losses), Diff (color-coded), Pkt (points, bold).

### Styling
- Own-club row: primary tint background (5% opacity) + 2px left border (primary 50% opacity). Team name in that team's badge color, semiBold. All stat values use `foreground` instead of `mutedForeground`.
- Other rows: neutral. Position and team name in `mutedForeground`, stats in lighter muted.
- Positive diff: green. Negative diff: red. Zero: neutral.
- Header row: smallest text, uppercase, muted.

### Interactions
- Tap own-club row → navigate to team detail dashboard.
- Tap opponent row → navigate to filtered match list showing all our games against that team (H2H view).

---

## 6. Schedule Tab

### Changes from current
- Match cards updated to the new design (no dots, no left border, badge-colored names, winner/loser score styling, home-game tint).
- Filter pills unchanged: All Games, Home Only, Away.
- Section grouping by date unchanged.
- Pagination unchanged (load more).

---

## 7. Teams Tab

### Changes from current
- Team cards keep the current grid layout (featured hero + 2-column grid).
- Team name displayed in badge color instead of neutral.
- Senior/youth section split unchanged.

---

## 8. New API Endpoints

### Existing endpoint update: `GET /public/matches`

Add new optional query parameter `opponentApiId` (number). When provided, returns only matches where the opponent team's `homeTeamApiId` or `guestTeamApiId` matches this value (and the other side is own-club). Used for the H2H match list screen.

### `GET /public/matches/:id`

Returns a single match with full detail including quarter scores.

**Response shape:**
```typescript
interface MatchDetail {
  // All fields from MatchListItem
  ...MatchListItem;
  // Quarter scores
  homeQ1: number | null;
  homeQ2: number | null;
  homeQ3: number | null;
  homeQ4: number | null;
  homeQ5: number | null;
  homeQ6: number | null;
  homeQ7: number | null;
  homeQ8: number | null;
  homeOt1: number | null;
  homeOt2: number | null;
  guestQ1: number | null;
  guestQ2: number | null;
  guestQ3: number | null;
  guestQ4: number | null;
  guestQ5: number | null;
  guestQ6: number | null;
  guestQ7: number | null;
  guestQ8: number | null;
  guestOt1: number | null;
  guestOt2: number | null;
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  // Officials
  anschreiber: string | null;
  zeitnehmer: string | null;
  shotclock: string | null;
  // Period format
  periodFormat: "quarters" | "achtel";
}
```

### `GET /public/matches/:id/context`

Returns derived statistics for a match: head-to-head record and form for both teams.

**Response shape:**
```typescript
interface MatchContext {
  headToHead: {
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    previousMeetings: Array<{
      matchId: number;
      date: string;
      homeTeamName: string;
      guestTeamName: string;
      homeScore: number;
      guestScore: number;
      isWin: boolean;
      homeIsOwnClub: boolean;
    }>;
  };
  homeForm: Array<{ result: "W" | "L"; matchId: number }>;
  guestForm: Array<{ result: "W" | "L"; matchId: number }>;
}
```

**Computation:** Query all matches where both teams have played each other (match on `homeTeamApiId`/`guestTeamApiId` pairs). Form is last 5 completed matches for each team independently (not just H2H).

### `GET /public/teams/:id/stats`

Returns computed season stats for a team.

**Response shape:**
```typescript
interface TeamStats {
  teamId: number;
  leagueName: string;
  position: number | null;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  form: Array<{ result: "W" | "L"; matchId: number }>;
}
```

**Computation:** Derive from standings table (position, W/L, points) plus match history (form). Single query joining standings + recent matches.

### `GET /public/home/dashboard`

Returns aggregated home screen data in a single request.

**Response shape:**
```typescript
interface HomeDashboard {
  nextGame: MatchListItem | null;
  recentResults: Array<MatchListItem>; // last 5 completed, all teams
  upcomingGames: Array<MatchListItem>; // next 3, all teams
  clubStats: {
    teamCount: number;
    totalWins: number;
    totalLosses: number;
    winPercentage: number;
  };
}
```

**Why a single endpoint:** The home screen currently makes 3 separate API calls. Consolidating into one reduces latency on mobile networks and simplifies the client code.

---

## 9. Shared Native Color Utilities

### `getNativeTeamColor(badgeColor, teamName, isDark)`

Utility function that maps a team's `badgeColor` preset to native-appropriate hex values for light/dark mode.

**Input:** `badgeColor` (string | null), `teamName` (string), `isDark` (boolean).

**Output:** `{ name: string; muted: string }` — `name` is for the team name text, `muted` is a more subtle variant.

**Logic:** Use `getColorPreset()` from `@dragons/shared` to get the preset, then return the `dot` hex for dark mode (already bright enough) or derive a darker variant for light mode. Only applied to own-club teams. Opponent teams always get `mutedForeground`.

---

## 10. i18n Additions

All new UI text needs de/en translations. Key additions:

**Result badges:** `match.win`, `match.loss`, `match.upcoming`, `match.cancelled`, `match.forfeited`.

**Home screen:** `home.nextGame`, `home.recentResults`, `home.upcomingGames`, `home.stats.teams`, `home.stats.wins`, `home.stats.losses`, `home.stats.winRate`, `home.countdown.today`, `home.countdown.tomorrow`, `home.countdown.inDays`.

**Game detail:** `game.final`, `game.quarters`, `game.halftime`, `game.total`, `game.record`, `game.form`, `game.details`, `game.venue`, `game.address`, `game.scorer`, `game.timekeeper`, `game.status`, `game.confirmed`, `game.previousMeetings`, `game.pointsFor`, `game.pointsAgainst`.

**Team detail:** `team.lastGame`, `team.nextGame`, `team.season`, `team.games`, `team.wins`, `team.losses`, `team.diff`, `team.position`, `team.standings`, `team.allGames`.

**Standings:** `standings.title`, `standings.played`, `standings.wins`, `standings.losses`, `standings.diff`, `standings.points`.

---

## 11. Design Consistency Rules

These rules apply across all screens:

1. **No dots or icons** next to team names. Team identity is conveyed through badge-colored text only.
2. **Home game = tinted background** (`primary` at 12% opacity dark, 6% light). Away game = neutral `surfaceLowest`.
3. **Winner score = bold + bright** (`foreground`, weight 700). Loser score = muted (`mutedForeground`, weight 400).
4. **Own-club team name = badge color + semiBold.** Opponent = `mutedForeground` + regular weight.
5. **Left border (2px, primary at 50% opacity)** is used ONLY for own-club row highlighting in standings tables.
6. **All badge/label text** goes through i18n (de/en).
7. **Tappable elements** use Pressable with opacity 0.85 on press.
8. **Cards** use `surfaceLowest` background, `radius.md` (4px), `spacing.lg` (16px) padding.
9. **Section labels** use label text style: 11px, uppercase, letter-spacing 0.5, `mutedForeground`.
10. **Stat values** use stat text style (22-24px, display font, bold).

---

## 12. Navigation Map

```
/ (root)
├── (tabs)
│   ├── index (Home)
│   │   ├── tap next game hero → /game/[id]
│   │   ├── tap result chip → /game/[id]
│   │   └── tap upcoming row → /game/[id]
│   ├── schedule
│   │   └── tap match card → /game/[id]
│   ├── standings
│   │   ├── tap own-club row → /team/[id]
│   │   └── tap opponent row → /h2h/[teamApiId] (filtered match list)
│   └── teams
│       └── tap team card → /team/[id]
├── game/[id] (match detail)
│   └── tap previous meeting → /game/[id] (different match)
├── team/[id] (team dashboard)
│   ├── tap last/next game → /game/[id]
│   ├── tap all-games row → /game/[id]
│   ├── tap own-club standings row → (already on this screen)
│   └── tap opponent standings row → /h2h/[teamApiId]
├── h2h/[teamApiId] (head-to-head match list)
│   └── tap match → /game/[id]
└── (existing: profile, auth)
```

### New Screen: H2H Match List (`/h2h/[teamApiId]`)

Simple screen showing all our matches against a specific opponent. Reuses match card component. Header shows opponent name.

**Data source:** New query parameter `opponentApiId` on `GET /public/matches`. The API filters matches where the opponent's `homeTeamApiId` or `guestTeamApiId` matches the given ID and at least one side is own-club. This is a new filter on the existing endpoint, not a separate endpoint.

---

## 13. API Client Updates

Add to `@dragons/api-client`:

```typescript
// In endpoints/public.ts
getMatch(id: number): Promise<MatchDetail>
getMatchContext(id: number): Promise<MatchContext>
getTeamStats(id: number): Promise<TeamStats>
getHomeDashboard(): Promise<HomeDashboard>
```

---

## 14. Scope Boundaries

**In scope:**
- All screen redesigns described above
- 4 new API endpoints with server-side stat computation
- Match card component rewrite
- Updated i18n files
- Native team color utility
- H2H screen
- API client updates

**Out of scope:**
- Admin screens (Phase 2)
- Push notification content changes
- Offline support
- Player-level statistics
- Calendar view
- Search functionality
