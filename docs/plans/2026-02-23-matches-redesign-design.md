# Matches Table & Detail Page Redesign

## Goal

Redesign the matches list table and detail page for efficient game planning. The table should surface scheduling and staff assignment info at a glance. The detail page should provide a clean two-column layout with inline override editing and clear diff visibility.

## Matches Table

### Default Columns

| Column | Sortable | Filterable | Notes |
|--------|----------|------------|-------|
| Datum (Date) | Yes | Date range picker | `de-DE` short format |
| Uhrzeit (Time) | Yes | No | `HH:MM` |
| Team | No | Faceted filter | Own team display name |
| Heim (Home) | No | No | Full team name |
| Gast (Guest) | No | No | Full team name |
| Anschreiber | No | No | Team name, plain text |
| Zeitnehmer | No | No | Team name, plain text |
| Shotclock | No | No | Team name, plain text |

### Hidden Columns (toggleable via column visibility menu)

- Ergebnis (Score)
- Kommentar (Public Comment)

### Visual Treatment

- **Home games**: Green background row (`bg-green-100` / `dark:bg-green-950/30`)
- **Global search**: Searches across home team, guest team, public comment, own team label
- **Empty state**: Calendar icon + "Keine Spiele gefunden"
- **Row click**: Navigate to detail page (Cmd/Ctrl+click for new tab)

## Match Detail Page

### Layout: Two-Column Split

On desktop, the page splits into a left read-only column and a right editable column. On mobile, they stack vertically (read-only on top).

### Header

- Back button (left arrow) linking to `/admin/matches`
- Title: "{Home Team} vs. {Guest Team}"
- Matchday badge
- Override count badge (amber, only if overrides exist)

### Left Column: Read-Only Reference

Displays match metadata that comes from the remote API. Not editable.

- **Match identifiers**: Match No, Matchday
- **League**: League name
- **Score**: Final score (e.g., "45:38") + Halftime score
- **Period scores**: Table with Q1-Q4 (or A1-A8 for achtel), OT1/OT2 if present
- **Status flags**: Confirmed, Forfeited, Cancelled as read-only badges
- **Sync info**: Last remote sync timestamp, remote version number

### Right Column: Editable Form

All editable fields live here, managed by React Hook Form with Zod validation.

#### Overridable Fields (remote + local)

Each overridable field renders as:

```
[Label]                    [Diverged] or [Synced]
┌─────────────────────────────────────────────────┐
│ [editable input with current value]         [x] │
└─────────────────────────────────────────────────┘
Remote: {remote value}
```

- **Amber left border + "Diverged" badge**: Local value differs from remote
- **Green "Synced" badge**: Local value matches remote
- **[x] Release button**: Only shown when diverged; reverts field to remote value
- **Remote label**: Always visible below the input in muted text

Fields:
- **Date** (`kickoffDate`): Date picker input. Validation: valid date format.
- **Time** (`kickoffTime`): Time picker input. Validation: `HH:MM` or `HH:MM:SS`.
- **Venue** (`venueNameOverride`): Text input. Max 200 chars.
- **Forfeited** (`isForfeited`): Switch/toggle.
- **Cancelled** (`isCancelled`): Switch/toggle.

#### Staff Section (local-only)

Simple text inputs, no remote reference.

- **Anschreiber**: Text input, max 100 chars
- **Zeitnehmer**: Text input, max 100 chars
- **Shotclock**: Text input, max 100 chars

#### Notes Section (local-only)

- **Internal Notes**: Textarea, max 2000 chars, labeled "only visible to admins"
- **Public Comment**: Textarea, max 500 chars, labeled "visible on public pages"

#### Form Footer

- **Change Reason**: Optional text input, max 200 chars
- **Save Changes**: Button, disabled when form is not dirty or is submitting
- Shows spinner during submission
- Toast notification on success/error
- Page data refreshes on successful save

### Form Behavior

- **Validation**: On blur (validate when leaving a field), with inline error messages
- **Dirty tracking**: React Hook Form tracks which fields changed; Save button only enabled when dirty
- **Unsaved changes**: Warn before navigating away if form has unsaved changes
- **Library**: React Hook Form + `@hookform/resolvers/zod` + existing Zod schema from `types.ts`

## Technical Approach

### Dependencies

- `react-hook-form` (add to `apps/web`)
- `@hookform/resolvers` (add to `apps/web`)

### Files to Modify

**Table changes:**
- `apps/web/src/components/admin/matches/match-list-table.tsx`: Update columns, remove Score/Comment from default, change staff cell rendering from badges to plain text, update home game row styling to green

**Detail page changes:**
- `apps/web/src/components/admin/matches/match-detail-view.tsx`: Rewrite from tabbed to two-column layout with React Hook Form
- `apps/web/src/components/admin/matches/match-override-field.tsx`: Refactor to work with React Hook Form `Controller`, add remote reference display and diff indicator inline
- `apps/web/src/components/admin/matches/diff-indicator.tsx`: Keep as-is (already handles diverged/synced/local-only states)

**No API changes needed.** The existing endpoints (`GET /admin/matches`, `GET /admin/matches/:id`, `PATCH /admin/matches/:id`, `DELETE /admin/matches/:id/overrides/:fieldName`) already support everything required.
