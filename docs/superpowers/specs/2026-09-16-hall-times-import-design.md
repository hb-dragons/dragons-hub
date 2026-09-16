# Hall times: import the Anlage T and flag uncovered home games

Status: approved 2026-09-16. Supersedes the "hall availability stays a manual
judgment" paragraph of ADR-0010; recorded as ADR-0011.

## Problem

The club rents its halls from the city. Twice a season the club sends the city
an "Anlage T zum Mietantrag" per hall: an Excel sheet listing every Saturday and
Sunday of the season with the time window the club wants, a dash where it wants
nothing, or the city's closure note (school holidays, public holidays, "keine
Vermietung"). The sheet is the record of when the club holds a hall.

The Hub does not know that record. `venue_bookings` are derived from home games
and say "we have games here that day", not "the hall is ours from 10:00 to
14:00". A home game on a day or at a time the club has not asked the city for
is invisible until someone compares the game plan with the sheet by hand. That
comparison is what the club needs automated: every home game outside a held
hall time means a rental request still has to go to the city.

## Decisions

1. **Hall times are a first-class table**, `venue_hall_times`, one row per venue
   and day. `-` and blank sheet days produce no row. A closure note produces a
   `closed` row carrying the note.
2. **The sheet is parsed in the browser** and the API receives typed JSON. The
   parser is a pure function over the cell grid in `@dragons/shared`; `xlsx`
   (the cdn.sheetjs.com pin `apps/site` already uses) becomes a dependency of
   `apps/web` only, loaded with a dynamic import in the upload dialog.
3. **Coverage is computed at read time**, never stored: a booking's effective
   window against the hall time of its venue and day.
4. **An import replaces** the venue's rows inside the sheet's date span.
   Manual rows survive only on days the sheet has no value.
5. **The event** `booking.hall_time.missing` fires once per booking transition
   into a non-covered state, from sync reconcile and from an import.

## Data model

`packages/db/src/schema/venue-hall-times.ts`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `venueId` | integer FK → `venues.id` | |
| `date` | date | club-zone calendar day |
| `startTime` | time, nullable | required when `kind = open` |
| `endTime` | time, nullable | required when `kind = open` |
| `kind` | varchar(10) `HallTimeKind` | `open` \| `closed` |
| `note` | text, nullable | closure text from the sheet, or a free note |
| `source` | varchar(10) `HallTimeSource` | `anlage_t` \| `manual` |
| `createdAt`, `updatedAt` | timestamptz | |

Constraints: unique `(venueId, date)`; check `kind <> 'open' OR (start_time IS
NOT NULL AND end_time IS NOT NULL)`; check `start_time < end_time`.

No `seasonId`. The sheet's first and last dates bound the season, and reads are
always by venue and date range.

`HALL_TIME_KINDS`, `HALL_TIME_SOURCES` and the DTO types live in
`packages/shared/src/hall-times.ts`, next to `bookings.ts`.

## Parser

`packages/shared/src/hall-times/anlage-t.ts`

```ts
parseAnlageT(grid: readonly (unknown)[][]): AnlageTParseResult
```

Input is the sheet's cell grid as `sheet_to_json(ws, { header: 1, raw: false })`
yields it, so the parser never touches `xlsx`. It reads:

- hall name from the cell right of "Sporthalle:" (row 3, column E)
- the update date from the cell right of "Datum dieser Aktualisierung:"
- two side-by-side blocks, columns C–G and I–M: `Tag | Datum | von | - | bis`.
  A `Tag` cell matching `/^(Sa|So)\*?$/` starts a data row; the block ends at
  the first row whose `Tag` cell is empty in both blocks.
- per data row: `Datum` is a `Date`, an ISO string, `m/d/yy` or `d.m.yyyy`;
  `von` and `bis` are `HH:mm` (or the sheet's numeric `HHmm`). Both present →
  `open`. Both absent and the separator column (`-`) holds text other than a
  dash → `closed` with that text as note: the city writes the note across the
  separator cell, not into `von`. Two-line notes ("Sommerferien**" over
  "02.07.-12.08.**") are joined and every row of the run carries the whole
  note. A blank row (no dash, no times) appears only inside a holiday block
  where the merged note cell spans it, so a blank row next to a note run is
  part of that closure, before the run as well as after it; a blank row that
  touches no note yields nothing. Only one of `von`/`bis` present, an
  inverted window or an unreadable date → warning, no row.
- the `*` suffix on `Tag` and `**` on notes are stripped; the footnotes are not
  imported.

Output: `{ hallName, updatedOn, rows: HallTimeInput[], warnings: string[] }`
where `HallTimeInput = { date, kind, startTime, endTime, note }` in
`YYYY-MM-DD` / `HH:mm`. Fixtures for the tests are cut from the two real sheets
(Goetheschule: 27 open days and 24 closed days; FES: 3 open days).

## Coverage

`packages/shared/src/hall-times/coverage.ts`

```ts
type HallTimeCoverage = "covered" | "partial" | "uncovered" | "closed";
coverageFor(window: { start: string; end: string }, hallTime: HallTimeRow | null): {
  status: HallTimeCoverage;
  gapBeforeMinutes: number;   // 0 unless partial
  gapAfterMinutes: number;    // 0 unless partial
}
```

The window is the booking's effective window (override per end, else
calculated), which already contains the buffers from the booking config: it is
what the club would write on the Anlage T. `covered` when the window sits inside
the hall time, `partial` when they overlap, `uncovered` when they do not or no
row exists, `closed` when the row is a closure.

