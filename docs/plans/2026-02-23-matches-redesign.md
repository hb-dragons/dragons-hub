# Matches Table & Detail Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the matches list table (simplified columns, green home-game rows) and detail page (two-column layout with inline override editing, form validation on blur, dirty tracking).

**Architecture:** The matches table gets column changes and visual updates (no structural changes). The detail page is rewritten from a tabbed layout to a two-column split: read-only reference on the left, editable form on the right. React Hook Form (already installed) handles validation, dirty tracking, and unsaved-changes warnings.

**Tech Stack:** Next.js 16, React Hook Form 7, Zod 4, TanStack Table v8, shadcn/Radix UI components, Tailwind CSS.

---

## Task 1: Update Matches Table Columns and Styling

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-list-table.tsx`

**Step 1: Update staff column cell renderers from TeamBadge to plain text**

In `match-list-table.tsx`, change the three staff column cell renderers. Replace `<TeamBadge>` with plain text:

```tsx
// anschreiber column (around line 154)
cell: ({ row }) => (
  <span className="text-sm">{row.original.anschreiber ?? ""}</span>
),

// zeitnehmer column (around line 165)
cell: ({ row }) => (
  <span className="text-sm">{row.original.zeitnehmer ?? ""}</span>
),

// shotclock column (around line 176)
cell: ({ row }) => (
  <span className="text-sm">{row.original.shotclock ?? ""}</span>
),
```

**Step 2: Hide Score and Comment columns by default**

Pass `initialColumnVisibility` to `DataTable` to hide score and publicComment:

```tsx
<DataTable
  columns={columns}
  data={data}
  onRowClick={handleRowClick}
  rowClassName={getRowClassName}
  globalFilterFn={matchGlobalFilterFn}
  initialColumnVisibility={{ score: false, publicComment: false }}
  emptyState={...}
>
```

**Step 3: Change home game row background to green**

Update the `getRowClassName` function:

```tsx
function getRowClassName(row: Row<MatchListItem>) {
  return row.original.homeIsOwnClub
    ? "bg-green-100 dark:bg-green-950/30"
    : undefined
}
```

**Step 4: Verify visually**

Run: `pnpm --filter @dragons/web dev`
Open `http://localhost:3000/admin/matches` and verify:
- Staff columns show plain text, not badges
- Score and Comment columns are hidden by default
- Score and Comment can be toggled on via column visibility menu
- Home game rows have a green background
- All filters and sorting still work

**Step 5: Commit**

```bash
git add apps/web/src/components/admin/matches/match-list-table.tsx
git commit -m "feat(matches): simplify table columns and green home-game rows"
```

---

## Task 2: Redesign Match Override Field Component

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-override-field.tsx`

This component changes from a grid-row layout (used in the old overrides tab) to a stacked layout showing the input with a remote reference label underneath and inline diff indicator.

**Step 1: Rewrite the component**

Replace the contents of `match-override-field.tsx` with the new stacked layout:

```tsx
"use client";

import { Controller, type Control, type FieldPath } from "react-hook-form";
import { Input } from "@dragons/ui/components/input";
import { Switch } from "@dragons/ui/components/switch";
import { Button } from "@dragons/ui/components/button";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { TimePicker } from "@dragons/ui/components/time-picker";
import { RotateCcw } from "lucide-react";
import { DiffIndicator } from "./diff-indicator";
import {
  Field,
  FieldLabel,
  FieldError,
} from "@dragons/ui/components/field";
import type { DiffStatus, MatchFormValues } from "./types";

interface MatchOverrideFieldProps {
  control: Control<MatchFormValues>;
  name: FieldPath<MatchFormValues>;
  label: string;
  remoteValue: string | null;
  diffStatus?: DiffStatus;
  inputType: "date" | "time" | "text" | "boolean";
  isOverridden?: boolean;
  onRelease?: () => void;
}

