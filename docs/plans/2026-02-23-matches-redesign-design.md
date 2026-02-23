# Match Override UI Redesign

## Problem

The current match UI has several issues:
1. Double header: page title "Spiele" and Card header "Spiele" are redundant
2. Detail page is cluttered with cards stacked vertically
3. Diff computation bug: after setting an override, both local and remote show the same value because `computeDiffs()` falls back to the match row value (which already includes the override) when `remoteSnapshot` is not passed
4. Override workflow requires navigating to a separate page and back
5. Visual design (icons, spacing, headers) doesn't feel modern or clean

## Decisions

- **Approach**: Refactor existing components in place (no new pages)
- **Edit flow**: Side panel (Sheet) slides in from the right when clicking a match row
- **Override indicator**: Subtle amber dot next to overridden values in the table, with tooltip showing "Offiziell: X -> Lokal: Y"
- **Diff display**: Side-by-side columns in the panel (Offiziell | Lokal)
- **Language**: Mixed German/English for now, with strings extracted to a constants file for future i18n

## Table Design

### Layout

- Remove the Card wrapper — table stands directly under the page heading
- Single "Spiele" h1 heading, no subtitle/description
- Toolbar (search, team filter, date filter, column visibility) between heading and table

### Columns

| Column | Sortable | Notes |
|--------|----------|-------|
| Datum | Yes | `de-DE` short format, date range filter |
| Uhrzeit | Yes | HH:MM |
| Team | Faceted filter | Own team badge |
| Heim | No | Full team name |
| Gast | No | Full team name |
| Anschreiber | No | Plain text |
| Zeitnehmer | No | Plain text |
| Shotclock | No | Plain text |

Hidden by default (toggleable): Ergebnis, Kommentar

### Visual Treatment

- **Home games**: Subtle green-tinted left border on the row (not full row highlight)
- **Overridden cells**: Small amber dot (`bullet`) after the value
- **Override tooltip**: On hover, shows "Offiziell: {remote} -> Lokal: {local}"
- **Row click**: Opens side panel (Sheet)
- **Cmd/Ctrl+click**: Opens detail page in new tab (keep URL-addressable detail page as fallback)

## Side Panel (Sheet)

Opens from the right, covers ~50% of viewport width on desktop.

### Structure

```
┌──────────────────────────────────┐
│  {Home} vs {Guest}           [✕] │  <- header with close button
│  Spieltag {N} · {League}        │
├──────────────────────────────────┤
│                                  │
│  ── Spielinfo ──                 │  <- read-only match data
│  Spiel-Nr, Spieltag, Liga       │
│  Halle, Status, Ergebnis         │
│  Period scores (Q1-Q4/A1-A8)    │
│                                  │
│  ── Lokale Änderungen ──        │  <- editable overrides
│                                  │
│  {FieldLabel}                    │
│  ┌────────────┬─────────────────┐│
│  │ Offiziell  │ Lokal           ││  <- side-by-side diff
│  │ {remote}   │ [{editable}]    ││
│  └────────────┴─────────────────┘│
│                   [Zurücksetzen]  │  <- release override
│                                  │
│  ... more override fields ...    │
│                                  │
│  ── Kampfgericht ──              │  <- local-only staff
│  Anschreiber, Zeitnehmer,       │
│  Shotclock (simple text inputs)  │
│                                  │
│  ── Notizen ──                   │  <- local-only notes
│  Intern, Öffentlich (textareas) │
│                                  │
│  Änderungsgrund: [___________]   │
│  [        Speichern        ]     │
└──────────────────────────────────┘
```

### Overridable Fields (with side-by-side diff)

- **Datum** (`kickoffDate`): DatePicker
- **Uhrzeit** (`kickoffTime`): TimePicker
- **Verzicht** (`isForfeited`): Switch
- **Abgesagt** (`isCancelled`): Switch

Each shows the official (remote) value in a read-only left column and the local (editable) value in the right column. The "Zurücksetzen" button appears only when a field has an active override and calls DELETE `/admin/matches/{id}/overrides/{fieldName}`.

### Local-Only Fields (no diff needed)

- **Hallenname** (`venueNameOverride`): Text input, max 200 chars
- **Anschreiber**: Text input, max 100 chars
- **Zeitnehmer**: Text input, max 100 chars
- **Shotclock**: Text input, max 100 chars
- **Interne Notizen** (`internalNotes`): Textarea
- **Öffentlicher Kommentar** (`publicComment`): Textarea

### Form Behavior

- React Hook Form + Zod validation (onBlur mode)
- Dirty tracking: Save button disabled when pristine or submitting
- Unsaved changes warning (beforeunload)
- Toast notifications on success/error
- Panel data refreshes after save; table row updates to reflect changes

## Bug Fix: Diff Computation

### Root Cause

`computeDiffs()` in `match-admin.service.ts:340` accepts an optional `remoteSnapshot` parameter. When not provided (lines 653, 734, 851), it falls back:

```typescript
remote: remoteSnapshot?.kickoffDate as string ?? row.kickoffDate
```

But `row.kickoffDate` is the current match value which may already include the override. So both "remote" and "local" show the same value.

### Fix

Always load the latest remote version snapshot from `matchRemoteVersions` before calling `computeDiffs()`. Make `remoteSnapshot` a required parameter.

Call sites to update:
- `getMatchDetail()` (line ~495) — already passes snapshot, keep
- `updateMatchLocal()` (line ~653) — load snapshot before calling
- `releaseOverride()` (line ~734) — load snapshot before calling
- `handleScoreOverride()` (line ~851) — load snapshot before calling

## New UI Components

Add to `packages/ui/src/components/`:

- **`sheet.tsx`**: shadcn/ui Sheet (Radix Dialog-based slide-over panel)
- **`tooltip.tsx`**: shadcn/ui Tooltip (Radix Tooltip for override dot hover)

## i18n Readiness

Extract all UI strings to `components/admin/matches/match-strings.ts`:

```typescript
export const matchStrings = {
  pageTitle: "Spiele",
  searchPlaceholder: "Spiele suchen...",
  columnDate: "Datum",
  columnTime: "Uhrzeit",
  officialLabel: "Offiziell",
  localLabel: "Lokal",
  resetOverride: "Zurücksetzen",
  save: "Speichern",
  // ... etc
}
```

This gives a single source of truth for text and a foundation for i18n later.

## Files to Modify

### Frontend (apps/web)

- `app/admin/matches/page.tsx` — remove Card wrapper, simplify heading
- `app/admin/matches/[id]/page.tsx` — keep as fallback route
- `components/admin/matches/match-list-table.tsx` — remove Card, add override dot indicators, add Sheet trigger on row click
- `components/admin/matches/match-detail-view.tsx` — refactor into `match-edit-sheet.tsx` (Sheet-based panel)
- `components/admin/matches/match-override-field.tsx` — refactor to side-by-side layout
- `components/admin/matches/diff-indicator.tsx` — may remove or simplify (replaced by dot + tooltip in table)
- `components/admin/matches/match-strings.ts` — new, string constants
- `components/admin/matches/types.ts` — update as needed
- `components/admin/matches/utils.ts` — add tooltip formatting helpers

### Shared UI (packages/ui)

- `components/sheet.tsx` — new
- `components/tooltip.tsx` — new

### Backend (apps/api)

- `services/admin/match-admin.service.ts` — fix `computeDiffs()` to always use remote snapshot

## Testing

- Fix `computeDiffs()` test: verify remote value from snapshot, not row
- Test side panel form submission (PATCH endpoint already tested)
- Test override release (DELETE endpoint already tested)
- Maintain 100% coverage thresholds