The API attaches `hallTime: { kind, startTime, endTime, note, coverage,
gapBeforeMinutes, gapAfterMinutes } | null` to `BookingListItem`,
`BookingDetail` and the `booking` sub-object of `MatchListItem` /
`MatchDetail`. `null` means no row for that venue and day, and the coverage in
that case is `uncovered`; list consumers therefore read coverage as
`hallTime?.coverage ?? "uncovered"` through a shared helper, not inline.

## API

All under `requireAuth`; permission per route.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/admin/venues/:id/hall-times?from&to` | `venue:view` | Rows for one venue in a range |
| POST | `/admin/venues/:id/hall-times/import/preview` | `venue:update` | Diff the sheet rows against stored rows; report bookings whose coverage changes |
| POST | `/admin/venues/:id/hall-times/import` | `venue:update` | Apply: replace rows in the sheet span in one transaction, emit events |
| PUT | `/admin/venues/:id/hall-times/:date` | `venue:update` | Upsert one manual row |
| DELETE | `/admin/venues/:id/hall-times/:date` | `venue:update` | Remove one row |

Import body (`packages/contracts/src/venue.ts`, `hallTimeImportBodySchema`):
`{ rows: HallTimeInput[], updatedOn?: string }`, at least one row, dates
distinct, `open` rows with both times and `start < end`.

Preview response: `{ span: { from, to }, added, changed, removed, unchanged,
bookings: { bookingId, date, before: HallTimeCoverage, after: HallTimeCoverage }[] }`.
Apply response: the same plus `eventsEmitted`.

Replace semantics: inside `[min(rows.date), max(rows.date)]` every stored row
with `source = anlage_t` is deleted and the incoming rows are inserted. A
`manual` row on a day the sheet has a value is replaced; on a day the sheet is
`-` or blank it stays.

Service: `apps/api/src/services/hall-times/hall-time.service.ts` (reads,
upsert, delete, import with preview and apply sharing one pure planner in
`hall-time-import-planner.ts`, mirroring `booking-planner.ts`).

## Flag surfaces

- **Bookings list** (`/admin/bookings`): a coverage badge column and a
  `coverage` filter (`uncovered | partial | closed`). Detail sheet shows the
  hall time, the booking window, and the gap in minutes.
- **Game plan** (`/admin/matches`): a badge on home-game rows whose booking is
  not `covered`, styled like the ghost badge. Match detail shows the day's hall
  time next to the booking.
- **Venue page** (`/admin/venues`): a "Hallenzeiten" panel per venue (list by
  month, manual edit, delete) and the upload dialog.
- **Alternative-dates finder**: each candidate carries `hallTime: { kind,
  startTime, endTime, note } | null`. Ranking becomes: booked and covered, open
  hall time without booking, booked but not covered, no hall time, closed;
  inside each tier unflagged before flagged, then chronological. The
  `AlternativeDateGroup` union grows by `hallTimeOpen` and `closed`.
- **Event** `booking.hall_time.missing` (`BOOKING_HALL_TIME_MISSING`):
  payload `{ bookingId, venueId, venueName, date, window, hallTime, coverage }`.
  Emitted by `reconcileAfterSync` and by the import apply, once per booking
  whose coverage changes from `covered` (or from no booking) to another state
  within that same operation: reconcile compares the booking window before
  and after its update against the stored hall times; import compares the
  stored bookings against the hall times before and after the replace. No
  emitted-state history is kept, so a repeated import of the same sheet emits
  nothing and a game that stays uncovered across syncs is reported once.
  Template in `templates/booking.ts`.

## Upload dialog

`apps/web/src/components/admin/venues/hall-time-upload-dialog.tsx`: file
input → `await import("xlsx")` → `sheet_to_json` grid → `parseAnlageT` →
venue picker preselected by case-insensitive name containment (`Goetheschule`
in `Gymnasium Goetheschule`) → preview call → table of added / changed /
removed rows and booking coverage changes → apply. Warnings from the parser are
shown above the table and never block the import.

## Documentation

- `AGENTS.md`: table count 48 → 49, data-model row, ERD line `Venue (1) ────
  (N) VenueHallTime`, endpoint rows under "Admin - Venues", event under
  "Booking Events".
- `CONTEXT.md`: new term **Hall time (Hallenzeit)** = one day the club holds a
  hall per its Mietantrag, with the time window or the closure reason. Remove
  "Hallenzeit" from the avoid list of Hall booking; adjust Venue ("that
  knowledge is not modeled" → points at Hall time).
- `docs/adr/0011-hall-times-from-anlage-t.md`: hall times are modeled from the
  Anlage T; the finder still does not decide, it shows.
- `apps/web/package.json`: `xlsx` from cdn.sheetjs.com, same URL as `apps/site`.

## Testing

- Parser: fixtures from both real sheets, both blocks, `Sa*`, two-line notes,
  Date vs string cells, half-filled rows → warning.
- Coverage: table test over inside / overlap-before / overlap-after / disjoint
  / closed / null.
- API (PGlite): GET range; preview diff classes; apply replaces only inside the
  span; manual row survives a `-` day and loses to a valued day; events emitted
  once per transition and not on repeat import; permission 403.
- Booking service: `hallTime` attached on list and detail; filter.
- Finder: tiers and group values; closed day ranks last.
- Web: dialog parses a fixture workbook through the real `xlsx` and posts the
  contract body (`*.contract.test.ts`); badges on bookings list and game plan.
- Docs drift: table, endpoint and event rows.

## Out of scope

Generating the Anlage T workbook from bookings; native app and public site
surfaces; per-weekday recurring hall times for training.
