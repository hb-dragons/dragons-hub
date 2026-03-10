# Calendar View for Public Schedule — Design

## Goal

Add a monthly calendar view as an alternative to the existing weekend-by-weekend schedule. Users toggle between "Weekend" and "Calendar" views. The calendar shows colored dots per game day (one dot per own-club match, colored by team badge color), and tapping a day shows that day's match cards below.

## Architecture

A new `CalendarView` client component sits alongside the existing `ScheduleView`. The schedule page gets a toggle (`?view=weekend` | `?view=calendar`, default `weekend`) that switches between them. The team filter is shared across both views.

The calendar uses the existing `@dragons/ui` Calendar component (react-day-picker) with custom day cell rendering. No new API endpoints are needed — the existing `/public/matches` endpoint covers all queries by adjusting `dateFrom`/`dateTo` to span a full month.

## Team Badge Colors

### Current state

`getTeamColor` in `apps/web/src/components/admin/matches/utils.ts` hashes the team name to pick from a hardcoded Tailwind palette. Colors are not configurable and not stored.

### New approach

- Add `badgeColor` varchar column to the `teams` table (stores a preset key like `"blue"`, `"teal"`)
- Define 10 color presets with light-mode and dark-mode Tailwind classes
- Admin teams page gets a color swatch picker per team
- `getTeamColor` updated to accept a preset key, with hash-based fallback for teams without a stored color
- Public teams endpoint (`/public/teams`) includes `badgeColor` in the response

### Color presets

Each preset defines `bg`, `border`, `text` classes for both light and dark mode:

| Key | Light | Dark |
|-----|-------|------|
| `blue` | bg-blue-100 text-blue-800 border-blue-300 | bg-blue-800 text-blue-100 border-blue-600 |
| `teal` | bg-teal-100 text-teal-800 border-teal-300 | bg-teal-700 text-teal-100 border-teal-500 |
| `green` | bg-green-100 text-green-800 border-green-300 | bg-green-700 text-green-100 border-green-500 |
| `orange` | bg-orange-100 text-orange-800 border-orange-300 | bg-orange-700 text-orange-100 border-orange-500 |
| `rose` | bg-rose-100 text-rose-800 border-rose-300 | bg-rose-800 text-rose-100 border-rose-600 |
| `pink` | bg-pink-100 text-pink-800 border-pink-300 | bg-pink-700 text-pink-100 border-pink-500 |
| `cyan` | bg-cyan-100 text-cyan-800 border-cyan-300 | bg-cyan-700 text-cyan-100 border-cyan-500 |
| `indigo` | bg-indigo-100 text-indigo-800 border-indigo-300 | bg-indigo-700 text-indigo-100 border-indigo-500 |
| `emerald` | bg-emerald-100 text-emerald-800 border-emerald-300 | bg-emerald-800 text-emerald-100 border-emerald-600 |
| `violet` | bg-violet-100 text-violet-800 border-violet-300 | bg-violet-700 text-violet-100 border-violet-500 |

## Calendar View Component

### Rendering

- Monthly grid using `react-day-picker` with custom `DayContent` renderer
- Each day cell shows small colored dots — one per own-club match on that day
- Dot color comes from the team's `badgeColor` preset
- Upcoming games (no score): filled dot at full opacity
- Played games (has score): same color at 40% opacity
- Selected day is highlighted; match cards for that day render below the calendar

### Data flow

1. **Initial load (server):** Schedule page fetches current month's matches (`dateFrom=YYYY-MM-01&dateTo=YYYY-MM-31`) plus team list. Passes both to `CalendarView`.
2. **Month navigation (client):** Fetches new month's matches from `/public/matches` with updated date range. One API call per month.
3. **Day tap (client):** Filters already-fetched month data to selected day. No extra API call.
4. **Team filter (client):** Filters both dots and match list from month data.

### URL state

- `?view=calendar` — persisted in URL so the view preference is shareable
- `?team=<apiTeamPermanentId>` — shared with weekend view (already exists)

## Page Integration

The schedule page renders:
1. Team filter (shared)
2. View toggle: two buttons — "Weekend" / "Calendar"
3. Conditionally: `ScheduleView` or `CalendarView`

The server component pre-fetches data for whichever view is active based on `?view` param.

## Files

### New
- `apps/web/src/components/public/schedule/calendar-view.tsx` — calendar grid + day match list
- `apps/web/src/components/public/schedule/view-toggle.tsx` — weekend/calendar switch buttons

### Modified
- `packages/db/src/schema/teams.ts` — add `badgeColor` column
- `apps/api/src/routes/admin/team.schemas.ts` — add `badgeColor` to update schema
- `apps/api/src/services/admin/team-admin.service.ts` — include `badgeColor` in responses
- `apps/api/src/routes/public/team.routes.ts` — include `badgeColor` in public response
- `apps/web/src/components/admin/matches/utils.ts` — update `getTeamColor` to accept preset key
- `apps/web/src/app/[locale]/admin/teams/teams-table.tsx` — add color swatch picker column
- `apps/web/src/app/[locale]/(public)/schedule/page.tsx` — view toggle, conditional rendering, month-range fetch for calendar
- `apps/web/src/components/public/schedule/types.ts` — add `badgeColor` to `PublicTeam`

## Testing

- Unit tests for color preset lookup and fallback logic
- Unit tests for month date range calculation helpers
- Unit tests for day-filtering logic (grouping matches by day from month data)
