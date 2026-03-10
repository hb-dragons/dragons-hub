# Calendar View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a monthly calendar view with team-colored dots as an alternative to the weekend schedule, plus admin-configurable team badge colors.

**Architecture:** New `badgeColor` column on teams table stores a color preset key. A shared color preset map defines Tailwind classes for light/dark mode. The calendar view uses `react-day-picker` from `@dragons/ui` with custom day rendering to show colored dots. The schedule page toggles between weekend and calendar views via URL param.

**Tech Stack:** Drizzle ORM (migration), Hono (API), react-day-picker, next-intl, Tailwind CSS

---

### Task 1: Add badgeColor column to teams table

**Files:**
- Modify: `packages/db/src/schema/teams.ts:11-32`

**Step 1: Add the column**

In `packages/db/src/schema/teams.ts`, add after the `estimatedGameDuration` field:

```typescript
badgeColor: varchar("badge_color", { length: 20 }),
```

**Step 2: Generate migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: New migration file created in `packages/db/migrations/`

**Step 3: Run migration**

Run: `pnpm --filter @dragons/db db:migrate`
Expected: Migration applied successfully

**Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors)

**Step 5: Commit**

```bash
git add packages/db/
git commit -m "feat: add badgeColor column to teams table"
```

---

### Task 2: Create shared color preset map

**Files:**
- Create: `packages/shared/src/team-colors.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write the test**

Create `packages/shared/src/team-colors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  COLOR_PRESETS,
  getColorPreset,
  COLOR_PRESET_KEYS,
} from "./team-colors";