export function MatchOverrideField({
  control,
  name,
  label,
  remoteValue,
  diffStatus,
  inputType,
  isOverridden,
  onRelease,
}: MatchOverrideFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const isDiverged = diffStatus === "diverged";

        return (
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>{label}</FieldLabel>
              <div className="flex items-center gap-2">
                {diffStatus && <DiffIndicator status={diffStatus} />}
                {isOverridden && onRelease && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={onRelease}
                    title="Release override (restore remote value)"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Release
                  </Button>
                )}
              </div>
            </div>

            <div
              className={
                isDiverged
                  ? "rounded-md border-l-4 border-l-amber-500 pl-3"
                  : undefined
              }
            >
              {inputType === "boolean" ? (
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
              ) : inputType === "date" ? (
                <DatePicker
                  value={typeof field.value === "string" ? field.value : null}
                  onChange={(v) => field.onChange(v)}
                  className="h-9"
                />
              ) : inputType === "time" ? (
                <TimePicker
                  value={typeof field.value === "string" ? field.value : null}
                  onChange={(v) => field.onChange(v)}
                  className="h-9"
                />
              ) : (
                <Input
                  value={
                    field.value == null
                      ? ""
                      : typeof field.value === "boolean"
                        ? ""
                        : field.value
                  }
                  onChange={(e) => field.onChange(e.target.value || null)}
                  onBlur={field.onBlur}
                  className="h-9"
                />
              )}

              <p className="mt-1 text-xs text-muted-foreground">
                Remote: {remoteValue ?? "—"}
              </p>
            </div>

            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        );
      }}
    />
  );
}
```

Key changes:
- Stacked layout instead of 5-column grid
- Label + diff indicator on same line at top
- Input wrapped in optional amber left border when diverged
- "Remote: ..." label always shown below input
- Release button moved next to diff indicator (top right)
- Removed clear (X) button (setting field to null is handled by clearing the input)
- Uses `Field`/`FieldLabel`/`FieldError` wrappers for consistent spacing

**Step 2: Verify the component compiles**

Run: `pnpm --filter @dragons/web build`
Expected: no TypeScript errors in `match-override-field.tsx`

**Step 3: Commit**

```bash
git add apps/web/src/components/admin/matches/match-override-field.tsx
git commit -m "feat(matches): redesign override field with inline remote reference"
```

---

## Task 3: Rewrite Match Detail View — Two-Column Layout

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-detail-view.tsx`

This is the largest change. The entire tabbed layout is replaced with a two-column split page.

**Step 1: Rewrite `match-detail-view.tsx`**

Replace the full component with the two-column layout. The left column is read-only reference data. The right column is the editable form with React Hook Form.

Key structure:

```
Header (back button, title, badges)
├── Left Column (Card)
│   ├── Match identifiers (No, Matchday, League)
│   ├── Score + Halftime
│   ├── Period Scores table
│   ├── Status flags (badges)
│   └── Sync info (last sync, version)
└── Right Column (form)
    ├── Overridable fields section
    │   ├── Date (MatchOverrideField)
    │   ├── Time (MatchOverrideField)
    │   ├── Venue (MatchOverrideField)
    │   ├── Forfeited (MatchOverrideField)
    │   └── Cancelled (MatchOverrideField)
    ├── Staff section
    │   ├── Anschreiber (Controller + Input)
    │   ├── Zeitnehmer (Controller + Input)
    │   └── Shotclock (Controller + Input)
    ├── Notes section
    │   ├── Internal Notes (Controller + Textarea)
    │   └── Public Comment (Controller + Textarea)
    └── Footer (Change Reason + Save button)
```

Full replacement code for `match-detail-view.tsx`:

```tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Textarea } from "@dragons/ui/components/textarea";
import { Separator } from "@dragons/ui/components/separator";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@dragons/ui/components/field";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { MatchOverrideField } from "./match-override-field";
import {
  formatMatchDate,
  formatMatchTime,
  formatScore,
  formatPeriodScores,
} from "./utils";
import {
  matchFormSchema,
  type MatchDetail,
  type MatchDetailResponse,
  type FieldDiff,
  type MatchFormValues,
} from "./types";

interface MatchDetailViewProps {
  initialData: MatchDetailResponse;
}

function getDefaultValues(match: MatchDetail): MatchFormValues {
  return {
    kickoffDate: match.overriddenFields.includes("kickoffDate")
      ? match.kickoffDate
      : null,
    kickoffTime: match.overriddenFields.includes("kickoffTime")
      ? match.kickoffTime
      : null,
    venueNameOverride: match.venueNameOverride,
    isForfeited: match.overriddenFields.includes("isForfeited")
      ? match.isForfeited
      : null,
    isCancelled: match.overriddenFields.includes("isCancelled")
      ? match.isCancelled
      : null,
    anschreiber: match.anschreiber,
    zeitnehmer: match.zeitnehmer,
    shotclock: match.shotclock,
    internalNotes: match.internalNotes,
    publicComment: match.publicComment,
    changeReason: "",
  };
}

export function MatchDetailView({ initialData }: MatchDetailViewProps) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchDetail>(initialData.match);
  const [diffs, setDiffs] = useState<FieldDiff[]>(initialData.diffs);
  const [saving, setSaving] = useState(false);

  const form = useForm<MatchFormValues>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: getDefaultValues(initialData.match),
    mode: "onBlur",
  });

  const { isDirty } = form.formState;

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const getDiffStatus = useCallback(
    (field: string) => diffs.find((d) => d.field === field)?.status,
    [diffs],
  );

  const onSubmit = useCallback(
    async (data: MatchFormValues) => {
      const { changeReason, ...fields } = data;
      const updateData: Record<string, unknown> = { ...fields };
      if (changeReason) {
        updateData.changeReason = changeReason;
      }

      try {
        setSaving(true);
        const result = await fetchAPI<MatchDetailResponse>(
          `/admin/matches/${match.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(updateData),
          },
        );
        setMatch(result.match);
        setDiffs(result.diffs);
        form.reset(getDefaultValues(result.match));
        toast.success("Match updated");
        router.refresh();
      } catch {
        toast.error("Failed to update match");
      } finally {
        setSaving(false);
      }
    },
    [match.id, form, router],
  );

  const handleReleaseOverride = useCallback(
    async (fieldName: string) => {
      try {
        setSaving(true);
        const result = await fetchAPI<MatchDetailResponse>(
          `/admin/matches/${match.id}/overrides/${fieldName}`,
          { method: "DELETE" },
        );
        setMatch(result.match);
        setDiffs(result.diffs);
        form.reset(getDefaultValues(result.match));
        toast.success(`Override released`);
        router.refresh();
      } catch {
        toast.error("Failed to release override");
      } finally {
        setSaving(false);
      }
    },
    [match.id, form, router],
  );

  const periodScores = formatPeriodScores(match);
  const overrideCount = match.overrides.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/matches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {match.homeTeamName} vs {match.guestTeamName}
          </h1>
          <p className="text-muted-foreground">
            Matchday {match.matchDay}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">MD {match.matchDay}</Badge>
          {overrideCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-600"
            >
              {overrideCount} Override{overrideCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column: Read-only reference */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Match Info</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Match No</dt>
                    <dd className="font-medium">{match.matchNo}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Matchday</dt>
                    <dd className="font-medium">{match.matchDay}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">League</dt>
                    <dd className="font-medium">{match.leagueName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="font-medium">
                      {formatMatchDate(match.kickoffDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Time</dt>
                    <dd className="font-medium">
                      {formatMatchTime(match.kickoffTime)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Venue</dt>
                    <dd className="font-medium">
                      {match.venueNameOverride ?? match.venueName ?? "—"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Final</dt>
                    <dd className="text-lg font-bold tabular-nums">
                      {formatScore(match.homeScore, match.guestScore)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Halftime</dt>
                    <dd className="text-lg font-bold tabular-nums">
                      {formatScore(
                        match.homeHalftimeScore,
                        match.guestHalftimeScore,
                      )}
                    </dd>
                  </div>
                </div>

                {periodScores.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 text-left text-xs font-medium text-muted-foreground" />
                          {periodScores.map((p) => (
                            <th
                              key={p.label}
                              className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                            >
                              {p.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-2 py-1 text-xs font-medium">
                            {match.homeTeamName}
                          </td>
                          {periodScores.map((p) => (
                            <td
                              key={p.label}
                              className="px-2 py-1 text-center tabular-nums"
                            >
                              {p.home ?? "—"}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="px-2 py-1 text-xs font-medium">
                            {match.guestTeamName}
                          </td>
                          {periodScores.map((p) => (
                            <td
                              key={p.label}
                              className="px-2 py-1 text-center tabular-nums"
                            >
                              {p.guest ?? "—"}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {match.isConfirmed && (
                    <Badge variant="success">Confirmed</Badge>
                  )}
                  {match.isForfeited && (
                    <Badge variant="destructive">Forfeited</Badge>
                  )}
                  {match.isCancelled && (
                    <Badge variant="destructive">Cancelled</Badge>
                  )}
                  {!match.isConfirmed &&
                    !match.isForfeited &&
                    !match.isCancelled && (
                      <span className="text-sm text-muted-foreground">
                        No status flags set
                      </span>
                    )}
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    Last sync:{" "}
                    {match.lastRemoteSync
                      ? new Date(match.lastRemoteSync).toLocaleString("de-DE")
                      : "—"}
                  </div>
                  <div>Remote version: v{match.currentRemoteVersion}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Editable form */}
          <div className="space-y-6">
            {/* Overridable fields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Overrides
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MatchOverrideField
                  control={form.control}
                  name="kickoffDate"
                  label="Date"
                  remoteValue={match.kickoffDate}
                  diffStatus={getDiffStatus("kickoffDate")}
                  inputType="date"
                  isOverridden={match.overriddenFields.includes("kickoffDate")}
                  onRelease={() => handleReleaseOverride("kickoffDate")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="kickoffTime"
                  label="Time"
                  remoteValue={formatMatchTime(match.kickoffTime)}
                  diffStatus={getDiffStatus("kickoffTime")}
                  inputType="time"
                  isOverridden={match.overriddenFields.includes("kickoffTime")}
                  onRelease={() => handleReleaseOverride("kickoffTime")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="venueNameOverride"
                  label="Venue"
                  remoteValue={match.venueName}
                  diffStatus={getDiffStatus("venue")}
                  inputType="text"
                />
                <MatchOverrideField
                  control={form.control}
                  name="isForfeited"
                  label="Forfeited"
                  remoteValue={String(match.isForfeited ?? false)}
                  diffStatus={getDiffStatus("isForfeited")}
                  inputType="boolean"
                  isOverridden={match.overriddenFields.includes("isForfeited")}
                  onRelease={() => handleReleaseOverride("isForfeited")}
                />
                <MatchOverrideField
                  control={form.control}
                  name="isCancelled"
                  label="Cancelled"
                  remoteValue={String(match.isCancelled ?? false)}
                  diffStatus={getDiffStatus("isCancelled")}
                  inputType="boolean"
                  isOverridden={match.overriddenFields.includes("isCancelled")}
                  onRelease={() => handleReleaseOverride("isCancelled")}
                />
              </CardContent>
            </Card>

            {/* Staff (local-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kampfgericht</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller
                  control={form.control}
                  name="anschreiber"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="anschreiber">
                        Anschreiber
                      </FieldLabel>
                      <Input
                        id="anschreiber"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Team name"
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="zeitnehmer"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="zeitnehmer">
                        Zeitnehmer
                      </FieldLabel>
                      <Input
                        id="zeitnehmer"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Team name"
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="shotclock"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="shotclock">
                        Shotclock
                      </FieldLabel>
                      <Input
                        id="shotclock"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Team name"
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
              </CardContent>
            </Card>

            {/* Notes (local-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller
                  control={form.control}
                  name="internalNotes"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="internal-notes">
                        Internal Notes
                      </FieldLabel>
                      <FieldDescription>
                        Only visible to admins
                      </FieldDescription>
                      <Textarea
                        id="internal-notes"
                        rows={4}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Internal notes"
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="publicComment"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="public-comment">
                        Public Comment
                      </FieldLabel>
                      <FieldDescription>
                        Visible on public pages
                      </FieldDescription>
                      <Textarea
                        id="public-comment"
                        rows={3}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        onBlur={field.onBlur}
                        placeholder="Public comment"
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </Field>
                  )}
                />
              </CardContent>
            </Card>

            {/* Form footer */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <Controller
                    control={form.control}
                    name="changeReason"
                    render={({ field, fieldState }) => (
                      <Field>
                        <FieldLabel htmlFor="change-reason">
                          Change Reason
                        </FieldLabel>
                        <FieldDescription>
                          Optional note explaining this change
                        </FieldDescription>
                        <Input
                          id="change-reason"
                          placeholder="e.g. Rescheduled by email"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={saving || !isDirty}
                    className="w-full"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
```

Key changes from current implementation:
- Removed `Tabs`/`TabsContent`/`TabsList`/`TabsTrigger` imports and usage
- Added `mode: "onBlur"` to `useForm` for on-blur validation
- Added `isDirty` from `form.formState` for save button state
- Added `beforeunload` event listener for unsaved changes warning
- Two-column grid with `lg:grid-cols-2` (stacks on mobile)
- Left column: three Cards (Match Info, Score, Status)
- Right column: four Cards (Overrides, Kampfgericht, Notes, Footer)
- Save button disabled when not dirty or saving
- Fixed duplicate toast in `handleReleaseOverride` (was called twice in original)
- Removed `FieldDescription` from staff fields (was "Scorekeeper/Timekeeper/24-second clock operator" — unnecessary)

**Step 2: Verify the build**

Run: `pnpm --filter @dragons/web build`
Expected: clean build with no TypeScript errors

**Step 3: Verify visually**

Run: `pnpm --filter @dragons/web dev`
Open a match detail page and verify:
- Two-column layout on desktop, stacked on mobile
- Left column shows read-only match data
- Right column shows all editable fields
- Override fields show "Remote: ..." label below input
- Diverged overrides have amber left border + badge
- Save button is disabled until a field is changed
- On-blur validation works (e.g., change date to invalid format, tab away)
- Browser warns when navigating away with unsaved changes

**Step 4: Commit**

```bash
git add apps/web/src/components/admin/matches/match-detail-view.tsx
git commit -m "feat(matches): two-column detail layout with inline overrides"
```

---

## Task 4: Clean Up Unused Imports

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-detail-view.tsx` (if any unused imports remain)
- Modify: `apps/web/src/components/admin/matches/match-list-table.tsx` (remove `TeamBadge` if unused)

**Step 1: Check if `TeamBadge` is still used**

`TeamBadge` in `match-list-table.tsx` is used by the "team" column cell renderer. Staff columns no longer use it. But the team column still does, so `TeamBadge` stays.

The `formatScore` import in `match-list-table.tsx` is still used by the score column (which is hidden by default but still defined). Keep it.

**Step 2: Run typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors

**Step 3: Run lint**

Run: `pnpm --filter @dragons/web lint`
Expected: no errors (or only pre-existing ones)

**Step 4: Commit (if any changes)**

```bash
git add -A apps/web/src/components/admin/matches/
git commit -m "chore(matches): clean up unused imports"
```

---

## Task 5: Final Visual QA and Commit

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Test matches table**

Navigate to `http://localhost:3000/admin/matches`:
- [ ] 8 default columns visible (Date, Time, Team, Home, Guest, Anschreiber, Zeitnehmer, Shotclock)
- [ ] Score and Comment hidden but available in column visibility menu
- [ ] Staff columns show plain text (not colored badges)
- [ ] Home game rows have green background
- [ ] Clicking a row navigates to detail page
- [ ] Cmd+click opens in new tab
- [ ] Global search works
- [ ] Team filter works
- [ ] Date range filter works
- [ ] Column visibility toggle shows/hides Score and Comment

**Step 3: Test match detail page**

Click into any match:
- [ ] Two-column layout on desktop
- [ ] Left column: Match Info, Score (with period scores if available), Status cards
- [ ] Right column: Overrides, Kampfgericht, Notes, Save footer
- [ ] Override fields show "Remote: ..." below input
- [ ] Diverged fields have amber left border + "Diverged" badge
- [ ] Release button appears on overridden fields
- [ ] Save button is disabled initially (no changes)
- [ ] Making a change enables the Save button
- [ ] Invalid input shows error on blur (e.g., bad date format)
- [ ] Navigating away with unsaved changes shows browser warning
- [ ] Save works and shows toast
- [ ] Release override works and shows toast

**Step 4: Final commit with all changes**

```bash
git add -A
git commit -m "feat(matches): redesign table and detail page

- Simplified table: 8 default columns, Score/Comment toggleable
- Staff columns show plain text instead of colored badges
- Home game rows highlighted in green
- Detail page: two-column layout replacing tabs
- Inline override editing with remote value reference
- On-blur validation with React Hook Form
- Dirty tracking: Save disabled until changes made
- Unsaved changes warning on navigation"
```
