# Social Wizard Improvement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the social wizard's manual week/year inputs with smart action cards and add collapsed context strips so completed steps remain visible.

**Architecture:** Frontend-only changes to 6 files in `apps/web/src/components/admin/social/`. The wizard lifts match-fetching from step 2 into the parent component, adds a `WeekendOption` type for pre-fetched card data, and renders collapsed summary strips for completed steps. No API or backend changes.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.9, Tailwind CSS, shadcn/Radix UI components, Lucide icons, `fetchAPI` from `@/lib/api`, weekend-utils from `@/lib/weekend-utils`.

**Spec:** `docs/superpowers/specs/2026-03-12-social-wizard-improvement-design.md`

---

## Chunk 1: Types, Weekend Utils, and Collapsed Strip Component

### Task 1: Update types.ts with new types and WizardState fields

**Files:**
- Modify: `apps/web/src/components/admin/social/types.ts`

- [ ] **Step 1: Add `WeekendOption` type and update `WizardState`**

```typescript
// Add after the existing Background interface:

export interface WeekendOption {
  week: number;
  year: number;
  dateFrom: string;
  dateTo: string;
  matchCount: number;
  matches: MatchItem[];
}

// Update WizardState to add two new fields:
// - furthestStep: 1 | 2 | 3 | 4;
// - selectedBackground: Background | null;
```

In `types.ts`, add the `WeekendOption` interface after `Background`. Then add two fields to `WizardState`:

```typescript
export interface WizardState {
  step: 1 | 2 | 3 | 4;
  furthestStep: 1 | 2 | 3 | 4;
  postType: PostType;
  calendarWeek: number;
  year: number;
  weekendLabel: string;
  matches: MatchItem[];
  selectedPhotoId: number | null;
  selectedPhoto: PlayerPhoto | null;
  selectedBackgroundId: number | null;
  selectedBackground: Background | null;
  playerPosition: PlayerPosition;
}
```

- [ ] **Step 2: Verify typecheck catches the missing fields**

Run: `pnpm --filter @dragons/web typecheck 2>&1 | head -30`

Expected: Type errors in `post-wizard.tsx` because `getInitialState()` doesn't include `furthestStep` or `selectedBackground`. This confirms the type change propagated.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/social/types.ts
git commit -m "feat(social): add WeekendOption type and extend WizardState"
```

---

### Task 2: Add weekend calculation utility functions

**Files:**
- Create: `apps/web/src/components/admin/social/weekend-utils.ts`
- Create: `apps/web/src/components/admin/social/weekend-utils.test.ts`

These are social-wizard-specific weekend calculations (which Saturday to show for results vs. preview). They use the shared `weekend-utils` from `@/lib/weekend-utils` for basic date math.

- [ ] **Step 1: Write failing tests for `getLastWeekendSaturday` and `getNextWeekendSaturday`**

Create `apps/web/src/components/admin/social/weekend-utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { toDateString } from "@/lib/weekend-utils";
import { getLastWeekendSaturday, getNextWeekendSaturday, getISOWeekAndYear } from "./weekend-utils";

describe("getLastWeekendSaturday", () => {
  it("returns previous Saturday when today is Monday", () => {
    // Monday 2026-03-09 → last fully-past weekend started Sat Mar 7
    const result = getLastWeekendSaturday(new Date(2026, 2, 9));
    expect(toDateString(result)).toBe("2026-03-07");
  });

  it("returns previous week Saturday when today is Saturday", () => {
    // Saturday 2026-03-07 → current weekend in progress, last was Feb 28
    const result = getLastWeekendSaturday(new Date(2026, 2, 7));
    expect(toDateString(result)).toBe("2026-02-28");
  });

  it("returns previous week Saturday when today is Sunday", () => {
    // Sunday 2026-03-08 → current weekend in progress, last was Feb 28
    const result = getLastWeekendSaturday(new Date(2026, 2, 8));
    expect(toDateString(result)).toBe("2026-02-28");
  });

  it("returns previous Saturday when today is Friday", () => {
    // Friday 2026-03-13 → last fully-past weekend started Sat Mar 7
    const result = getLastWeekendSaturday(new Date(2026, 2, 13));
    expect(toDateString(result)).toBe("2026-03-07");
  });

  it("returns previous Saturday when today is Wednesday", () => {
    // Wednesday 2026-03-11 → last fully-past weekend started Sat Mar 7
    const result = getLastWeekendSaturday(new Date(2026, 2, 11));
    expect(toDateString(result)).toBe("2026-03-07");
  });
});

