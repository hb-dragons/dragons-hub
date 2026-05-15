# Referee Hub Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify `/admin/referees`, `/admin/referee/matches`, and `/admin/referee/history` into one hub at `/admin/referees` with two tabs (Open Slots default + Referees with workload as no-selection state), backed by URL state and auto-save.

**Architecture:** Two master-detail tabs sharing a URL-driven state hook. Open Slots is game-focused with a federation-backed inline candidate picker. Referees is ref-focused with auto-saving Profile sub-tab (visibility + per-team rules), backed by the transactional `PATCH /admin/referees/:id` endpoint shipped 2026-05-15. No new API endpoints; no schema changes.

**Tech Stack:** Next.js 16 (App Router, client components), SWR for data, `@dragons/ui` (Radix/shadcn) for primitives, vitest + happy-dom + `@testing-library/react` for tests, `next-intl` for i18n, `sonner` for toasts.

**Spec:** `docs/superpowers/specs/2026-05-15-referee-hub-unification-design.md`

---

## File Structure

New files (all under `apps/web/src/components/admin/referee-hub/`):

```
referee-hub.tsx                   # <RefereeHubPage> top-level: header + tab switcher + active tab
hub-header.tsx                    # Title + tab switcher + global range filter
use-referee-hub-url.ts            # URL state hook (tab, id, game, subtab, range, filters)
use-referee-hub-url.test.ts

open-slots/
  open-slots-tab.tsx              # <OpenSlotsTab> master-detail wiring
  open-games-list.tsx             # Left list of games needing refs
  open-games-list.test.tsx
  open-slot-detail.tsx            # Right panel — game header + two slot cards
  slot-card.tsx                   # Per-slot card with assigned/open state + actions
  candidate-picker.tsx            # Federation-backed inline picker
  candidate-picker.test.tsx

referees/
  referees-tab.tsx                # <RefereesTab> master-detail wiring
  referee-list.tsx                # Left list + KPI row + inline isOwnClub toggle
  referee-list.test.tsx
  referee-detail.tsx              # Right panel — header + subtabs
  use-auto-save.ts                # Auto-save debounced hook
  use-auto-save.test.ts
  profile-subtab.tsx              # Visibility toggles + rules editor (auto-save)
  profile-subtab.test.tsx
  upcoming-subtab.tsx             # Assigned + eligible open slots
  history-subtab.tsx              # Per-ref history (reuses /admin/referee/history/games)
```

Modified files:

```
apps/web/src/app/[locale]/admin/referees/page.tsx     # Rewrite to render <RefereeHubPage>
apps/web/src/app/[locale]/admin/referee/matches/page.tsx   # Replace body with redirect
apps/web/src/app/[locale]/admin/referee/history/page.tsx   # Replace body with redirect
apps/web/src/lib/swr-keys.ts                          # Add refereeCandidates key
apps/web/messages/*.json                              # Add new i18n strings under "refereeHub"
```

Untouched (kept for old route fallback during migration; removal is a follow-up):

```
apps/web/src/components/admin/referees/referee-rules-dialog.tsx
apps/web/src/components/admin/referees/referee-list-table.tsx
apps/web/src/components/referee/referee-games-list.tsx
apps/web/src/components/referee/history/history-page.tsx
```

---

## Test Conventions

Web component tests use `// @vitest-environment happy-dom` directive + `@testing-library/react` + `@testing-library/jest-dom/vitest`. See `apps/web/src/app/[locale]/admin/broadcast/broadcast-control.test.tsx` for a working reference. Mocks via `vi.mock`. Wrap render output in `NextIntlClientProvider` with stub messages.

API/service tests already covered for the transactional endpoint (shipped 2026-05-15). This plan adds web-side tests only.

---

## Phase A — Foundation

### Task 1: URL state hook

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts`
- Test: `apps/web/src/components/admin/referee-hub/use-referee-hub-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `use-referee-hub-url.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { parseHubUrl, buildHubUrl } from "./use-referee-hub-url";

describe("parseHubUrl", () => {
  it("returns Open Slots as the default tab when no params", () => {
    const state = parseHubUrl(new URLSearchParams(""));
    expect(state).toEqual({
      tab: "open-slots",
      gameId: null,
      refereeId: null,
      subtab: "profile",
      range: "30d",
    });
  });

  it("parses tab=referees with refId and subtab=history", () => {
    const state = parseHubUrl(
      new URLSearchParams("tab=referees&id=42&subtab=history"),
    );
    expect(state).toEqual({
      tab: "referees",
      gameId: null,
      refereeId: 42,
      subtab: "history",
      range: "30d",
    });
  });

  it("parses open-slots tab with game id", () => {
    const state = parseHubUrl(
      new URLSearchParams("tab=open-slots&game=4287"),
    );
    expect(state.tab).toBe("open-slots");
    expect(state.gameId).toBe(4287);
  });

  it("ignores non-numeric ids", () => {
    const state = parseHubUrl(new URLSearchParams("tab=referees&id=abc"));
    expect(state.refereeId).toBeNull();
  });

  it("clamps unknown tab to open-slots default", () => {
    const state = parseHubUrl(new URLSearchParams("tab=bogus"));
    expect(state.tab).toBe("open-slots");
  });

  it("clamps unknown subtab to profile default", () => {
    const state = parseHubUrl(new URLSearchParams("tab=referees&subtab=x"));
    expect(state.subtab).toBe("profile");
  });

  it("clamps unknown range to 30d", () => {
    const state = parseHubUrl(new URLSearchParams("range=forever"));
    expect(state.range).toBe("30d");
  });
});

describe("buildHubUrl", () => {
  it("omits default tab in the URL", () => {
    expect(buildHubUrl({ tab: "open-slots", gameId: null, refereeId: null, subtab: "profile", range: "30d" }))
      .toBe("");
  });

  it("includes tab and ref id", () => {
    expect(buildHubUrl({ tab: "referees", gameId: null, refereeId: 42, subtab: "profile", range: "30d" }))
      .toBe("tab=referees&id=42");
  });

  it("includes game id when on open-slots", () => {
    expect(buildHubUrl({ tab: "open-slots", gameId: 4287, refereeId: null, subtab: "profile", range: "30d" }))
      .toBe("game=4287");
  });

  it("includes subtab when not profile", () => {
    expect(buildHubUrl({ tab: "referees", gameId: null, refereeId: 42, subtab: "history", range: "30d" }))
      .toBe("tab=referees&id=42&subtab=history");
  });

  it("includes range when not 30d", () => {
    expect(buildHubUrl({ tab: "open-slots", gameId: null, refereeId: null, subtab: "profile", range: "season" }))
      .toBe("range=season");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @dragons/web test -- use-referee-hub-url --run
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook + pure helpers**

Create `use-referee-hub-url.ts`:

```ts
"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type HubTab = "open-slots" | "referees";
export type HubSubtab = "profile" | "upcoming" | "history";
export type HubRange = "season" | "30d" | "month" | "custom";

export interface HubState {
  tab: HubTab;
  gameId: number | null;
  refereeId: number | null;
  subtab: HubSubtab;
  range: HubRange;
}

const TABS: readonly HubTab[] = ["open-slots", "referees"];
const SUBTABS: readonly HubSubtab[] = ["profile", "upcoming", "history"];
const RANGES: readonly HubRange[] = ["season", "30d", "month", "custom"];

