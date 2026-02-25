# Architecture Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix four architectural issues: i18n tooling (10), error recovery (4), match-admin decomposition (8), and SWR-based data fetching with SSR (5).

**Architecture:** Smallest-to-largest ordering. i18n and error recovery are config/file additions. Match-admin is a backend refactor. SWR is the most invasive — replaces all custom providers with SWR hooks while preserving SSR everywhere.

**Tech Stack:** next-intl TypeScript augmentation, @lingual/i18n-check, SWR 2.x, nuqs 2.x (already installed), Next.js App Router SSR patterns.

---

## Task 1: i18n — TypeScript Augmentation

**Files:**
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/global.d.ts`
- Modify: `apps/web/tsconfig.json`
- Modify: `.gitignore`

**Step 1: Update next.config.ts to use object-form plugin with createMessagesDeclaration**

Replace the current `createNextIntlPlugin("./src/i18n/request.ts")` call with the object form:

```typescript
const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    createMessagesDeclaration: "./src/messages/en.json",
  },
});
```

**Step 2: Create global.d.ts**

Create `apps/web/global.d.ts`:

```typescript
import type { routing } from "@/i18n/routing";
import type messages from "./src/messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
```

**Step 3: Update tsconfig.json — add allowArbitraryExtensions**

Add `"allowArbitraryExtensions": true` to `compilerOptions` in `apps/web/tsconfig.json`. Also add `"global.d.ts"` to the `include` array.

**Step 4: Update .gitignore**

Add this line to the root `.gitignore`:

```
# next-intl generated type declarations
apps/web/src/messages/*.d.json.ts
```

**Step 5: Verify**

Run: `pnpm --filter @dragons/web build`
Expected: Build succeeds. A file `apps/web/src/messages/en.d.json.ts` is generated. TypeScript now provides autocomplete on `t()` keys and errors on undefined keys.

**Step 6: Commit**

```bash
git add apps/web/next.config.ts apps/web/global.d.ts apps/web/tsconfig.json .gitignore
git commit -m "feat(web): add next-intl TypeScript augmentation for type-safe translations"
```

---

## Task 2: i18n — CI Validation with @lingual/i18n-check

**Files:**
- Modify: `apps/web/package.json`
- Modify: `.github/workflows/ci.yml`

**Step 1: Install @lingual/i18n-check**

```bash
pnpm --filter @dragons/web add -D @lingual/i18n-check
```

**Step 2: Add i18n:check script to apps/web/package.json**

Add to `"scripts"`:

```json
"i18n:check": "i18n-check -l src/messages -s en -f next-intl"
```

**Step 3: Add root-level script**

Add to root `package.json` scripts:

```json
"check:i18n": "pnpm --filter @dragons/web i18n:check"
```

**Step 4: Add CI step**

In `.github/workflows/ci.yml`, add a new step in the `quality` job after the existing "Lint" step:

```yaml
      - name: i18n completeness check
        run: pnpm check:i18n
```

**Step 5: Verify locally**

Run: `pnpm check:i18n`
Expected: Passes (both locales currently have matching keys per messages.test.ts).

**Step 6: Commit**

```bash
git add apps/web/package.json package.json .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "feat(ci): add i18n completeness check with @lingual/i18n-check"
```

---

## Task 3: Error Recovery — Add error.tsx, not-found.tsx, loading.tsx

**Files:**
- Create: `apps/web/src/app/[locale]/error.tsx`
- Create: `apps/web/src/app/[locale]/not-found.tsx`
- Create: `apps/web/src/app/[locale]/admin/error.tsx`
- Create: `apps/web/src/app/[locale]/admin/loading.tsx`
- Create: `apps/web/src/app/[locale]/admin/matches/[id]/not-found.tsx`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

**Step 1: Add i18n keys for error pages**

Add to both `en.json` and `de.json` under a new top-level `"errors"` key.

English (`en.json`):
```json
"errors": {
  "title": "Something went wrong",
  "description": "An unexpected error occurred. Please try again.",
  "tryAgain": "Try again",
  "goHome": "Go to dashboard",
  "notFound": {
    "title": "Page not found",
    "description": "The page you are looking for does not exist.",
    "matchTitle": "Match not found",
    "matchDescription": "This match does not exist or has been removed."
  }
}
```

German (`de.json`):
```json
"errors": {
  "title": "Etwas ist schiefgelaufen",
  "description": "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.",
  "tryAgain": "Erneut versuchen",
  "goHome": "Zum Dashboard",
  "notFound": {
    "title": "Seite nicht gefunden",
    "description": "Die gesuchte Seite existiert nicht.",
    "matchTitle": "Spiel nicht gefunden",
    "matchDescription": "Dieses Spiel existiert nicht oder wurde entfernt."
  }
}
```

**Step 2: Create `apps/web/src/app/[locale]/error.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <Button onClick={reset}>{t("tryAgain")}</Button>
    </div>
  );
}
```

**Step 3: Create `apps/web/src/app/[locale]/not-found.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Link } from "@/lib/navigation";

export default function NotFound() {
  const t = useTranslations("errors.notFound");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <Button asChild>
        <Link href="/admin/matches">{useTranslations("errors")("goHome")}</Link>
      </Button>
    </div>
  );
}
```

**Step 4: Create `apps/web/src/app/[locale]/admin/error.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Link } from "@/lib/navigation";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <div className="flex gap-3">
        <Button onClick={reset}>{t("tryAgain")}</Button>
        <Button variant="outline" asChild>
          <Link href="/admin/matches">{t("goHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
```

**Step 5: Create `apps/web/src/app/[locale]/admin/loading.tsx`**

```tsx
import { Loader2 } from "lucide-react";

export default function AdminLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
```

**Step 6: Create `apps/web/src/app/[locale]/admin/matches/[id]/not-found.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Link } from "@/lib/navigation";

export default function MatchNotFound() {
  const t = useTranslations("errors.notFound");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t("matchTitle")}</h1>
      <p className="text-muted-foreground max-w-md">{t("matchDescription")}</p>
      <Button asChild>
        <Link href="/admin/matches">{useTranslations("errors")("goHome")}</Link>
      </Button>
    </div>
  );
}
```

**Step 7: Verify**

Run: `pnpm --filter @dragons/web build`
Expected: Build succeeds. Error boundaries catch server component failures. 404 pages render properly.

**Step 8: Commit**

```bash
git add apps/web/src/app/\[locale\]/error.tsx apps/web/src/app/\[locale\]/not-found.tsx apps/web/src/app/\[locale\]/admin/error.tsx apps/web/src/app/\[locale\]/admin/loading.tsx apps/web/src/app/\[locale\]/admin/matches/\[id\]/not-found.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add error boundaries, not-found pages, and loading state"
```

---

## Task 4: Decompose match-admin.service.ts

Split the 870-line God Service into 3 focused files. No behavior changes — pure refactor.

**Files:**
- Create: `apps/api/src/services/admin/match-query.service.ts`
- Create: `apps/api/src/services/admin/match-diff.service.ts`
- Modify: `apps/api/src/services/admin/match-admin.service.ts` (becomes override-only)
- Modify: `apps/api/src/services/admin/match-admin.service.test.ts` (update imports)
- Modify: `apps/api/src/routes/admin/match.routes.ts` (update imports)

### Decomposition map

**match-diff.service.ts** (pure logic, no DB):
- `OVERRIDABLE_FIELDS`, `LOCAL_ONLY_FIELDS` constants
- `OverridableField`, `LocalOnlyField`, `AllEditableField` types
- `DiffStatus`, `FieldDiff` types
- `computeDiffs()` function

**match-query.service.ts** (read-only DB access):
- `homeTeam`, `guestTeam` aliases
- `MatchListParams`, `MatchListItem`, `MatchDetail`, `OverrideInfo`, `MatchDetailResponse` types
- `MatchUpdateData` type
- `getBaseQuery()` / `queryMatchWithJoins()` → unified as single function accepting optional `client` param
- `loadOverrides()`
- `loadRemoteSnapshot()`
- `rowToListItem()`, `rowToDetail()`
- `getOwnClubMatches()`
- `getMatchDetail()`
- `buildDetailResponse()` — new helper extracting the shared tail from both transaction functions

**match-admin.service.ts** (write operations only):
- `updateMatchLocal()` — imports query/diff helpers
- `releaseOverride()` — imports query/diff helpers
- Re-exports everything for backwards compatibility

**Step 1: Create `apps/api/src/services/admin/match-diff.service.ts`**

Extract from match-admin.service.ts:
- `OVERRIDABLE_FIELDS` and `LOCAL_ONLY_FIELDS` (lines 119-141)
- The types `OverridableField`, `LocalOnlyField`, `AllEditableField` (lines 143-145)
- `DiffStatus` and `FieldDiff` interfaces (lines 18-26)
- `computeDiffs()` function (lines 346-405)

The function signature for `computeDiffs` stays the same. It accepts a row (generic record), overriddenFields array, and optional remoteSnapshot. The row type param uses the same `Awaited<ReturnType<typeof getBaseQuery>>[number]` — but since getBaseQuery lives in query service, export a `MatchRow` type from the query service and import it here.

Actually, to avoid circular deps, `computeDiffs` should accept a simpler interface. The row fields it actually reads are: `kickoffDate`, `kickoffTime`, `venueNameOverride`, `venueName`, `isForfeited`, `isCancelled`, `anschreiber`, `zeitnehmer`, `shotclock`, `internalNotes`, `publicComment`. Define a `DiffInput` interface in this file.

```typescript
export interface DiffInput {
  kickoffDate: string;
  kickoffTime: string;
  venueNameOverride: string | null;
  venueName: string | null;
  isForfeited: boolean | null;
  isCancelled: boolean | null;
  anschreiber: string | null;
  zeitnehmer: string | null;
  shotclock: string | null;
  internalNotes: string | null;
  publicComment: string | null;
}
```

**Step 2: Create `apps/api/src/services/admin/match-query.service.ts`**

Extract:
- Imports for db, schema tables, drizzle operators
- `TransactionClient` type (line 16)
- `homeTeam`, `guestTeam` aliases (lines 177-178)
- `MatchListParams`, `OverrideInfo`, `MatchListItem`, `MatchDetail`, `MatchDetailResponse`, `MatchUpdateData` interfaces
- `getBaseQuery()` (lines 180-250)
- Unify `queryMatchWithJoins()` (lines 511-581) with `getBaseQuery()`: make one function that accepts an optional `client` parameter defaulting to `db`
- `loadOverrides()` (lines 252-262)
- `loadRemoteSnapshot()` (lines 492-509)
- `rowToListItem()` (lines 264-304)
- `rowToDetail()` (lines 306-344)
- `getOwnClubMatches()` (lines 407-473)
- `getMatchDetail()` (lines 475-490)

Add new helper `buildDetailResponse()` that encapsulates the shared tail pattern used by both `updateMatchLocal` and `releaseOverride`:

```typescript
export async function buildDetailResponse(
  client: Database | TransactionClient,
  matchId: number,
): Promise<MatchDetailResponse | null> {
  const [row] = await queryMatchWithJoins(client)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return null;

  const overrides = await client
    .select({
      fieldName: matchOverrides.fieldName,
      reason: matchOverrides.reason,
      changedBy: matchOverrides.changedBy,
      createdAt: matchOverrides.createdAt,
    })
    .from(matchOverrides)
    .where(eq(matchOverrides.matchId, matchId));

  const overriddenFields = overrides.map((o) => o.fieldName);
  const remoteSnapshot = await loadRemoteSnapshot(client, matchId, row.currentRemoteVersion);

  return {
    match: rowToDetail(row, overriddenFields, overrides),
    diffs: computeDiffs(row, overriddenFields, remoteSnapshot),
  };
}
```

Export a `MatchRow` type: `export type MatchRow = Awaited<ReturnType<typeof queryMatchWithJoins>>[number];`

**Step 3: Slim down `match-admin.service.ts`**

Keep only:
- `updateMatchLocal()` — now imports `OVERRIDABLE_FIELDS`, `LOCAL_ONLY_FIELDS` from match-diff, and `buildDetailResponse`, `loadRemoteSnapshot`, `queryMatchWithJoins` from match-query
- `releaseOverride()` — same imports
- Re-export everything from both new files for backwards compatibility:

```typescript
export { computeDiffs, OVERRIDABLE_FIELDS, LOCAL_ONLY_FIELDS } from "./match-diff.service";
export type { DiffStatus, FieldDiff, DiffInput, OverridableField, LocalOnlyField, AllEditableField } from "./match-diff.service";
export {
  getOwnClubMatches,
  getMatchDetail,
  queryMatchWithJoins,
  loadOverrides,
  loadRemoteSnapshot,
  buildDetailResponse,
} from "./match-query.service";
export type {
  MatchListParams,
  OverrideInfo,
  MatchListItem,
  MatchDetail,
  MatchDetailResponse,
  MatchUpdateData,
  MatchRow,
} from "./match-query.service";
```

This ensures existing imports from `match-admin.service` still work.

**Step 4: Update match-admin.service.test.ts imports**

The test file imports from `./match-admin.service`. Since we re-export everything, the imports still work. No test file changes needed unless TypeScript complains about specific named imports — in that case, update to import from the correct sub-module.

However, if the test file directly references internal functions (like `computeDiffs`), verify they're properly re-exported. The test file should continue to import from `./match-admin.service` to validate the re-export contract.

**Step 5: Update match.routes.ts**

Check if `match.routes.ts` imports from `match-admin.service`. If so, imports continue to work via re-exports. No changes needed.

**Step 6: Run tests**

```bash
pnpm --filter @dragons/api test
```

Expected: All tests pass. Coverage stays at 100%.

**Step 7: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors.

**Step 8: Commit**

```bash
git add apps/api/src/services/admin/match-diff.service.ts apps/api/src/services/admin/match-query.service.ts apps/api/src/services/admin/match-admin.service.ts
git commit -m "refactor(api): decompose match-admin.service into query, diff, and override modules"
```

---

## Task 5: Install SWR and Create API Fetcher

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/swr.ts`

**Step 1: Install SWR**

```bash
pnpm --filter @dragons/web add swr
```

**Step 2: Create `apps/web/src/lib/swr.ts`**

This is the shared SWR fetcher that uses the existing `fetchAPI` function:

```typescript
import { fetchAPI } from "./api";

export const apiFetcher = <T>(endpoint: string): Promise<T> =>
  fetchAPI<T>(endpoint);
```

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/swr.ts pnpm-lock.yaml
git commit -m "feat(web): install SWR and create shared API fetcher"
```

---

## Task 6: SWR — Migrate Sync Page

This is the most complex migration because the sync provider has polling, optimistic updates, and SSE integration. Strategy: Replace the context provider with a set of SWR hooks that each component calls directly. Keep the SSE logic in its own component.

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/sync/page.tsx`
- Create: `apps/web/src/lib/swr-keys.ts`
- Create: `apps/web/src/components/admin/sync/use-sync.ts`
- Modify: `apps/web/src/components/admin/sync/sync-status-cards.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-trigger-button.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-history-table.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-schedule-config.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-live-logs-container.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-error-banner.tsx`
- Delete: `apps/web/src/components/admin/sync/sync-provider.tsx`

### Design

Instead of one big provider, create focused hooks in `use-sync.ts`:

```typescript
// Shared state for the running sync run ID (needs to persist across components)
// Use a tiny context just for the mutable runningSyncRunId + triggerSync action.
```

Actually, the `runningSyncRunId` + optimistic trigger needs shared mutable state that SWR alone can't handle (it's not fetched from the server — it's set client-side on trigger and cleared on completion). So we keep a minimal context for just that, and move all data fetching to SWR.

**Step 1: Create `apps/web/src/lib/swr-keys.ts`**

Centralize all SWR cache keys:

```typescript
export const SWR_KEYS = {
  syncStatus: "/admin/sync/status",
  syncLogs: (limit: number, offset: number) =>
    `/admin/sync/logs?limit=${limit}&offset=${offset}`,
  syncSchedule: "/admin/sync/schedule",
  matches: "/admin/matches",
  matchDetail: (id: number) => `/admin/matches/${id}`,
  teams: "/admin/teams",
  settingsClub: "/admin/settings/club",
  settingsLeagues: "/admin/settings/leagues",
} as const;
```

**Step 2: Create `apps/web/src/components/admin/sync/use-sync.ts`**

Replace the provider with a small context (only for `runningSyncRunId`) + SWR hooks:

```typescript
"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import type {
  SyncStatusResponse,
  LogsResponse,
  SyncScheduleData,
  SyncRun,
  TriggerResponse,
} from "./types";

// --- Minimal context for sync run tracking ---

interface SyncRunContextValue {
  runningSyncRunId: number | null;
  setRunningSyncRunId: (id: number | null) => void;
}

const SyncRunContext = createContext<SyncRunContextValue | null>(null);

export { SyncRunContext };

export function useSyncRunContext() {
  const ctx = useContext(SyncRunContext);
  if (!ctx) throw new Error("useSyncRunContext requires SyncRunProvider");
  return ctx;
}

// --- SWR hooks ---

export function useSyncStatus() {
  const { runningSyncRunId } = useSyncRunContext();
  const isRunning = runningSyncRunId !== null;

  const { data, error, mutate } = useSWR<SyncStatusResponse>(
    SWR_KEYS.syncStatus,
    apiFetcher,
    {
      refreshInterval: isRunning ? 3000 : 15000,
      revalidateOnFocus: true,
    },
  );

  // Derive isRunning from both server state and local tracking
  const serverRunning = data?.isRunning ?? false;
  const effectiveRunning = serverRunning || isRunning;

  return { status: data ?? null, error, isRunning: effectiveRunning, mutate };
}

export function useSyncLogs() {
  const { data, error, mutate, isLoading } = useSWR<LogsResponse>(
    SWR_KEYS.syncLogs(20, 0),
    apiFetcher,
    {
      refreshInterval: 15000,
      revalidateOnFocus: true,
    },
  );

  return {
    logs: data?.items ?? [],
    hasMore: data?.hasMore ?? false,
    error,
    isLoading,
    mutate,
  };
}

export function useSyncSchedule() {
  const { data, error, mutate } = useSWR<SyncScheduleData>(
    SWR_KEYS.syncSchedule,
    apiFetcher,
  );

  return { schedule: data ?? null, error, mutate };
}

export function useTriggerSync() {
  const t = useTranslations();
  const { setRunningSyncRunId } = useSyncRunContext();
  const { mutate: mutateStatus } = useSyncStatus();
  const { mutate: mutateLogs } = useSyncLogs();
  const [triggering, setTriggering] = useState(false);

  const trigger = useCallback(async () => {
    try {
      setTriggering(true);
      const result = await fetchAPI<TriggerResponse>("/admin/sync/trigger", {
        method: "POST",
      });

      setRunningSyncRunId(result.syncRunId);

      // Optimistic: tell SWR the status is now running
      const now = new Date().toISOString();
      const optimisticRun: SyncRun = {
        id: result.syncRunId,
        syncType: "full",
        status: "running",
        triggeredBy: "manual",
        recordsProcessed: null,
        recordsCreated: null,
        recordsUpdated: null,
        recordsFailed: null,
        recordsSkipped: null,
        startedAt: now,
        completedAt: null,
        durationMs: null,
        errorMessage: null,
        errorStack: null,
        summary: null,
        createdAt: now,
      };

      await mutateStatus({ isRunning: true, lastSync: optimisticRun }, { revalidate: false });
      await mutateLogs(
        (current) => {
          const items = current?.items ?? [];
          return {
            items: [optimisticRun, ...items.filter((r) => r.id !== result.syncRunId)],
            hasMore: current?.hasMore ?? false,
          };
        },
        { revalidate: false },
      );
    } catch {
      toast.error(t("sync.toast.triggerFailed"));
    } finally {
      setTriggering(false);
    }
  }, [t, setRunningSyncRunId, mutateStatus, mutateLogs]);

  return { trigger, triggering };
}
```

**Step 3: Create `apps/web/src/components/admin/sync/sync-run-provider.tsx`**

Tiny provider wrapping just the runningSyncRunId state:

```typescript
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { SyncRunContext } from "./use-sync";
import type { SyncStatusResponse, SyncRun } from "./types";

function deriveRunningSyncRunId(status: SyncStatusResponse | null): number | null {
  if (status?.isRunning && status.lastSync?.status === "running") {
    return status.lastSync.id;
  }
  return null;
}

interface SyncRunProviderProps {
  initialStatus: SyncStatusResponse | null;
  children: ReactNode;
}

export function SyncRunProvider({ initialStatus, children }: SyncRunProviderProps) {
  const [runningSyncRunId, setRunningSyncRunId] = useState<number | null>(
    deriveRunningSyncRunId(initialStatus),
  );

  return (
    <SyncRunContext value={{ runningSyncRunId, setRunningSyncRunId }}>
      {children}
    </SyncRunContext>
  );
}
```

**Step 4: Add a `SyncCompletionWatcher` client component**

This replaces the `useEffect` in the old provider that clears `runningSyncRunId` when the tracked run is done:

```typescript
// Add to use-sync.ts or as a separate component file

export function SyncCompletionWatcher() {
  const { runningSyncRunId, setRunningSyncRunId } = useSyncRunContext();
  const { logs } = useSyncLogs();

  useEffect(() => {
    if (runningSyncRunId === null) return;
    const trackedRun = logs.find((r) => r.id === runningSyncRunId);
    if (trackedRun && trackedRun.status !== "running" && trackedRun.status !== "pending") {
      setRunningSyncRunId(null);
    }
  }, [runningSyncRunId, logs, setRunningSyncRunId]);

  return null;
}
```

**Step 5: Update sync/page.tsx**

Replace `SyncProvider` with `SWRConfig` + `SyncRunProvider`:

```tsx
import { SWRConfig } from "swr";
import { SyncRunProvider } from "@/components/admin/sync/sync-run-provider";
import { SyncCompletionWatcher } from "@/components/admin/sync/use-sync";
import { SWR_KEYS } from "@/lib/swr-keys";

export default async function SyncPage() {
  const t = await getTranslations();
  let status: SyncStatusResponse | null = null;
  let logs: LogsResponse | null = null;
  let schedule: SyncScheduleData | null = null;
  let error: string | null = null;

  try {
    [status, logs, schedule] = await Promise.all([
      fetchAPIServer<SyncStatusResponse>("/admin/sync/status"),
      fetchAPIServer<LogsResponse>("/admin/sync/logs?limit=20&offset=0"),
      fetchAPIServer<SyncScheduleData>("/admin/sync/schedule"),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("sync.title")}</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <SWRConfig
      value={{
        fallback: {
          [SWR_KEYS.syncStatus]: status,
          [SWR_KEYS.syncLogs(20, 0)]: logs,
          [SWR_KEYS.syncSchedule]: schedule,
        },
      }}
    >
      <SyncRunProvider initialStatus={status}>
        <SyncCompletionWatcher />
        <div className="space-y-6">
          {/* ... header, cards, tabs — same JSX, no provider wrapper */}
        </div>
      </SyncRunProvider>
    </SWRConfig>
  );
}
```

**Step 6: Update each sync child component**

Replace `useSyncContext()` calls with specific SWR hooks:

- `SyncStatusCards` → `const { status, isRunning } = useSyncStatus();` + `const { schedule } = useSyncSchedule();`
- `SyncTriggerButton` → `const { trigger, triggering } = useTriggerSync();` + `const { isRunning } = useSyncStatus();`
- `SyncHistoryTable` → `const { logs, hasMore } = useSyncLogs();` + keep the "load more" logic using fetchAPI directly (SWR doesn't handle appending well)
- `SyncScheduleConfig` → `const { schedule, mutate } = useSyncSchedule();`
- `SyncLiveLogsContainer` → `const { runningSyncRunId } = useSyncRunContext();`
- `SyncErrorBanner` → `const { error } = useSyncStatus();`

For `SyncHistoryTable` load-more: Keep a local `extraLogs` state for pages beyond the first. SWR handles page 1, extra pages are manual appends. Or use `useSWRInfinite` if appropriate. Simplest: keep the manual approach for "load more" since it's append-only pagination.

**Step 7: Delete sync-provider.tsx**

Remove the file. All functionality has been replaced by `use-sync.ts` + `sync-run-provider.tsx`.

**Step 8: Verify**

```bash
pnpm --filter @dragons/web build
```

Expected: Builds successfully. Sync page SSR works with SWR fallback data. Polling activates on client side.

**Step 9: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts apps/web/src/components/admin/sync/
git add apps/web/src/app/\[locale\]/admin/sync/page.tsx
git rm apps/web/src/components/admin/sync/sync-provider.tsx
git commit -m "refactor(web): migrate sync page from context provider to SWR"
```