describe("getNextWeekendSaturday", () => {
  it("returns this coming Saturday when today is Monday", () => {
    // Monday 2026-03-09 → next weekend starts Sat Mar 14
    const result = getNextWeekendSaturday(new Date(2026, 2, 9));
    expect(toDateString(result)).toBe("2026-03-14");
  });

  it("returns next Saturday when today is Saturday", () => {
    // Saturday 2026-03-07 → current weekend in progress, next is Mar 14
    const result = getNextWeekendSaturday(new Date(2026, 2, 7));
    expect(toDateString(result)).toBe("2026-03-14");
  });

  it("returns next Saturday when today is Sunday", () => {
    // Sunday 2026-03-08 → current weekend in progress, next is Mar 14
    const result = getNextWeekendSaturday(new Date(2026, 2, 8));
    expect(toDateString(result)).toBe("2026-03-14");
  });

  it("returns this coming Saturday when today is Wednesday", () => {
    // Wednesday 2026-03-11 → next weekend starts Sat Mar 14
    const result = getNextWeekendSaturday(new Date(2026, 2, 11));
    expect(toDateString(result)).toBe("2026-03-14");
  });
});

describe("getISOWeekAndYear", () => {
  it("returns correct ISO week for a known date", () => {
    // Saturday 2026-03-07 is ISO week 10
    const result = getISOWeekAndYear(new Date(2026, 2, 7));
    expect(result).toEqual({ week: 10, year: 2026 });
  });

  it("handles year boundary (Jan 1 2026 is week 1)", () => {
    const result = getISOWeekAndYear(new Date(2026, 0, 1));
    expect(result).toEqual({ week: 1, year: 2026 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/web test -- --run src/components/admin/social/weekend-utils.test.ts`

Expected: FAIL — module `./weekend-utils` not found.

- [ ] **Step 3: Implement the weekend utility functions**

Create `apps/web/src/components/admin/social/weekend-utils.ts`:

```typescript
import {
  getSaturday,
  getSunday,
  previousSaturday,
  nextSaturday,
  toDateString,
} from "@/lib/weekend-utils";

/**
 * Get the Saturday of the most recent fully-past weekend.
 * If today is Saturday or Sunday, the current weekend is still
 * in progress — return the previous week's Saturday.
 *
 * NOTE: getSaturday() returns the Saturday of the same Mon-Sun week,
 * which is the *upcoming* Saturday for Mon-Fri dates.
 */
export function getLastWeekendSaturday(today: Date = new Date()): Date {
  const day = today.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) {
    // Weekend in progress — go back to last week's Saturday
    const thisSat = getSaturday(today);
    return previousSaturday(thisSat);
  }
  // Weekday — getSaturday returns THIS week's upcoming Saturday,
  // so go back one week to get last weekend's Saturday
  return previousSaturday(getSaturday(today));
}

/**
 * Get the Saturday of the next weekend that hasn't started yet.
 * If today is Saturday or Sunday, "next" is next week's Saturday.
 */
export function getNextWeekendSaturday(today: Date = new Date()): Date {
  const day = today.getDay();
  if (day === 0 || day === 6) {
    // Weekend in progress — next weekend is +1 week from this Saturday
    const thisSat = getSaturday(today);
    return nextSaturday(thisSat);
  }
  // Weekday — getSaturday returns THIS week's upcoming Saturday,
  // which is exactly what we want for "next weekend"
  return getSaturday(today);
}

/** Returns ISO 8601 week number and year for a given date. */
export function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { week, year: d.getUTCFullYear() };
}

/** Format a weekend date range for display: "Sa 7. – So 8. Mär" */
export function formatWeekendLabel(saturday: Date): string {
  const sunday = getSunday(saturday);
  const monthNames = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];
  const satDay = saturday.getDate();
  const sunDay = sunday.getDate();
  const satMonth = monthNames[saturday.getMonth()]!;
  const sunMonth = monthNames[sunday.getMonth()]!;

  if (satMonth === sunMonth) {
    return `Sa ${satDay}. – So ${sunDay}. ${satMonth}`;
  }
  return `Sa ${satDay}. ${satMonth} – So ${sunDay}. ${sunMonth}`;
}

export { toDateString, previousSaturday, nextSaturday } from "@/lib/weekend-utils";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/web test -- --run src/components/admin/social/weekend-utils.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/social/weekend-utils.ts apps/web/src/components/admin/social/weekend-utils.test.ts
git commit -m "feat(social): add weekend calculation utils with tests"
```

---

### Task 3: Create the CollapsedStepSummary component

**Files:**
- Create: `apps/web/src/components/admin/social/collapsed-step-summary.tsx`

This renders the summary strip for a completed wizard step. It receives the wizard state and step number, and displays a one-line summary with an "Ändern" link.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/admin/social/collapsed-step-summary.tsx`:

```typescript
"use client";

import type { WizardState } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CollapsedStepSummaryProps {
  step: 1 | 2 | 3;
  state: WizardState;
  onEdit: () => void;
}

function StepOneSummary({ state }: { state: WizardState }) {
  const typeLabel = state.postType === "results" ? "Ergebnisse" : "Vorschau";
  return (
    <span className="text-sm">
      <span className="font-medium">{typeLabel}</span>
      <span className="text-muted-foreground">
        {" · "}KW {state.calendarWeek} ({state.weekendLabel})
      </span>
    </span>
  );
}

function StepTwoSummary({ state }: { state: WizardState }) {
  const count = state.matches.length;
  const labels = state.matches.map((m) => m.teamLabel).join(", ");
  return (
    <span className="text-sm">
      <span className="font-medium">{count} Spiele</span>
      <span className="text-muted-foreground"> · {labels}</span>
    </span>
  );
}

function StepThreeSummary({ state }: { state: WizardState }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      {state.selectedPhotoId !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_BASE}/admin/social/player-photos/${state.selectedPhotoId}/image`}
          alt="Spielerfoto"
          className="h-10 w-10 rounded object-cover"
          crossOrigin="use-credentials"
        />
      )}
      {state.selectedBackground !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_BASE}/admin/social/backgrounds/${state.selectedBackground.id}/image`}
          alt="Hintergrund"
          className="h-10 w-10 rounded object-cover"
          crossOrigin="use-credentials"
        />
      )}
      <span className="text-muted-foreground">Foto & Hintergrund</span>
    </span>
  );
}

export function CollapsedStepSummary({
  step,
  state,
  onEdit,
}: CollapsedStepSummaryProps) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
          {step}
        </span>
        {step === 1 && <StepOneSummary state={state} />}
        {step === 2 && <StepTwoSummary state={state} />}
        {step === 3 && <StepThreeSummary state={state} />}
      </div>
      <button
        onClick={onEdit}
        className="text-sm text-primary hover:underline"
        type="button"
      >
        Ändern
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm --filter @dragons/web typecheck 2>&1 | head -20`

