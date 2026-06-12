# Referee-hub kickoff date formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render referee-hub kickoff dates/times as locale-aware human-friendly strings (matching the public pages) instead of raw ISO, via one shared tested helper used at four call sites.

**Architecture:** A pure `formatKickoff(format, date, time?)` helper wraps next-intl's `format.dateTime` with the public-page date options (`weekday: short, day: numeric, month: short`) and appends `· HH:MM`. Each of the four referee-hub components obtains the formatter with `useFormatter()` and calls the helper; per-site trailing fields (league / role / `#matchNo`) stay inline.

**Tech Stack:** TypeScript, React, Next.js (App Router), next-intl (`useFormatter` / `createFormatter`), Vitest + Testing Library (happy-dom).

---

## File structure

- **Create** `apps/web/src/lib/format-kickoff.ts` — the shared helper (one responsibility: format a kickoff date + optional time).
- **Create** `apps/web/src/lib/format-kickoff.test.ts` — unit tests using real `createFormatter` for de + en.
- **Modify** `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx` (render line ~78).
- **Modify** `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx` (extend next-intl mock).
- **Modify** `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx` (`Row` subcomponent, render line ~78).
- **Modify** `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.test.tsx` (extend next-intl mock).
- **Modify** `apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx` (render line ~29). No test file exists; the formatting logic is covered by `format-kickoff.test.ts`.
- **Modify** `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx` (date-only render line ~47). Its test uses a real `NextIntlClientProvider`, so no mock change.

**Working branch:** `fix/referee-hub-kickoff-date-formatting` (already checked out; spec committed as `9fa21372`).

**Note on the next-intl mock asymmetry:** `open-games-list.test.tsx` and `upcoming-subtab.test.tsx` do `vi.mock("next-intl", () => ({ useTranslations: ... }))` — these crash once the component calls `useFormatter`, so they MUST gain a `useFormatter` stub. `history-subtab.test.tsx` renders through the real `NextIntlClientProvider`, so `useFormatter` resolves for real — no change. `open-slot-detail.tsx` has no test file.

---

## Task 1: Shared `formatKickoff` helper (TDD)

**Files:**
- Create: `apps/web/src/lib/format-kickoff.ts`
- Test: `apps/web/src/lib/format-kickoff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/format-kickoff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createFormatter } from "next-intl";
import { formatKickoff } from "./format-kickoff";

const en = createFormatter({ locale: "en", timeZone: "Europe/Berlin" });
const de = createFormatter({ locale: "de", timeZone: "Europe/Berlin" });

describe("formatKickoff", () => {
  it("formats date + time for en (drops seconds)", () => {
    expect(formatKickoff(en, "2026-04-25", "18:30:00")).toBe("Sat, Apr 25 · 18:30");
  });

  it("formats date + time for de (locale ordering)", () => {
    expect(formatKickoff(de, "2026-04-25", "18:30:00")).toBe("Sa., 25. Apr. · 18:30");
  });

  it("formats date only when time is omitted (en)", () => {
    expect(formatKickoff(en, "2026-04-25")).toBe("Sat, Apr 25");
  });

  it("formats date only when time is null (de)", () => {
    expect(formatKickoff(de, "2026-04-25", null)).toBe("Sa., 25. Apr.");
  });

  it("uses the noon anchor so the time never rolls the date", () => {
    // 00:00 time, but the date part must stay Jan 1 (Thu), not roll to Dec 31.
    expect(formatKickoff(en, "2026-01-01", "00:00:00")).toBe("Thu, Jan 1 · 00:00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/web test -- format-kickoff`
Expected: FAIL — cannot resolve `./format-kickoff` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/format-kickoff.ts`:

```ts
import type { useFormatter } from "next-intl";

type Formatter = ReturnType<typeof useFormatter>;

const DATE_OPTS = { weekday: "short", day: "numeric", month: "short" } as const;