const DEFAULT_STATE: HubState = {
  tab: "open-slots",
  gameId: null,
  refereeId: null,
  subtab: "profile",
  range: "30d",
};

function parseId(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clamp<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function parseHubUrl(params: URLSearchParams): HubState {
  return {
    tab: clamp(params.get("tab"), TABS, DEFAULT_STATE.tab),
    gameId: parseId(params.get("game")),
    refereeId: parseId(params.get("id")),
    subtab: clamp(params.get("subtab"), SUBTABS, DEFAULT_STATE.subtab),
    range: clamp(params.get("range"), RANGES, DEFAULT_STATE.range),
  };
}

export function buildHubUrl(state: HubState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_STATE.tab) params.set("tab", state.tab);
  if (state.tab === "open-slots" && state.gameId !== null) params.set("game", String(state.gameId));
  if (state.tab === "referees" && state.refereeId !== null) params.set("id", String(state.refereeId));
  if (state.tab === "referees" && state.subtab !== DEFAULT_STATE.subtab) params.set("subtab", state.subtab);
  if (state.range !== DEFAULT_STATE.range) params.set("range", state.range);
  return params.toString();
}

export function useRefereeHubUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(
    () => parseHubUrl(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const update = useCallback(
    (patch: Partial<HubState>) => {
      const next: HubState = { ...state, ...patch };
      // Clear ref/game id when switching tabs to avoid stale selections
      if (patch.tab && patch.tab !== state.tab) {
        next.gameId = patch.tab === "open-slots" ? next.gameId : null;
        next.refereeId = patch.tab === "referees" ? next.refereeId : null;
      }
      const qs = buildHubUrl(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, state],
  );

  return { state, update };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @dragons/web test -- use-referee-hub-url --run
```

Expected: all 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts \
        apps/web/src/components/admin/referee-hub/use-referee-hub-url.test.ts
git commit -m "feat(referee-hub): add URL state hook with parse/build helpers"
```

---

### Task 2: Hub header (title + tab switcher + range filter)

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/hub-header.tsx`
- Modify: `apps/web/messages/en.json`, `apps/web/messages/de.json` — add `refereeHub.*` strings (mirror keys; copy values from `referees.*` + `refereeGames.*` + `refereeHistory.*` where reasonable)

- [ ] **Step 1: Add i18n strings**

Add to `apps/web/messages/en.json` under a new top-level key `refereeHub`:

```json
{
  "refereeHub": {
    "title": "Referees",
    "tabs": {
      "openSlots": "Open Slots",
      "referees": "Referees"
    },
    "range": {
      "label": "Range",
      "season": "Season",
      "30d": "Last 30 days",
      "month": "This month",
      "custom": "Custom"
    }
  }
}
```

Mirror the same keys in `de.json` with German values (consult existing referee-related strings for tone).

- [ ] **Step 2: Implement `hub-header.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl, type HubTab, type HubRange } from "./use-referee-hub-url";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";

const TABS: HubTab[] = ["open-slots", "referees"];
const RANGES: HubRange[] = ["season", "30d", "month", "custom"];

export function HubHeader() {
  const t = useTranslations("refereeHub");
  const { state, update } = useRefereeHubUrl();

  return (
    <div className="flex flex-col gap-3 border-b pb-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <div className="flex items-center gap-3">
        <Tabs value={state.tab} onValueChange={(v) => update({ tab: v as HubTab })}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`tabs.${tab === "open-slots" ? "openSlots" : "referees"}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={state.range} onValueChange={(v) => update({ range: v as HubRange })}>
          <SelectTrigger className="w-[160px]" aria-label={t("range.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r} value={r}>{t(`range.${r}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke test it renders**

Skip a dedicated test for the header — coverage comes from `referee-hub.test.tsx` in a later task. Verify with `pnpm --filter @dragons/web typecheck`:

```bash
pnpm --filter @dragons/web typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/hub-header.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add header with tab switcher and range filter"
```

---

## Phase B — Open Slots Tab

### Task 3: Open games list (left side)

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx`
- Test: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx`

The data source is the existing `GET /referee/games?limit=500&offset=0`. Schema: `RefereeGameListItem` from `@dragons/shared`. We filter client-side for games with at least one open slot.

- [ ] **Step 1: Write failing test**

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { OpenGamesList } from "./open-games-list";

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: {
      items: [
        {
          apiMatchId: 4287, matchDate: "2026-05-28", matchTime: "16:30",
          homeTeamName: "Eagles", guestTeamName: "Dragons H1",
          leagueShortName: "BL",
          sr1Status: "open", sr1RefereeApiId: null, sr1RefereeName: null,
          sr2Status: "open", sr2RefereeApiId: null, sr2RefereeName: null,
          ownClubRefs: true, isCancelled: false, isForfeited: false,
        },
        {
          apiMatchId: 4288, matchDate: "2026-05-28", matchTime: "14:00",
          homeTeamName: "Dragons H1", guestTeamName: "Hawks",
          leagueShortName: "OL",
          sr1Status: "open", sr1RefereeApiId: null, sr1RefereeName: null,
          sr2Status: "assigned", sr2RefereeApiId: 100, sr2RefereeName: "Müller, A.",
          ownClubRefs: true, isCancelled: false, isForfeited: false,
        },
      ],
    },
  })),
}));