---

## Task 7: SWR — Migrate Matches Pages

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/matches/page.tsx`
- Modify: `apps/web/src/components/admin/matches/match-list-table.tsx`
- Modify: `apps/web/src/components/admin/matches/match-edit-sheet.tsx`
- Modify: `apps/web/src/app/[locale]/admin/matches/[id]/page.tsx`
- Modify: `apps/web/src/components/admin/matches/match-detail-view.tsx`

### Key improvements:
1. Match list uses SWR with SSR fallback — no more `router.refresh()` after edit
2. Match edit sheet uses `useSWR` with the same key as detail page — SWR deduplicates
3. After mutation, `mutate()` revalidates both the detail and the list

**Step 1: Update matches/page.tsx**

Wrap children in `SWRConfig` with fallback data:

```tsx
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export default async function MatchesPage() {
  const t = await getTranslations();
  let data: MatchListResponse | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<MatchListResponse>("/admin/matches");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("matches.title")}</h1>
      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.matches]: data } }}>
          <MatchListTable />
        </SWRConfig>
      )}
    </div>
  );
}
```

Note: `MatchListTable` no longer receives `data` and `teamOptions` as props — it gets them from SWR.

**Step 2: Update MatchListTable**

Remove `data` and `teamOptions` props. Use `useSWR`:

```tsx
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export function MatchListTable() {
  const { data: response } = useSWR<MatchListResponse>(SWR_KEYS.matches, apiFetcher);
  const allItems = response?.items ?? [];
  const teamOptions = [...new Set(allItems.map((m) => getOwnTeamLabel(m)))].sort();

  // ... rest of component uses allItems instead of data prop
}
```

After the edit sheet saves, instead of `router.refresh()`, call `mutate(SWR_KEYS.matches)` to revalidate:

In the sheet's `onSaved` callback:
```tsx
import { useSWRConfig } from "swr";
const { mutate } = useSWRConfig();
// After save:
mutate(SWR_KEYS.matches);
```

**Step 3: Update match-edit-sheet.tsx**

Replace the manual `fetchAPI` in `useEffect` with `useSWR`:

```tsx
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";

