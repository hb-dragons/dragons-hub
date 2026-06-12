# Referee Candidate Picker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two stacked inline candidate lists in the open-slots detail pane with a per-slot popover picker that shows eligible candidates first, hides ineligible ones behind a toggle, and paginates correctly via infinite scroll.

**Architecture:** A pure `getBlockReason` helper (extracted from the view) and a `useCandidateSearch` hook (`useSWRInfinite`, pages append) feed a rewritten `CandidatePicker` rendered inside a Radix `Popover` triggered from `SlotCard`. No API, contract, or api-client changes.

**Tech Stack:** Next.js 16 / React 19, SWR 2 (`swr/infinite`), Radix Popover via `@dragons/ui`, next-intl, Vitest + Testing Library (happy-dom per-file pragma).

**Spec:** `docs/superpowers/specs/2026-06-12-referee-candidate-picker-redesign-design.md`

**Branch:** `feat/referee-candidate-picker-redesign` (already created; spec committed).

---

## Context for a zero-context engineer

- Run everything from the repo root. Web tests: `pnpm --filter @dragons/web test`. A single file: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/candidate-block-reason.test.ts` (the `--` then a path filter).
- Component tests carry `// @vitest-environment happy-dom` as their first line (the package default is `node`). Pure-logic tests don't need it.
- i18n messages live in `apps/web/src/messages/en.json` and `de.json`. Tests pass their own `messages` object to `NextIntlClientProvider`, so test strings are independent of those files — but the real keys must exist in both locales.
- `pageFrom` on the candidates endpoint is a **page index** (0, 1, 2…), not a row offset — the existing UI computes `hasMore` as `(page + 1) * 15 < total` and the server forwards it verbatim to the federation API. Keep page-index semantics.
- Design-system rules that apply here (`packages/ui/DESIGN-SYSTEM.md`): row hover inside a popover uses `hover:bg-accent` (NOT `bg-surface-high` — in dark mode `surface-high` equals `card`, so it would vanish); popovers come pre-styled from `@dragons/ui` (`bg-popover`, shadow, ghost ring); radius is always `rounded-md`.
- House pattern reference for a popover picker: `apps/web/src/components/admin/board/assignee-picker.tsx`.
- Never add `Co-Authored-By` or any AI trailer to commits.

### File map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/components/admin/referee-hub/open-slots/candidate-block-reason.ts` | Create | Pure slot-eligibility rules → structured `BlockReason` |
| `.../candidate-block-reason.test.ts` | Create | Unit tests for every rule × both slots |
| `.../use-candidate-search.ts` | Create | `useSWRInfinite` wrapper; appending pagination |
| `.../use-candidate-search.test.tsx` | Create | Hook tests (append, hasMore, search reset) |
| `.../candidate-picker.tsx` | Rewrite | Popover *content*: search, eligible list, ineligible toggle, scroll sentinel |
| `.../candidate-picker.test.tsx` | Rewrite | Component tests against a mocked hook |
| `.../slot-card.tsx` | Modify | Popover trigger + open-state; close on successful assign |
| `.../slot-card.test.tsx` | Modify | Open-popover helper; close-on-assign test |
| `apps/web/src/messages/en.json`, `de.json` | Modify | New picker keys; drop `loadMore` |

All component paths below are relative to `apps/web/src/components/admin/referee-hub/open-slots/`.

---

### Task 1: `candidate-block-reason.ts` — pure eligibility helper

Extracts `getBlockReason` from `candidate-picker.tsx:23-35` into a tested module. Returns a structured reason instead of a translated string so the logic is testable without i18n.

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/candidate-block-reason.ts`
- Test: `apps/web/src/components/admin/referee-hub/open-slots/candidate-block-reason.test.ts`

- [ ] **Step 1: Write the failing test**

Create `candidate-block-reason.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getBlockReason, type RefCandidate } from "./candidate-block-reason";

