# Stitch Design System Integration — Spec

## Overview

Integrate the "Dragon's Lair" design language from the Stitch project into the Dragons admin UI. The Stitch project contains 4 page designs (Dashboard, Schedule, Standings, Referee Management) each in dark desktop, light desktop, and mobile variants. The design tokens (colors, fonts, radii, shadows) are already applied. This spec covers the **layout and component changes** needed to match the Stitch page layouts.

## Design Source

- **Stitch project:** `projects/6536303684079353503` ("Dragons")
- **Dark design system:** "Dragon's Lair" — dark mode, `surface` #131313, Space Grotesk + Inter
- **Light design system:** "Dragon's Lair Light" — light mode, `surface` #f8f9fa, same fonts
- **Design tokens already applied** in `packages/ui/src/styles/globals.css` (colors, fonts, radii, shadows, surface tiers, heat accent, brand tokens)

## Scope

### Phase 1: Layout Foundation (shared components)
Reusable components that all redesigned pages share:
- `PageHeader` — large Space Grotesk display title with optional subtitle and stat badges
- `StatCard` — KPI metric card with label, value, optional trend indicator
- `SummaryStrip` — bottom-of-page stat aggregation row
- Table styling — remove explicit borders, add tonal row layering per design system rules

### Phase 2: Admin Dashboard (new page)
New landing page at `/admin/dashboard` replacing the current redirect to `/admin/sync`.
- 4 KPI cards (referees, upcoming matches, league position, teams tracked)
- Urgent Tasks widget (aggregated from multiple data sources)
- Today's Schedule widget (today's matches)
- Quick-link cards (Teams, Bookings, Sync Status)

### Phase 3: Schedule Matrix (future — redesign `/admin/matches`)
Apply display title, league badge chips, ref status indicators, summary strip.

### Phase 4: League Standings (future — redesign `/admin/standings`)
Apply display title, top stat cards, league filter toggle, own-team highlight.

### Phase 5: Referee Management (future — redesign `/admin/referees`)
Apply display title, two-column layout, game assignments view, quick assign pool.

**This plan covers Phases 1-2 only.** Phases 3-5 are separate plans once the foundation is validated.

## Data Mapping (Phase 2 Dashboard)

| Widget | Data Source | API Endpoint |
|---|---|---|
| Referees count | Paginated total | `GET /admin/referees?limit=1&offset=0` → `.total` |
| Upcoming matches | Paginated total filtered by future date | `GET /admin/matches?dateFrom=<today>` → `.total` |
| League position | Best own-team position from standings | `GET /admin/standings` → filter `isOwnClub` |
| Teams tracked | Array length | `GET /admin/teams` → `.length` |
| Today's matches | Matches for today | `GET /admin/matches?dateFrom=<today>&dateTo=<today>` |
| Urgent tasks | Matches missing refs, sync errors, pending bookings | Multiple endpoints |
| Sync status | Current sync state | `GET /admin/sync/status` |

## Design Rules (from Stitch design system docs)

1. **No 1px borders for sectioning** — use tonal surface shifts instead
2. **Display typography** — Space Grotesk (`font-display`) for all page titles, uppercase, tight tracking
3. **Tonal layering** — cards on `surface-low`, sections on `surface-base`, interactive elements on `surface-high`
4. **Ghost borders** — `outline-variant` at 15% opacity only when required for accessibility
5. **Dragon shadows** — large blur (32px+), low opacity (6-8%), tinted with `on-surface` color
6. **Orange "heat" accent** — for urgent/live items, CTAs, countdown alerts
7. **Sharp corners** — `rounded-md` (0.25rem base), not `rounded-xl`
8. **Editorial whitespace** — generous `py-4 px-6` padding, `space-y-8` between sections

## Non-Goals

- Public-facing pages (schedule, standings, teams for fans) — separate effort
- Navigation restructure — keep current sidebar groups, only add Dashboard item
- New API endpoints — dashboard aggregates client-side from existing endpoints
- Mobile-specific components — responsive via Tailwind, no separate mobile components