Expected: Errors only from `post-wizard.tsx` (missing `furthestStep`/`selectedBackground` in `getInitialState`), not from the new component.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/social/collapsed-step-summary.tsx
git commit -m "feat(social): add CollapsedStepSummary component"
```

---

## Chunk 2: Rewrite PostTypeStep and update MatchReviewStep / AssetSelectStep

### Task 4: Rewrite PostTypeStep as action cards

**Files:**
- Modify: `apps/web/src/components/admin/social/steps/post-type-step.tsx`

The entire component is rewritten. It receives `WeekendOption` data (pre-fetched by the parent wizard) and renders two clickable cards. It also has a toggleable week picker.

- [ ] **Step 1: Rewrite post-type-step.tsx**

Replace the full contents of `apps/web/src/components/admin/social/steps/post-type-step.tsx` with:

```typescript
"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@dragons/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import type { WeekendOption } from "../types";

interface PostTypeStepProps {
  resultsOption: WeekendOption | null;
  previewOption: WeekendOption | null;
  loading: boolean;
  error: string | null;
  onSelectCard: (type: "results" | "preview", option: WeekendOption) => void;
  onNavigateWeek: (direction: "prev" | "next") => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  weekLabel: string;
}

function ActionCard({
  option,
  typeLabel,
  contextLabel,
  countSuffix,
  loading,
  onClick,
}: {
  option: WeekendOption | null;
  typeLabel: string;
  contextLabel: string;
  countSuffix: string;
  loading: boolean;
  onClick: () => void;
}) {
  const disabled = loading || option === null || option.matchCount === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex-1 rounded-lg border p-4 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/50 opacity-50"
          : "cursor-pointer border-border bg-card hover:border-primary hover:bg-accent/5",
      ].join(" ")}
    >
      <div className="text-base font-bold">{typeLabel}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{contextLabel}</div>
      {loading ? (
        <div className="mt-3 h-5 w-32 animate-pulse rounded bg-muted" />
      ) : option !== null ? (
        <>
          <div className="mt-3 text-sm font-medium">
            KW {option.week} · {option.dateFrom && formatDateRange(option.dateFrom, option.dateTo)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {option.matchCount} {countSuffix}
          </div>
        </>
      ) : null}
    </button>
  );
}