function makeCandidate(over: Partial<RefCandidate> = {}): RefCandidate {
  return {
    srId: 1, vorname: "Tom", nachName: "Wagner", email: "", lizenznr: 88421,
    strasse: "", plz: "", ort: "", distanceKm: "0",
    qmaxSr1: null, qmaxSr2: null, warning: [],
    meta: { schiedsrichterId: 1, lizenzNr: 88421, heimTotal: 1, gastTotal: 2, total: 3, va: 0, eh: 0, qmaxSr1: null, qmaxSr2: null, tnaCount: 0, sperrvereinCount: 0, sperrzeitenCount: 0, qualiSr1: 1, qualiSr2: 1, qualiSr3: 0, qualiCoa: 0, qualiKom: 0, entfernung: 0, maxDatumBefore: null, minDatumAfter: null, anzAmTag: 0, anzInWoche: 0, anzImMonat: 0 },
    qualiSr1: true, qualiSr2: true, qualiSr3: false, qualiCoa: false, qualiKom: false,
    srModusMismatchSr1: false, srModusMismatchSr2: false,
    ansetzungAmTag: false, blocktermin: false, zeitraumBlockiert: null,
    srGruppen: [],
    ...over,
  };
}

describe("getBlockReason", () => {
  it("returns null for a fully eligible candidate (both slots)", () => {
    expect(getBlockReason(makeCandidate(), 1)).toBeNull();
    expect(getBlockReason(makeCandidate(), 2)).toBeNull();
  });

  it("flags missing SR1 qualification for slot 1", () => {
    expect(getBlockReason(makeCandidate({ qualiSr1: false }), 1)).toEqual({ kind: "notQualified", slot: 1 });
  });

  it("flags missing SR2 qualification for slot 2", () => {
    expect(getBlockReason(makeCandidate({ qualiSr2: false }), 2)).toEqual({ kind: "notQualified", slot: 2 });
  });

  it("a missing qualification only blocks its own slot", () => {
    expect(getBlockReason(makeCandidate({ qualiSr2: false }), 1)).toBeNull();
    expect(getBlockReason(makeCandidate({ qualiSr1: false }), 2)).toBeNull();
  });

  it("flags srModus mismatch per slot", () => {
    expect(getBlockReason(makeCandidate({ srModusMismatchSr1: true }), 1)).toEqual({ kind: "modeMismatch", slot: 1 });
    expect(getBlockReason(makeCandidate({ srModusMismatchSr2: true }), 2)).toEqual({ kind: "modeMismatch", slot: 2 });
    expect(getBlockReason(makeCandidate({ srModusMismatchSr2: true }), 1)).toBeNull();
  });

  it("flags blocktermin", () => {
    expect(getBlockReason(makeCandidate({ blocktermin: true }), 1)).toEqual({ kind: "blocked" });
  });

  it("returns the zeitraumBlockiert text verbatim", () => {
    expect(getBlockReason(makeCandidate({ zeitraumBlockiert: "Urlaub bis 20.06." }), 2)).toEqual({ kind: "zeitraum", text: "Urlaub bis 20.06." });
  });

  it("qualification outranks blocktermin (rule precedence)", () => {
    expect(getBlockReason(makeCandidate({ qualiSr1: false, blocktermin: true }), 1)).toEqual({ kind: "notQualified", slot: 1 });
  });

  it("modus mismatch outranks zeitraumBlockiert (rule precedence)", () => {
    expect(getBlockReason(makeCandidate({ srModusMismatchSr1: true, zeitraumBlockiert: "x" }), 1)).toEqual({ kind: "modeMismatch", slot: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/candidate-block-reason.test.ts`
Expected: FAIL — cannot resolve `./candidate-block-reason`.

- [ ] **Step 3: Write the implementation**

Create `candidate-block-reason.ts`:

```ts
import type { CandidateSearchResponse } from "@dragons/shared";

export type RefCandidate = CandidateSearchResponse["results"][number];

export type BlockReason =
  | { kind: "notQualified"; slot: 1 | 2 }
  | { kind: "modeMismatch"; slot: 1 | 2 }
  | { kind: "blocked" }
  | { kind: "zeitraum"; text: string };

const SLOT_CHECKS: Record<
  1 | 2,
  { quali: (c: RefCandidate) => boolean; mismatch: (c: RefCandidate) => boolean }
> = {
  1: { quali: (c) => c.qualiSr1, mismatch: (c) => c.srModusMismatchSr1 },
  2: { quali: (c) => c.qualiSr2, mismatch: (c) => c.srModusMismatchSr2 },
};

/**
 * Why a candidate cannot take the given slot, or null if assignable.
 * Rule order is load-bearing: qualification → srModus → blocktermin → blocked period.
 */
export function getBlockReason(candidate: RefCandidate, slot: 1 | 2): BlockReason | null {
  const checks = SLOT_CHECKS[slot];
  if (!checks.quali(candidate)) return { kind: "notQualified", slot };
  if (checks.mismatch(candidate)) return { kind: "modeMismatch", slot };
  if (candidate.blocktermin) return { kind: "blocked" };
  if (candidate.zeitraumBlockiert) return { kind: "zeitraum", text: candidate.zeitraumBlockiert };
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/candidate-block-reason.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/candidate-block-reason.ts apps/web/src/components/admin/referee-hub/open-slots/candidate-block-reason.test.ts
git commit -m "feat(web): extract candidate block-reason rules into tested helper"
```

---

### Task 2: `use-candidate-search.ts` — appending pagination hook

The actual load-more fix. `useSWRInfinite` keys each page; pages accumulate; a search-term change swaps the whole key family which resets pagination automatically.

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/open-slots/use-candidate-search.ts`
- Test: `apps/web/src/components/admin/referee-hub/open-slots/use-candidate-search.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `use-candidate-search.test.tsx` (note `.tsx` — the wrapper is JSX):

```tsx
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { useCandidateSearch } from "./use-candidate-search";
import type { RefCandidate } from "./candidate-block-reason";

const searchAssignmentCandidates = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    referees: {
      searchAssignmentCandidates: (...a: unknown[]) => searchAssignmentCandidates(...a),
    },
  },
}));

function makeCandidate(srId: number): RefCandidate {
  return {
    srId, vorname: `Ref${srId}`, nachName: "Test", email: "", lizenznr: srId,
    strasse: "", plz: "", ort: "", distanceKm: "0",
    qmaxSr1: null, qmaxSr2: null, warning: [],
    meta: { schiedsrichterId: srId, lizenzNr: srId, heimTotal: 0, gastTotal: 0, total: 0, va: 0, eh: 0, qmaxSr1: null, qmaxSr2: null, tnaCount: 0, sperrvereinCount: 0, sperrzeitenCount: 0, qualiSr1: 1, qualiSr2: 1, qualiSr3: 0, qualiCoa: 0, qualiKom: 0, entfernung: 0, maxDatumBefore: null, minDatumAfter: null, anzAmTag: 0, anzInWoche: 0, anzImMonat: 0 },
    qualiSr1: true, qualiSr2: true, qualiSr3: false, qualiCoa: false, qualiKom: false,
    srModusMismatchSr1: false, srModusMismatchSr2: false,
    ansetzungAmTag: false, blocktermin: false, zeitraumBlockiert: null,
    srGruppen: [],
  };
}

function page(ids: number[], total: number) {
  return { total, results: ids.map(makeCandidate) };
}

function range(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + i);
}

// Fresh SWR cache per render so tests don't leak state into each other.
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

beforeEach(() => {
  searchAssignmentCandidates.mockReset();
});

describe("useCandidateSearch", () => {
  it("loads the first page with page-index 0", async () => {
    searchAssignmentCandidates.mockResolvedValueOnce(page(range(1, 15), 30));
    const { result } = renderHook(() => useCandidateSearch(4287, 1, ""), { wrapper });

    await waitFor(() => expect(result.current.candidates).toHaveLength(15));
    expect(result.current.total).toBe(30);
    expect(result.current.hasMore).toBe(true);
    expect(searchAssignmentCandidates).toHaveBeenCalledWith(4287, {
      search: "", pageFrom: 0, pageSize: 15, slotNumber: 1,
    });
  });

  it("appends the next page on loadMore (does not replace)", async () => {
    searchAssignmentCandidates
      .mockResolvedValueOnce(page(range(1, 15), 30))
      .mockResolvedValueOnce(page(range(16, 15), 30));
    const { result } = renderHook(() => useCandidateSearch(4287, 1, ""), { wrapper });
    await waitFor(() => expect(result.current.candidates).toHaveLength(15));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.candidates).toHaveLength(30));
    expect(result.current.candidates[0].srId).toBe(1);
    expect(result.current.candidates[15].srId).toBe(16);
    expect(result.current.hasMore).toBe(false);
    expect(searchAssignmentCandidates).toHaveBeenLastCalledWith(4287, {
      search: "", pageFrom: 1, pageSize: 15, slotNumber: 1,
    });
  });

  it("resets to page 0 when the search term changes", async () => {
    searchAssignmentCandidates
      .mockResolvedValueOnce(page(range(1, 15), 30))
      .mockResolvedValueOnce(page(range(16, 15), 30))
      .mockResolvedValueOnce(page([99], 1));
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useCandidateSearch(4287, 1, q),
      { wrapper, initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current.candidates).toHaveLength(15));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.candidates).toHaveLength(30));

    rerender({ q: "wag" });

    await waitFor(() => {
      expect(result.current.candidates).toHaveLength(1);
      expect(result.current.candidates[0].srId).toBe(99);
    });
    expect(result.current.hasMore).toBe(false);
    expect(searchAssignmentCandidates).toHaveBeenLastCalledWith(4287, {
      search: "wag", pageFrom: 0, pageSize: 15, slotNumber: 1,
    });
  });

  it("hasMore is false on an empty result", async () => {
    searchAssignmentCandidates.mockResolvedValueOnce(page([], 0));
    const { result } = renderHook(() => useCandidateSearch(4287, 2, "zzz"), { wrapper });
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(result.current.candidates).toHaveLength(0);
    expect(result.current.hasMore).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/use-candidate-search.test.tsx`
Expected: FAIL — cannot resolve `./use-candidate-search`.

- [ ] **Step 3: Write the implementation**

Create `use-candidate-search.ts`:

```ts
"use client";

import { useCallback } from "react";
import useSWRInfinite from "swr/infinite";
import { api } from "@/lib/api";
import type { CandidateSearchResponse } from "@dragons/shared";
import type { RefCandidate } from "./candidate-block-reason";

const PAGE_SIZE = 15;

type PageKey = readonly ["referee-candidates", number, 1 | 2, string, number];

/**
 * Paginated candidate search for one game slot. Pages append (infinite
 * scroll); changing `search` swaps the SWR key family, which resets the page
 * stack to page 0. `pageFrom` is a page index, not a row offset.
 */
export function useCandidateSearch(gameApiId: number, slot: 1 | 2, search: string) {
  const { data, error, size, setSize } = useSWRInfinite<CandidateSearchResponse>(
    (pageIndex: number, previous: CandidateSearchResponse | null): PageKey | null => {
      if (previous && previous.results.length === 0) return null;
      return ["referee-candidates", gameApiId, slot, search, pageIndex];
    },
    ([, id, s, q, page]: PageKey) =>
      api.referees.searchAssignmentCandidates(id, {
        search: q,
        pageFrom: page,
        pageSize: PAGE_SIZE,
        slotNumber: s,
      }),
    // Without this, every loadMore would refetch page 0 against the
    // rate-limited federation API before fetching the new page.
    { revalidateFirstPage: false },
  );

  // SWR can hold sparse entries while a page is in flight; drop the holes.
  const pages = (data ?? []).filter(
    (p): p is CandidateSearchResponse => p !== undefined,
  );
  const candidates: RefCandidate[] = pages.flatMap((p) => p.results);
  const total = pages.length > 0 ? pages[pages.length - 1].total : 0;
  const hasMore = pages.length > 0 && candidates.length < total;
  const isLoadingMore = data === undefined || size > pages.length;

  const loadMore = useCallback(() => {
    void setSize((s) => s + 1);
  }, [setSize]);

  return { candidates, total, hasMore, isLoadingMore, loadMore, error };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/use-candidate-search.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/use-candidate-search.ts apps/web/src/components/admin/referee-hub/open-slots/use-candidate-search.test.tsx
git commit -m "feat(web): candidate search hook with appending pagination"
```

---

### Task 3: Rewrite `candidate-picker.tsx` (eligible/ineligible split + infinite scroll) and i18n keys

The picker becomes popover *content*: search input, eligible rows, `Show N ineligible` toggle, scroll sentinel. The popover wrapper itself is Task 4 (slot card).

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.tsx` (full rewrite)
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.test.tsx` (full rewrite)
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json`

- [ ] **Step 1: Update i18n messages**

In `apps/web/src/messages/en.json`, inside `refereeHub.openSlots.picker`: **remove** `"loadMore"` and add:

```json
"assignTrigger": "Assign referee…",
"showIneligible": "Show {n} ineligible",
"hideIneligible": "Hide ineligible",
"loadingMore": "Loading more…"
```

In `apps/web/src/messages/de.json`, same spot: **remove** `"loadMore"` and add:

```json
"assignTrigger": "Schiedsrichter zuweisen…",
"showIneligible": "{n} nicht Einsetzbare anzeigen",
"hideIneligible": "Nicht Einsetzbare ausblenden",
"loadingMore": "Lade mehr…"
```

(`assignTrigger` is consumed in Task 4; adding it here keeps the message edit in one place.)

- [ ] **Step 2: Replace the test file**

Overwrite `candidate-picker.test.tsx` entirely:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { act, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CandidatePicker } from "./candidate-picker";
import type { RefCandidate } from "./candidate-block-reason";

function makeCandidate(over: Partial<RefCandidate> = {}): RefCandidate {
  return {
    srId: 1, vorname: "Tom", nachName: "Wagner", email: "", lizenznr: 88421,
    strasse: "", plz: "", ort: "", distanceKm: "0",
    qmaxSr1: null, qmaxSr2: null, warning: [],
    meta: { schiedsrichterId: 1, lizenzNr: 88421, heimTotal: 1, gastTotal: 2, total: 3, va: 0, eh: 0, qmaxSr1: null, qmaxSr2: null, tnaCount: 0, sperrvereinCount: 0, sperrzeitenCount: 0, qualiSr1: 1, qualiSr2: 1, qualiSr3: 0, qualiCoa: 0, qualiKom: 0, entfernung: 0, maxDatumBefore: null, minDatumAfter: null, anzAmTag: 0, anzInWoche: 0, anzImMonat: 0 },
    qualiSr1: true, qualiSr2: true, qualiSr3: false, qualiCoa: false, qualiKom: false,
    srModusMismatchSr1: false, srModusMismatchSr2: false,
    ansetzungAmTag: false, blocktermin: false, zeitraumBlockiert: null,
    srGruppen: [],
    ...over,
  };
}

const hookReturn: {
  candidates: RefCandidate[];
  total: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: ReturnType<typeof vi.fn>;
  error: unknown;
} = {
  candidates: [],
  total: 0,
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
  error: undefined,
};

vi.mock("./use-candidate-search", () => ({
  useCandidateSearch: () => hookReturn,
}));

vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (v: string) => v }));

