# Match Override UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the match list and detail UI with a clean table, side panel for editing overrides with side-by-side diff display, and fix the diff computation bug.

**Architecture:** Refactor existing match components in place. Replace the detail page navigation with a Sheet (slide-over panel) triggered by row click. Fix the backend `computeDiffs()` to always use the remote snapshot. Add Sheet and Tooltip UI primitives to the shared UI package.

**Tech Stack:** Next.js 16 App Router, TanStack React Table, shadcn/ui (Radix), react-hook-form + Zod, Hono API, Drizzle ORM

**Worktree:** `/Users/jn/git/dragons-all/.worktrees/match-override-ui` (branch: `feature/match-override-ui`)

**Design doc:** `docs/plans/2026-02-23-matches-redesign-design.md`

---

### Task 1: Fix `computeDiffs()` Bug — Write Tests

The diff computation bug causes both "remote" and "local" to show the same value after an override, because `computeDiffs()` falls back to `row.kickoffDate` when no snapshot is passed.

**Files:**
- Modify: `apps/api/src/services/admin/match-admin.service.test.ts`

**Step 1: Write failing test for `computeDiffs` with overridden field but no snapshot**

Add this test inside the existing `describe("computeDiffs", ...)` block (after line 627 in `match-admin.service.test.ts`):

```typescript
it("uses remote snapshot values instead of row values for overridden fields", () => {
  const row = {
    kickoffDate: "2025-04-01", // overridden value in the row
    kickoffTime: "19:00:00",   // overridden value in the row
    venueName: "Test Venue",
    venueNameOverride: null,
    isForfeited: false,
    isCancelled: false,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    internalNotes: null,
    publicComment: null,
  } as Parameters<typeof computeDiffs>[0];

  const remoteSnapshot = {
    kickoffDate: "2025-03-15", // original remote value
    kickoffTime: "18:00",      // original remote value
    isForfeited: false,
    isCancelled: false,
  };

  const diffs = computeDiffs(row, ["kickoffDate", "kickoffTime"], remoteSnapshot);

  const dateDiff = diffs.find((d) => d.field === "kickoffDate");
  expect(dateDiff).toBeDefined();
  expect(dateDiff!.remoteValue).toBe("2025-03-15");
  expect(dateDiff!.localValue).toBe("2025-04-01");
  expect(dateDiff!.status).toBe("diverged");

  const timeDiff = diffs.find((d) => d.field === "kickoffTime");
  expect(timeDiff).toBeDefined();
  expect(timeDiff!.remoteValue).toBe("18:00");
  expect(timeDiff!.localValue).toBe("19:00:00");
  expect(timeDiff!.status).toBe("diverged");
});

it("requires remoteSnapshot for correct diff when override matches row value", () => {
  // This is the exact bug scenario: override is set, but row value already includes it,
  // so without snapshot both remote and local would show the same value
  const row = {
    kickoffDate: "2025-04-01", // this IS the overridden value
    kickoffTime: "18:00:00",
    venueName: "Test Venue",
    venueNameOverride: null,
    isForfeited: false,
    isCancelled: false,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    internalNotes: null,
    publicComment: null,
  } as Parameters<typeof computeDiffs>[0];

  const remoteSnapshot = {
    kickoffDate: "2025-03-20", // the ACTUAL remote value is different
    kickoffTime: "18:00:00",
    isForfeited: false,
    isCancelled: false,
  };

  const diffs = computeDiffs(row, ["kickoffDate"], remoteSnapshot);
  const dateDiff = diffs.find((d) => d.field === "kickoffDate");
  expect(dateDiff!.remoteValue).toBe("2025-03-20"); // must come from snapshot, not row
  expect(dateDiff!.localValue).toBe("2025-04-01");
  expect(dateDiff!.status).toBe("diverged");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- --reporter=verbose apps/api/src/services/admin/match-admin.service.test.ts`

Expected: The new tests should pass because `computeDiffs` already accepts and uses `remoteSnapshot` when passed. If they pass, the tests are valid — they document correct behavior. The actual bug is in the *call sites* that omit the snapshot (Task 2).