function formatDateRange(dateFrom: string, dateTo: string): string {
  const monthNames = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];
  const sat = new Date(dateFrom + "T12:00:00");
  const sun = new Date(dateTo + "T12:00:00");
  const satMonth = monthNames[sat.getMonth()]!;
  const sunMonth = monthNames[sun.getMonth()]!;
  if (satMonth === sunMonth) {
    return `Sa ${sat.getDate()}. – So ${sun.getDate()}. ${satMonth}`;
  }
  return `Sa ${sat.getDate()}. ${satMonth} – So ${sun.getDate()}. ${sunMonth}`;
}

export function PostTypeStep({
  resultsOption,
  previewOption,
  loading,
  error,
  onSelectCard,
  onNavigateWeek,
  canNavigatePrev,
  canNavigateNext,
  weekLabel,
}: PostTypeStepProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Social Post erstellen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <ActionCard
            option={resultsOption}
            typeLabel="Ergebnisse"
            contextLabel="Letztes Wochenende"
            countSuffix="Spiele mit Ergebnis"
            loading={loading}
            onClick={() => resultsOption && onSelectCard("results", resultsOption)}
          />
          <ActionCard
            option={previewOption}
            typeLabel="Vorschau"
            contextLabel="Kommendes Wochenende"
            countSuffix="Spiele geplant"
            loading={loading}
            onClick={() => previewOption && onSelectCard("preview", previewOption)}
          />
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowPicker((prev) => !prev)}
            className="text-sm text-primary hover:underline"
          >
            {showPicker ? "Standardwoche" : "Andere Woche wählen"}
          </button>
        </div>

        {showPicker && (
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onNavigateWeek("prev")}
              disabled={!canNavigatePrev}
              aria-label="Vorherige Woche"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{weekLabel}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onNavigateWeek("next")}
              disabled={!canNavigateNext}
              aria-label="Nächste Woche"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify no import errors in this file**

Run: `pnpm --filter @dragons/web typecheck 2>&1 | grep post-type-step`

Expected: No errors from `post-type-step.tsx` itself (errors in `post-wizard.tsx` are expected because it still passes old props).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/social/steps/post-type-step.tsx
git commit -m "feat(social): rewrite PostTypeStep as action cards with week picker"
```

---

### Task 5: Simplify MatchReviewStep to receive matches as props

**Files:**
- Modify: `apps/web/src/components/admin/social/steps/match-review-step.tsx`

Remove the internal `useEffect` fetch, `loading`/`error` state, and the `fetchAPI` import. The component now receives matches, loading, and error as props.

- [ ] **Step 1: Rewrite match-review-step.tsx**

Replace the full contents of `apps/web/src/components/admin/social/steps/match-review-step.tsx` with:

```typescript
"use client";

import { ArrowUp, ArrowDown, X } from "lucide-react";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import type { MatchItem } from "../types";