// happy-dom has no IntersectionObserver; capture the callback so tests can
// simulate the sentinel entering the viewport.
let observerCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
class FakeIntersectionObserver {
  constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observerCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

const messages = {
  refereeHub: {
    openSlots: {
      picker: {
        searchPlaceholder: "Search referees…",
        assign: "Assign SR{n}",
        empty: "No eligible referees",
        workload: "{n} games",
        assignTrigger: "Assign referee…",
        showIneligible: "Show {n} ineligible",
        hideIneligible: "Hide ineligible",
        loadingMore: "Loading more…",
        disposition: {
          notQualifiedSr1: "Not qualified as SR1",
          notQualifiedSr2: "Not qualified as SR2",
          modeMismatchSr1: "SR1 mode mismatch",
          modeMismatchSr2: "SR2 mode mismatch",
          blocked: "Blocked",
        },
      },
    },
  },
};

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => {
  hookReturn.candidates = [
    makeCandidate({ srId: 1, vorname: "Tom", nachName: "Wagner", meta: { ...makeCandidate().meta, total: 3 } }),
    makeCandidate({ srId: 2, vorname: "Lisa", nachName: "Klein", qualiSr2: false, meta: { ...makeCandidate().meta, total: 7 } }),
    makeCandidate({ srId: 3, vorname: "Anna", nachName: "Müller", blocktermin: true, meta: { ...makeCandidate().meta, total: 14 } }),
  ];
  hookReturn.total = 3;
  hookReturn.hasMore = false;
  hookReturn.isLoadingMore = false;
  hookReturn.loadMore = vi.fn();
  hookReturn.error = undefined;
  observerCallback = null;
});