**Step 3: Commit**

```bash
git add apps/api/src/services/admin/match-admin.service.test.ts
git commit -m "test: add computeDiffs tests for remote snapshot usage"
```

---

### Task 2: Fix `computeDiffs()` Bug — Make Snapshot Required at Call Sites

Three call sites in `updateMatchLocal()` and `releaseOverride()` call `computeDiffs(row, overriddenFields)` without passing the remote snapshot.

**Files:**
- Modify: `apps/api/src/services/admin/match-admin.service.ts:643-734`

**Step 1: Write integration test that exposes the bug**

Add to `match-admin.service.test.ts` inside the `describe("updateMatchLocal", ...)` block:

```typescript
it("returns correct remote diff values after updating override fields", async () => {
  await seedBasicData();
  const matchId = await insertMatch({
    kickoff_date: "2025-03-15",
    kickoff_time: "18:00:00",
    current_remote_version: 1,
  });
  await insertRemoteVersion(matchId, 1, {
    kickoffDate: "2025-03-15",
    kickoffTime: "18:00",
    isForfeited: false,
    isCancelled: false,
  });

  const result = await updateMatchLocal(
    matchId,
    { kickoffDate: "2025-04-01" },
    "admin@test.com",
  );

  const dateDiff = result!.diffs.find((d) => d.field === "kickoffDate");
  expect(dateDiff).toBeDefined();
  expect(dateDiff!.remoteValue).toBe("2025-03-15"); // must be from snapshot
  expect(dateDiff!.localValue).toBe("2025-04-01");
  expect(dateDiff!.status).toBe("diverged");
});
```

Also add to `describe("releaseOverride", ...)`:

```typescript
it("returns correct remote diff values after releasing override", async () => {
  await seedBasicData();
  const matchId = await insertMatch({
    kickoff_date: "2025-04-01",
    kickoff_time: "19:00:00",
    current_remote_version: 1,
  });
  await insertRemoteVersion(matchId, 1, {
    kickoffDate: "2025-03-15",
    kickoffTime: "18:00",
    isForfeited: false,
    isCancelled: false,
  });
  await insertOverride(matchId, "kickoffDate");

  const result = await releaseOverride(matchId, "kickoffDate", "admin@test.com");

  // After release, kickoffDate should be restored to remote value
  expect(result!.match.kickoffDate).toBe("2025-03-15");
  // Diffs should still reference the snapshot for any remaining overrides
  // (no overrides remain, so diffs should be empty for override fields)
});
```

**Step 2: Run tests — the first test should fail**

Run: `pnpm --filter @dragons/api test -- --reporter=verbose apps/api/src/services/admin/match-admin.service.test.ts`

Expected: "returns correct remote diff values after updating override fields" FAILS because `updateMatchLocal` calls `computeDiffs(row, overriddenFields)` without the snapshot.

**Step 3: Fix the call sites**

In `match-admin.service.ts`, create a helper function that loads the remote snapshot within a transaction. Then update all three call sites.

Add this helper near line 499 (after `queryMatchWithJoins`):

```typescript
async function loadRemoteSnapshot(
  client: Database | TransactionClient,
  matchId: number,
  remoteVersion: number,
): Promise<Record<string, unknown> | null> {
  if (remoteVersion <= 0) return null;
  const [latestRemote] = await client
    .select({ snapshot: matchRemoteVersions.snapshot })
    .from(matchRemoteVersions)
    .where(
      and(
        eq(matchRemoteVersions.matchId, matchId),
        eq(matchRemoteVersions.versionNumber, remoteVersion),
      ),
    )
    .limit(1);
  return (latestRemote?.snapshot as Record<string, unknown>) ?? null;
}
```

Then update the three call sites:

**Line ~653** (no-change early return in `updateMatchLocal`):
```typescript
// Before:
return { match: rowToDetail(row, overriddenFields, overrides), diffs: computeDiffs(row, overriddenFields) };

// After:
const remoteSnapshot = await loadRemoteSnapshot(tx, id, row.currentRemoteVersion);
return { match: rowToDetail(row, overriddenFields, overrides), diffs: computeDiffs(row, overriddenFields, remoteSnapshot) };
```