interface MatchReviewStepProps {
  matches: MatchItem[];
  loading: boolean;
  error: string | null;
  onUpdateMatches: (matches: MatchItem[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function MatchReviewStep({
  matches,
  loading,
  error,
  onUpdateMatches,
  onNext,
  onBack,
}: MatchReviewStepProps) {
  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...matches];
    const temp = updated[index - 1]!;
    updated[index - 1] = updated[index]!;
    updated[index] = temp;
    onUpdateMatches(updated);
  }

  function moveDown(index: number) {
    if (index === matches.length - 1) return;
    const updated = [...matches];
    const temp = updated[index]!;
    updated[index] = updated[index + 1]!;
    updated[index + 1] = temp;
    onUpdateMatches(updated);
  }

  function removeMatch(index: number) {
    const updated = matches.filter((_, i) => i !== index);
    onUpdateMatches(updated);
  }

  function formatScore(match: MatchItem): string {
    if (match.homeScore !== null && match.guestScore !== null) {
      return `${match.homeScore}:${match.guestScore}`;
    }
    return match.kickoffTime;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spiele auswählen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <span className="animate-pulse">Spiele werden geladen…</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">Keine Spiele gefunden</div>
        )}

        {!loading && !error && matches.length > 0 && (
          <ul className="space-y-2">
            {matches.map((match, index) => (
              <li
                key={match.id}
                className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => moveUp(index)}
                    aria-label="Nach oben"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === matches.length - 1}
                    onClick={() => moveDown(index)}
                    aria-label="Nach unten"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{match.teamLabel}</span>
                    <span className="font-mono text-muted-foreground">{formatScore(match)}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span>{match.opponent}</span>
                    <Badge variant={match.isHome ? "default" : "secondary"}>
                      {match.isHome ? "Heim" : "Auswärts"}
                    </Badge>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMatch(index)}
                  aria-label="Spiel entfernen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            Zurück
          </Button>
          <Button onClick={onNext} disabled={matches.length === 0}>
            Assets auswählen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/admin/social/steps/match-review-step.tsx
git commit -m "refactor(social): simplify MatchReviewStep to receive matches as props"
```

---

### Task 6: Update AssetSelectStep to store full Background object

**Files:**
- Modify: `apps/web/src/components/admin/social/steps/asset-select-step.tsx`

Two small changes: (1) store the full `Background` object in state when selecting, and (2) store it when auto-selecting the default.

- [ ] **Step 1: Update `handleSelectBackground` and auto-select logic**

In `asset-select-step.tsx`, change the `handleSelectBackground` function (line 71-73):

```typescript
// Before:
function handleSelectBackground(bg: Background) {
  onUpdate({ selectedBackgroundId: bg.id });
}

// After:
function handleSelectBackground(bg: Background) {
  onUpdate({ selectedBackgroundId: bg.id, selectedBackground: bg });
}
```

Also update the auto-select in `loadBackgrounds` (line 47-49):

```typescript
// Before:
if (defaultBg) {
  onUpdate({ selectedBackgroundId: defaultBg.id });
}

// After:
if (defaultBg) {
  onUpdate({ selectedBackgroundId: defaultBg.id, selectedBackground: defaultBg });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/admin/social/steps/asset-select-step.tsx
git commit -m "refactor(social): store full Background object in wizard state"
```

---

## Chunk 3: Rewrite PostWizard with accordion and data fetching

### Task 7: Rewrite PostWizard as the orchestrator

**Files:**
- Modify: `apps/web/src/components/admin/social/post-wizard.tsx`

This is the main change. The wizard:
1. Fetches weekend match data on mount (two parallel calls)
2. Manages week navigation state (offset from default, ±8 weeks)
3. Renders collapsed strips for completed steps
4. Tracks `furthestStep` alongside `step`
5. Owns match loading/error state

- [ ] **Step 1: Rewrite post-wizard.tsx**

Replace the full contents of `apps/web/src/components/admin/social/post-wizard.tsx` with:

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchItem, PostType, WeekendOption, WizardState } from "./types";
import { PostTypeStep } from "./steps/post-type-step";
import { MatchReviewStep } from "./steps/match-review-step";
import { AssetSelectStep } from "./steps/asset-select-step";
import { PreviewStep } from "./steps/preview-step";
import { CollapsedStepSummary } from "./collapsed-step-summary";
import {
  getLastWeekendSaturday,
  getNextWeekendSaturday,
  getISOWeekAndYear,
  formatWeekendLabel,
  previousSaturday,
  nextSaturday,
  toDateString,
} from "./weekend-utils";
import { getSunday } from "@/lib/weekend-utils";
import { fetchAPI } from "@/lib/api";

const MAX_WEEK_OFFSET = 8;

const MONTH_NAMES = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

function formatDateRange(dateFrom: string, dateTo: string): string {
  const sat = new Date(dateFrom + "T12:00:00");
  const sun = new Date(dateTo + "T12:00:00");
  const satMonth = MONTH_NAMES[sat.getMonth()]!;
  const sunMonth = MONTH_NAMES[sun.getMonth()]!;
  if (satMonth === sunMonth) {
    return `Sa ${sat.getDate()}. – So ${sun.getDate()}. ${satMonth}`;
  }
  return `Sa ${sat.getDate()}. ${satMonth} – So ${sun.getDate()}. ${sunMonth}`;
}

function getInitialState(): WizardState {
  return {
    step: 1,
    furthestStep: 1,
    postType: "results",
    calendarWeek: 1,
    year: 2026,
    weekendLabel: "",
    matches: [],
    selectedPhotoId: null,
    selectedPhoto: null,
    selectedBackgroundId: null,
    selectedBackground: null,
    playerPosition: { x: 0, y: 0, scale: 1 },
  };
}

async function fetchWeekendOption(
  type: "results" | "preview",
  saturday: Date,
): Promise<WeekendOption> {
  const { week, year } = getISOWeekAndYear(saturday);
  const dateFrom = toDateString(saturday);
  const dateTo = toDateString(getSunday(saturday));
  const matches = await fetchAPI<MatchItem[]>(
    `/admin/social/matches?type=${type}&week=${week}&year=${year}`,
  );
  const sliced = matches.slice(0, 6);
  return { week, year, dateFrom, dateTo, matchCount: sliced.length, matches: sliced };
}

export function PostWizard() {
  const [state, setState] = useState<WizardState>(getInitialState);

  // Weekend navigation state
  const [weekOffset, setWeekOffset] = useState(0);
  const [resultsOption, setResultsOption] = useState<WeekendOption | null>(null);
  const [previewOption, setPreviewOption] = useState<WeekendOption | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState<string | null>(null);

  // Track what week/type the current matches were fetched for
  const matchSourceRef = useRef<{ week: number; type: PostType } | null>(null);

  // Calculate the base Saturdays (offset = 0)
  const baseSatResults = getLastWeekendSaturday();
  const baseSatPreview = getNextWeekendSaturday();

  // Apply offset
  function applyOffset(base: Date, offset: number): Date {
    let d = new Date(base);
    const step = offset > 0 ? nextSaturday : previousSaturday;
    for (let i = 0; i < Math.abs(offset); i++) {
      d = step(d);
    }
    return d;
  }

  const currentResultsSat = applyOffset(baseSatResults, weekOffset);
  const currentPreviewSat = applyOffset(baseSatPreview, weekOffset);
  const weekLabel = `KW ${getISOWeekAndYear(currentResultsSat).week} / ${getISOWeekAndYear(currentPreviewSat).week}`;

  // Fetch weekend data whenever offset changes
  useEffect(() => {
    let cancelled = false;
    setCardLoading(true);
    setCardError(null);

    Promise.all([
      fetchWeekendOption("results", currentResultsSat),
      fetchWeekendOption("preview", currentPreviewSat),
    ])
      .then(([results, preview]) => {
        if (!cancelled) {
          setResultsOption(results);
          setPreviewOption(preview);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCardError(err instanceof Error ? err.message : "Fehler beim Laden");
        }
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  function handleUpdate(updates: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...updates }));
  }

  function handleSelectCard(type: PostType, option: WeekendOption) {
    const source = matchSourceRef.current;
    const needsNewMatches = !source || source.week !== option.week || source.type !== type;
    const label = formatDateRange(option.dateFrom, option.dateTo);

    setState((prev) => ({
      ...prev,
      postType: type,
      calendarWeek: option.week,
      year: option.year,
      weekendLabel: label,
      matches: needsNewMatches ? option.matches : prev.matches,
      step: 2,
      furthestStep: Math.max(prev.furthestStep, 2) as WizardState["furthestStep"],
    }));

    if (needsNewMatches) {
      matchSourceRef.current = { week: option.week, type };
    }
  }

  function handleNext() {
    setState((prev) => {
      if (prev.step < 4) {
        const next = (prev.step + 1) as WizardState["step"];
        return {
          ...prev,
          step: next,
          furthestStep: Math.max(prev.furthestStep, next) as WizardState["furthestStep"],
        };
      }
      return prev;
    });
  }

  function handleBack() {
    setState((prev) => {
      if (prev.step > 1) {
        return { ...prev, step: (prev.step - 1) as WizardState["step"] };
      }
      return prev;
    });
  }

  function handleGoToStep(step: 1 | 2 | 3) {
    setState((prev) => ({ ...prev, step }));
  }

  const handleUpdateMatches = useCallback((matches: MatchItem[]) => {
    setState((prev) => ({ ...prev, matches }));
  }, []);

  return (
    <div className="space-y-3">
      {/* Collapsed strips for completed steps before the active one */}
      {state.step > 1 && state.furthestStep >= 1 && (
        <CollapsedStepSummary step={1} state={state} onEdit={() => handleGoToStep(1)} />
      )}

      {state.step > 2 && state.furthestStep >= 2 && (
        <CollapsedStepSummary step={2} state={state} onEdit={() => handleGoToStep(2)} />
      )}

      {state.step > 3 && state.furthestStep >= 3 && (
        <CollapsedStepSummary step={3} state={state} onEdit={() => handleGoToStep(3)} />
      )}

      {/* Active step */}
      {state.step === 1 && (
        <PostTypeStep
          resultsOption={resultsOption}
          previewOption={previewOption}
          loading={cardLoading}
          error={cardError}
          onSelectCard={handleSelectCard}
          onNavigateWeek={(dir) =>
            setWeekOffset((prev) =>
              dir === "prev" ? Math.max(prev - 1, -MAX_WEEK_OFFSET) : Math.min(prev + 1, MAX_WEEK_OFFSET),
            )
          }
          canNavigatePrev={weekOffset > -MAX_WEEK_OFFSET}
          canNavigateNext={weekOffset < MAX_WEEK_OFFSET}
          weekLabel={weekLabel}
        />
      )}

      {state.step === 2 && (
        <MatchReviewStep
          matches={state.matches}
          loading={false}
          error={null}
          onUpdateMatches={handleUpdateMatches}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {state.step === 3 && (
        <AssetSelectStep state={state} onUpdate={handleUpdate} onNext={handleNext} onBack={handleBack} />
      )}

      {state.step === 4 && (
        <PreviewStep state={state} onUpdate={handleUpdate} onBack={handleBack} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @dragons/web typecheck`

Expected: PASS — all types should align. Fix any type errors before proceeding.

- [ ] **Step 3: Run lint**

Run: `pnpm --filter @dragons/web lint`

Expected: PASS or only pre-existing warnings. Fix any new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/social/post-wizard.tsx
git commit -m "feat(social): rewrite PostWizard with action cards and collapsed strips"
```

---

### Task 8: Smoke test the full flow

- [ ] **Step 1: Run full typecheck and lint across the monorepo**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS.

- [ ] **Step 2: Run the web app's test suite**

Run: `pnpm --filter @dragons/web test -- --run`

Expected: All tests pass, including the new `weekend-utils.test.ts`.

- [ ] **Step 3: Verify the build succeeds**

Run: `pnpm --filter @dragons/web build`

Expected: Build succeeds without errors.

- [ ] **Step 4: Final commit if any fixups were needed**

If any fixes were required during the smoke test, stage and commit them:

```bash
git add -u
git commit -m "fix(social): address typecheck/lint issues from wizard rewrite"
```