// Inside the component:
const { data: detailData, isLoading } = useSWR<MatchDetailResponse>(
  open && matchId ? SWR_KEYS.matchDetail(matchId) : null,
  apiFetcher,
);
```

The `null` key when `!open || !matchId` tells SWR to skip the request. When the sheet opens with a matchId, SWR fetches and caches it.

After PATCH mutation, mutate both the detail and the list:

```tsx
const { mutate } = useSWRConfig();

// In the save handler:
const result = await fetchAPI<MatchDetailResponse>(...);
// Update detail cache with the response
await mutate(SWR_KEYS.matchDetail(matchId), result, { revalidate: false });
// Revalidate the list
await mutate(SWR_KEYS.matches);
```

Same for release override — mutate both keys.

Remove: the manual `useEffect` that fetches match detail, the `loading` state, the `match`/`diffs` state (derive from SWR data).

**Step 4: Update matches/[id]/page.tsx**

Wrap in SWRConfig with fallback:

```tsx
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id } = await params;

  let data: MatchDetailResponse;
  try {
    data = await fetchAPIServer<MatchDetailResponse>(`/admin/matches/${id}`);
  } catch (e) {
    if (e instanceof APIError && e.status === 404) {
      notFound();
    }
    throw e;
  }

  return (
    <SWRConfig value={{ fallback: { [SWR_KEYS.matchDetail(Number(id))]: data } }}>
      <MatchDetailView matchId={Number(id)} />
    </SWRConfig>
  );
}
```

**Step 5: Update MatchDetailView**

Replace `initialData` prop with `useSWR`:

```tsx
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export function MatchDetailView({ matchId }: { matchId: number }) {
  const { data } = useSWR<MatchDetailResponse>(
    SWR_KEYS.matchDetail(matchId),
    apiFetcher,
  );
  const match = data?.match ?? null;
  const diffs = data?.diffs ?? [];

  // ... rest of component
}
```

After mutations, mutate the cache:

```tsx
const { mutate } = useSWRConfig();

