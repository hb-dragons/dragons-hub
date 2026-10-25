# Hall occupancy from hall times, without stored bookings

Date: 2026-10-25. Branch `feat/hall-times-import` (PR #389). Supersedes the
booking parts of `2026-09-16-hall-times-import-design.md`; the hall-time model,
the Anlage T parser and the import stay as that spec describes them.

## Why

The club rents its halls from the city through the Anlage T, and the city
approves the sheet as sent. Once that sheet is imported, the Hub knows exactly
when each hall is ours. The stored venue booking (`venue_bookings` with its
`pending → requested → confirmed` workflow) was built for asking the city game
day by game day. That workflow is not used in production and duplicates what
the hall times already say.

What the club needs instead are two answers, both computed from games, hall
times and the buffer settings:

1. **Moving a game.** For each candidate day: which of our halls are held,
   which games already sit in each, and whether the moved game still fits,
   with a suggested hall and kickoff. A game may move to a different hall of
   ours.
2. **Days with several games.** For each hall and day with home games: is the
   whole programme inside the held window, and if not, how many minutes are
   missing before or after.

## Goals

- No stored booking. Hall occupancy is derived at read time.
- The alternative-date finder considers every one of our halls for a home game.
- One list ("Hallenbelegung") of hall × day with games, window, hall time,
  coverage and gap, plus the same coverage on the game plan and match detail.

## Non-goals

- Applying a move. The club enters reschedules at the federation as today; the
  sync picks them up. No venue override on a game (only `venueNameOverride`
  text exists and stays as is).
- Notifications. Every move at our halls comes from the club itself, and so
  does every import, so nobody needs to be told. `booking.hall_time.missing`
  is removed.
- Generating the Anlage T back out, native or public site surfaces, training
  hall times.

## Anti-goals

- A second source of truth for "is the hall ours". Hall times are the only one.
- A finder that decides for the user. It shows options and ranks them
  (ADR-0010/0011 stand).

## Terms

- **Our halls:** every venue with at least one row in `venue_hall_times`. No
  extra flag; a hall joins when its Anlage T is imported.
- **Home game day:** one venue and one date with at least one live home game
  (`isCancelled = false`, `isForfeited = false`, home side is the own club) at
  that venue. Uses the game's current `kickoffDate`/`kickoffTime`, which
  already reflect an active override; ghost entries are not games and do not
  count.
- **Programme window:** earliest kickoff minus `bufferBefore` to the latest
  game end (kickoff plus the team entry's `estimatedGameDuration`, else the
  `gameDuration` setting) plus `bufferAfter`. This is today's
  `calculateTimeWindow`; keep it, moved out of `venue-booking/` (e.g. to
  `services/hall-times/` or `@dragons/shared` if the web needs it).
- **Coverage:** `coverageFor(programmeWindow, hallTime)` with the gap
  minutes, extended by one value: `covered | partial | uncovered | closed |
  none`. `none` means the hall has no hall-time row that day (nothing asked
  of the city), split from `uncovered` (a hall time exists but the programme
  sits fully outside it), so the badge and filter can tell the two apart.
  *(Builder call.)*

Scope *(builder call)*: only our halls are judged. A home game at a venue
with no hall-time rows at all (not one of our halls) gets no coverage badge,
does not appear in the Hallenbelegung list, and is not offered by the finder.
A home game at one of our halls on a day without a row is `none` and does
appear.

## The finder

For a home game, each candidate day lists every one of our halls, the game's
current hall first, then by name. Per hall:

- the hall time (`open` with window, `closed` with note, or none);
- the live home games already there that day (excluding the game being moved),
  with kickoff, end and team;
- **fit:** whether the moved game can be placed, and the suggested kickoff.

Fit rule. Games in one hall are played one after another. A kickoff `k` for the
moved game (duration `d` from its own team entry) fits when:

- `[k, k + d]` overlaps no other game's `[kickoff, kickoff + duration]` there,
  with `bufferAfter` kept between one game's end and the next kickoff (the same
  spacing today's suggestion uses); and
- the moved game's own slot sits inside the hall time: from `k` minus
  `bufferBefore` (when it would be the first game of the day) or `k` (when a
  game precedes it) to `k + d` plus `bufferAfter`.

The rest of the day's programme is not part of fit: games already sticking
out of the hall time do not stop a free slot well inside it from fitting.
That existing shortfall is shown on the hall as a flag (its coverage and gap)
so the user sees it. *(Builder call.)*

Suggested kickoff: the first kickoff on the day that fits, trying in order the
slot right after the existing programme (today's rule: latest end plus
`bufferAfter`), then the slot before the first game, then gaps between games.
With no games there, the hall time's start plus `bufferBefore`. Kickoffs are
rounded up to the next quarter hour.

Ranking of a candidate day stays tiered, using the best hall that day:

1. fits into a held hall;
2. a held hall (an `open` hall time) exists but the game does not fit (the
   hall time would have to be extended or games reshuffled);
3. no held hall: our halls have no row or are closed, in any mix;
4. closed at every one of our halls.

A `closed` hall is never held, whether or not games are already there; those
games show with the hall's `closed` coverage. *(Builder call.)*

Inside a tier: unflagged before flagged (squad and staff conflicts as today),
then chronological. The response shape replaces the single-venue `bookings` /
`hallTime` fields with a `halls` array; `AlternativeDateGroup` follows the
tiers. Away games are unchanged (squad conflicts only, no halls).

## Hallenbelegung list

`/admin/bookings` becomes a read-only list of home game days (hall × date):
date, hall, the games (time and team), programme window, hall time, coverage
badge, gap before/after in minutes. Filters: date range (default today to
season end), hall, coverage. A row links to the match detail of each game and
to the venue's Hallenzeiten panel. No create, edit, status or reconcile.
Route path, nav id and the `booking` permission keep their names (no role
changes); the visible label becomes "Hallenbelegung" / "Hall occupancy".

Game plan badge and match detail show the coverage of the game's home game
day, from the same computation.

## Removed

- Tables `venue_bookings` and `venue_booking_matches` (migration drops them),
  the `BookingStatus` enum and its constants.
- The sync's "Reconcile venue bookings" step (`sync/index.ts`, and its stage
  in AGENTS.md's Execution Flow block), `venue-booking.service.ts`,
  `booking-planner.ts`.
- Booking create / update / status / delete / reconcile routes and the
  matching contracts and api-client endpoints; the create and reconcile
  dialogs and the detail sheet's edit parts.
- Per-booking override window, notes, `confirmedBy`.
- Setting `venue_booking_due_days_before` (`dueDaysBefore`). Buffers and game
  duration settings stay.
- Events `booking.created`, `booking.status.changed`,
  `booking.needs_reconfirmation`, `booking.hall_time.missing`, their templates,
  schemas and role defaults. Rows already in `domain_events` with those types
  must still render in the event browser (fall back to a generic rendering of
  an unknown type rather than failing).

## Anlage T import

Preview and apply lose their booking parts: drop `bookings`
(`HallTimeImportBookingChange[]`) from the preview and `eventsEmitted` from
apply, with their contracts, api-client types and dialog UI. The preview keeps
the hall-time diff (added / changed / removed rows). After apply, the
Hallenbelegung list shows the resulting coverage. *(Builder call: no
"affected game days" section in the preview.)*

## Constraints

- PGlite integration tests for the new reads (no mocked Drizzle).
- Coverage thresholds must hold; nothing gets lowered.
- AGENTS.md (table inventory, endpoint tables, event list, execution flow),
  CONTEXT.md (Hall booking → Home game day / Hall occupancy) and a new ADR
  ("hall occupancy is derived, not stored") are updated in the same change;
  `docs-drift.test.ts` enforces the first three.
- Times through `@dragons/shared` kickoff helpers; tests force a non-Berlin TZ.

## Left to the builder

- Module layout and naming of the new read service and response types.
- Whether the programme-window calculation lives in the API or in
  `@dragons/shared`.
- Exact column order and responsive layout of the list (follow
  `packages/ui/DESIGN-SYSTEM.md`).
- How to slice commits.