afterEach(() => cleanup());

describe("CandidatePicker", () => {
  it("renders eligible candidates with workload badge", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("Tom Wagner")).toBeInTheDocument();
    expect(screen.getByText("3 games")).toBeInTheDocument();
    // Lisa lacks SR2 quali but slot is 1 → eligible here
    expect(screen.getByText("Lisa Klein")).toBeInTheDocument();
  });

  it("hides ineligible candidates behind the toggle and reveals them with a reason", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    // Anna has blocktermin → ineligible for any slot
    expect(screen.queryByText("Anna Müller")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 1 ineligible" }));

    const row = screen.getByText("Anna Müller").closest("[data-candidate]");
    expect(row).toHaveAttribute("data-disabled", "true");
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    const button = row!.querySelector("button")!;
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Hide ineligible" }));
    expect(screen.queryByText("Anna Müller")).not.toBeInTheDocument();
  });

  it("treats slot-specific qualification correctly (SR2)", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={2} onPick={vi.fn()} />));
    // Lisa lacks SR2 quali → hidden until toggled
    expect(screen.queryByText("Lisa Klein")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 2 ineligible" }));
    expect(screen.getByText("Lisa Klein")).toBeInTheDocument();
    expect(screen.getByText("Not qualified as SR2")).toBeInTheDocument();
  });

  it("invokes onPick with srId on Assign click", () => {
    const onPick = vi.fn();
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={onPick} />));
    const row = screen.getByText("Tom Wagner").closest("[data-candidate]")!;
    fireEvent.click(row.querySelector("button")!);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("keeps server order within the eligible section (no client re-sort)", () => {
    hookReturn.candidates = [
      makeCandidate({ srId: 2, vorname: "Lower", nachName: "Workload", meta: { ...makeCandidate().meta, total: 3 } }),
      makeCandidate({ srId: 1, vorname: "Higher", nachName: "Workload", meta: { ...makeCandidate().meta, total: 10 } }),
    ];
    render(wrap(<CandidatePicker gameApiId={1} slotNumber={1} onPick={() => {}} />));
    const items = screen.getAllByTestId("candidate-row");
    expect(items[0]).toHaveTextContent("Lower Workload");
    expect(items[1]).toHaveTextContent("Higher Workload");
  });

  it("shows the empty state when there are no eligible candidates", () => {
    hookReturn.candidates = [];
    hookReturn.total = 0;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("No eligible referees")).toBeInTheDocument();
  });

  it("loads the next page when the scroll sentinel becomes visible", () => {
    hookReturn.hasMore = true;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByTestId("scroll-sentinel")).toBeInTheDocument();

    act(() => observerCallback?.([{ isIntersecting: true }]));

    expect(hookReturn.loadMore).toHaveBeenCalledTimes(1);
  });

  it("renders no sentinel when there are no more pages", () => {
    hookReturn.hasMore = false;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.queryByTestId("scroll-sentinel")).not.toBeInTheDocument();
  });

  it("shows a loading row while a page is in flight", () => {
    hookReturn.isLoadingMore = true;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/candidate-picker.test.tsx`
Expected: FAIL — the old component still fetches via `useSWR` (unmocked module) and has no toggle/sentinel.

- [ ] **Step 4: Rewrite the component**

Overwrite `candidate-picker.tsx` entirely:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import { getBlockReason, type BlockReason, type RefCandidate } from "./candidate-block-reason";
import { useCandidateSearch } from "./use-candidate-search";

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  onPick: (refereeApiId: number) => void;
  disabled?: boolean;
}

type DispositionKey =
  | "notQualifiedSr1"
  | "notQualifiedSr2"
  | "modeMismatchSr1"
  | "modeMismatchSr2"
  | "blocked";

function blockReasonText(reason: BlockReason, t: (k: DispositionKey) => string): string {
  switch (reason.kind) {
    case "notQualified":
      return t(reason.slot === 1 ? "notQualifiedSr1" : "notQualifiedSr2");
    case "modeMismatch":
      return t(reason.slot === 1 ? "modeMismatchSr1" : "modeMismatchSr2");
    case "blocked":
      return t("blocked");
    case "zeitraum":
      return reason.text;
  }
}

export function CandidatePicker({ gameApiId, slotNumber, onPick, disabled }: Props) {
  const t = useTranslations("refereeHub.openSlots.picker");
  const tDisposition = useTranslations("refereeHub.openSlots.picker.disposition");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [showIneligible, setShowIneligible] = useState(false);
  const { candidates, hasMore, isLoadingMore, loadMore } = useCandidateSearch(
    gameApiId,
    slotNumber,
    debounced,
  );

  const rows = candidates.map((c) => ({ c, reason: getBlockReason(c, slotNumber) }));
  const eligible = rows.filter((r) => r.reason === null);
  const ineligible = rows.filter((r) => r.reason !== null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const renderRow = (c: RefCandidate, reasonText: string | null) => {
    const blocked = reasonText !== null;
    const displayName = `${c.vorname} ${c.nachName}`.trim();
    return (
      <div
        key={c.srId}
        data-testid="candidate-row"
        data-candidate
        data-disabled={blocked}
        className={cn(
          "flex items-center justify-between p-2 rounded-md gap-2 hover:bg-accent",
          blocked && "opacity-50",
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground flex gap-2 items-center flex-wrap">
            <Badge variant="outline">{t("workload", { n: String(c.meta.total) })}</Badge>
            {blocked && <span className="text-destructive">{reasonText}</span>}
          </div>
        </div>
        <Button
          size="sm"
          variant="default"
          disabled={blocked || disabled}
          onClick={() => onPick(c.srId)}
        >
          {t("assign", { n: String(slotNumber) })}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        autoFocus
      />
      <div className="max-h-80 overflow-y-auto space-y-1">
        {eligible.length === 0 && !isLoadingMore && (
          <div className="text-sm text-muted-foreground py-3 text-center">{t("empty")}</div>
        )}
        {eligible.map(({ c }) => renderRow(c, null))}
        {ineligible.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowIneligible((v) => !v)}
          >
            {showIneligible
              ? t("hideIneligible")
              : t("showIneligible", { n: String(ineligible.length) })}
          </Button>
        )}
        {showIneligible &&
          ineligible.map(({ c, reason }) =>
            renderRow(c, reason === null ? null : blockReasonText(reason, tDisposition)),
          )}
        {isLoadingMore && (
          <div className="text-xs text-muted-foreground py-2 text-center">{t("loadingMore")}</div>
        )}
        {hasMore && <div ref={sentinelRef} data-testid="scroll-sentinel" className="h-px" />}
      </div>
    </div>
  );
}
```

Notes for the implementer:
- The old `getBlockReason` (lines 23-35) and the `useMemo` `hasMore` computation are gone — both now live in the helper/hook from Tasks 1-2.
- `setPage(0)` on search change is gone — the hook's key family handles the reset.
- Row hover is `hover:bg-accent`; the old `bg-card` row background is dropped (rows now sit on the popover surface).
- The ineligible count reflects **loaded** candidates only — that's the spec'd behavior, not a bug.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/candidate-picker.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.tsx apps/web/src/components/admin/referee-hub/open-slots/candidate-picker.test.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): candidate picker with ineligible toggle and infinite scroll"
```

---

### Task 4: `slot-card.tsx` — popover trigger, close on successful assign

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/slot-card.test.tsx`

- [ ] **Step 1: Update the tests first**

Overwrite `slot-card.test.tsx` entirely:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SlotCard } from "./slot-card";

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast }));