describe("team-colors", () => {
  it("has 10 color presets", () => {
    expect(COLOR_PRESET_KEYS).toHaveLength(10);
  });

  it("returns the correct preset for a known key", () => {
    const preset = getColorPreset("blue");
    expect(preset).toBeDefined();
    expect(preset.dot).toBeDefined();
    expect(preset.light.bg).toContain("blue");
    expect(preset.dark.bg).toContain("blue");
  });

  it("falls back to the first preset for an unknown key", () => {
    const preset = getColorPreset("nonexistent");
    expect(preset).toEqual(COLOR_PRESETS[COLOR_PRESET_KEYS[0]]);
  });

  it("falls back to a hash-based preset for null key with teamName", () => {
    const preset1 = getColorPreset(null, "Team A");
    const preset2 = getColorPreset(null, "Team A");
    expect(preset1).toEqual(preset2);

    const preset3 = getColorPreset(null, "Team B");
    // Different teams may or may not get different colors, but both should be valid
    expect(COLOR_PRESET_KEYS).toContain(
      COLOR_PRESET_KEYS.find((k) => COLOR_PRESETS[k] === preset3)
    );
  });

  it("each preset has light and dark mode classes and a dot color", () => {
    for (const key of COLOR_PRESET_KEYS) {
      const preset = COLOR_PRESETS[key];
      expect(preset.light.bg).toBeTruthy();
      expect(preset.light.border).toBeTruthy();
      expect(preset.light.text).toBeTruthy();
      expect(preset.dark.bg).toBeTruthy();
      expect(preset.dark.border).toBeTruthy();
      expect(preset.dark.text).toBeTruthy();
      expect(preset.dot).toBeTruthy();
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/shared test -- team-colors`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `packages/shared/src/team-colors.ts`:

```typescript
export interface ColorPresetMode {
  bg: string;
  border: string;
  text: string;
}

export interface ColorPreset {
  light: ColorPresetMode;
  dark: ColorPresetMode;
  /** Tailwind bg class for the calendar dot (works in both modes) */
  dot: string;
}

export const COLOR_PRESETS: Record<string, ColorPreset> = {
  blue: {
    light: { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800" },
    dark: { bg: "bg-blue-800", border: "border-blue-600", text: "text-blue-100" },
    dot: "bg-blue-500",
  },
  teal: {
    light: { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-800" },
    dark: { bg: "bg-teal-700", border: "border-teal-500", text: "text-teal-100" },
    dot: "bg-teal-500",
  },
  green: {
    light: { bg: "bg-green-100", border: "border-green-300", text: "text-green-800" },
    dark: { bg: "bg-green-700", border: "border-green-500", text: "text-green-100" },
    dot: "bg-green-500",
  },
  orange: {
    light: { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
    dark: { bg: "bg-orange-700", border: "border-orange-500", text: "text-orange-100" },
    dot: "bg-orange-500",
  },
  rose: {
    light: { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800" },
    dark: { bg: "bg-rose-800", border: "border-rose-600", text: "text-rose-100" },
    dot: "bg-rose-500",
  },
  pink: {
    light: { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-800" },
    dark: { bg: "bg-pink-700", border: "border-pink-500", text: "text-pink-100" },
    dot: "bg-pink-500",
  },
  cyan: {
    light: { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800" },
    dark: { bg: "bg-cyan-700", border: "border-cyan-500", text: "text-cyan-100" },
    dot: "bg-cyan-500",
  },
  indigo: {
    light: { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
    dark: { bg: "bg-indigo-700", border: "border-indigo-500", text: "text-indigo-100" },
    dot: "bg-indigo-500",
  },
  emerald: {
    light: { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
    dark: { bg: "bg-emerald-800", border: "border-emerald-600", text: "text-emerald-100" },
    dot: "bg-emerald-500",
  },
  violet: {
    light: { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-800" },
    dark: { bg: "bg-violet-700", border: "border-violet-500", text: "text-violet-100" },
    dot: "bg-violet-500",
  },
};

export const COLOR_PRESET_KEYS = Object.keys(COLOR_PRESETS);

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Get a color preset by key. Falls back to hash-based selection if key is null/unknown.
 * @param key - The badgeColor preset key from the team record
 * @param teamName - Used for hash-based fallback when key is null
 */
export function getColorPreset(key: string | null | undefined, teamName?: string): ColorPreset {
  if (key && COLOR_PRESETS[key]) {
    return COLOR_PRESETS[key];
  }
  // Fallback: hash the team name or use first preset
  const fallbackKey = teamName
    ? COLOR_PRESET_KEYS[hashString(teamName) % COLOR_PRESET_KEYS.length]
    : COLOR_PRESET_KEYS[0];
  return COLOR_PRESETS[fallbackKey];
}
```

**Step 4: Export from package**

Add to `packages/shared/src/index.ts`:

```typescript
export { COLOR_PRESETS, COLOR_PRESET_KEYS, getColorPreset } from "./team-colors";
export type { ColorPreset, ColorPresetMode } from "./team-colors";
```

**Step 5: Run test to verify it passes**

Run: `pnpm --filter @dragons/shared test -- team-colors`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared color preset map for team badges"
```

---

### Task 3: Update API to include badgeColor in team endpoints

**Files:**
- Modify: `apps/api/src/routes/admin/team.schemas.ts:7-10`
- Modify: `apps/api/src/services/admin/team-admin.service.ts`
- Modify: `apps/api/src/routes/public/team.routes.ts`

**Step 1: Add badgeColor to team update schema**

In `apps/api/src/routes/admin/team.schemas.ts`, add to `teamUpdateBodySchema`:

```typescript
export const teamUpdateBodySchema = z.object({
  customName: z.string().max(50).nullable().optional(),
  estimatedGameDuration: z.number().int().positive().nullable().optional(),
  badgeColor: z.string().max(20).nullable().optional(),
});
```

**Step 2: Update admin team service**

In `apps/api/src/services/admin/team-admin.service.ts`:

Add `badgeColor` to the `OwnClubTeam` interface:

```typescript
export interface OwnClubTeam {
  id: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueName: string | null;
  estimatedGameDuration: number | null;
  badgeColor: string | null;
}
```

Add `badgeColor: teams.badgeColor` to the select in `getOwnClubTeams()` (line ~21).

Add `badgeColor: teams.badgeColor` to the `.returning()` in `updateTeam()` (line ~51).

Add to the `set` block in `updateTeam()`:

```typescript
if (data.badgeColor !== undefined) set.badgeColor = data.badgeColor;
```

**Step 3: Verify public teams endpoint already returns badgeColor**

Check `apps/api/src/routes/public/team.routes.ts` — it does `db.select().from(teams)` which returns all columns including the new `badgeColor`. No change needed.

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/admin/team.schemas.ts apps/api/src/services/admin/team-admin.service.ts
git commit -m "feat: add badgeColor to team API endpoints"
```

---

### Task 4: Update admin getTeamColor to use presets

**Files:**
- Modify: `apps/web/src/components/admin/matches/utils.ts:57-82`

**Step 1: Replace the TEAM_COLORS array and getTeamColor function**

Replace lines 57-82 in `apps/web/src/components/admin/matches/utils.ts` with:

```typescript
import { getColorPreset } from "@dragons/shared";

// Re-export for admin badge usage: returns { bg, border, text } for current color scheme
export function getTeamColor(teamName: string, badgeColor?: string | null) {
  const preset = getColorPreset(badgeColor, teamName);
  // Admin always uses dark mode style (dark bg, light text) for badge contrast
  return preset.dark;
}
```

Remove the old `TEAM_COLORS` array, `hashString` function, and old `getTeamColor` function.

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS — the return type `{ bg, border, text }` matches existing usage in `TeamBadge` component.

**Step 3: Commit**

```bash
git add apps/web/src/components/admin/matches/utils.ts
git commit -m "refactor: use shared color presets for admin team badges"
```

---

### Task 5: Add color picker to admin teams page

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

**Step 1: Add translation keys**

In `apps/web/src/messages/en.json`, add to the `"teams"` section:

```json
"badgeColor": "Badge Color"
```

In `apps/web/src/messages/de.json`, add to the `"teams"` section:

```json
"badgeColor": "Badge-Farbe"
```

**Step 2: Update the OwnClubTeam interface in teams-table.tsx**

Add `badgeColor: string | null;` to the `OwnClubTeam` interface in `teams-table.tsx`.

**Step 3: Add color draft state and color picker column**

Add a `colorDrafts` state alongside existing `drafts` and `durationDrafts`:

```typescript
const [colorDrafts, setColorDrafts] = useState<Record<number, string | null>>({});
```

Add a `getColorDraft` helper:

```typescript
function getColorDraft(team: OwnClubTeam) {
  return team.id in colorDrafts ? colorDrafts[team.id] : team.badgeColor;
}
```

Update `isDirty` to also check `colorDrafts`:

```typescript
function isDirty(team: OwnClubTeam) {
  const nameDraft = getDraft(team);
  const durDraft = getDurationDraft(team);
  const colorDraft = getColorDraft(team);
  return (
    nameDraft !== (team.customName ?? "") ||
    durDraft !== (team.estimatedGameDuration?.toString() ?? "") ||
    colorDraft !== team.badgeColor
  );
}
```

Update `save` to include `badgeColor`:

```typescript
const badgeColor = getColorDraft(team);
// ... in body:
body: JSON.stringify({ customName, estimatedGameDuration, badgeColor }),
```

Clear color draft on save success:

```typescript
setColorDrafts((prev) => {
  const next = { ...prev };
  delete next[team.id];
  return next;
});
```

**Step 4: Add the color swatch column to the table**

Add after the game duration column:

```tsx
<TableHead>{t("teams.badgeColor")}</TableHead>
```

And the table cell:

```tsx
import { COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";

<TableCell>
  <div className="flex gap-1">
    {COLOR_PRESET_KEYS.map((colorKey) => {
      const preset = getColorPreset(colorKey);
      const isSelected = getColorDraft(team) === colorKey;
      return (
        <button
          key={colorKey}
          type="button"
          className={cn(
            "size-6 rounded-full border-2 transition-transform",
            preset.dot,
            isSelected ? "scale-110 border-foreground ring-2 ring-foreground/20" : "border-transparent hover:scale-105"
          )}
          onClick={() =>
            setColorDrafts((prev) => ({ ...prev, [team.id]: colorKey }))
          }
          aria-label={colorKey}
        />
      );
    })}
  </div>
</TableCell>
```

**Step 5: Add imports**

Add at top of `teams-table.tsx`:

```typescript
import { COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";
```

**Step 6: Verify it works**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/web/src/app/[locale]/admin/teams/teams-table.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat: add color picker to admin teams page"
```

---

### Task 6: Add badgeColor to public schedule types

**Files:**
- Modify: `apps/web/src/components/public/schedule/types.ts`

**Step 1: Add badgeColor to PublicTeam**

```typescript
export interface PublicTeam {
  apiTeamPermanentId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  badgeColor: string | null;
}

export interface PublicTeamWithClubFlag extends PublicTeam {
  isOwnClub: boolean;
}
```

**Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS (existing code doesn't break since badgeColor is nullable and not consumed yet)

**Step 3: Commit**

```bash
git add apps/web/src/components/public/schedule/types.ts
git commit -m "feat: add badgeColor to public team types"
```

---

### Task 7: Add month date range utility functions

**Files:**
- Modify: `apps/web/src/lib/weekend-utils.ts`
- Modify: `apps/web/src/lib/weekend-utils.test.ts`

**Step 1: Write the tests**

Add to `apps/web/src/lib/weekend-utils.test.ts`:

```typescript
import { getMonthStart, getMonthEnd } from "./weekend-utils";

describe("getMonthStart", () => {
  it("returns the first day of the month", () => {
    const result = getMonthStart(new Date("2026-03-15T12:00:00"));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(1);
  });
});

describe("getMonthEnd", () => {
  it("returns the last day of the month", () => {
    const result = getMonthEnd(new Date("2026-03-15T12:00:00"));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(31);
  });

  it("handles February correctly", () => {
    const result = getMonthEnd(new Date("2026-02-10T12:00:00"));
    expect(result.getDate()).toBe(28);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/web test`
Expected: FAIL — getMonthStart/getMonthEnd not found

**Step 3: Implement the functions**

Add to `apps/web/src/lib/weekend-utils.ts`:

```typescript
/** Get the first day of the month containing the given date */
export function getMonthStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Get the last day of the month containing the given date */
export function getMonthEnd(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0); // Day 0 of next month = last day of current month
  d.setHours(12, 0, 0, 0);
  return d;
}
```

**Step 4: Run tests**

Run: `pnpm --filter @dragons/web test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/weekend-utils.ts apps/web/src/lib/weekend-utils.test.ts
git commit -m "feat: add month date range utilities"
```

---

### Task 8: Add i18n keys for calendar view

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

**Step 1: Add translation keys**

In `apps/web/src/messages/en.json`, add to the `"public"` object:

```json
"weekendView": "Weekend",
"calendarView": "Calendar",
"noMatchesOnDay": "No games on this day."
```

In `apps/web/src/messages/de.json`, add to the `"public"` object:

```json
"weekendView": "Wochenende",
"calendarView": "Kalender",
"noMatchesOnDay": "Keine Spiele an diesem Tag."
```

**Step 2: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat: add calendar view translation keys"
```

---

### Task 9: Create the view toggle component

**Files:**
- Create: `apps/web/src/components/public/schedule/view-toggle.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@dragons/ui/components/button";
import { CalendarDays, ListIcon } from "lucide-react";

interface ViewToggleProps {
  view: "weekend" | "calendar";
  weekendLabel: string;
  calendarLabel: string;
}

export function ViewToggle({ view, weekendLabel, calendarLabel }: ViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setView(newView: "weekend" | "calendar") {
    const params = new URLSearchParams(searchParams.toString());
    if (newView === "weekend") {
      params.delete("view");
    } else {
      params.set("view", newView);
    }
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
      <Button
        variant={view === "weekend" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => setView("weekend")}
        className="gap-1.5"
      >
        <ListIcon className="h-3.5 w-3.5" />
        {weekendLabel}
      </Button>
      <Button
        variant={view === "calendar" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => setView("calendar")}
        className="gap-1.5"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {calendarLabel}
      </Button>
    </div>
  );
}
```

**Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/public/schedule/view-toggle.tsx
git commit -m "feat: add view toggle component for weekend/calendar switch"
```

---

### Task 10: Create the calendar view component

**Files:**
- Create: `apps/web/src/components/public/schedule/calendar-view.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useFormatter } from "next-intl";
import type { DayContentProps } from "react-day-picker";
import { Calendar } from "@dragons/ui/components/calendar";
import type { MatchListItem } from "@dragons/shared";
import { getColorPreset } from "@dragons/shared";
import { MatchCard } from "./match-card";
import type { PublicTeam } from "./types";
import { resolveTeamName } from "./types";
import { getMonthStart, getMonthEnd, toDateString } from "@/lib/weekend-utils";

interface CalendarViewProps {
  teams: PublicTeam[];
  initialMatches: MatchListItem[];
  initialMonth: string; // YYYY-MM-DD of month start
  translations: {
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesOnDay: string;
  };
  apiBaseUrl: string;
}

/** Build a map of date string → matches for that day */
function buildDateMap(matches: MatchListItem[]): Map<string, MatchListItem[]> {
  const map = new Map<string, MatchListItem[]>();
  for (const match of matches) {
    const key = match.kickoffDate ?? "unknown";
    const arr = map.get(key) ?? [];
    arr.push(match);
    map.set(key, arr);
  }
  return map;
}

/** Find which own-club team is playing in a match, return their apiTeamPermanentId */
function getOwnTeamId(match: MatchListItem): number | null {
  if (match.homeIsOwnClub) return match.homeTeamApiId;
  if (match.guestIsOwnClub) return match.guestTeamApiId;
  return null;
}

export function CalendarView({
  teams,
  initialMatches,
  initialMonth,
  translations,
  apiBaseUrl,
}: CalendarViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const format = useFormatter();

  const teamParam = searchParams.get("team");
  const selectedTeamApiId = teamParam ? Number(teamParam) : null;

  const [month, setMonth] = useState(() => new Date(initialMonth + "T12:00:00"));
  const [matches, setMatches] = useState(initialMatches);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Build team color lookup: apiTeamPermanentId → dot class
  const teamColorMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const team of teams) {
      const preset = getColorPreset(team.badgeColor, resolveTeamName(team));
      map.set(team.apiTeamPermanentId, preset.dot);
    }
    return map;
  }, [teams]);

  // Filter matches by selected team
  const filteredMatches = useMemo(() => {
    if (!selectedTeamApiId) return matches;
    return matches.filter(
      (m) => m.homeTeamApiId === selectedTeamApiId || m.guestTeamApiId === selectedTeamApiId,
    );
  }, [matches, selectedTeamApiId]);

  const dateMap = useMemo(() => buildDateMap(filteredMatches), [filteredMatches]);

  // Matches for the selected day
  const dayMatches = useMemo(() => {
    if (!selectedDay) return [];
    return dateMap.get(selectedDay) ?? [];
  }, [selectedDay, dateMap]);

  const formatDate = useCallback(
    (date: string) =>
      format.dateTime(new Date(date + "T12:00:00"), {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [format],
  );

  const fetchMonth = useCallback(
    async (monthDate: Date) => {
      const start = getMonthStart(monthDate);
      const end = getMonthEnd(monthDate);
      const params = new URLSearchParams({
        dateFrom: toDateString(start),
        dateTo: toDateString(end),
      });
      setLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/public/matches?${params}`);
        const data = await res.json();
        setMatches(data.items ?? []);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl],
  );

  const handleMonthChange = useCallback(
    (newMonth: Date) => {
      setMonth(newMonth);
      setSelectedDay(null);
      fetchMonth(newMonth);
    },
    [fetchMonth],
  );

  const handleDayClick = useCallback((day: Date) => {
    const dateStr = toDateString(day);
    setSelectedDay((prev) => (prev === dateStr ? null : dateStr));
  }, []);

  // Custom day content renderer to show colored dots
  function DayContent(props: DayContentProps) {
    const dateStr = toDateString(props.date);
    const dayMatchList = dateMap.get(dateStr) ?? [];

    return (
      <div className="flex flex-col items-center">
        <span>{props.date.getDate()}</span>
        {dayMatchList.length > 0 && (
          <div className="flex gap-0.5 mt-0.5">
            {dayMatchList.map((match) => {
              const teamId = getOwnTeamId(match);
              const dotColor = teamId ? teamColorMap.get(teamId) ?? "bg-muted-foreground" : "bg-muted-foreground";
              const hasScore = match.homeScore !== null && match.guestScore !== null;
              return (
                <span
                  key={match.id}
                  className={`size-1.5 rounded-full ${dotColor} ${hasScore ? "opacity-40" : ""}`}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={loading ? "opacity-50 transition-opacity" : ""}>
        <Calendar
          mode="single"
          selected={selectedDay ? new Date(selectedDay + "T12:00:00") : undefined}
          onSelect={(day) => day && handleDayClick(day)}
          month={month}
          onMonthChange={handleMonthChange}
          weekStartsOn={1}
          components={{ DayContent }}
          className="rounded-lg border"
        />
      </div>

      {selectedDay && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {formatDate(selectedDay)}
          </h2>
          {dayMatches.length > 0 ? (
            <div className="space-y-2">
              {dayMatches.map((match) => (
                <MatchCard key={match.id} match={match} translations={translations} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-4 text-center">
              {translations.noMatchesOnDay}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

Note: The `DayContent` component prop may need adjustment based on the exact react-day-picker v9 API. Check the `@dragons/ui` calendar component for the correct prop type. If `DayContentProps` doesn't exist, use `{ date: Date }` as the props type and adjust the `components` key to `DayButton` or the correct v9 component slot.

**Step 3: Commit**

```bash
git add apps/web/src/components/public/schedule/calendar-view.tsx
git commit -m "feat: add calendar view component with team-colored dots"
```

---

### Task 11: Wire up the schedule page with view toggle

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/schedule/page.tsx`

**Step 1: Update the server component**

Replace the full file content:

```tsx
import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import type { MatchListItem } from "@dragons/shared";
import { ScheduleView } from "@/components/public/schedule/schedule-view";
import { CalendarView } from "@/components/public/schedule/calendar-view";
import { ViewToggle } from "@/components/public/schedule/view-toggle";
import type { PublicTeamWithClubFlag } from "@/components/public/schedule/types";
import { getSaturday, getSunday, getMonthStart, getMonthEnd, toDateString } from "@/lib/weekend-utils";
import { TeamFilter } from "@/components/public/schedule/team-filter";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("public");

  const teamParam = typeof params.team === "string" ? params.team : undefined;
  const view = params.view === "calendar" ? "calendar" : "weekend";

  // Fetch teams (shared between both views)
  const allTeams = await fetchAPI<PublicTeamWithClubFlag[]>("/public/teams").catch(() => []);
  const ownClubTeams = allTeams.filter((team) => team.isOwnClub);

  // Build query params based on view
  const queryParams = new URLSearchParams();
  if (teamParam) {
    queryParams.set("teamApiId", teamParam);
  }

  if (view === "calendar") {
    const now = new Date();
    const monthStart = getMonthStart(now);
    const monthEnd = getMonthEnd(now);
    queryParams.set("dateFrom", toDateString(monthStart));
    queryParams.set("dateTo", toDateString(monthEnd));
  } else {
    const saturday = getSaturday(new Date());
    const sunday = getSunday(saturday);
    queryParams.set("dateFrom", toDateString(saturday));
    queryParams.set("dateTo", toDateString(sunday));
  }

  const matchData = await fetchAPI<{ items: MatchListItem[] }>(
    `/public/matches?${queryParams}`,
  ).catch(() => ({ items: [] }));

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("schedule")}</h1>
        <ViewToggle
          view={view}
          weekendLabel={t("weekendView")}
          calendarLabel={t("calendarView")}
        />
      </div>

      {view === "weekend" ? (
        <ScheduleView
          teams={ownClubTeams}
          initialMatches={matchData.items}
          initialSaturday={toDateString(getSaturday(new Date()))}
          translations={{
            allTeams: t("allTeams"),
            vs: t("vs"),
            matchCancelled: t("matchCancelled"),
            matchForfeited: t("matchForfeited"),
            noMatchesThisWeekend: t("noMatchesThisWeekend"),
          }}
          apiBaseUrl={apiBaseUrl}
        />
      ) : (
        <CalendarView
          teams={ownClubTeams}
          initialMatches={matchData.items}
          initialMonth={toDateString(getMonthStart(new Date()))}
          translations={{
            vs: t("vs"),
            matchCancelled: t("matchCancelled"),
            matchForfeited: t("matchForfeited"),
            noMatchesOnDay: t("noMatchesOnDay"),
          }}
          apiBaseUrl={apiBaseUrl}
        />
      )}
    </div>
  );
}
```

Note: The `TeamFilter` import is unused here since it's rendered inside `ScheduleView` and `CalendarView`. Remove the import if the linter complains. If the calendar view needs a team filter, it should be passed the same way as `ScheduleView` does it (the filter is already inside `ScheduleView`). For the `CalendarView`, the team filter from the URL `?team=` param is read via `useSearchParams` inside the component, so it works automatically.

**Step 2: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/schedule/page.tsx
git commit -m "feat: wire up schedule page with view toggle and calendar view"
```

---

### Task 12: Add team filter to calendar view

The `CalendarView` currently reads the team filter from URL params but doesn't render a filter UI. The `ScheduleView` has `TeamFilter` built in. For consistency, move the team filter to the schedule page level so both views share it.

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/schedule/page.tsx`
- Create: `apps/web/src/components/public/schedule/schedule-page-client.tsx`

**Step 1: Create a client wrapper**

The team filter needs `onSelect` (client-side navigation), so we need a thin client wrapper that renders the filter + view toggle + the active view.

Create `apps/web/src/components/public/schedule/schedule-page-client.tsx`:

```tsx
"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MatchListItem } from "@dragons/shared";
import { ScheduleView } from "./schedule-view";
import { CalendarView } from "./calendar-view";
import { ViewToggle } from "./view-toggle";
import { TeamFilter } from "./team-filter";
import type { PublicTeam } from "./types";

interface SchedulePageClientProps {
  view: "weekend" | "calendar";
  teams: PublicTeam[];
  initialMatches: MatchListItem[];
  initialSaturday: string;
  initialMonth: string;
  translations: {
    allTeams: string;
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesThisWeekend: string;
    noMatchesOnDay: string;
    weekendView: string;
    calendarView: string;
  };
  apiBaseUrl: string;
}

export function SchedulePageClient({
  view,
  teams,
  initialMatches,
  initialSaturday,
  initialMonth,
  translations,
  apiBaseUrl,
}: SchedulePageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const selectedTeamApiId = searchParams.get("team")
    ? Number(searchParams.get("team"))
    : null;

  const handleTeamSelect = useCallback(
    (teamApiId: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (teamApiId) {
        params.set("team", teamApiId.toString());
      } else {
        params.delete("team");
      }
      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <TeamFilter
          teams={teams}
          selectedTeamApiId={selectedTeamApiId}
          onSelect={handleTeamSelect}
          allTeamsLabel={translations.allTeams}
        />
        <ViewToggle
          view={view}
          weekendLabel={translations.weekendView}
          calendarLabel={translations.calendarView}
        />
      </div>

      {view === "weekend" ? (
        <ScheduleView
          teams={teams}
          initialMatches={initialMatches}
          initialSaturday={initialSaturday}
          translations={{
            allTeams: translations.allTeams,
            vs: translations.vs,
            matchCancelled: translations.matchCancelled,
            matchForfeited: translations.matchForfeited,
            noMatchesThisWeekend: translations.noMatchesThisWeekend,
          }}
          apiBaseUrl={apiBaseUrl}
        />
      ) : (
        <CalendarView
          teams={teams}
          initialMatches={initialMatches}
          initialMonth={initialMonth}
          translations={{
            vs: translations.vs,
            matchCancelled: translations.matchCancelled,
            matchForfeited: translations.matchForfeited,
            noMatchesOnDay: translations.noMatchesOnDay,
          }}
          apiBaseUrl={apiBaseUrl}
        />
      )}
    </div>
  );
}
```

**Step 2: Update schedule page to use the client wrapper**

Replace `apps/web/src/app/[locale]/(public)/schedule/page.tsx`:

```tsx
import { fetchAPI } from "@/lib/api";
import { getTranslations } from "next-intl/server";
import type { MatchListItem } from "@dragons/shared";
import type { PublicTeamWithClubFlag } from "@/components/public/schedule/types";
import { getSaturday, getSunday, getMonthStart, getMonthEnd, toDateString } from "@/lib/weekend-utils";
import { SchedulePageClient } from "@/components/public/schedule/schedule-page-client";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("public");

  const teamParam = typeof params.team === "string" ? params.team : undefined;
  const view = params.view === "calendar" ? "calendar" : "weekend";

  const allTeams = await fetchAPI<PublicTeamWithClubFlag[]>("/public/teams").catch(() => []);
  const ownClubTeams = allTeams.filter((team) => team.isOwnClub);

  const queryParams = new URLSearchParams();
  if (teamParam) {
    queryParams.set("teamApiId", teamParam);
  }

  const saturday = getSaturday(new Date());
  const monthStart = getMonthStart(new Date());

  if (view === "calendar") {
    queryParams.set("dateFrom", toDateString(monthStart));
    queryParams.set("dateTo", toDateString(getMonthEnd(new Date())));
  } else {
    queryParams.set("dateFrom", toDateString(saturday));
    queryParams.set("dateTo", toDateString(getSunday(saturday)));
  }

  const matchData = await fetchAPI<{ items: MatchListItem[] }>(
    `/public/matches?${queryParams}`,
  ).catch(() => ({ items: [] }));

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("schedule")}</h1>
      <SchedulePageClient
        view={view}
        teams={ownClubTeams}
        initialMatches={matchData.items}
        initialSaturday={toDateString(saturday)}
        initialMonth={toDateString(monthStart)}
        translations={{
          allTeams: t("allTeams"),
          vs: t("vs"),
          matchCancelled: t("matchCancelled"),
          matchForfeited: t("matchForfeited"),
          noMatchesThisWeekend: t("noMatchesThisWeekend"),
          noMatchesOnDay: t("noMatchesOnDay"),
          weekendView: t("weekendView"),
          calendarView: t("calendarView"),
        }}
        apiBaseUrl={apiBaseUrl}
      />
    </div>
  );
}
```

**Step 3: Remove duplicate TeamFilter from ScheduleView**

In `apps/web/src/components/public/schedule/schedule-view.tsx`, remove the `TeamFilter` import and its JSX rendering since it's now at the page level. Also remove the `handleTeamSelect` callback and the `allTeams` translation from `ScheduleViewProps.translations`. The team filtering is now handled by the URL param `?team=` which `ScheduleView` already reads via `useSearchParams`.

**Step 4: Verify typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/public/schedule/schedule-page-client.tsx apps/web/src/app/[locale]/(public)/schedule/page.tsx apps/web/src/components/public/schedule/schedule-view.tsx
git commit -m "feat: share team filter between weekend and calendar views"
```

---

### Task 13: Visual testing and polish

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Test weekend view**

- Navigate to `http://localhost:3000/schedule` — should show weekend view (default)
- Verify team filter and weekend navigation still work
- Select a team and verify URL updates

**Step 3: Test calendar view**

- Navigate to `http://localhost:3000/schedule?view=calendar`
- Verify calendar renders with colored dots on game days
- Verify upcoming games have solid dots, played games have muted dots
- Click a day with games — match cards appear below
- Click a day without games — empty state message appears
- Navigate to next/previous month — data loads
- Select a team — only that team's dots show

**Step 4: Test view toggle**

- Click "Calendar" button — URL changes, calendar appears
- Click "Weekend" button — URL changes, weekend view returns
- Verify team filter persists across view switches

**Step 5: Test admin color picker**

- Navigate to admin teams page
- Verify color swatches appear for each team
- Select a color, click save
- Go back to public calendar — verify dot colors match

**Step 6: Fix any issues found during testing**

Address any TypeScript errors, layout issues, or API mismatches.

**Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish calendar view after visual testing"
```

---

### Task 14: Run full CI checks

**Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 2: Lint**

Run: `pnpm lint`
Expected: PASS

**Step 3: Tests**

Run: `pnpm test`
Expected: PASS

**Step 4: Build**

Run: `pnpm build`
Expected: PASS

**Step 5: Fix any failures and commit**

```bash
git add -A
git commit -m "fix: address CI check failures"
```
