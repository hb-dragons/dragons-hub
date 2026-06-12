# Referee-hub kickoff date formatting — design

## Problem

In the referee hub, kickoff dates/times render as raw ISO strings
(e.g. `2026-04-25 · 18:30:00`) instead of a locale-aware, human-friendly
format. Fix the four sites that render the `{kickoffDate} · {kickoffTime} · …`
pattern so they match the formatting the public pages already use.

## Data shape

- `kickoffDate`: `"YYYY-MM-DD"` (string)
- `kickoffTime`: `"HH:MM:SS"` (string)

Documented in `packages/shared/src/broadcast.ts`; same shape on the referee
game DTOs.

## Target format

Match the public homepage / game pages exactly (next-intl `useFormatter`):

```
weekday: short, day: numeric, month: short   →   "Sat, Apr 25" (en) / "Sa., 25. Apr." (de)
+ " · " + time.slice(0, 5)                    →   "Sat, Apr 25 · 18:30"
```

- `new Date(`${date}T12:00:00`)` — the noon anchor avoids UTC-vs-local date
  rollover (matches the public pattern).
- `.slice(0, 5)` drops the seconds from the time.
- next-intl renders the date per-locale automatically (de wants `DD. Mon.`
  ordering), so no manual locale branching.

## Shared helper

New module `apps/web/src/lib/format-kickoff.ts`:

```ts
import type { useFormatter } from "next-intl";
type Formatter = ReturnType<typeof useFormatter>;

const DATE_OPTS = { weekday: "short", day: "numeric", month: "short" } as const;

/** kickoffDate "YYYY-MM-DD", kickoffTime "HH:MM:SS" → "Sat, Apr 25 · 18:30" (locale-aware). */
export function formatKickoff(format: Formatter, date: string, time?: string | null): string {
  const datePart = format.dateTime(new Date(`${date}T12:00:00`), DATE_OPTS);
  return time ? `${datePart} · ${time.slice(0, 5)}` : datePart;
}
```

The helper covers two shapes: **date only** (history subtab) and
**date + time** (the other three). League / role / `#matchNo` stay inline at
each call site — they vary per site, so they sit outside the helper's
boundary.

## Call sites

Each component adds `const format = useFormatter();` and replaces the raw
interpolation:

| File:line | New render |
|---|---|
| `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx:78` | `{formatKickoff(format, g.kickoffDate, g.kickoffTime)} · {g.leagueShort ?? ""}` |
| `apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx:29` | `{formatKickoff(format, game.kickoffDate, game.kickoffTime)} · {game.leagueShort ?? ""} · #{game.matchNo}` |
| `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx:78` | `useFormatter` inside the `Row` subcomponent; `{formatKickoff(format, game.kickoffDate, game.kickoffTime)} · {game.leagueShort ?? ""}` |
| `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx:47` | `{formatKickoff(format, g.kickoffDate)} · {role} · {g.leagueShort ?? ""}` (date-only — this site shows role, not time) |

## Testing

- **New** `apps/web/src/lib/format-kickoff.test.ts` — built with TDD
  (red→green). Uses the real `createFormatter` from `next-intl` for both `de`
  and `en` locales (timezone `Europe/Berlin`), asserting:
  - date + time output for each locale
  - date-only output (time omitted) for each locale
  - no UTC date rollover at the noon anchor
- **Extend existing component mocks.** The component test files mock
  `next-intl` as `vi.mock("next-intl", () => ({ useTranslations: ... }))`.
  Adding `useFormatter` to the components means each of those mocks must also
  return a `useFormatter` stub, or the render throws. Affected files:
  `open-games-list.test.tsx`, `upcoming-subtab.test.tsx`, and
  (if it mocks next-intl) `open-slot-detail.test.tsx` / `history-subtab.test.tsx`.
  Existing assertions (team names, translation keys) are unaffected — none
  assert on the raw date string.

## Gates

- `pnpm --filter @dragons/web test`
- `pnpm --filter @dragons/web typecheck`
- `apps/web` coverage must not drop (the new helper is fully unit-tested).

## Out of scope

- The public-page formatting (already correct).
- The pending `fix/referee-list-selection-and-open-badge` commits — their merge
  is a separate decision, tracked independently.