// After save:
const result = await fetchAPI<MatchDetailResponse>(...);
await mutate(SWR_KEYS.matchDetail(matchId), result, { revalidate: false });
```

**Step 6: Verify**

```bash
pnpm --filter @dragons/web build
```

**Step 7: Commit**

```bash
git add apps/web/src/app/\[locale\]/admin/matches/ apps/web/src/components/admin/matches/
git commit -m "refactor(web): migrate matches pages to SWR with SSR fallback"
```

---

## Task 8: SWR — Migrate Settings Page

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/settings/page.tsx`
- Modify: `apps/web/src/components/admin/settings/club-config.tsx`
- Modify: `apps/web/src/components/admin/settings/tracked-leagues.tsx`
- Delete: `apps/web/src/components/admin/settings/settings-provider.tsx`

**Step 1: Update settings/page.tsx**

Replace `SettingsProvider` with `SWRConfig`:

```tsx
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export default async function SettingsPage() {
  const t = await getTranslations();
  let clubConfig = null;
  let leaguesResponse = null;

  try {
    [clubConfig, leaguesResponse] = await Promise.all([
      fetchAPIServer<ClubConfigType | null>("/admin/settings/club"),
      fetchAPIServer<TrackedLeaguesResponse>("/admin/settings/leagues"),
    ]);
  } catch {
    // Will show empty state
  }

  return (
    <SWRConfig
      value={{
        fallback: {
          [SWR_KEYS.settingsClub]: clubConfig,
          [SWR_KEYS.settingsLeagues]: leaguesResponse,
        },
      }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="text-muted-foreground">{t("settings.description")}</p>
        </div>
        <ClubConfig />
        <TrackedLeagues />
      </div>
    </SWRConfig>
  );
}
```