**Line ~734** (end of `updateMatchLocal` transaction):
```typescript
// Before:
diffs: computeDiffs(row, overriddenFields),

// After:
diffs: computeDiffs(row, overriddenFields, await loadRemoteSnapshot(tx, id, row.currentRemoteVersion)),
```

**Line ~851** (end of `releaseOverride` transaction):
```typescript
// Before:
diffs: computeDiffs(row, overriddenFields),

// After:
diffs: computeDiffs(row, overriddenFields, await loadRemoteSnapshot(tx, matchId, row.currentRemoteVersion)),
```

Also refactor `getMatchDetail()` (line ~478-491) to use the new helper:
```typescript
// Before: inline snapshot loading
let remoteSnapshot: Record<string, unknown> | null = null;
if (row.currentRemoteVersion > 0) {
  const [latestRemote] = await db
    .select({ snapshot: matchRemoteVersions.snapshot })
    .from(matchRemoteVersions)
    .where(
      and(
        eq(matchRemoteVersions.matchId, id),
        eq(matchRemoteVersions.versionNumber, row.currentRemoteVersion),
      ),
    )
    .limit(1);
  remoteSnapshot = (latestRemote?.snapshot as Record<string, unknown>) ?? null;
}

// After:
const remoteSnapshot = await loadRemoteSnapshot(db, id, row.currentRemoteVersion);
```

**Step 4: Run tests — they should pass**

Run: `pnpm --filter @dragons/api test -- --reporter=verbose apps/api/src/services/admin/match-admin.service.test.ts`

Expected: ALL tests pass.

**Step 5: Run full test suite**

Run: `pnpm --filter @dragons/api test`

Expected: 460 passing (same 13 pre-existing failures in sdk-client.test.ts).

**Step 6: Commit**

```bash
git add apps/api/src/services/admin/match-admin.service.ts apps/api/src/services/admin/match-admin.service.test.ts
git commit -m "fix: always load remote snapshot for diff computation

computeDiffs() was falling back to row values when remoteSnapshot
was not passed, causing both local and remote to show the same
value after an override. Extract loadRemoteSnapshot() helper and
pass snapshot at all call sites."
```

---

### Task 3: Add Sheet and Tooltip UI Components

**Files:**
- Create: `packages/ui/src/components/sheet.tsx`
- Create: `packages/ui/src/components/tooltip.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Install Radix dependencies (if not already included in `radix-ui` package)**

Check if `radix-ui` v1.4.3 already bundles Dialog and Tooltip primitives. It should — `radix-ui` is the monorepo package that bundles all Radix primitives.

Run: `pnpm --filter @dragons/ui exec node -e "const r = require.resolve('radix-ui'); console.log(r)" 2>&1 || echo "check manually"`

If `radix-ui` already includes Dialog and Tooltip (it does as of v1.1+), no new dependencies needed.

**Step 2: Create `sheet.tsx`**

Standard shadcn/ui Sheet component. This is a Dialog variant that slides from the side.

```tsx
"use client"

import * as React from "react"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "radix-ui"
import { X } from "lucide-react"
import { cn } from "../lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const Sheet = Dialog.Root
const SheetTrigger = DialogTrigger
const SheetClose = DialogClose
const SheetPortal = DialogPortal

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogOverlay>) {
  return (
    <DialogOverlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  )
}

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 overflow-y-auto",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-lg",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
)