const assignReferee = vi.fn();
const unassignReferee = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    referees: {
      assignReferee: (...a: unknown[]) => assignReferee(...a),
      unassignReferee: (...a: unknown[]) => unassignReferee(...a),
    },
  },
  APIError: class extends Error {},
}));

vi.mock("./candidate-picker", () => ({
  CandidatePicker: ({ onPick }: { onPick: (n: number) => void }) =>
    <button onClick={() => onPick(7)} data-testid="pick">pick</button>,
}));

const messages = { refereeHub: { openSlots: {
  slot: { label: "SR{n}", open: "Open", unassign: "Unassign" },
  errorChip: { dismiss: "Dismiss" },
  picker: { assignTrigger: "Assign referee…" },
} } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

const openAssignment = { refereeApiId: null, refereeName: null, status: "open" as const };

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /assign referee/i }));
}

beforeEach(() => { assignReferee.mockReset(); unassignReferee.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });
afterEach(() => cleanup());

describe("SlotCard", () => {
  it("renders a compact trigger instead of an inline candidate list", () => {
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    expect(screen.getByRole("button", { name: /assign referee/i })).toBeInTheDocument();
    expect(screen.queryByTestId("pick")).not.toBeInTheDocument();
  });

  it("opens the picker popover from the trigger", () => {
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    expect(screen.getByTestId("pick")).toBeInTheDocument();
  });

  it("closes the popover and calls onChange after a successful assign", async () => {
    assignReferee.mockResolvedValueOnce({});
    const onChange = vi.fn();
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={onChange} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("pick")).not.toBeInTheDocument());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps the popover open and shows the inline error chip on assign failure (no toast)", async () => {
    assignReferee.mockRejectedValueOnce(new Error("federation down"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getByText(/federation down/)).toBeInTheDocument());
    expect(screen.getByTestId("pick")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("dismiss clears the chip", async () => {
    assignReferee.mockRejectedValueOnce(new Error("nope"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={openAssignment} onChange={() => {}} />));
    openPicker();
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });
});
```

If `PopoverContent` rendering fails in happy-dom with a `ResizeObserver is not defined` error, add this stub next to the other mocks at the top of the test file:

```tsx
if (typeof globalThis.ResizeObserver === "undefined") {
  class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/slot-card.test.tsx`
Expected: FAIL — there is no trigger button; the (mocked) picker renders inline immediately.

- [ ] **Step 3: Update the component**

Overwrite `slot-card.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover";
import { CandidatePicker } from "./candidate-picker";

export type SlotStatus = "open" | "offered" | "assigned";

interface Assignment {
  refereeApiId: number | null;
  refereeName: string | null;
  status: SlotStatus;
}

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  assignment: Assignment;
  onChange: () => void;
}

export function SlotCard({ gameApiId, slotNumber, assignment, onChange }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleAssign(refereeApiId: number) {
    setBusy(true);
    setError(null);
    try {
      await api.referees.assignReferee(gameApiId, { slotNumber, refereeApiId });
      setPickerOpen(false);
      onChange();
    } catch (err) {
      setError(err instanceof APIError ? err.message : err instanceof Error ? err.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign() {
    setBusy(true);
    setError(null);
    try {
      await api.referees.unassignReferee(gameApiId, slotNumber);
      onChange();
    } catch (err) {
      setError(err instanceof APIError ? err.message : err instanceof Error ? err.message : "Unassign failed");
    } finally {
      setBusy(false);
    }
  }

  const isOpen = assignment.status === "open";

  return (
    <div className="bg-surface-low rounded-md p-3 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-muted-foreground">{t("slot.label", { n: String(slotNumber) })}</div>
          {isOpen ? (
            <div className="text-sm font-semibold text-heat">{t("slot.open")}</div>
          ) : (
            <div className="text-sm font-semibold">{assignment.refereeName ?? "—"}</div>
          )}
        </div>
        {!isOpen && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { void handleUnassign(); }}>{t("slot.unassign")}</Button>
        )}
        {isOpen && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy}>
                {t("picker.assignTrigger")}
                <ChevronDown className="size-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-2" align="end">
              <CandidatePicker
                gameApiId={gameApiId}
                slotNumber={slotNumber}
                onPick={(id) => { void handleAssign(id); }}
                disabled={busy}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between text-xs rounded-md bg-destructive/10 text-destructive px-2 py-1">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>{t("errorChip.dismiss")}</Button>
        </div>
      )}
    </div>
  );
}
```

Notes for the implementer:
- The error chip stays in the card (outside the popover) so a failure is visible even after the popover closes or while it is open.
- On assign failure the popover intentionally stays open (no `setPickerOpen(false)` in the catch path) so the admin can retry another candidate.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/web test -- src/components/admin/referee-hub/open-slots/slot-card.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx apps/web/src/components/admin/referee-hub/open-slots/slot-card.test.tsx
git commit -m "feat(web): assign-referee popover trigger in slot card"
```