**Step 2: Update ClubConfig**

Replace `useSettings()` with `useSWR`:

```tsx
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export function ClubConfig() {
  const { data: clubConfig } = useSWR<ClubConfigType | null>(
    SWR_KEYS.settingsClub,
    apiFetcher,
  );
  const { mutate } = useSWRConfig();

  // After save:
  const result = await fetchAPI<ClubConfigType>("/admin/settings/club", { ... });
  await mutate(SWR_KEYS.settingsClub, result, { revalidate: false });
}
```

**Step 3: Update TrackedLeagues**

Replace `useSettings()` with `useSWR`:

```tsx
import useSWR, { useSWRConfig } from "swr";

export function TrackedLeagues() {
  const { data: clubConfig } = useSWR<ClubConfigType | null>(SWR_KEYS.settingsClub, apiFetcher);
  const { data: leaguesData } = useSWR<TrackedLeaguesResponse>(SWR_KEYS.settingsLeagues, apiFetcher);
  const { mutate } = useSWRConfig();

  // After save:
  await mutate(SWR_KEYS.settingsLeagues); // revalidate from server
}
```

**Step 4: Delete settings-provider.tsx**

**Step 5: Verify**

```bash
pnpm --filter @dragons/web build
```

**Step 6: Commit**

```bash
git add apps/web/src/app/\[locale\]/admin/settings/ apps/web/src/components/admin/settings/
git rm apps/web/src/components/admin/settings/settings-provider.tsx
git commit -m "refactor(web): migrate settings page to SWR with SSR fallback"
```