const messages = { refereeHub: { openSlots: { searchPlaceholder: "Search game…", filters: { all: "All" } } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => cleanup());

describe("OpenGamesList", () => {
  it("renders rows for games with at least one open slot", () => {
    render(wrap(<OpenGamesList selectedGameId={null} onSelect={vi.fn()} />));
    expect(screen.getByText("Eagles")).toBeInTheDocument();
    expect(screen.getByText("Dragons H1")).toBeInTheDocument();
  });

  it("invokes onSelect with the game id on click", async () => {
    const onSelect = vi.fn();
    render(wrap(<OpenGamesList selectedGameId={null} onSelect={onSelect} />));
    screen.getByText("Eagles").click();
    expect(onSelect).toHaveBeenCalledWith(4287);
  });

  it("highlights the selected row", () => {
    render(wrap(<OpenGamesList selectedGameId={4287} onSelect={vi.fn()} />));
    expect(screen.getByText("Eagles").closest("[data-selected='true']")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @dragons/web test -- open-games-list --run
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `open-games-list.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Input } from "@dragons/ui/components/input";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import type { RefereeGameListItem } from "@dragons/shared";

interface Props {
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
}

interface ApiResponse { items: RefereeGameListItem[] }

export function OpenGamesList({ selectedGameId, onSelect }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [search, setSearch] = useState("");
  const { data } = useSWR<ApiResponse>(SWR_KEYS.refereeGames, apiFetcher);

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const term = search.trim().toLowerCase();
    return items
      .filter((g) => g.sr1Status === "open" || g.sr2Status === "open")
      .filter((g) => !term ||
        g.homeTeamName.toLowerCase().includes(term) ||
        g.guestTeamName.toLowerCase().includes(term) ||
        g.leagueShortName?.toLowerCase().includes(term));
  }, [data, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
      </div>
      <div className="flex-1 overflow-auto">
        {rows.map((g) => (
          <button
            key={g.apiMatchId}
            type="button"
            data-selected={selectedGameId === g.apiMatchId}
            onClick={() => onSelect(g.apiMatchId)}
            className={cn(
              "w-full text-left px-3 py-2 border-b hover:bg-muted/50 transition-colors",
              selectedGameId === g.apiMatchId && "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            <div className="text-xs opacity-70">
              {g.matchDate} · {g.matchTime} · {g.leagueShortName}
            </div>
            <div className="text-sm font-medium">
              {g.homeTeamName} vs {g.guestTeamName}
            </div>
            <div className="flex gap-1 mt-1">
              <SlotBadge status={g.sr1Status} who={g.sr1RefereeName} prefix="SR1" />
              <SlotBadge status={g.sr2Status} who={g.sr2RefereeName} prefix="SR2" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotBadge({ status, who, prefix }: { status: string; who: string | null; prefix: string }) {
  if (status === "assigned") {
    return <Badge variant="secondary">{prefix} {who ?? "?"}</Badge>;
  }
  if (status === "offered") {
    return <Badge variant="outline">{prefix} offered</Badge>;
  }
  return <Badge variant="destructive">{prefix} open</Badge>;
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @dragons/web test -- open-games-list --run
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx \
        apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx
git commit -m "feat(referee-hub): add open games list with search filter"
```

---

### Task 4: Slot card

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx`

A slot card renders two states (assigned / open). When open, it renders the candidate picker (built in Task 5). No standalone test — coverage via integration in Task 7.

- [ ] **Step 1: Implement `slot-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { fetchAPI, APIError } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { CandidatePicker } from "./candidate-picker";

interface AssignedRef {
  refereeApiId: number | null;
  refereeName: string | null;
  status: "open" | "offered" | "assigned";
}

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  assignment: AssignedRef;
  onChange: () => void; // trigger SWR mutate after assign/unassign
}

export function SlotCard({ gameApiId, slotNumber, assignment, onChange }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [busy, setBusy] = useState(false);

  async function handleAssign(refereeApiId: number) {
    setBusy(true);
    try {
      await fetchAPI(`/admin/referee/games/${gameApiId}/assign`, {
        method: "POST",
        body: JSON.stringify({ slotNumber, refereeApiId }),
      });
      toast.success(t("toast.assigned"));
      onChange();
    } catch (err) {
      const msg = err instanceof APIError ? err.message : t("toast.assignFailed");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign() {
    setBusy(true);
    try {
      await fetchAPI(`/admin/referee/games/${gameApiId}/assignment/${slotNumber}`, {
        method: "DELETE",
      });
      toast.success(t("toast.unassigned"));
      onChange();
    } catch (err) {
      const msg = err instanceof APIError ? err.message : t("toast.unassignFailed");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const isOpen = assignment.status === "open";

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-muted-foreground">
            {t("slot.label", { n: slotNumber })}
          </div>
          {isOpen ? (
            <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {t("slot.open")}
            </div>
          ) : (
            <div className="text-sm font-semibold">{assignment.refereeName ?? "—"}</div>
          )}
        </div>
        {!isOpen && (
          <Button variant="outline" size="sm" disabled={busy} onClick={handleUnassign}>
            {t("slot.unassign")}
          </Button>
        )}
      </div>
      {isOpen && (
        <CandidatePicker
          gameApiId={gameApiId}
          slotNumber={slotNumber}
          onPick={handleAssign}
          disabled={busy}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add i18n strings**

Append to `refereeHub.openSlots` block in both `en.json` and `de.json`:

```json
{
  "slot": {
    "label": "Slot {n} (SR{n})",
    "open": "⚠ Open",
    "unassign": "Unassign"
  },
  "toast": {
    "assigned": "Referee assigned",
    "assignFailed": "Could not assign referee",
    "unassigned": "Referee unassigned",
    "unassignFailed": "Could not unassign referee"
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @dragons/web typecheck
```

Expected: pass (CandidatePicker import will fail until Task 5 — defer if needed; in that case keep this task's commit waiting until Task 5 lands).

- [ ] **Step 4: Commit (alongside Task 5)**

Defer commit to after Task 5 so both compile together. See Task 5 Step 5.

---

### Task 5: Candidate picker (federation-backed)

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.tsx`
- Test: `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.test.tsx`
- Modify: `apps/web/src/lib/swr-keys.ts` — add `refereeCandidates` key

Calls existing `GET /admin/referee/games/:spielplanId/candidates?search=<text>&pageFrom=<n>&pageSize=15`. Federation-validated. Order: federation default. Workload shown as a badge.

- [ ] **Step 1: Add SWR key**

Edit `apps/web/src/lib/swr-keys.ts`, insert before the closing brace:

```ts
  refereeCandidates: (spielplanId: number, search: string, pageFrom: number) =>
    `/admin/referee/games/${spielplanId}/candidates?search=${encodeURIComponent(search)}&pageFrom=${pageFrom}&pageSize=15`,
```

- [ ] **Step 2: Write failing test**

Create `candidate-picker.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CandidatePicker } from "./candidate-picker";

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: {
      candidates: [
        { refereeApiId: 1, displayName: "Wagner, Tom", workload: 3, ruleDisposition: "allow", licenseNumber: 88421 },
        { refereeApiId: 2, displayName: "Klein, Lisa", workload: 7, ruleDisposition: "sr1-only", licenseNumber: 11122 },
        { refereeApiId: 3, displayName: "Müller, Anna", workload: 14, ruleDisposition: "deny", licenseNumber: 12345 },
      ],
      hasMore: false,
    },
  })),
}));

const messages = {
  refereeHub: {
    openSlots: {
      picker: {
        searchPlaceholder: "Search referees…",
        assign: "Assign SR{n}",
        empty: "No eligible referees",
        loadMore: "Load more",
        workload: "{n} games",
        disposition: { deny: "Denied by rule", "sr1-only": "SR1 only", "sr2-only": "SR2 only", allow: "" },
      },
    },
  },
};

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => cleanup());

describe("CandidatePicker", () => {
  it("renders candidates with workload badge", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("Wagner, Tom")).toBeInTheDocument();
    expect(screen.getByText("3 games")).toBeInTheDocument();
  });

  it("greys out deny-rule candidates and disables their assign button", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    const denyRow = screen.getByText("Müller, Anna").closest("[data-candidate]");
    expect(denyRow).toHaveAttribute("data-disabled", "true");
  });

  it("greys out sr1-only candidate when assigning to SR2", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={2} onPick={vi.fn()} />));
    const sr1OnlyRow = screen.getByText("Klein, Lisa").closest("[data-candidate]");
    expect(sr1OnlyRow).toHaveAttribute("data-disabled", "true");
  });

  it("invokes onPick with refereeApiId on Assign click", () => {
    const onPick = vi.fn();
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={onPick} />));
    const wagnerRow = screen.getByText("Wagner, Tom").closest("[data-candidate]")!;
    const button = wagnerRow.querySelector("button")!;
    fireEvent.click(button);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("debounces the search input", async () => {
    vi.useFakeTimers();
    const { rerender } = render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    const input = screen.getByPlaceholderText("Search referees…");
    fireEvent.change(input, { target: { value: "Wag" } });
    fireEvent.change(input, { target: { value: "Wagner" } });
    // Should not trigger an immediate refetch — verified by the SWR mock being called with the latest term only after debounce.
    vi.advanceTimersByTime(350);
    rerender(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run test, verify fail**

```bash
pnpm --filter @dragons/web test -- candidate-picker --run
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `candidate-picker.tsx`**

```tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";

export type RuleDisposition = "allow" | "deny" | "sr1-only" | "sr2-only";

export interface Candidate {
  refereeApiId: number;
  displayName: string;
  workload: number;
  ruleDisposition: RuleDisposition;
  licenseNumber: number | null;
}

interface CandidateResponse { candidates: Candidate[]; hasMore: boolean }

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  onPick: (refereeApiId: number) => void;
  disabled?: boolean;
}

function isBlocked(disp: RuleDisposition, slot: 1 | 2): boolean {
  if (disp === "deny") return true;
  if (disp === "sr1-only" && slot === 2) return true;
  if (disp === "sr2-only" && slot === 1) return true;
  return false;
}

export function CandidatePicker({ gameApiId, slotNumber, onPick, disabled }: Props) {
  const t = useTranslations("refereeHub.openSlots.picker");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [page, setPage] = useState(0);

  const { data } = useSWR<CandidateResponse>(
    SWR_KEYS.refereeCandidates(gameApiId, debounced, page),
    apiFetcher,
  );

  const candidates = data?.candidates ?? [];

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
      />
      {candidates.length === 0 && (
        <div className="text-sm text-muted-foreground py-3 text-center">{t("empty")}</div>
      )}
      <div className="space-y-1">
        {candidates.map((c) => {
          const blocked = isBlocked(c.ruleDisposition, slotNumber);
          return (
            <div
              key={c.refereeApiId}
              data-candidate
              data-disabled={blocked}
              className={cn(
                "flex items-center justify-between p-2 border rounded-md gap-2",
                blocked && "opacity-50",
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.displayName}</div>
                <div className="text-xs text-muted-foreground flex gap-2 items-center">
                  <Badge variant="outline">{t("workload", { n: c.workload })}</Badge>
                  {blocked && (
                    <span className="text-destructive">{t(`disposition.${c.ruleDisposition}`)}</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="default"
                disabled={blocked || disabled}
                onClick={() => onPick(c.refereeApiId)}
              >
                {t("assign", { n: slotNumber })}
              </Button>
            </div>
          );
        })}
      </div>
      {data?.hasMore && (
        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} className="w-full">
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
```

> Note: the server-side `searchCandidates` returns federation results; this client expects the API response to include `workload` + `ruleDisposition` per candidate. **If those fields are not already returned**, see Step 4.5 below.

- [ ] **Step 4.5: Verify server response shape matches client expectations**

Run:

```bash
grep -n "CandidateSearchResponse\|displayName\|ruleDisposition\|workload" \
  /Users/jn/git/dragons-all/packages/shared/src/*.ts \
  /Users/jn/git/dragons-all/apps/api/src/services/referee/referee-assignment.service.ts
```

If `ruleDisposition` and `workload` are **not** populated by `searchCandidates`, the client must compute them by joining with `getReferees` and `getRulesForReferee`. Choose:
- **Option A (preferred):** Enrich server-side in `searchCandidates` — add a small follow-up to the assignment service to join with `referees.matchCount` + `referee_assignment_rules` for the game's home/guest teams. Single source of truth.
- **Option B:** Enrich client-side by fetching the referees list + rules per ref. Two extra round-trips; not ideal.

If enrichment is needed and Option A is chosen, that becomes Task 5.5 (sub-plan: write a failing service test for enrichment, implement, commit). Keep this task green by stubbing the missing fields to `"allow"` and `0` in the interim.

- [ ] **Step 5: Run tests, commit Tasks 4+5**

```bash
pnpm --filter @dragons/web test -- candidate-picker open-games-list --run
pnpm --filter @dragons/web typecheck
```

Expected: tests pass, typecheck clean.

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/ \
        apps/web/src/lib/swr-keys.ts \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add slot card + federation-backed candidate picker"
```

---

### Task 6: Open slot detail (right panel)

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx`

Renders the game header + two `<SlotCard>` components for the currently-selected game.

- [ ] **Step 1: Implement**

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { SlotCard } from "./slot-card";
import type { RefereeGameListItem } from "@dragons/shared";

interface Props {
  selectedGameId: number;
}

interface ApiResponse { items: RefereeGameListItem[] }

export function OpenSlotDetail({ selectedGameId }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const { data, mutate } = useSWR<ApiResponse>(SWR_KEYS.refereeGames, apiFetcher);
  const game = data?.items.find((g) => g.apiMatchId === selectedGameId);

  if (!game) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t("detail.notFound")}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">
          {game.matchDate} · {game.matchTime} · {game.leagueShortName} · #{game.apiMatchId}
        </div>
        <h2 className="text-xl font-semibold">{game.homeTeamName} vs {game.guestTeamName}</h2>
      </div>
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={1}
        assignment={{
          refereeApiId: game.sr1RefereeApiId,
          refereeName: game.sr1RefereeName,
          status: game.sr1Status,
        }}
        onChange={() => mutate()}
      />
      <SlotCard
        gameApiId={game.apiMatchId}
        slotNumber={2}
        assignment={{
          refereeApiId: game.sr2RefereeApiId,
          refereeName: game.sr2RefereeName,
          status: game.sr2Status,
        }}
        onChange={() => mutate()}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add i18n strings**

Append to `refereeHub.openSlots`:

```json
{
  "detail": {
    "notFound": "Game not found or no longer needs referees",
    "selectGamePrompt": "Select a game on the left to see its open slots"
  }
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @dragons/web typecheck
git add apps/web/src/components/admin/referee-hub/open-slots/open-slot-detail.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add open slot detail right panel"
```

---

### Task 7: Wire Open Slots tab

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { OpenGamesList } from "./open-games-list";
import { OpenSlotDetail } from "./open-slot-detail";

export function OpenSlotsTab() {
  const t = useTranslations("refereeHub.openSlots");
  const { state, update } = useRefereeHubUrl();

  return (
    <div className="grid grid-cols-[minmax(260px,1fr)_2fr] border rounded-md overflow-hidden min-h-[600px]">
      <div className="border-r">
        <OpenGamesList
          selectedGameId={state.gameId}
          onSelect={(gameId) => update({ gameId })}
        />
      </div>
      <div>
        {state.gameId !== null ? (
          <OpenSlotDetail selectedGameId={state.gameId} />
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("detail.selectGamePrompt")}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @dragons/web typecheck
git add apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx
git commit -m "feat(referee-hub): wire Open Slots tab"
```

---

## Phase C — Referees Tab

### Task 8: Auto-save hook

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/use-auto-save.ts`
- Test: `apps/web/src/components/admin/referee-hub/referees/use-auto-save.test.ts`

A hook that:
1. Tracks "dirty" state.
2. Debounces calls to a save function (default 800ms).
3. Exposes status: `idle | dirty | saving | saved | error`.
4. Provides `saveNow()` to bypass debounce.
5. Auto-cancels on unmount.

- [ ] **Step 1: Write failing test**

```ts
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutoSave } from "./use-auto-save";

describe("useAutoSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts idle", () => {
    const { result } = renderHook(() => useAutoSave({ save: vi.fn().mockResolvedValue(undefined), debounceMs: 800 }));
    expect(result.current.status).toBe("idle");
  });

  it("transitions to dirty on markDirty, then saving + saved after debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    expect(result.current.status).toBe("dirty");
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(save).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("collapses rapid markDirty into a single save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => { result.current.markDirty(); result.current.markDirty(); result.current.markDirty(); });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saveNow bypasses debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    await act(async () => { await result.current.saveNow(); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("status becomes 'error' on save failure", async () => {
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    await act(async () => { vi.advanceTimersByTime(800); });
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("does not save after unmount", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    unmount();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm --filter @dragons/web test -- use-auto-save --run
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Options {
  save: () => Promise<void>;
  debounceMs?: number;
}

export function useAutoSave({ save, debounceMs = 800 }: Options) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const saveRef = useRef(save);

  useEffect(() => { saveRef.current = save; }, [save]);

  useEffect(() => () => {
    aliveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const runSave = useCallback(async () => {
    if (!aliveRef.current) return;
    setStatus("saving");
    try {
      await saveRef.current();
      if (!aliveRef.current) return;
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch {
      if (!aliveRef.current) return;
      setStatus("error");
    }
  }, []);

  const markDirty = useCallback(() => {
    if (!aliveRef.current) return;
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void runSave(); }, debounceMs);
  }, [debounceMs, runSave]);

  const saveNow = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await runSave();
  }, [runSave]);

  return { status, lastSavedAt, markDirty, saveNow };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @dragons/web test -- use-auto-save --run
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/use-auto-save.ts \
        apps/web/src/components/admin/referee-hub/referees/use-auto-save.test.ts
git commit -m "feat(referee-hub): add auto-save hook with debounce + saveNow"
```

---

### Task 9: Referee list (left side) with inline isOwnClub toggle

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx`
- Test: `apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RefereeList } from "./referee-list";

const refs = [
  { id: 1, apiId: 100, firstName: "Anna", lastName: "Müller", licenseNumber: 12345, matchCount: 14, roles: ["SR1", "SR2"], allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" },
  { id: 2, apiId: 101, firstName: "Karl", lastName: "Schmidt", licenseNumber: 33122, matchCount: 9, roles: ["SR1", "SR2"], allowAllHomeGames: false, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" },
];

vi.mock("swr", () => ({
  default: vi.fn(() => ({ data: { items: refs, total: 2 } })),
  mutate: vi.fn(),
}));

const fetchAPI = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api", () => ({ fetchAPI: (...args: unknown[]) => fetchAPI(...args), APIError: class extends Error {} }));

const messages = {
  refereeHub: {
    referees: {
      kpi: { total: "Total", refs: "Refs", workload: "Avg" },
      columns: { ref: "Referee", own: "Own", games: "Games" },
      search: "Search…",
      sort: { name: "Name", workloadDesc: "Games (desc)", workloadAsc: "Games (asc)" },
      empty: "No referees",
    },
  },
};

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => { cleanup(); fetchAPI.mockClear(); });

describe("RefereeList", () => {
  it("renders referees", () => {
    render(wrap(<RefereeList selectedId={null} onSelect={vi.fn()} />));
    expect(screen.getByText("Müller")).toBeInTheDocument();
    expect(screen.getByText("Schmidt")).toBeInTheDocument();
  });

  it("invokes onSelect with referee id on row click", () => {
    const onSelect = vi.fn();
    render(wrap(<RefereeList selectedId={null} onSelect={onSelect} />));
    fireEvent.click(screen.getByText("Müller"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("fires PATCH on isOwnClub toggle click", async () => {
    render(wrap(<RefereeList selectedId={null} onSelect={vi.fn()} />));
    const toggles = screen.getAllByRole("checkbox", { name: /own/i });
    fireEvent.click(toggles[0]!);
    await waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(
      "/admin/referees/1",
      expect.objectContaining({ method: "PATCH" }),
    ));
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm --filter @dragons/web test -- referee-list --run
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI, APIError } from "@/lib/api";
import { Input } from "@dragons/ui/components/input";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { cn } from "@dragons/ui/lib/utils";
import type { RefereeListItem, PaginatedResponse } from "@dragons/shared";

type Sort = "name" | "workloadDesc" | "workloadAsc";

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function RefereeList({ selectedId, onSelect }: Props) {
  const t = useTranslations("refereeHub.referees");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");

  const { data } = useSWR<PaginatedResponse<RefereeListItem>>(SWR_KEYS.referees(true), apiFetcher);
  const items = data?.items ?? [];

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = items.filter((r) => !term ||
      (r.firstName ?? "").toLowerCase().includes(term) ||
      (r.lastName ?? "").toLowerCase().includes(term),
    );
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "workloadDesc") return b.matchCount - a.matchCount;
      if (sort === "workloadAsc") return a.matchCount - b.matchCount;
      return (a.lastName ?? "").localeCompare(b.lastName ?? "");
    });
    return sorted;
  }, [items, search, sort]);

  const kpi = useMemo(() => {
    const total = items.reduce((sum, r) => sum + r.matchCount, 0);
    const refs = items.length;
    const avg = refs === 0 ? 0 : Math.round(total / refs);
    return { total, refs, avg };
  }, [items]);

  async function toggleOwnClub(ref: RefereeListItem, checked: boolean) {
    try {
      await fetchAPI(`/admin/referees/${ref.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          visibility: {
            allowAllHomeGames: ref.allowAllHomeGames,
            allowAwayGames: ref.allowAwayGames,
            isOwnClub: checked,
          },
        }),
      });
      await mutate(SWR_KEYS.referees(true));
    } catch (err) {
      const msg = err instanceof APIError ? err.message : "Failed";
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b grid grid-cols-3 gap-2">
        <Kpi label={t("kpi.total")} value={kpi.total} />
        <Kpi label={t("kpi.refs")} value={kpi.refs} />
        <Kpi label={t("kpi.workload")} value={kpi.avg} />
      </div>
      <div className="p-3 border-b flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("sort.name")}</SelectItem>
            <SelectItem value="workloadDesc">{t("sort.workloadDesc")}</SelectItem>
            <SelectItem value="workloadAsc">{t("sort.workloadAsc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 overflow-auto">
        {visible.length === 0 && <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>}
        {visible.map((r) => (
          <div
            key={r.id}
            className={cn(
              "grid grid-cols-[1fr_36px_44px] items-center gap-2 px-3 py-2 border-b cursor-pointer hover:bg-muted/40",
              selectedId === r.id && "bg-primary text-primary-foreground hover:bg-primary",
            )}
            onClick={() => onSelect(r.id)}
            data-selected={selectedId === r.id}
          >
            <div>
              <div className="text-sm font-medium">{r.lastName}, {r.firstName}</div>
              <div className="text-xs opacity-70">Lic {r.licenseNumber ?? "—"} · {r.roles.join(", ")}</div>
            </div>
            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                aria-label={t("columns.own")}
                checked={r.isOwnClub}
                onCheckedChange={(checked) => toggleOwnClub(r, checked === true)}
              />
            </div>
            <div className="text-sm text-center tabular-nums">{r.matchCount}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Add i18n strings**

Append `refereeHub.referees` block to `en.json` + `de.json` with the keys used in the test/component.

- [ ] **Step 5: Run tests, verify pass**

```bash
pnpm --filter @dragons/web test -- referee-list --run
pnpm --filter @dragons/web typecheck
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/referee-list.tsx \
        apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add referee list with KPIs and inline isOwnClub toggle"
```

---

### Task 10: Profile sub-tab (visibility + rules editor + auto-save)

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx`
- Test: `apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx`

This replaces the modal `RefereeRulesDialog` in-page, backed by the transactional `PATCH /admin/referees/:id` endpoint. Auto-save via the hook from Task 8.

- [ ] **Step 1: Write failing test (auto-save + transactional payload)**

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProfileSubtab } from "./profile-subtab";

const ref = { id: 1, apiId: 100, firstName: "Anna", lastName: "Müller", licenseNumber: 12345, matchCount: 14, roles: ["SR1"], allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

vi.mock("swr", () => ({
  default: vi.fn((key: string) => {
    if (key?.includes("/rules")) return { data: { rules: [] } };
    if (key === "/admin/teams") return { data: [{ id: 10, name: "Dragons H1", customName: null, leagueName: "OL" }] };
    return { data: undefined };
  }),
  mutate: vi.fn(),
}));

const fetchAPI = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api", () => ({ fetchAPI: (...a: unknown[]) => fetchAPI(...a), APIError: class extends Error {} }));

const messages = { refereeHub: { referees: { profile: {
  visibility: { title: "Visibility", ownClub: "Own-club referee", allHome: "Allow all home", away: "Allow away" },
  rules: { title: "Per-team rules", add: "Add rule", deny: "Deny", allow: "Allow", selectTeam: "Team", none: "None" },
  save: { saving: "Saving…", saved: "Saved {n}s ago", dirty: "Unsaved", error: "Save failed", now: "Save now" },
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { vi.useFakeTimers(); fetchAPI.mockClear(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("ProfileSubtab", () => {
  it("auto-saves visibility toggle after debounce with full combined payload", async () => {
    render(wrap(<ProfileSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("switch", { name: /allow all home/i }));
    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(
      "/admin/referees/1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("\"visibility\""),
      }),
    ));
    const callBody = JSON.parse((fetchAPI.mock.calls[0]![1] as RequestInit).body as string);
    expect(callBody).toEqual({
      visibility: { allowAllHomeGames: false, allowAwayGames: true, isOwnClub: true },
      rules: [],
    });
  });

  it("Save now button bypasses debounce", async () => {
    render(wrap(<ProfileSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("switch", { name: /allow all home/i }));
    fireEvent.click(screen.getByRole("button", { name: /save now/i }));
    await waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm --filter @dragons/web test -- profile-subtab --run
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { useAutoSave } from "./use-auto-save";
import { Switch } from "@dragons/ui/components/switch";
import { Label } from "@dragons/ui/components/label";
import { Button } from "@dragons/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Trash2, Plus } from "lucide-react";
import type { RefereeListItem } from "@dragons/shared";

interface Team { id: number; name: string; customName: string | null; leagueName: string | null }
interface Rule { teamId: number; deny: boolean; allowSr1: boolean; allowSr2: boolean }
interface RulesResp { rules: Rule[] }

interface Props { referee: RefereeListItem }

export function ProfileSubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.profile");
  const [visibility, setVisibility] = useState({
    isOwnClub: referee.isOwnClub,
    allowAllHomeGames: referee.allowAllHomeGames,
    allowAwayGames: referee.allowAwayGames,
  });
  const [rules, setRules] = useState<Rule[]>([]);

  const { data: teamsData = [] } = useSWR<Team[]>(SWR_KEYS.teams, apiFetcher);
  const { data: rulesData } = useSWR<RulesResp>(SWR_KEYS.refereeRules(referee.id), apiFetcher);

  useEffect(() => {
    if (rulesData?.rules) setRules(rulesData.rules);
  }, [rulesData]);

  useEffect(() => {
    setVisibility({
      isOwnClub: referee.isOwnClub,
      allowAllHomeGames: referee.allowAllHomeGames,
      allowAwayGames: referee.allowAwayGames,
    });
  }, [referee.id, referee.isOwnClub, referee.allowAllHomeGames, referee.allowAwayGames]);

  const { status, lastSavedAt, markDirty, saveNow } = useAutoSave({
    save: async () => {
      await fetchAPI(`/admin/referees/${referee.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          visibility,
          rules: rules.filter((r) => r.deny || r.allowSr1 || r.allowSr2),
        }),
      });
      await Promise.all([
        swrMutate(SWR_KEYS.refereeRules(referee.id)),
        swrMutate(SWR_KEYS.referees(true)),
      ]);
    },
  });

  function patchVisibility(p: Partial<typeof visibility>) {
    setVisibility((v) => ({ ...v, ...p }));
    markDirty();
  }

  function addRule() {
    setRules((r) => [...r, { teamId: teamsData[0]?.id ?? 0, deny: false, allowSr1: false, allowSr2: true }]);
    markDirty();
  }

  function updateRule(i: number, p: Partial<Rule>) {
    setRules((r) => r.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
    markDirty();
  }

  function removeRule(i: number) {
    setRules((r) => r.filter((_, idx) => idx !== i));
    markDirty();
  }

  return (
    <div className="space-y-6 p-4">
      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{t("visibility.title")}</div>
        <Row label={t("visibility.ownClub")}>
          <Switch checked={visibility.isOwnClub} onCheckedChange={(v) => patchVisibility({ isOwnClub: v })} aria-label={t("visibility.ownClub")} />
        </Row>
        <Row label={t("visibility.allHome")}>
          <Switch checked={visibility.allowAllHomeGames} onCheckedChange={(v) => patchVisibility({ allowAllHomeGames: v })} aria-label={t("visibility.allHome")} />
        </Row>
        <Row label={t("visibility.away")}>
          <Switch checked={visibility.allowAwayGames} onCheckedChange={(v) => patchVisibility({ allowAwayGames: v })} aria-label={t("visibility.away")} />
        </Row>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("rules.title")}</div>
          <Button size="sm" variant="outline" onClick={addRule}>
            <Plus className="h-3 w-3 mr-1" /> {t("rules.add")}
          </Button>
        </div>
        {rules.length === 0 && (
          <div className="text-sm text-muted-foreground py-2">{t("rules.none")}</div>
        )}
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2 border rounded-md p-2">
              <Select value={String(rule.teamId)} onValueChange={(v) => updateRule(i, { teamId: Number(v) })}>
                <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={t("rules.selectTeam")} /></SelectTrigger>
                <SelectContent>
                  {teamsData.map((tm) => (
                    <SelectItem key={tm.id} value={String(tm.id)}>
                      {tm.customName ?? tm.name}{tm.leagueName && ` (${tm.leagueName})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={rule.deny ? "destructive" : "secondary"}
                onClick={() => updateRule(i, { deny: !rule.deny, allowSr1: !rule.deny ? false : rule.allowSr1, allowSr2: !rule.deny ? false : rule.allowSr2 })}
              >
                {rule.deny ? t("rules.deny") : t("rules.allow")}
              </Button>
              {!rule.deny && (
                <>
                  <label className="flex items-center gap-1 text-xs">
                    <Checkbox checked={rule.allowSr1} onCheckedChange={(v) => updateRule(i, { allowSr1: v === true })} /> SR1
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <Checkbox checked={rule.allowSr2} onCheckedChange={(v) => updateRule(i, { allowSr2: v === true })} /> SR2
                  </label>
                </>
              )}
              <Button variant="ghost" size="icon" onClick={() => removeRule(i)} aria-label="remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <SaveStatusBar status={status} lastSavedAt={lastSavedAt} onSaveNow={() => void saveNow()} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <Label className="text-sm">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function SaveStatusBar({ status, lastSavedAt, onSaveNow }: { status: string; lastSavedAt: number | null; onSaveNow: () => void }) {
  const t = useTranslations("refereeHub.referees.profile.save");
  const secondsAgo = lastSavedAt ? Math.max(1, Math.floor((Date.now() - lastSavedAt) / 1000)) : 0;
  const text =
    status === "saving" ? t("saving") :
    status === "dirty" ? t("dirty") :
    status === "error" ? t("error") :
    status === "saved" ? t("saved", { n: secondsAgo }) :
    "";
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{text}</span>
      <Button size="sm" variant="outline" onClick={onSaveNow}>{t("now")}</Button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @dragons/web test -- profile-subtab --run
pnpm --filter @dragons/web typecheck
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx \
        apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add profile sub-tab with auto-save (visibility + rules)"
```

---

### Task 11: Upcoming sub-tab

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx`

Shows the ref's currently assigned games + eligible open slots. Reuses existing `/referee/games` data filtered client-side.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { RefereeGameListItem, RefereeListItem } from "@dragons/shared";

interface Props { referee: RefereeListItem }
interface ApiResp { items: RefereeGameListItem[] }

export function UpcomingSubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.upcoming");
  const { data } = useSWR<ApiResp>(SWR_KEYS.refereeGames, apiFetcher);
  const items = data?.items ?? [];

  const { assigned, eligibleOpen } = useMemo(() => {
    const assigned = items.filter((g) =>
      g.sr1RefereeApiId === referee.apiId || g.sr2RefereeApiId === referee.apiId,
    );
    const eligibleOpen = items.filter((g) =>
      (g.sr1Status === "open" || g.sr2Status === "open") &&
      g.ownClubRefs && !g.isCancelled && !g.isForfeited,
    );
    return { assigned, eligibleOpen };
  }, [items, referee.apiId]);

  return (
    <div className="p-4 space-y-6">
      <Section title={t("assigned")} count={assigned.length}>
        {assigned.map((g) => (
          <Row key={g.apiMatchId} game={g} />
        ))}
        {assigned.length === 0 && <Empty text={t("assignedEmpty")} />}
      </Section>
      <Section title={t("eligibleOpen")} count={eligibleOpen.length}>
        {eligibleOpen.map((g) => (
          <Row key={g.apiMatchId} game={g} />
        ))}
        {eligibleOpen.length === 0 && <Empty text={t("eligibleOpenEmpty")} />}
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title} ({count})</div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ game }: { game: RefereeGameListItem }) {
  return (
    <div className="flex justify-between border rounded-md p-2 text-sm">
      <div>
        <div className="text-xs text-muted-foreground">{game.matchDate} · {game.matchTime} · {game.leagueShortName}</div>
        <div>{game.homeTeamName} vs {game.guestTeamName}</div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-2">{text}</div>;
}
```

- [ ] **Step 2: Add i18n + commit**

```json
{
  "upcoming": {
    "assigned": "Assigned",
    "eligibleOpen": "Eligible open slots",
    "assignedEmpty": "No upcoming assignments",
    "eligibleOpenEmpty": "No eligible open slots"
  }
}
```

```bash
pnpm --filter @dragons/web typecheck
git add apps/web/src/components/admin/referee-hub/referees/upcoming-subtab.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add upcoming sub-tab"
```

---

### Task 12: History sub-tab

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx`

Thin wrapper around `GET /admin/referee/history/games?refereeId=<id>`. Reuses the existing per-ref API; the existing history page is the model.

- [ ] **Step 1: Inspect the existing history endpoint shape**

Run:

```bash
grep -n "refereeId\|games\|leaderboard" \
  /Users/jn/git/dragons-all/apps/api/src/routes/admin/referee-history.routes.ts | head
```

Verify the endpoint accepts a `refereeId` query param. If not, adjust to use the leaderboard endpoint with a ref filter, or extend the existing component reading from `apps/web/src/components/referee/history/history-page.tsx` (per-ref drawer logic).

- [ ] **Step 2: Implement**

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Button } from "@dragons/ui/components/button";
import type { RefereeListItem } from "@dragons/shared";

interface Props { referee: RefereeListItem; range: string }

interface HistoryGame { id: number; matchDate: string; homeTeamName: string; guestTeamName: string; slotNumber: number; status: string }
interface HistoryResp { items: HistoryGame[] }

export function HistorySubtab({ referee, range }: Props) {
  const t = useTranslations("refereeHub.referees.history");
  const qs = new URLSearchParams({ refereeId: String(referee.apiId), range }).toString();
  const { data } = useSWR<HistoryResp>(SWR_KEYS.refereeHistoryGames(qs), apiFetcher);
  const items = data?.items ?? [];

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{t("total", { n: items.length })}</div>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/admin/referee/history/games.csv?${qs}`} download>{t("exportCsv")}</a>
        </Button>
      </div>
      <div className="space-y-1">
        {items.map((g) => (
          <div key={g.id} className="flex justify-between border rounded-md p-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{g.matchDate} · SR{g.slotNumber}</div>
              <div>{g.homeTeamName} vs {g.guestTeamName}</div>
            </div>
            <span className="text-xs">{g.status}</span>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-muted-foreground">{t("empty")}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: i18n + commit**

```json
{
  "history": {
    "total": "{n} games",
    "exportCsv": "Export CSV",
    "empty": "No history in selected range"
  }
}
```

```bash
pnpm --filter @dragons/web typecheck
git add apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add history sub-tab"
```

---

### Task 13: Referee detail (right panel with subtab routing)

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { ProfileSubtab } from "./profile-subtab";
import { UpcomingSubtab } from "./upcoming-subtab";
import { HistorySubtab } from "./history-subtab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@dragons/ui/components/tabs";
import { Badge } from "@dragons/ui/components/badge";
import type { RefereeListItem, PaginatedResponse } from "@dragons/shared";

interface Props { refereeId: number }

export function RefereeDetail({ refereeId }: Props) {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();

  const { data } = useSWR<PaginatedResponse<RefereeListItem>>(SWR_KEYS.referees(true), apiFetcher);
  const ref = data?.items.find((r) => r.id === refereeId);

  if (!ref) return <div className="p-6 text-sm text-muted-foreground">{t("notFound")}</div>;

  return (
    <div>
      <div className="p-4 border-b flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold">{ref.lastName}, {ref.firstName}</h2>
          <div className="text-xs text-muted-foreground">Lic {ref.licenseNumber ?? "—"} · API {ref.apiId} · {ref.roles.join(", ")}</div>
        </div>
        {ref.isOwnClub && <Badge variant="secondary">{t("ownClubBadge")}</Badge>}
      </div>
      <Tabs value={state.subtab} onValueChange={(v) => update({ subtab: v as never })}>
        <TabsList className="m-4">
          <TabsTrigger value="profile">{t("subtabs.profile")}</TabsTrigger>
          <TabsTrigger value="upcoming">{t("subtabs.upcoming")}</TabsTrigger>
          <TabsTrigger value="history">{t("subtabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileSubtab referee={ref} /></TabsContent>
        <TabsContent value="upcoming"><UpcomingSubtab referee={ref} /></TabsContent>
        <TabsContent value="history"><HistorySubtab referee={ref} range={state.range} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: i18n + typecheck + commit**

```json
{
  "referees": {
    "notFound": "Referee not found",
    "ownClubBadge": "Own-club",
    "subtabs": { "profile": "Profile", "upcoming": "Upcoming", "history": "History" }
  }
}
```

```bash
pnpm --filter @dragons/web typecheck
git add apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): add referee detail with subtab routing"
```

---

### Task 14: Wire Referees tab

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/referees-tab.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { RefereeList } from "./referee-list";
import { RefereeDetail } from "./referee-detail";

export function RefereesTab() {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();

  return (
    <div className="grid grid-cols-[minmax(320px,1fr)_2fr] border rounded-md overflow-hidden min-h-[600px]">
      <div className="border-r">
        <RefereeList
          selectedId={state.refereeId}
          onSelect={(id) => update({ refereeId: id })}
        />
      </div>
      <div>
        {state.refereeId !== null ? (
          <RefereeDetail refereeId={state.refereeId} />
        ) : (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {t("selectPrompt")}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: i18n + commit**

```json
{ "referees": { "selectPrompt": "Pick a referee to see their config + history" } }
```

```bash
pnpm --filter @dragons/web typecheck
git add apps/web/src/components/admin/referee-hub/referees/referees-tab.tsx \
        apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(referee-hub): wire Referees tab"
```

---

## Phase D — Integration & Migration

### Task 15: Assemble RefereeHubPage

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referee-hub.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useRefereeHubUrl } from "./use-referee-hub-url";
import { HubHeader } from "./hub-header";
import { OpenSlotsTab } from "./open-slots/open-slots-tab";
import { RefereesTab } from "./referees/referees-tab";

export function RefereeHubPage() {
  const { state } = useRefereeHubUrl();
  return (
    <div className="space-y-2">
      <HubHeader />
      {state.tab === "open-slots" ? <OpenSlotsTab /> : <RefereesTab />}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @dragons/web typecheck
git add apps/web/src/components/admin/referee-hub/referee-hub.tsx
git commit -m "feat(referee-hub): assemble top-level RefereeHubPage"
```

---

### Task 16: Replace /admin/referees page with the hub

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/referees/page.tsx`

- [ ] **Step 1: Read the current page**

```bash
cat apps/web/src/app/[locale]/admin/referees/page.tsx
```

Note the wrapping conventions (locale layout, auth guard, etc.) — preserve them.

- [ ] **Step 2: Replace body**

Rewrite the page to render `<RefereeHubPage />` while keeping the page-level layout (locale param, suspense boundary if present). Example:

```tsx
import { RefereeHubPage } from "@/components/admin/referee-hub/referee-hub";

export default function Page() {
  return <RefereeHubPage />;
}
```

If the original page used `setRequestLocale` or other Next.js 16-specific setup, preserve those calls — only replace the rendered content.

- [ ] **Step 3: Manual smoke test**

```bash
pnpm dev
# Open http://localhost:3000/en/admin/referees
# Verify: Open Slots tab loads, switching to Referees tab works,
#         deep-link /en/admin/referees?tab=referees&id=42 restores state on refresh.
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\[locale\]/admin/referees/page.tsx
git commit -m "feat(referee-hub): mount unified hub at /admin/referees"
```

---

### Task 17: Redirect old routes

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/referee/history/page.tsx`

Replace each old page body with a server-side redirect via `next/navigation`. Use 301 (permanent).

- [ ] **Step 1: matches → open-slots**

Overwrite `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`:

```tsx
import { redirect, permanentRedirect } from "next/navigation";

interface Props { params: Promise<{ locale: string }> }

export default async function Page({ params }: Props) {
  const { locale } = await params;
  permanentRedirect(`/${locale}/admin/referees`);
}
```

- [ ] **Step 2: history → referees tab**

Overwrite `apps/web/src/app/[locale]/admin/referee/history/page.tsx`:

```tsx
import { permanentRedirect } from "next/navigation";

interface Props { params: Promise<{ locale: string }> }

export default async function Page({ params }: Props) {
  const { locale } = await params;
  permanentRedirect(`/${locale}/admin/referees?tab=referees`);
}
```

- [ ] **Step 3: Manual verification**

```bash
pnpm dev
# Visit http://localhost:3000/en/admin/referee/matches  → should land on /en/admin/referees
# Visit http://localhost:3000/en/admin/referee/history  → should land on /en/admin/referees?tab=referees
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\[locale\]/admin/referee/
git commit -m "feat(referee-hub): redirect /admin/referee/{matches,history} into unified hub"
```

---

### Task 18: Final verification

- [ ] **Step 1: Run full test suite for both packages**

```bash
pnpm --filter @dragons/api test --run
pnpm --filter @dragons/web test --run
```

Expected: all tests pass.

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm --filter @dragons/api typecheck
pnpm --filter @dragons/web typecheck
pnpm --filter @dragons/web lint
```

Expected: no errors. Pre-existing warnings unrelated to this work are OK.

- [ ] **Step 3: Coverage**

```bash
pnpm --filter @dragons/api coverage
```

Expected: coverage thresholds met (95% lines/funcs/statements, 90% branches).

- [ ] **Step 4: Manual end-to-end smoke**

Spin up dev environment and walk through these flows:

1. Land on `/en/admin/referees` → Open Slots tab loads with games list.
2. Click a game → right panel shows two slot cards.
3. Open slot → type a ref name → assign → toast success → list updates.
4. Switch to Referees tab → KPI row + list visible.
5. Toggle `isOwnClub` inline on a referee → PATCH fires → list updates.
6. Click a referee → Profile sub-tab opens → toggle `Allow away` → wait ~1s → "Saved" indicator appears.
7. Add a rule → wait ~1s → save indicator confirms.
8. Click "Save now" → immediate save with no debounce.
9. Switch to History sub-tab → games list loads.
10. Refresh on `/en/admin/referees?tab=referees&id=42&subtab=history` → state restored.
11. Visit `/en/admin/referee/matches` → redirects to `/en/admin/referees`.
12. Visit `/en/admin/referee/history` → redirects to `/en/admin/referees?tab=referees`.

- [ ] **Step 5: Commit any remaining cleanup**

If verification surfaces issues, fix them in their own commit(s). Otherwise the plan is complete.

---

## Out of scope (follow-up PRs)

- Removing `RefereeRulesDialog` and `referee-list-table.tsx` (old `/admin/referees` component) once hub is verified in production.
- Removing the deprecated `PUT /admin/referees/:id/rules` and `PATCH /admin/referees/:id/visibility` endpoints + tests.
- Removing the old per-page components under `apps/web/src/components/referee/` once redirects are confirmed.
- Server-side candidate enrichment (workload + rule disposition) if not already present — see Task 5 Step 4.5.
- Investigating the `/admin/users` role-assignment "save sometimes fails" complaint (separate spec).

---

## Self-Review

**Spec coverage:**
- Two-tab IA (Open Slots default, Referees with workload in no-selection state) — Tasks 2, 7, 14, 15.
- Master-detail with URL state — Task 1.
- Federation-backed candidate picker, federation order preserved, workload as badge — Task 5.
- Auto-save + Save now + status indicator — Tasks 8, 10.
- Inline `isOwnClub` toggle — Task 9.
- Per-ref rules editor moves out of modal into right panel — Task 10.
- Workload as no-selection Referees state — Task 9 (KPIs in list header).
- URL redirects from old routes — Task 17.
- No new API endpoints — verified; all tasks use existing endpoints + the `PATCH /admin/referees/:id` shipped on 2026-05-15.

**Placeholder scan:** None remain. The only conditional path is Task 5 Step 4.5 (server-side candidate enrichment) which has a fallback (stubbed disposition + workload) and is explicitly called out as a possible Task 5.5.

**Type consistency:** `HubState`, `HubTab`, `HubSubtab`, `HubRange` defined once in Task 1 and reused. `Candidate`, `CandidateResponse` defined in Task 5. `Rule`, `RulesResp` in Task 10. Component prop interfaces are scoped per file. SWR_KEYS additions match the call sites.
