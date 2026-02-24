# Kampfgericht Team Dropdown Design

## Problem

The Kampfgericht (court staff) fields in the Match Edit Sheet are free-text inputs. They should be dropdowns populated with the Dragons' own teams from the Teams page, since staff assignments are always made by team.

## Design

### UI Changes (Match Edit Sheet only)

Replace the three free-text `Input` fields in the Officials section with:

1. **"Kampfgericht" team dropdown** — a `Combobox` at the top of the section. Selecting a team fills all three role fields (Anschreiber, Zeitnehmer, Shotclock) with that team's display name.
2. **Three per-role `Combobox` dropdowns** — each pre-filled from the top-level selection but individually overridable to a different team.

Display name priority: `customName > nameShort > name` (matches existing `getOwnTeamLabel` logic).

### Data Source

- Fetch own club teams from `GET /admin/teams` when the sheet opens
- Already returns: `{ id, name, customName, leagueName }`
- No new API endpoint needed

### Storage

No database change. The three columns (`anschreiber`, `zeitnehmer`, `shotclock`) remain `varchar(100)` and store the team's display name as text.

### Component

Reuse the existing `Combobox` from `@dragons/ui` (already used for venue selection in the same sheet).

### i18n

Add translation keys:
- `matchDetail.staff.team` — label for the top-level team dropdown
- `matchDetail.staff.teamPlaceholder` — placeholder text

### Scope

- Match Edit Sheet (`match-edit-sheet.tsx`) — both views updated
- Match Detail View — no changes (user confirmed it's no longer needed)
