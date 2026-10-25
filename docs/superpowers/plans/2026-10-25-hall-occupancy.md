# Hall Occupancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stored venue bookings with hall occupancy derived at read time from home games, hall times and the buffer settings; make the alternative-date finder consider every one of our halls.

**Architecture:** Pure calculation (programme window, coverage, fit) in `apps/api/src/services/hall-times/hall-occupancy.ts`; one read service (`hall-occupancy.service.ts`) loads home games plus hall times and is the only producer of coverage for the list, the match DTOs and the finder. The booking subsystem is removed last, after nothing reads it.

**Tech Stack:** Hono, Drizzle (PGlite in tests), zod contracts in `@dragons/contracts`, Next.js + next-intl, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-25-hall-occupancy-design.md`

## Global Constraints

- New API tests run against PGlite via `setupTestDb` / `resetTestDb` / `closeTestDb`; never mock `drizzle-orm` or `@dragons/db/schema`.
- Coverage thresholds in each `vitest.config.ts` hold; never lower one.
- Request schemas live only in `packages/contracts/src/<group>.ts`, re-exported by name; api-client infers from them; add a `*.contract.test.ts` case for every new client call.
- Dates and times through `@dragons/shared` kickoff helpers; any test touching them forces a non-Berlin `TZ`.
- Every AGENTS.md table/endpoint/event/execution-flow change lands in the same commit as the code (`docs-drift.test.ts`).
- No banned prose words (`pnpm check:ai-slop`); no AI trailers on commits.
- Our halls = venues with at least one `venue_hall_times` row. Home game = live (`isCancelled = false`, `isForfeited = false`) and home team `isOwnClub`.
- The `booking` RBAC resource, the `/admin/bookings` web path and the `bookings` nav id keep their names.

## Review Focus

1. A retired `booking.*` row already in `domain_events` must still list in the event browser and its type filter must not 400. Test in Task 8.
2. A stored watch rule whose `eventTypes` names a retired `booking.*` type must still load and save on the watch-rules screen. Test in Task 8.
3. A day whose programme runs past midnight: `programmeWindow` clamps to `23:59:59`, and no kickoff is ever suggested past `23:59` minus duration. Test in Task 2.
4. A game whose own kickoff override moves it to another day must count on the new day, not the official one (no ghost entry counts). Test in Task 3.
5. The game being moved must not block its own slot in the finder (excluded from the games of its current hall). Test in Task 5.

---

### Task 1: Shared types — `none` coverage and occupancy shapes

**Files:**
- Modify: `packages/shared/src/hall-times.ts`, `packages/shared/src/hall-times/coverage.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/hall-occupancy.ts`
- Test: `packages/shared/src/hall-times/coverage.test.ts`

**Interfaces:**
- Produces:
  - `HallTimeCoverage = "covered" | "partial" | "uncovered" | "closed" | "none"`; `HALL_TIME_COVERAGES` const array of the same five, in that order (used by the list filter contract).
  - `coverageFor(window, null)` returns `{ status: "none", gapBeforeMinutes: 0, gapAfterMinutes: 0 }`; `hallTimeCoverage(undefined | null)` returns `"none"`.
  - `HallCoverageInfo { hallTime: HallTimeWindow | null; coverage: HallTimeCoverage; gapBeforeMinutes: number; gapAfterMinutes: number }` (replaces `BookingHallTime`; `BookingHallTime` stays exported as a deprecated alias until Task 8 deletes it).
  - In `hall-occupancy.ts`:
    - `HallOccupancyGame { matchId: number; kickoffTime: string; endTime: string; homeTeam: string; homeTeamCustomName: string | null; homeBadgeColor: string | null; guestTeam: string; leagueName: string | null }` (times `HH:mm:ss`).
    - `HallOccupancyDay extends HallCoverageInfo { venueId: number; venueName: string; date: string; windowStart: string; windowEnd: string; games: HallOccupancyGame[] }`.

- [ ] **Step 1: Write failing tests** in `coverage.test.ts`: `coverageFor({start:"10:00",end:"12:00"}, null).status === "none"`; `hallTimeCoverage(null) === "none"`; the existing "disjoint → uncovered" row still passes; `HALL_TIME_COVERAGES` equals the five values above.
- [ ] **Step 2: Run** `pnpm --filter @dragons/shared exec vitest run src/hall-times/coverage.test.ts` → FAIL.
- [ ] **Step 3: Implement** the type, constant, the two return changes and the new file; export all by name from `index.ts`. Update the `HallTimeCoverage` doc comment (no longer "uncovered when none").
- [ ] **Step 4: Run** `pnpm --filter @dragons/shared test && pnpm typecheck` → shared PASS. Typecheck errors elsewhere from exhaustive switches over coverage: add a `none` case wherever it fires (web badge: neutral variant, label key `hallTimes.coverage.none` = de "Keine Hallenzeit" / en "No hall time").
- [ ] **Step 5: Commit** `feat(shared): none coverage and hall occupancy types`.

### Task 2: Pure occupancy calculation

**Files:**
- Create: `apps/api/src/services/hall-times/hall-occupancy.ts`, `apps/api/src/services/hall-times/hall-occupancy.test.ts`
- Modify: `apps/api/src/services/venue-booking/booking-calculator.ts` (re-export `calculateTimeWindow` from the new file as a temporary shim; deleted in Task 8)

**Interfaces:**
- Produces (all times `HH:mm:ss` in and out):
  - `interface BufferConfig { bufferBeforeMinutes: number; bufferAfterMinutes: number; defaultGameDurationMinutes: number }`
  - `interface PlacedGame { kickoffTime: string; durationMinutes: number | null }` (null → default)
  - `gameEnd(game: PlacedGame, config: BufferConfig): string`
  - `programmeWindow(games: PlacedGame[], config: BufferConfig): { start: string; end: string } | null` — today's `calculateTimeWindow` semantics, including clamp of end to `23:59:59`.
  - `findFit(input: { hallTime: HallTimeWindow | null; games: PlacedGame[]; durationMinutes: number; config: BufferConfig }): { fits: boolean; suggestedKickoffTime: string | null }`

`findFit` algorithm (not determined by the signature):

```
if hallTime is null, closed, or lacks start/end → { fits:false, suggestedKickoffTime:null }
sorted = games by kickoff; ends = gameEnd of each
candidates, in order:
  empty hall: roundUp15(hs + bufferBefore)
  else: roundUp15(max(ends) + bufferAfter)                  // after programme
        roundDown15(firstKickoff - bufferAfter - duration)   // before first
        for each consecutive pair: roundUp15(prevEnd + bufferAfter)  // gaps