function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent> & VariantProps<typeof sheetVariants>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogContent
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
        {children}
      </DialogContent>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  return (
    <DialogTitle
      data-slot="sheet-title"
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogDescription>) {
  return (
    <DialogDescription
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
```

**Step 3: Create `tooltip.tsx`**

Standard shadcn/ui Tooltip component.

```tsx
"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { cn } from "../lib/utils"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

**Step 4: Export from index**

Add to `packages/ui/src/index.ts`:

```typescript
export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./components/sheet";
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/tooltip";
```

**Step 5: Verify types compile**

Run: `pnpm --filter @dragons/ui typecheck`

Expected: No errors.

**Step 6: Commit**

```bash
git add packages/ui/src/components/sheet.tsx packages/ui/src/components/tooltip.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Sheet and Tooltip components

Sheet for slide-over panel (match edit), Tooltip for override
indicator hover in table."
```

---

### Task 4: Create Match String Constants

Extract all UI strings for i18n readiness.

**Files:**
- Create: `apps/web/src/components/admin/matches/match-strings.ts`

**Step 1: Create the strings file**

```typescript
/**
 * UI string constants for match components.
 * Centralised here as a stepping stone toward i18n.
 */
export const matchStrings = {
  // Page
  pageTitle: "Spiele",

  // Table columns
  columnDate: "Datum",
  columnTime: "Uhrzeit",
  columnTeam: "Team",
  columnHome: "Heim",
  columnGuest: "Gast",
  columnScore: "Ergebnis",
  columnAnschreiber: "Anschreiber",
  columnZeitnehmer: "Zeitnehmer",
  columnShotclock: "Shotclock",
  columnComment: "Kommentar",

  // Table toolbar
  searchPlaceholder: "Spiele suchen...",
  dateFilter: "Datum",
  noResults: "Keine Spiele gefunden",

  // Sheet header
  matchDay: "Spieltag",

  // Sheet sections
  sectionMatchInfo: "Spielinfo",
  sectionOverrides: "Lokale Änderungen",
  sectionStaff: "Kampfgericht",
  sectionNotes: "Notizen",

  // Match info labels
  matchNo: "Spiel-Nr",
  league: "Liga",
  venue: "Halle",
  status: "Status",
  score: "Ergebnis",
  halftimeScore: "Halbzeit",
  confirmed: "Bestätigt",
  forfeited: "Verzicht",
  cancelled: "Abgesagt",
  lastSync: "Letzter Sync",
  remoteVersion: "Remote Version",

  // Override fields
  officialLabel: "Offiziell",
  localLabel: "Lokal",
  resetOverride: "Zurücksetzen",
  overrideTooltip: (official: string, local: string) =>
    `Offiziell: ${official} → Lokal: ${local}`,

  // Form
  venueOverride: "Hallenname",
  internalNotes: "Interne Notizen",
  internalNotesHint: "Nur für Admins sichtbar",
  publicComment: "Öffentlicher Kommentar",
  publicCommentHint: "Auf öffentlichen Seiten sichtbar",
  changeReason: "Änderungsgrund",
  changeReasonPlaceholder: "z.B. Per E-Mail verschoben",
  save: "Speichern",

  // Badges / status
  overrideCount: (n: number) => `${n} Override${n !== 1 ? "s" : ""}`,
  noStatusFlags: "Keine Statusflags gesetzt",
} as const;
```

**Step 2: Commit**

```bash
git add apps/web/src/components/admin/matches/match-strings.ts
git commit -m "feat: add match UI string constants for i18n readiness"
```

---

### Task 5: Redesign the Match List Table

Remove Card wrapper, clean up visual design, add override dot indicators with tooltips.

**Files:**
- Modify: `apps/web/src/app/admin/matches/page.tsx`
- Modify: `apps/web/src/components/admin/matches/match-list-table.tsx`
- Modify: `apps/web/src/components/admin/matches/types.ts` (add MatchOverrideDiff to list item if needed)

**Step 1: Simplify the page layout**

In `apps/web/src/app/admin/matches/page.tsx`, remove the subtitle. The page should be:

```tsx
import { fetchAPIServer } from "@/lib/api.server"
import { MatchListTable } from "@/components/admin/matches/match-list-table"
import type { MatchListResponse } from "@/components/admin/matches/types"
import { getOwnTeamLabel } from "@/components/admin/matches/utils"
import { matchStrings } from "@/components/admin/matches/match-strings"

export default async function MatchesPage() {
  let data: MatchListResponse | null = null
  let error: string | null = null

  try {
    data = await fetchAPIServer<MatchListResponse>("/admin/matches")
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API"
  }

  const allItems = data?.items ?? []
  const teamOptions = [
    ...new Set(allItems.map((m) => getOwnTeamLabel(m))),
  ].sort()

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{matchStrings.pageTitle}</h1>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <MatchListTable
          data={allItems}
          teamOptions={teamOptions}
        />
      )}
    </div>
  )
}
```

**Step 2: Refactor the table component**

In `match-list-table.tsx`:

1. Remove the `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` wrapper
2. Import `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from `@dragons/ui/components/tooltip`
3. Use `matchStrings` for all labels
4. Change home game styling from full row background to subtle left border
5. Add override dot indicator with tooltip for overridden cells
6. The table renders directly (no Card), toolbar above it

Key changes for override indicators in cells — create a helper component inside the file:

```tsx
function OverrideDot({ match, field }: { match: MatchListItem; field: string }) {
  if (!match.overriddenFields.includes(field)) return null

  // Find the diff info if available
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Override aktiv</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

Update the kickoffDate and kickoffTime cell renderers to include the dot:

```tsx
cell: ({ row }) => (
  <span className="whitespace-nowrap text-sm">
    {formatMatchDate(row.original.kickoffDate)}
    <OverrideDot match={row.original} field="kickoffDate" />
  </span>
),
```

Change row className from full green background to left border:

```tsx
function getRowClassName(row: Row<MatchListItem>) {
  return row.original.homeIsOwnClub
    ? "border-l-2 border-l-green-500"
    : undefined
}
```

Row click should now track which match is selected for the Sheet (handled in Task 6).

**Step 3: Verify typecheck**

Run: `pnpm --filter @dragons/web exec tsc --noEmit --skipLibCheck`

Expected: No type errors.

**Step 4: Commit**

```bash
git add apps/web/src/app/admin/matches/page.tsx apps/web/src/components/admin/matches/match-list-table.tsx
git commit -m "refactor: clean up match table — remove Card wrapper, add override dots

- Single page heading, no duplicate header
- Home games indicated by green left border instead of full row tint
- Overridden cells show amber dot indicator
- Use matchStrings for all labels"
```

---

### Task 6: Build the Match Edit Sheet

Replace the detail page navigation with a Sheet that opens from the right.

**Files:**
- Create: `apps/web/src/components/admin/matches/match-edit-sheet.tsx`
- Modify: `apps/web/src/components/admin/matches/match-list-table.tsx` (add Sheet trigger)
- Modify: `apps/web/src/components/admin/matches/match-override-field.tsx` (side-by-side layout)

**Step 1: Create the Match Edit Sheet component**

Create `apps/web/src/components/admin/matches/match-edit-sheet.tsx`.

This component:
- Accepts `matchId: number | null` and `open: boolean` + `onOpenChange`
- When opened, fetches match detail from `GET /admin/matches/{id}`
- Shows loading state while fetching
- Renders read-only match info at the top
- Renders the override form below with side-by-side diff layout
- Handles PATCH save and DELETE override release
- Calls `onSaved` callback so the table can refresh

Key structure:

```tsx
"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@dragons/ui/components/sheet"
import { Badge } from "@dragons/ui/components/badge"
import { Button } from "@dragons/ui/components/button"
import { Input } from "@dragons/ui/components/input"
import { Textarea } from "@dragons/ui/components/textarea"
import { Switch } from "@dragons/ui/components/switch"
import { DatePicker } from "@dragons/ui/components/date-picker"
import { TimePicker } from "@dragons/ui/components/time-picker"
import { Separator } from "@dragons/ui/components/separator"
import { Loader2, RotateCcw } from "lucide-react"
import { fetchAPI } from "@/lib/api"
import { matchStrings } from "./match-strings"
import {
  formatMatchDate,
  formatMatchTime,
  formatScore,
  formatPeriodScores,
} from "./utils"
import {
  matchFormSchema,
  type MatchDetailResponse,
  type MatchDetail,
  type FieldDiff,
  type MatchFormValues,
} from "./types"

// ... component implementation
```

The override fields use the side-by-side layout:

```tsx
function OverrideField({
  label,
  remoteValue,
  remoteDisplay,
  children, // the editable input
  isOverridden,
  diffStatus,
  onRelease,
}: {
  label: string
  remoteValue: string | null
  remoteDisplay?: string
  children: React.ReactNode
  isOverridden?: boolean
  diffStatus?: string
  onRelease?: () => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {isOverridden && onRelease && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={onRelease}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {matchStrings.resetOverride}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{matchStrings.officialLabel}</span>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
            {remoteDisplay ?? remoteValue ?? "—"}
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{matchStrings.localLabel}</span>
          {children}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Wire the Sheet into the table**

In `match-list-table.tsx`:
- Add state: `const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null)`
- Row click sets `setSelectedMatchId(row.original.id)` instead of navigating
- Cmd/Ctrl+click still navigates to `/admin/matches/{id}` in new tab
- Render `<Sheet open={selectedMatchId !== null} onOpenChange={...}>` wrapping `<MatchEditSheet>`

**Step 3: Verify typecheck**

Run: `pnpm --filter @dragons/web exec tsc --noEmit --skipLibCheck`

**Step 4: Commit**

```bash
git add apps/web/src/components/admin/matches/match-edit-sheet.tsx apps/web/src/components/admin/matches/match-list-table.tsx
git commit -m "feat: add match edit Sheet with side-by-side override diffs

- Sheet slides from right on row click
- Read-only match info section at top
- Side-by-side Offiziell/Lokal columns for overridable fields
- Override release (Zurücksetzen) per field
- Local-only fields (staff, notes) below
- Cmd/Ctrl+click still opens detail page in new tab"
```

---

### Task 7: Clean Up Old Components

Remove or simplify components that are no longer needed.

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-detail-view.tsx` — simplify to use the new Sheet or keep as standalone fallback for `/admin/matches/[id]`
- Delete or simplify: `apps/web/src/components/admin/matches/match-override-field.tsx` — logic moved into Sheet
- Delete or simplify: `apps/web/src/components/admin/matches/diff-indicator.tsx` — replaced by side-by-side layout

**Step 1: Decide on detail page**

The `/admin/matches/[id]` route should still work (for bookmarking, Cmd+click). The simplest approach: have it render the same `MatchEditSheet` content but as a full page. Or redirect to the matches list with the sheet open.

For now, update `match-detail-view.tsx` to reuse the same form sections from the Sheet, extracting shared components as needed. The detail page becomes a thin wrapper.

**Step 2: Remove unused code**

If `match-override-field.tsx` and `diff-indicator.tsx` are fully replaced by the Sheet's inline `OverrideField`, delete them.

**Step 3: Verify typecheck and no dead imports**

Run: `pnpm --filter @dragons/web exec tsc --noEmit --skipLibCheck`

**Step 4: Commit**

```bash
git add -A apps/web/src/components/admin/matches/
git commit -m "refactor: clean up old match detail components

Remove match-override-field.tsx and diff-indicator.tsx (replaced by
Sheet inline OverrideField). Simplify match-detail-view.tsx."
```

---

### Task 8: Final Verification

**Step 1: Run full API test suite**

Run: `pnpm --filter @dragons/api test`

Expected: 460+ passing (same 13 pre-existing failures in sdk-client.test.ts).

**Step 2: Run typecheck across all packages**

Run: `pnpm typecheck`

Expected: No errors.

**Step 3: Run lint**

Run: `pnpm lint`

Expected: No errors.

**Step 4: Run AI slop check**

Run: `pnpm check:ai-slop`

Expected: No violations.

**Step 5: Build**

Run: `pnpm build`

Expected: Successful build.

**Step 6: Commit any remaining fixes**

If any checks fail, fix and commit.

**Step 7: Final commit with all tasks complete**

If needed, create a summary commit for any remaining cleanups.
