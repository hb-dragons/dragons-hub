# Referee Assignment ("Übernehmen") Design

## Problem

Referees need a way to find basketball games with open referee slots and claim them via the official Basketball-Bund platform. Currently, the app syncs referee data but doesn't expose open-slot information or provide deep-links to the federation's assignment system.

## Solution

Add an "Übernehmen" (take over) workflow inspired by [SR-Basar](https://github.com/JamesNeumann/srbasar-backend). Referees log into our app, browse matches with open referee slots, and click a deep-link to `basketball-bund.net` to officially claim the assignment. We track the intent locally; the sync confirms actual assignments.

## Data Model Changes

### matches table — 3 new columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `sr1_open` | boolean NOT NULL | false | SR slot 1 openly offered |
| `sr2_open` | boolean NOT NULL | false | SR slot 2 openly offered |
| `sr3_open` | boolean NOT NULL | false | SR slot 3 openly offered |

Populated during sync from `SdkRefereeSlot.offenAngeboten`. Included in match hash computation so changes trigger updates.

### New table: `referee_assignment_intents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `match_id` | integer FK → matches(id) CASCADE | Which match |
| `referee_id` | integer FK → referees(id) | Which referee clicked |
| `slot_number` | smallint NOT NULL | 1, 2, or 3 |
| `clicked_at` | timestamp with tz, NOT NULL | When the deep-link was clicked |
| `confirmed_by_sync_at` | timestamp with tz, nullable | Set when sync detects actual assignment |
| `created_at` | timestamp with tz | |

Unique constraint: `(match_id, referee_id, slot_number)`.

### user table — referee linking

- Add `referee_id` column (integer, nullable, FK → referees(id)) to the `user` table
- Use existing `role` text column with value `"referee"` for referee accounts
- Admin creates referee users and links them to synced referee records

## Sync Changes

### Data Fetcher

Extract `offenAngeboten` from `SdkRefereeSlot` for sr1/sr2/sr3 alongside existing referee data extraction.

### Matches Sync

Set `sr1Open`, `sr2Open`, `sr3Open` from the game response:

```
sr1Open = gameResp.sr1.offenAngeboten
sr2Open = gameResp.sr2.offenAngeboten
sr3Open = gameResp.sr3.offenAngeboten
```

Include these in the match data hash so slot status changes trigger updates.

### Intent Confirmation

After `syncRefereeAssignmentsFromData`, check `refereeAssignmentIntents` rows where `confirmedBySyncAt` is null. For each, if the referee now appears assigned to that match+slot in `matchReferees`, set `confirmedBySyncAt = now()`.

## API Changes

### New referee endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/referee/matches` | referee role | Paginated list of matches with open slots. Filterable by date/league. Own club matches flagged. |
| POST | `/referee/matches/:id/take` | referee role | Record intent. Body: `{ slotNumber: 1\|2\|3 }`. Returns deep-link URL. |

### Extended admin endpoints

| Method | Path | Change |
|--------|------|--------|
| POST | `/admin/users` | Support `role: "referee"` with `refereeId` to link user → referee |
| GET | `/admin/matches/:id` | Response includes `refereeSlots` (open/assigned per slot) and `intents` |

### Auth middleware

New `requireReferee` middleware — allows `role: "referee"` or `role: "admin"`.

## Deep-Link Format

```
https://basketball-bund.net/app.do?app=/sr/take&spielId={apiMatchId}
```

`apiMatchId` corresponds to `spielplanId` in the SDK, already stored on every match record.

## Frontend Changes

### New page: `/referee/matches`

- Table of matches with open referee slots, sorted by date
- Columns: date, time, home vs guest, league, venue, open slots (visual indicator per sr1/sr2/sr3)
- Own club matches highlighted (background color or badge)
- Filters: date range, league
- "Übernehmen" button per open slot → calls `POST /referee/matches/:id/take`, opens deep-link in new tab
- Slots already clicked by this referee show "Beantragt" (requested) state

### Admin match detail — extended

- New "Schiedsrichter" section showing 3 referee slots
- Per slot: assigned referee name, open status, or pending intent with referee name

### Navigation

- Referee users see simplified nav: referee matches view + profile
- Admin users see full nav as before

## End-to-End Flow

```
1. Admin creates referee user → links to synced referee record, role: "referee"
2. Sync runs → stores sr1Open/sr2Open/sr3Open per match, confirms pending intents
3. Referee logs in → sees /referee/matches with all games having open slots
4. Referee clicks "Übernehmen" on slot → POST /referee/matches/:id/take
   → Backend creates intent row, returns deep-link URL
   → Frontend opens basketball-bund.net in new tab
   → Referee completes assignment on federation platform
5. Next sync → detects referee assigned, sets confirmedBySyncAt, flips srNOpen to false
6. Admin views match detail → sees slot assigned to referee (confirmed)
```
