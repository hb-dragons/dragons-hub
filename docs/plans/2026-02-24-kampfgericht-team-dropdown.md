# Kampfgericht Team Dropdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace free-text inputs for Kampfgericht staff (Anschreiber, Zeitnehmer, Shotclock) with team dropdowns in the Match Edit Sheet.

**Architecture:** Add a "Set All" team dropdown and three per-role team dropdowns to the Officials section. Teams are fetched from `GET /admin/teams` (existing endpoint). The `Select` component from `@dragons/ui` is used since the list is small and static (no search needed). The API service is extended to also return `nameShort` so display name priority `customName > nameShort > name` works.

**Tech Stack:** React, Radix Select, react-hook-form, next-intl, Hono API

---

### Task 1: Add `nameShort` to team admin service response

The existing `getOwnClubTeams()` returns `{ id, name, customName, leagueName }` but not `nameShort`. We need it for display name priority.

**Files:**
- Modify: `apps/api/src/services/admin/team-admin.service.ts:5-10` (OwnClubTeam interface)
- Modify: `apps/api/src/services/admin/team-admin.service.ts:12-27` (getOwnClubTeams query)
- Test: `apps/api/src/services/admin/team-admin.service.test.ts` (if exists, update)

**Step 1: Update the `OwnClubTeam` interface**

Add `nameShort` field:

```typescript
export interface OwnClubTeam {
  id: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueName: string | null;
}
```

**Step 2: Update the `getOwnClubTeams` query**

Add `nameShort` to the select:

```typescript
const rows = await db
  .selectDistinctOn([teams.id], {
    id: teams.id,
    name: teams.name,
    nameShort: teams.nameShort,
    customName: teams.customName,
    leagueName: leagues.name,
  })
  // ... rest unchanged
```

**Step 3: Verify API still works**

Run: `pnpm --filter @dragons/api test`
Expected: all tests pass (the route test may need updating if it asserts exact shape)

**Step 4: Commit**

```
feat(api): add nameShort to own club teams response
```

---

### Task 2: Add i18n translation keys

**Files:**
- Modify: `apps/web/src/messages/en.json:97-103` (matchDetail.staff section)
- Modify: `apps/web/src/messages/de.json:97-103` (matchDetail.staff section)

**Step 1: Add keys to en.json**

In the `matchDetail.staff` section, add:

```json
"staff": {
  "title": "Officials",
  "team": "Team",
  "teamPlaceholder": "Select team...",
  "setAll": "Set all",
  "anschreiber": "Scorer",
  "zeitnehmer": "Timekeeper",
  "shotclock": "Shot Clock",
  "placeholder": "Select team..."
}
```

**Step 2: Add keys to de.json**

```json
"staff": {
  "title": "Kampfgericht",
  "team": "Team",
  "teamPlaceholder": "Team auswählen...",
  "setAll": "Alle setzen",
  "anschreiber": "Anschreiber",
  "zeitnehmer": "Zeitnehmer",
  "shotclock": "Shotclock",
  "placeholder": "Team auswählen..."
}
```

**Step 3: Verify i18n completeness**

Run: `pnpm --filter @dragons/web test`
Expected: i18n completeness test passes

**Step 4: Commit**

```
feat(i18n): add Kampfgericht team dropdown translations
```

---

### Task 3: Replace free-text inputs with team Select dropdowns

This is the main UI change. Replace the three `Input` fields in the Officials section of `match-edit-sheet.tsx` with:
1. A "Set All" `Select` dropdown that sets all three fields at once
2. Three per-role `Select` dropdowns (each independently overridable)

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-edit-sheet.tsx:1-19` (imports)
- Modify: `apps/web/src/components/admin/matches/match-edit-sheet.tsx:142-205` (state + fetch)
- Modify: `apps/web/src/components/admin/matches/match-edit-sheet.tsx:670-735` (Officials section)

**Step 1: Add imports**

Add to the imports at the top of `match-edit-sheet.tsx`:

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { X } from "lucide-react";
```

**Step 2: Add team state and fetch**

Inside the `MatchEditSheet` component, add state for teams and fetch them when the sheet opens. Add after the existing state declarations (line ~154):