---

### Task 5: Full gates and dead-reference sweep

**Files:** none new — verification only.

- [ ] **Step 1: Sweep for stale references**

Run: `grep -rn "loadMore" apps/web/src/messages/ && echo "STALE" || echo "clean"`
Expected: `clean` (the key was removed in Task 3).

Run: `grep -rn "picker.loadMore\|setPage" apps/web/src/components/admin/referee-hub/open-slots/`
Expected: no matches.

- [ ] **Step 2: Run the full web test suite**

Run: `pnpm --filter @dragons/web test`
Expected: all tests pass, including untouched suites (`open-games-list`, `slots-filter-sidebar`, `open-slot-detail` does not have its own test file).

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: both exit 0. Watch for `no-floating-promises` (all `setSize`/`handleAssign` calls are `void`-ed in the code above).

- [ ] **Step 4: Coverage gate**

Run: `pnpm --filter @dragons/web coverage`
Expected: thresholds met (branches 9 / functions 10 / lines 12 / statements 12 in `apps/web/vitest.config.ts`). The new fully-tested helper and hook should raise coverage, not lower it. Do NOT lower thresholds.

- [ ] **Step 5: Commit any straggler fixes**

If steps 1-4 required fixes, commit them:

```bash
git add -A
git commit -m "fix(web): post-redesign cleanup for candidate picker"
```

If nothing changed, skip the commit.

---

## Out of scope (do not touch)

- API routes, contracts (`packages/contracts`), api-client — the endpoint and its request schema are unchanged.
- Server-side global ranking across federation pages.
- `slots-filter-sidebar.tsx`, `open-games-list.tsx`, `open-slot-detail.tsx`.
- Shared mutation hook for SlotCard.
- `AGENTS.md` (no endpoint or data-model changes).