fits(k):
  prev = last game with kickoff <= k; next = first game with kickoff > k
  prev && prevEnd + bufferAfter > k            → no
  next && k + duration + bufferAfter > next.k  → no
  slotStart = prev ? k : k - bufferBefore
  slotEnd   = next ? k + duration : k + duration + bufferAfter
  slotStart >= hs && slotEnd <= he && k + duration <= 23:59  → yes
return first candidate that fits, else { fits:false, suggestedKickoffTime:null }
```

- [ ] **Step 1: Write failing tests** (`TZ=America/New_York` irrelevant here; pure minutes). Config `{60, 60, 90}` unless stated:
  - `programmeWindow` cases moved verbatim from `booking-calculator.test.ts` (empty → null, team duration wins, end clamp `23:59:59`).
  - empty open hall `10:00–18:00`, duration 90 → `{fits:true, suggested:"11:00:00"}`.
  - hall `10:00–20:00`, game at `11:00` → after programme `11:00+90+60 = 13:30` → `"13:30:00"`.
  - hall `10:00–14:00`, game at `11:00` (ends 12:30): after = 13:30, slot end 13:30+90+60=16:30 > 14:00 → no; before = 11:00-60-90 = 08:30, slot start 07:30 < 10:00 → no → `{fits:false, null}`.
  - hall `08:00–14:00`, game at `11:00`: after fails, before `08:30` slotStart 07:30 < 08:00 fails → false; hall `07:00–14:00` → `"08:30:00"`.
  - gap: hall `09:00–22:00`, games `10:00` and `16:00`, duration 90; after = 17:30+60=18:30 fits → `"18:30:00"` (after wins over gap). Same with hall `09:00–18:00`: after fails, before fails (slot start 07:00), gap `11:30+60 = 12:30` fits (12:30+90+60 = 15:00 ≤ 16:00) → `"12:30:00"`.
  - closed hall → false/null; null hall → false/null.
  - existing game sticking out (hall `12:00–18:00`, game at `11:00`): after = 13:30, slot 13:30–16:30 inside → `"13:30:00"` (existing overrun does not block).
  - rounding: game at `10:05` → after = 11:35+60 = 12:35 → `"12:45:00"`.
  - late day: hall `18:00–23:59`, game at `21:00` → after = 23:30 → k+90 > 23:59 → false.
- [ ] **Step 2: Run** `pnpm --filter @dragons/api exec vitest run src/services/hall-times/hall-occupancy.test.ts` → FAIL.
- [ ] **Step 3: Implement** `hall-occupancy.ts`; reuse `timeToMinutes` from `@dragons/shared`. Make `booking-calculator.ts` re-export so current callers keep compiling.
- [ ] **Step 4: Run** the test file and `apps/api/src/services/venue-booking/booking-calculator.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(api): pure hall occupancy calculation`.

### Task 3: Hall occupancy read service and list endpoint

**Files:**
- Create: `apps/api/src/services/hall-times/hall-occupancy.service.ts` (+ `.test.ts`), `packages/contracts/src/hall-occupancy.ts` (+ `.test.ts`), `packages/api-client/src/endpoints/hall-occupancy.ts`, `apps/api/src/routes/admin/hall-occupancy.routes.ts` (+ `.test.ts`)
- Modify: `packages/contracts/src/index.ts`, `packages/api-client/src/endpoints/index.ts`, `packages/api-client/src/create-api.ts`, `packages/api-client/src/endpoints/hall-occupancy.contract.test.ts` (create), `apps/api/src/routes/index.ts`, `apps/api/src/config/openapi.ts` (tag), `AGENTS.md` (endpoint row under a new "Admin - Hall occupancy" table)

**Interfaces:**
- Consumes: Task 1 types, Task 2 `programmeWindow`, `gameEnd`, `BufferConfig`; `getBookingConfig()` (still in `venue-booking.service.ts`; Task 8 moves it).
- Produces:
  - `hallOccupancyQuerySchema = z.object({ dateFrom: dateSchema.optional(), dateTo: dateSchema.optional(), venueId: z.coerce.number().int().positive().optional(), coverage: z.enum(HALL_TIME_COVERAGES).optional() })`, type `HallOccupancyQuery`.
  - `getBufferConfig(): Promise<BufferConfig>` in `hall-occupancy.service.ts` (wraps the settings read; Task 8 deletes `getBookingConfig`).
  - `loadOurHalls(): Promise<{ venueId: number; venueName: string }[]>` — distinct venues in `venue_hall_times`, ordered by name.
  - `loadHomeGameDays(scope: { from: string; to: string; venueIds?: number[] } | { matchIds: number[] }): Promise<HallOccupancyDay[]>` — live home games at our halls, grouped by venue+`kickoffDate`, with games sorted by kickoff, window via `programmeWindow`, coverage via `coverageFor` against that day's hall time. `matchIds` scope returns the full days those games sit on (all games of the day, not only the asked ones). Ordered by date, then venue name.
  - `listHallOccupancy(query: HallOccupancyQuery): Promise<HallOccupancyDay[]>` — defaults `dateFrom` = `todayInClubZone()`, `dateTo` = active season end (`getActiveSeasonId` → season `endDate`; fall back to `dateFrom` + 365 days); applies `coverage` filter after computing.
  - `GET /admin/hall-occupancy` with `requirePermission("booking", "view")`, `validator("query", hallOccupancyQuerySchema, validationHook)`, returns `HallOccupancyDay[]`.
  - api-client: `api.hallOccupancy.list(query?: HallOccupancyQuery): Promise<HallOccupancyDay[]>`.

- [ ] **Step 1: Write failing PGlite tests** in `hall-occupancy.service.test.ts` (`TZ=America/New_York` via `vi.stubEnv` or the file's existing pattern):
  - two home games same venue+day (10:00, 13:00), hall time `08:00–17:00`, config 60/60/90 → one day, window `09:00:00–15:30:00`, `covered`, games in kickoff order.
  - same with hall time `10:00–15:00` → `partial`, gapBefore 60, gapAfter 30.
  - our hall, no row that day → `none`, `hallTime: null`.
  - home game at a venue with no hall-time rows at all → not returned.
  - cancelled and forfeited games excluded; away games excluded; a game of another club at our hall excluded.
  - Review Focus 4: a game with a kickoff override moved to day B lists under B only.
  - `matchIds` scope returns the whole day including games not asked.
  - `coverage: "none"` filter returns only `none` days.
- [ ] **Step 2: Contract + route tests**: schema accepts `{}` and rejects `coverage: "pending"`; route 200 with seeded data, 403 without `booking:view`; api-client contract test parses `list({ coverage: "partial", venueId: 3 })` query.
- [ ] **Step 3: Run** the three test files → FAIL.
- [ ] **Step 4: Implement** service, contract, route, client, AGENTS.md row.
- [ ] **Step 5: Run** the test files and `apps/api/src/test/docs-drift.test.ts` → PASS.
- [ ] **Step 6: Commit** `feat(api): hall occupancy list from home games and hall times`.

### Task 4: Match list and detail read coverage from occupancy

**Files:**
- Modify: `packages/shared/src/matches.ts` (`MatchListItem.booking` → `hallCoverage`), `apps/api/src/services/admin/match-query.service.ts`, `apps/web/src/components/admin/matches/match-list-table.tsx`, `match-detail-page.tsx`, `match-edit-sheet.tsx`, `apps/web/src/components/admin/hall-times/hall-time-coverage-badge.tsx`, `AGENTS.md` (match endpoint descriptions: "with hall coverage" instead of "with booking info")
- Test: `apps/api/src/services/admin/match-query.service.test.ts`, `apps/web/src/components/admin/matches/match-list-table.ghost.test.tsx`, `match-detail-page.test.tsx`

**Interfaces:**
- Consumes: `loadHomeGameDays({ matchIds })` from Task 3.
- Produces: `MatchListItem.hallCoverage: (HallCoverageInfo & { windowStart: string; windowEnd: string; gameCount: number }) | null` — null for away games and games not at one of our halls. Detail gets the same field.

- [ ] **Step 1: Update failing tests**: list item for a home game at our hall with hall time `08:00–17:00` → `hallCoverage.coverage === "covered"`, `gameCount` = games that day; away game → `null`; game at a venue without hall times → `null`. Web: badge renders for `partial` and `none` on game-plan rows, not for `covered`; match detail shows hall time and window; edit sheet shows coverage instead of booking status.
- [ ] **Step 2: Run** `pnpm --filter @dragons/api exec vitest run src/services/admin/match-query.service.test.ts` and `pnpm --filter @dragons/web exec vitest run src/components/admin/matches` → FAIL.
- [ ] **Step 3: Implement**: replace both `venueBookingMatches` joins and `bookingSummaries` with one `loadHomeGameDays({ matchIds })` call per request, mapping each match to its day by `venueId:kickoffDate`. Remove the booking status block from `match-edit-sheet.tsx`; drop now-unused i18n keys (`matchDetail.booking.*`) and add `matchDetail.hallCoverage.*` (de/en).
- [ ] **Step 4: Run** both test sets and `pnpm check:i18n` → PASS.
- [ ] **Step 5: Commit** `feat: match list and detail show hall coverage from hall times`.

### Task 5: Multi-hall alternative-date finder

**Files:**
- Modify: `packages/shared/src/matches.ts` (finder types), `apps/api/src/services/reschedule/alternative-dates.service.ts`, `apps/web/src/components/admin/matches/alternative-dates-panel.tsx`, `apps/web/src/messages/{de,en}.json`, `docs/adr/0011-hall-times-from-anlage-t.md` (the finder now derives a kickoff from the hall time; amend the decision line)
- Test: `apps/api/src/routes/admin/match.routes.alternative-dates.test.ts`, `apps/web/src/components/admin/matches/alternative-dates-panel.test.tsx`

**Interfaces:**
- Consumes: `loadOurHalls`, `loadHomeGameDays({ from, to })`, `getBufferConfig` (Task 3); `findFit`, `gameEnd` (Task 2).
- Produces (shared):
  - `AlternativeDateGroup = "fits" | "heldNoFit" | "notHeld" | "closed" | "away"`.
  - `AlternativeDateHall { venueId: number; venueName: string; isCurrentVenue: boolean; hallTime: HallTimeWindow | null; games: HallOccupancyGame[]; existing: HallCoverageInfo | null; fits: boolean; suggestedKickoffTime: string | null }` — `existing` is the coverage of the games already there (null when none).
  - `AlternativeDateCandidate`: remove `bookings`, `suggestedKickoffTime`, `hallTime`; add `halls: AlternativeDateHall[]` (empty for away games). Delete `AlternativeDateBooking`.
- Group of a home-game day: `fits` if any hall fits; else `heldNoFit` if any hall has an `open` hall time; else `closed` if every one of our halls is `closed`; else `notHeld`. Order of groups in the ranking: `fits`, `heldNoFit`, `notHeld`, `closed`; inside a group unflagged before flagged, then chronological (unchanged rule).
- Halls inside a day: current venue first (when it is one of ours), then by name. The moved game is excluded from its current hall's games; its duration is its own team entry's `estimatedGameDuration`, else the default.

- [ ] **Step 1: Update failing route tests** (seed two halls A and B):
  - day with A open `10:00–18:00` and one game at 11:00, B no row → group `fits`, A first (current venue), `A.suggestedKickoffTime === "13:30:00"`, B `fits:false`, `hallTime:null`.
  - day where A is full but B open and empty → `fits` via B, `B.suggestedKickoffTime` = B start + 60 rounded up.
  - day where A open but too short, B no row → `heldNoFit`.
  - day with A closed, B no row → `notHeld`; both closed → `closed`.
  - Review Focus 5: the moved game itself sits on a candidate day at A 11:00 → it is not in `A.games`.
  - away game → `halls: []`, group `away`.
  - ranking order across the four groups.
- [ ] **Step 2: Update failing panel tests**: renders one row per hall with hall time, games and the suggested kickoff; the current venue is marked; a `none` hall shows "Keine Hallenzeit"; group headings for the four home groups.
- [ ] **Step 3: Run** both test files → FAIL.
- [ ] **Step 4: Implement**: replace `loadHallTimes`/`loadBookedDays`/`loadBookedGames`/`suggestKickoff` with one `loadOurHalls` + one hall-time range read for all our halls + `loadHomeGameDays({from,to})`, then `findFit` per (day, hall) in memory. Keep the fixed-query-count doc comment true.
- [ ] **Step 5: Run** both test files → PASS.
- [ ] **Step 6: Commit** `feat(matches): alternative-date finder offers every one of our halls`.

### Task 6: Anlage T import without bookings

**Files:**
- Modify: `apps/api/src/services/hall-times/hall-time-import-planner.ts` (+ test), `apps/api/src/services/hall-times/hall-time.service.ts`, `apps/api/src/routes/admin/venue.routes.ts`, `packages/shared/src/hall-times.ts`, `packages/contracts/src/venue.ts` (if it types the response), `apps/web/src/components/admin/hall-times/hall-time-import-dialog.tsx` (+ test), `apps/api/src/routes/admin/venue.routes.hall-times.test.ts`

**Interfaces:**
- Produces: `HallTimeImportPreview` without `bookings`; `HallTimeImportResult = HallTimeImportPreview` (no `eventsEmitted`). `planHallTimeImport` input loses its bookings; `emitHallTimeMissing`, `bookingHallTime`, `attachHallTimes` deleted if unused after Task 4 (`attachHallTimes` still used by `booking-admin.service.ts` — leave it until Task 8).

- [ ] **Step 1: Update failing tests**: preview response has exactly `span, added, changed, removed, unchanged`; apply writes rows and emits no domain event (count `domain_events` before/after equal); the dialog shows no booking section.
- [ ] **Step 2: Run** `pnpm --filter @dragons/api exec vitest run src/routes/admin/venue.routes.hall-times.test.ts src/services/hall-times` → FAIL.
- [ ] **Step 3: Implement** the removals.
- [ ] **Step 4: Run** the same plus `pnpm --filter @dragons/web exec vitest run src/components/admin/hall-times` → PASS.
- [ ] **Step 5: Commit** `refactor(hall-times): import no longer judges bookings`.

### Task 7: Hallenbelegung page

**Files:**
- Create: `apps/web/src/components/admin/hall-occupancy/hall-occupancy-table.tsx` (+ `.test.tsx`, `.a11y.test.tsx`)
- Modify: `apps/web/src/app/[locale]/admin/bookings/page.tsx`, `apps/web/src/lib/swr-keys.ts`, `apps/web/src/lib/swr-queries.ts`, `apps/web/src/components/admin/nav-meta.ts`, `admin-breadcrumb.tsx`, `dashboard/dashboard-view.tsx`, `apps/web/src/messages/{de,en}.json`
- Delete: `apps/web/src/components/admin/bookings/` (all files, incl. tests and `types.ts`)

**Interfaces:**
- Consumes: `api.hallOccupancy.list` (Task 3), `HallOccupancyDay`, `HallTimeCoverageBadge`.
- Produces: `swrKeys.hallOccupancy(query)`; page title / nav label / dashboard quick link: de "Hallenbelegung", en "Hall occupancy".

- [ ] **Step 1: Write failing tests**: table renders date, hall, games (time + team via `TeamBadge`), window, hall time ("Geschlossen: <note>" for closed, "Keine Hallenzeit" for none), coverage badge, gap ("30 Min. zu früh" / "45 Min. zu spät"; en "30 min early" / "45 min late"); hall and coverage filters change the SWR key; each game links to `/admin/matches/:id`; the hall name links to the venue's Hallenzeiten panel; no create/edit/reconcile controls; axe passes.
- [ ] **Step 2: Run** `pnpm --filter @dragons/web exec vitest run src/components/admin/hall-occupancy` → FAIL.
- [ ] **Step 3: Implement** per `packages/ui/DESIGN-SYSTEM.md`; delete the bookings components and their i18n keys.
- [ ] **Step 4: Run** web tests, `pnpm check:i18n`, `pnpm check:design-tokens`, `pnpm --filter @dragons/web typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): Hallenbelegung list replaces the bookings page`.

### Task 8: Remove the booking subsystem

**Files:**
- Delete: `apps/api/src/services/venue-booking/` (all), `apps/api/src/services/admin/booking-admin.service.ts` (+ tests), `apps/api/src/routes/admin/booking.routes.ts` (+ tests), `packages/contracts/src/booking.ts` (+ tests), `packages/api-client/src/endpoints/booking.ts` (+ tests), `packages/db/src/schema/venue-bookings.ts`, `venue-booking-matches.ts`, `packages/shared/src/bookings.ts`, `apps/api/src/services/notifications/templates/booking.ts` (+ test)
- Modify: `apps/api/src/services/sync/index.ts` (drop Step 5.5), `apps/api/src/routes/admin/match.routes.ts` (drop `reconcileMatch`), `apps/api/src/routes/index.ts`, `apps/api/src/config/openapi.ts`, `packages/db/src/schema/index.ts`, `packages/shared/src/{constants,validation,index,settings,domain-events,domain-event-schemas}.ts`, `packages/contracts/src/{index,settings}.ts`, `apps/api/src/services/admin/settings.service.ts`, `apps/web/src/components/admin/settings/booking-config.tsx`, `apps/api/src/services/notifications/{role-defaults,templates/render-chain}.ts`, `apps/web/src/components/admin/notifications/event-browser.tsx`, `apps/api/src/services/hall-times/hall-time.service.ts` (drop `attachHallTimes`, `bookingHallTime`), `apps/api/src/test/enum-column-values.test.ts`, `AGENTS.md`, `CONTEXT.md`
- Create: `packages/db/drizzle/0057_*.sql` via `db:generate`, `docs/adr/0012-hall-occupancy-derived-not-stored.md`

**Interfaces:**
- Produces:
  - `RETIRED_EVENT_TYPES = ["booking.created", "booking.status.changed", "booking.needs_reconfirmation", "booking.hall_time.missing"] as const` and `RETIRED_EVENT_ENTITY_TYPES = ["booking"] as const` in `domain-events.ts`, both folded into `STORED_EVENT_TYPE_VALUES` / `STORED_EVENT_ENTITY_TYPES` (readable, never publishable). The four leave `EVENT_TYPES`; `"booking"` leaves `EVENT_ENTITY_TYPES`.
  - `BookingSettings` loses `dueDaysBefore` (rename not required); `BOOKING_DEFAULTS` likewise; settings contract drops the field.
  - Migration drops `venue_booking_matches` then `venue_bookings`; append by hand `DELETE FROM app_settings WHERE key = 'venue_booking_due_days_before';`.

- [ ] **Step 1: Write failing tests**:
  - Review Focus 1: insert a `domain_events` row with type `booking.created`, entity `booking`; `GET /admin/events` lists it and `GET /admin/events?type=booking.created` returns 200 with it.
  - Review Focus 2: a watch rule stored with `eventTypes: ["booking.created"]` is returned by the list route and can be updated (only name changed) without a 400. If the watch-rule contract rejects retired types on update, accept `STORED_EVENT_TYPE_VALUES` for already-stored entries only if that is a one-line change; otherwise make the update test assert the 400 and document that the rule must be edited to drop the retired type.
  - `POST /admin/events/trigger` with `booking.created` → 400.
  - settings `PUT /admin/settings/booking` with `dueDaysBefore` → 400 (strict) and without it → 200.
  - `fullSync` no longer calls a reconcile stage (docs-drift execution-flow test covers it after AGENTS.md edit).
- [ ] **Step 2: Run** affected test files → FAIL.
- [ ] **Step 3: Implement** the deletions and modifications; move `getBufferConfig` fully into `hall-occupancy.service.ts` (no import from `venue-booking/` left). Run `pnpm --filter @dragons/db db:generate`, append the `DELETE`, check the SQL only drops the two tables (and their indexes/FKs).
- [ ] **Step 4: Docs**: AGENTS.md — table count 49 → 47, remove the two table rows and ERD lines, remove "Admin - Bookings" endpoint table and booking events, remove Step 5.5 from Execution Flow, settings row text without due date. CONTEXT.md — replace **Hall booking** with **Home game day (Heimspieltag)** (one hall, one day, at least one live home game; its programme window and coverage are derived) and **Hall occupancy (Hallenbelegung)** (the list of home game days); keep "Hallenbuchung" in the avoid list. ADR-0012: derived not stored, why (Anlage T is approved; per-day workflow unused), consequence (no history of past bookings; nothing to reconcile).
- [ ] **Step 5: Verify** `rg -n "venueBooking|venue_booking|BookingStatus|reconcile" apps packages --glob '!**/drizzle/**' --glob '!**/coverage/**'` returns only the retired-type constants and settings keys `venue_booking_buffer_*` / `venue_booking_game_duration`.
- [ ] **Step 6: Run** the full gate: `pnpm typecheck && pnpm lint && pnpm knip && pnpm check:i18n && pnpm check:ai-slop && pnpm check:design-tokens && pnpm check:skipped-tests && pnpm check:coverage-scripts && pnpm coverage` → all PASS, thresholds held.
- [ ] **Step 7: Commit** `refactor: remove stored venue bookings`.

### Task 9: Ship

- [ ] **Step 1:** Push `feat/hall-times-import`; update PR #389 title to `feat: hall occupancy from the Anlage T; drop stored bookings` and rewrite the body (what changed, migration drops two tables, no notifications, checks run).
- [ ] **Step 2:** Watch CI to green; report failures with output.
