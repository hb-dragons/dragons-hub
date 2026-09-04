# Referee Einsatz screen and team staff — design

Decided 2026-09-02 in a grilling session. Vocabulary: `CONTEXT.md` → "Officiating". Ownership split: ADR-0008.

## Problem

A referee opening one of their games in the Dragons App lands on the fan match screen for own-club games (score, quarters, head-to-head, form, no officials) and on a thin referee screen for everything else. Neither answers the three questions a referee has before a game: who is the co-referee, which team runs the Kampfgericht, and whom to call. The last one has no data behind it: coaches live only in the CMS, which the API never reads.

## Decisions

| # | Decision |
|---|----------|
| Surface | Native (Dragons App) only. Web keeps the admin referee hub, no referee self-service. |
| Screen | One referee-specific Einsatz screen for every referee game. The own-club branch into `game/[id]` goes away; a "Spielinfo" link opens the fan screen when a linked match exists. Today tab and push deep links route to the Einsatz screen. |
| Kampfgericht | Shown as the Dragons team name (`matches.anschreiber/zeitnehmer/shotclock`), home games with a linked match only. One line when all three equal, three lines when split. Its team contact is shown next to it, deduped when it is the playing team. |
| Team contact | Coaches of the Dragons team playing (both teams in a derby). Flagged `refereeContact` members first, otherwise every coach of that team entry. Foreign games have no contact section. Past games keep it. |
| Co-referee | Name only (already on the row). Email and phone deliberately not shown. |
| Extra info | Venue street + PLZ + maps link; Spielnummer + league; per-slot federation state (vorläufig/fest); venue-changed and time-changed flags; cancelled/forfeited badges; deep link to the basketball-bund.net game. No SR-Kosten. |
| Visibility | Kampfgericht and contacts only when the caller holds a slot on that game or is an admin. Open claimable games show teams, venue, slots only. |
| Staff entity | `team_staff` in the Hub, attached to a team entry (ADR-0004), carried forward at season rollover, optionally linked to a user account (`user.staffId`, nullable unique, mirror of `refereeId`). Roles: `trainer`, `co_trainer`. |
| Staff source of truth | Hub. CMS `trainers` collection removed after a one-off import. CMS keeps team photo, prose, training times, SEO; `people` stays for Vorstand and positions. |
| Photo | Hub owns the coach portrait (existing GCS upload helper). |
| Website | Reads `staff[]` from `/public/teams` at build time; Hub triggers the site rebuild on staff change through the existing repository_dispatch plumbing. |
| Coach self-edit | Native profile: phone, email, licence. Name, role, teams, photo remain admin-only. |
| Policy | One sentence in the Datenschutzerklärung `#app` section, human-reviewed. |

Assumptions made without asking: `firstName`/`lastName` split (matches `referees`; CMS `name` split on the last space at import); linking a user to a staff record grants the `coach` role through a default-on checkbox and touches no other role; the read-only `coach` RBAC role is unchanged; Kampfgericht hidden when the referee game has no linked match; issue #281 (season-blind referee reads) stays open, the new queries do not add to it.

## Data model

### `team_staff` (new)

| Column | Notes |
|--------|-------|
| `id` | serial PK |
| `teamEntryId` | FK → `team_entries.id`, cascade |
| `firstName`, `lastName` | required |
| `role` | enum `trainer` \| `co_trainer` |
| `phone`, `email`, `licence` | nullable text |
| `photoFilename` | nullable, object name in the GCS bucket |
| `refereeContact` | boolean, default false |
| `createdAt`, `updatedAt` | |

`user.staffId` — nullable, unique, FK → `team_staff.id`, set null on delete.

Carry-forward: `team-entry-seeding.service.ts` copies the staff rows of the previous entry when it seeds a new season's entry (same place badge color and duration are copied). Custom name is still not copied.

### `referee_games` (extended)

`venueStreet`, `venuePostalCode` (from `spielfeld.strasse` / `plz`), `sr1Tentative`, `sr2Tentative` (from `tempeinteilung`), `venueChanged`, `timeChanged` (from `spielortGeandert` / `spielzeitGeandert`). All included in the data hash.

## API

| Method | Path | Change |
|--------|------|--------|
| GET | `/referee/games/:id` | Returns `RefereeGameDetail` = `RefereeGameListItem` + `brief` (venue address, slot state, change flags, deep link) + `contacts` and `kampfgericht` only when `mySlot !== null` or the caller is an admin. Season derived from the linked match's league; active season as fallback when unlinked. |
| GET | `/admin/teams/:id/staff` | List staff of a team entry (`team:view`). |
| POST/PATCH/DELETE | `/admin/teams/:id/staff[/:staffId]` | Manage staff (`team:manage`); PATCH also flips `refereeContact`. |
| POST | `/admin/teams/:id/staff/:staffId/photo` | Multipart upload, same shape as player photos (`team:manage`). |
| PATCH | `/admin/users/:id/staff-link` | Link/unlink a user to a staff record, optional `grantCoachRole` (mirror of the referee link). Built as `staff-link`, not the `link-staff` this row first named, so it reads as one family with `referee-link`. |
| GET/PATCH | `/me/staff` | Coach reads and edits own phone, email, licence (`user.staffId` required). |
| GET | `/public/teams` | Own-club rows gain `staff: { firstName, lastName, role, licence, photoUrl }[]`. Never phone or email. |

Request schemas live in `@dragons/contracts`; AGENTS.md endpoint and data-model tables gain the rows in the same commits (`docs-drift.test.ts`).

## Delivery

Three issues, in order. Each is a PR series with its own tests and coverage.

**A — staff entity, admin editor, import, Einsatz screen.** Schema + migration, sync columns, referee detail endpoint, staff admin endpoints, Web-App staff editor on the teams page, `migrate:cms-staff` one-off script, native Einsatz screen replacing both branches, route/deep-link updates, i18n (de/en), `AGENTS.md` rows.

**B — Website reads staff from the Hub, CMS cleanup.** `/public/teams` `staff[]`, Hub → site rebuild dispatch on staff change, site build-time fetch replacing `primaryTrainer()` from CMS, CMS: drop `trainers`, `teams.trainers`, `teams.leagueName`, `teams.leagueId`; contract test and site zod schema updated together. Follow-up issue for CMS `people.phone` (unused, `read: anyone`). Separate issue for rendering `trainingTimes`.

**C — coach accounts and self-edit.** `user.staffId`, link-staff dialog with the coach-role checkbox, native profile "Meine Kontaktdaten", `/me/staff`, the Datenschutzerklärung sentence (ready-for-human).

## Out of scope

Co-referee email or phone; individual Kampfgericht names; SR-Kosten; web referee self-service; season scoping of referee lists (#281); Betreuer/Teammanager roles (one enum value when needed).