/**
 * Formats a referee-game kickoff for display.
 * @param format next-intl formatter from `useFormatter()`
 * @param date   kickoff date as "YYYY-MM-DD"
 * @param time   optional kickoff time as "HH:MM:SS" (seconds dropped); omit for date-only
 * @returns e.g. "Sat, Apr 25 · 18:30" (en) / "Sa., 25. Apr. · 18:30" (de), locale-aware
 */
export function formatKickoff(format: Formatter, date: string, time?: string | null): string {
  // Noon anchor avoids UTC-vs-local date rollover (matches the public pages).
  const datePart = format.dateTime(new Date(`${date}T12:00:00`), DATE_OPTS);
  return time ? `${datePart} · ${time.slice(0, 5)}` : datePart;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/web test -- format-kickoff`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format-kickoff.ts apps/web/src/lib/format-kickoff.test.ts
git commit -m "feat(web): add formatKickoff helper for referee-hub dates"
```

---

## Task 2: Use the helper in `open-games-list.tsx`

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx`
- Test: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx`

- [ ] **Step 1: Add the import and formatter to the component**

In `open-games-list.tsx`, change the next-intl import (line 6) from:

```tsx
import { useTranslations } from "next-intl";
```
to:
```tsx
import { useTranslations, useFormatter } from "next-intl";
```

Add the helper import alongside the other `@/` imports (near line 7):

```tsx
import { formatKickoff } from "@/lib/format-kickoff";
```

Inside `OpenGamesList`, just below `const t = useTranslations("refereeHub.openSlots");` (line 25), add:

```tsx
  const format = useFormatter();
```

Replace the date line in `Row` (line 77-79):

```tsx
        <div className="text-xs opacity-70">
          {g.kickoffDate} · {g.kickoffTime} · {g.leagueShort ?? ""}
        </div>
```
with:
```tsx
        <div className="text-xs opacity-70">
          {formatKickoff(format, g.kickoffDate, g.kickoffTime)} · {g.leagueShort ?? ""}
        </div>
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web test -- open-games-list`
Expected: FAIL — `useFormatter` is not a function / `format.dateTime` is undefined (the test's `vi.mock("next-intl", …)` only stubs `useTranslations`).

- [ ] **Step 3: Extend the next-intl mock**

In `open-games-list.test.tsx`, replace the mock (line 9):

```tsx
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
```
with:
```tsx
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- open-games-list`
Expected: PASS (all existing assertions — team names, badges — unaffected).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx \
        apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx
git commit -m "feat(web): format kickoff in open games list"
```

---

## Task 3: Use the helper in `upcoming-subtab.tsx`

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx`
- Test: `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.test.tsx`

- [ ] **Step 1: Add the import and use the formatter in `Row`**

In `upcoming-subtab.tsx`, change the next-intl import (line 4) from:

```tsx
import { useTranslations } from "next-intl";
```
to:
```tsx
import { useTranslations, useFormatter } from "next-intl";
```

Add the helper import alongside the other imports (near line 6):

```tsx
import { formatKickoff } from "@/lib/format-kickoff";
```

The date is rendered inside the `Row` subcomponent (lines 73-86). Update `Row` so it gets its own formatter and uses the helper:

```tsx
function Row({ game }: RowProps) {
  const format = useFormatter();
  return (
    <div className="flex justify-between bg-surface-low rounded-md p-2 text-sm">
      <div>
        <div className="text-xs text-muted-foreground">
          {formatKickoff(format, game.kickoffDate, game.kickoffTime)} · {game.leagueShort ?? ""}
        </div>
        <div>
          {game.homeTeamName} vs {game.guestTeamName}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web test -- upcoming-subtab`
Expected: FAIL — `useFormatter` is not a function (the test's `vi.mock("next-intl", …)` only stubs `useTranslations`).

- [ ] **Step 3: Extend the next-intl mock**

In `upcoming-subtab.test.tsx`, replace the mock (line 8):

```tsx
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
```
with:
```tsx
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- upcoming-subtab`
Expected: PASS (existing assertions — `"A vs B"`, section keys — unaffected).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx \
        apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.test.tsx
git commit -m "feat(web): format kickoff in referee upcoming subtab"
```

---

## Task 4: Use the helper in `open-slot-detail.tsx`

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx`

No co-located test exists for this component; the formatting behavior is covered by `format-kickoff.test.ts` (Task 1). Verification here is typecheck only.

- [ ] **Step 1: Add the import and formatter, replace the date line**

In `open-slot-detail.tsx`, change the next-intl import (line 4) from:

```tsx
import { useTranslations } from "next-intl";
```
to:
```tsx
import { useTranslations, useFormatter } from "next-intl";
```

Add the helper import (near line 6):

```tsx
import { formatKickoff } from "@/lib/format-kickoff";
```

Inside `OpenSlotDetail`, just below `const t = useTranslations("refereeHub.openSlots");` (line 13), add:

```tsx
  const format = useFormatter();
```

Replace the date line (line 28-30):

```tsx
        <div className="text-xs text-muted-foreground">
          {game.kickoffDate} · {game.kickoffTime} · {game.leagueShort ?? ""} · #{game.matchNo}
        </div>
```
with:
```tsx
        <div className="text-xs text-muted-foreground">
          {formatKickoff(format, game.kickoffDate, game.kickoffTime)} · {game.leagueShort ?? ""} · #{game.matchNo}
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx
git commit -m "feat(web): format kickoff in open slot detail"
```

---

## Task 5: Use the helper (date-only) in `history-subtab.tsx`

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx`

This site shows date + role (no time). Its test renders through a real `NextIntlClientProvider`, so `useFormatter` works without a mock change.

- [ ] **Step 1: Add the import and formatter, replace the date line**

In `history-subtab.tsx`, change the next-intl import (line 5) from:

```tsx
import { useTranslations } from "next-intl";
```
to:
```tsx
import { useTranslations, useFormatter } from "next-intl";
```

Add the helper import (near line 7):

```tsx
import { formatKickoff } from "@/lib/format-kickoff";
```

Inside `HistorySubtab`, just below `const t = useTranslations("refereeHub.referees.history");` (line 15), add:

```tsx
  const format = useFormatter();
```

Replace the date line (line 47):

```tsx
                <div className="text-xs text-muted-foreground">{g.kickoffDate} · {role} · {g.leagueShort ?? ""}</div>
```
with:
```tsx
                <div className="text-xs text-muted-foreground">{formatKickoff(format, g.kickoffDate)} · {role} · {g.leagueShort ?? ""}</div>
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- history-subtab`
Expected: PASS — existing assertions (status text, role, team names) unaffected; the real next-intl provider renders the formatted date.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx
git commit -m "feat(web): format kickoff in referee history subtab"
```

---

## Task 6: Full-package verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm --filter @dragons/web test`
Expected: all tests pass (previously 222 passed / 6 skipped, now including the 5 new `formatKickoff` tests).

- [ ] **Step 2: Typecheck the web package**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 3: Lint the web package**

Run: `pnpm --filter @dragons/web lint`
Expected: no errors (confirms `consistent-type-imports` is satisfied — `formatKickoff`'s `import type { useFormatter }` is type-only while the components import the value).

- [ ] **Step 4: Confirm coverage did not drop**

Run: `pnpm --filter @dragons/web coverage`
Expected: thresholds still met (the new helper is fully unit-tested; new component lines call into tested code).

---

## Self-review notes

- **Spec coverage:** helper (spec "Shared helper") → Task 1; four call sites (spec table) → Tasks 2–5; tests + mock extensions (spec "Testing") → Tasks 1–3, 5; gates (spec "Gates") → Task 6. All spec sections mapped.
- **Type consistency:** `formatKickoff(format, date, time?)` signature is identical across the helper definition (Task 1) and every call site (Tasks 2–5). `Formatter = ReturnType<typeof useFormatter>` is the single source for the param type.
- **Mock asymmetry handled:** date-only `history-subtab` and the test-less `open-slot-detail` are explicitly distinguished from the two mock-only-`useTranslations` tests that need the `useFormatter` stub.