```typescript
const [teams, setTeams] = useState<
  { id: number; name: string; nameShort: string | null; customName: string | null; leagueName: string | null }[]
>([]);
```

Add the teams fetch inside the existing `useEffect` that fetches match data (around line 186). After the `fetchAPI<MatchDetailResponse>` call succeeds, also fetch teams:

```typescript
// Inside the existing useEffect, after setMatch/setDiffs/form.reset:
fetchAPI<{ teams: typeof teams }>("/admin/teams")
  .then((result) => {
    if (!cancelled) setTeams(result.teams);
  })
  .catch(() => {
    // Teams fetch failure is non-critical — dropdowns just won't have options
  });
```

Wait — the existing teams endpoint returns an array directly, not `{ teams: [...] }`. Check the route handler to verify the response shape.

**Step 2b: Check route response shape**

Read `apps/api/src/routes/admin/team.routes.ts` to verify what shape the `/admin/teams` GET endpoint returns. Use the exact shape in the fetch call.

**Step 3: Add helper function for team display name**

Add a helper inside the component (or above it):

```typescript
function getTeamDisplayName(team: { name: string; nameShort: string | null; customName: string | null }): string {
  return team.customName ?? team.nameShort ?? team.name;
}
```

**Step 4: Replace the Officials section (lines 673-735)**

Replace the three `Controller` blocks with:

```tsx
{/* Officials */}
<section className="space-y-4">
  <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
    {t("matchDetail.staff.title")}
  </h3>

  {/* Set All dropdown */}
  <Field>
    <FieldLabel>{t("matchDetail.staff.setAll")}</FieldLabel>
    <Select
      value="__trigger__"
      onValueChange={(teamName) => {
        form.setValue("anschreiber", teamName, { shouldDirty: true });
        form.setValue("zeitnehmer", teamName, { shouldDirty: true });
        form.setValue("shotclock", teamName, { shouldDirty: true });
      }}
    >
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder={t("matchDetail.staff.teamPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {teams.map((team) => {
          const displayName = getTeamDisplayName(team);
          return (
            <SelectItem key={team.id} value={displayName}>
              {displayName}
              {team.leagueName && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {team.leagueName}
                </span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  </Field>

  {/* Per-role dropdowns */}
  {(["anschreiber", "zeitnehmer", "shotclock"] as const).map((fieldName) => (
    <Controller
      key={fieldName}
      control={form.control}
      name={fieldName}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel>{t(`matchDetail.staff.${fieldName}`)}</FieldLabel>
          <div className="flex gap-2">
            <Select
              value={field.value ?? ""}
              onValueChange={(v) => field.onChange(v)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={t("matchDetail.staff.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => {
                  const displayName = getTeamDisplayName(team);
                  return (
                    <SelectItem key={team.id} value={displayName}>
                      {displayName}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {field.value && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => field.onChange(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <FieldError>{fieldState.error?.message}</FieldError>
        </Field>
      )}
    />
  ))}
</section>
```

Note on the "Set All" dropdown: it uses a dummy `value="__trigger__"` so it always shows the placeholder and acts as a one-shot action button. Each time you pick a team from it, all three role fields update. This avoids needing to track a separate "set all" state.

**Step 5: Verify the UI works**

Run: `pnpm --filter @dragons/web dev`
- Open a match in the edit sheet
- Verify the "Set All" dropdown shows all own-club teams
- Select a team — all three role dropdowns should update
- Override one role individually — only that field changes
- Clear a role using the X button — field resets to null
- Save — verify the team display names are stored correctly

**Step 6: Commit**

```
feat(web): replace Kampfgericht free-text inputs with team dropdowns
```

---

### Task 4: Handle edge case — team admin route response shape

Before Task 3's fetch logic works, verify the exact response shape of `GET /admin/teams`.

**Files:**
- Read: `apps/api/src/routes/admin/team.routes.ts`

The teams page likely expects an array response. If the endpoint returns `{ teams: [...] }`, use that. If it returns a bare array, use `fetchAPI<OwnClubTeam[]>(...)` directly.

This task is a dependency check for Task 3 Step 2 — resolve the response shape before writing the fetch call.