---

## Task 9: SWR — Migrate Teams Page

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/teams/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`

**Step 1: Update teams/page.tsx**

```tsx
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export default async function TeamsPage() {
  const t = await getTranslations();
  let teams: OwnClubTeam[] | null = null;
  let error: string | null = null;

  try {
    teams = await fetchAPIServer<OwnClubTeam[]>("/admin/teams");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("teams.title")}</h1>
        <p className="text-muted-foreground">{t("teams.description")}</p>
      </div>
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.teams]: teams } }}>
          <TeamsTable />
        </SWRConfig>
      )}
    </div>
  );
}
```

**Step 2: Update TeamsTable**

Replace `initialTeams` prop with `useSWR`. Keep the `drafts` pattern since it's local-only UI state:

```tsx
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";

export function TeamsTable() {
  const { data: teams } = useSWR<OwnClubTeam[]>(SWR_KEYS.teams, apiFetcher);
  const { mutate } = useSWRConfig();
  const teamsList = teams ?? [];
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  async function save(team: OwnClubTeam) {
    // ... existing save logic ...
    const updated = await fetchAPI<OwnClubTeam>(`/admin/teams/${team.id}`, { ... });

    // Update SWR cache with the changed team
    await mutate(
      SWR_KEYS.teams,
      (current: OwnClubTeam[] | undefined) =>
        (current ?? []).map((t) => (t.id === team.id ? updated : t)),
      { revalidate: false },
    );

    // Clear draft for this team
    setDrafts((prev) => { const next = { ...prev }; delete next[team.id]; return next; });
  }

  // ... rest uses teamsList instead of teams state
}
```

**Step 3: Verify**

```bash
pnpm --filter @dragons/web build
```

**Step 4: Commit**

```bash
git add apps/web/src/app/\[locale\]/admin/teams/
git commit -m "refactor(web): migrate teams page to SWR with SSR fallback"
```

---

## Task 10: Final Verification

**Step 1: Run full build**

```bash
pnpm build
```

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

**Step 3: Run API tests**

```bash
pnpm --filter @dragons/api test
```

**Step 4: Run i18n check**

```bash
pnpm check:i18n
```

**Step 5: Run lint**

```bash
pnpm lint
```

**Step 6: Manual smoke test**

Start dev server: `pnpm dev`

Verify each page loads with SSR data (check page source for pre-rendered content):
- `/admin/matches` — table renders on server, SWR revalidates on client
- `/admin/matches/123` — detail renders on server
- `/admin/sync` — status cards render on server, polling starts on client
- `/admin/settings` — club config and leagues render on server
- `/admin/teams` — team table renders on server

Verify mutations work:
- Edit a match → list updates without full page refresh
- Trigger sync → status updates in real-time
- Change team name → table updates in-place

Verify error pages:
- Visit `/admin/nonexistent` → shows 404 page
- Stop the API server and refresh → shows error boundary with retry button

**Step 7: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup after architecture improvements"
```
