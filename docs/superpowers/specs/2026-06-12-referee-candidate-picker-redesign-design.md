# Referee candidate picker redesign — design

## Problem

In the referee hub's open-slots detail pane, each open slot renders a full
inline `CandidatePicker`: a search input plus a 15-row candidate list. With
both SR1 and SR2 open, the pane stacks two complete pickers. Slot-ineligible
candidates (wrong qualification, srModus mismatch, blocked date/period) are
interleaved at 50% opacity, and the upstream federation API sorts by distance
and paginates *before* our re-rank, so page 1 can be mostly blocked rows.

On top of that, "Load more" is broken: `candidate-picker.tsx` keeps a `page`
state that feeds the SWR key and renders only `data.results` of the current
page — clicking the button **replaces** page 0 with page 1 instead of
appending.

## Decisions (user-approved)

1. **Popover combobox per slot** — the slot card shows a compact
   `Assign referee… ▾` trigger; the picker lives in a popover. Only one
   picker open at a time; the detail pane stays small.
2. **Ineligible candidates hidden behind a toggle** — default list shows only
   slot-eligible candidates; a `Show N ineligible` row reveals the rest with
   their block reasons.
3. **Infinite scroll** — `useSWRInfinite` with an IntersectionObserver
   sentinel; no Load more button.

## Interaction

- Open slot card row: status label (`OPEN`, `text-heat`) + outline button
  `Assign referee… ▾` (uses `bg-input` / ghost border like other form
  controls).
- Clicking opens a `Popover` (`bg-popover`, `shadow-md`,
  `ring-1 ring-foreground/10`, `rounded-md` — floating-element rules from
  `packages/ui/DESIGN-SYSTEM.md`) containing:
  1. Search input (debounced 300 ms, unchanged).
  2. Scrollable list, `max-h` ≈ 320 px. Eligible candidates only by default.
     Row: name, workload badge (`outline` variant, `meta.total`), Assign
     button. Row hover: `bg-accent` (menu-hover token — NOT `surface-high`,
     which equals `card` in dark mode).
  3. `Show N ineligible` toggle row after the eligible section. Expanded rows
     are greyed (`opacity-50`) and show the block reason in `text-destructive`.
     N counts **loaded** candidates only (upstream pagination means the true
     total is unknowable client-side).
  4. Sentinel `div` at the list bottom; when it intersects, the next page
     loads. A small loading row shows while a page is in flight.
- Successful assign closes the popover and calls the existing `onChange` →
  SWR `mutate` of the game. Assign errors keep using the slot card's existing
  error chip.
  Decision (final review): while the popover is open, the error renders
  inside the popover (the floating panel would occlude the chip); the card
  chip shows only when the popover is closed, and reopening the picker
  clears a stale error.
- Search text change resets the list to page 0 (falls out of the SWR key).

## Components

All under `apps/web/src/components/admin/referee-hub/open-slots/` unless
noted. No API, contract, or `@dragons/api-client` changes — the existing
`GET /referee/games/:spielplanId/candidates` endpoint and
`queries.refereeCandidates` page-keyed fetcher remain the data source.

### `candidate-block-reason.ts` (new, pure)

`getBlockReason` moves out of the view (mirrors the `format-kickoff`
extraction). The slot-1/slot-2 branch duplication collapses via a
slot-indexed lookup:

```ts
import type { CandidateSearchResponse } from "@dragons/shared";

type RefCandidate = CandidateSearchResponse["results"][number];

export type BlockReason =
  | { kind: "notQualified"; slot: 1 | 2 }     // → disposition.notQualifiedSr1/2
  | { kind: "modeMismatch"; slot: 1 | 2 }     // → disposition.modeMismatchSr1/2
  | { kind: "blocked" }                        // blocktermin → disposition.blocked
  | { kind: "zeitraum"; text: string };        // zeitraumBlockiert verbatim

export function getBlockReason(c: RefCandidate, slot: 1 | 2): BlockReason | null;
```

The component translates `kind`+`slot` to the existing
`refereeHub.openSlots.picker.disposition.*` message keys; `zeitraum` renders
its text verbatim (current behavior). Rule order is preserved: quali →
modus → blocktermin → zeitraum.

### `use-candidate-search.ts` (new hook)

Wraps `useSWRInfinite`. Key per page index: an inline tuple
`["referee-candidates", gameApiId, slot, search, pageIndex]`, fetcher
`api.referees.searchAssignmentCandidates(...)` with `pageSize: 15`.

Decision (code review, Task 2): the tuple key replaces the originally
sketched `SWR_KEYS.refereeCandidates` URL-string key — tuple keys fit
`useSWRInfinite` better and nothing invalidates candidate caches externally.
Consequence: once the picker rewrite removes the old `useSWR` call,
`SWR_KEYS.refereeCandidates` and `queries.refereeCandidates` are dead code
and must be deleted with it.

```ts
export function useCandidateSearch(gameApiId: number, slot: 1 | 2, search: string): {
  candidates: RefCandidate[];   // pages flattened, append-only
  total: number;                // from the last response
  hasMore: boolean;             // loadedCount < total
  isLoadingMore: boolean;
  loadMore: () => void;         // setSize(size + 1)
}
```

This is the pagination fix: pages accumulate instead of replacing, and a
search change swaps the whole key family, resetting `size` to 1.

### `candidate-picker.tsx` (rewritten)

Popover **content** only (the trigger lives in the slot card). Renders the
search input, partitions `candidates` with `getBlockReason` into
eligible/ineligible, renders the eligible rows, the toggle + ineligible rows,
and the scroll sentinel. Keeps the existing `data-testid="candidate-row"` /
`data-disabled` hooks. Props stay `{ gameApiId, slotNumber, onPick, disabled }`.

### `slot-card.tsx` (modified)

When `status === "open"`, render `Popover` + `PopoverTrigger` (the
`Assign referee… ▾` button) + `PopoverContent` containing `CandidatePicker`.
Popover open state is local; `handleAssign` success closes it. The
`busy`/`error` mutation state stays in the slot card unchanged (the shared
mutation-hook idea is explicitly out of scope).

### i18n

New keys under `refereeHub.openSlots.picker`: trigger label
(`assignTrigger`), ineligible toggle (`showIneligible` with count, and
`hideIneligible`), loading row (`loadingMore`). Existing `disposition.*`,
`workload`, `empty`, `searchPlaceholder`, `assign` keys are reused;
`loadMore` is removed.

## Testing

- **New** `candidate-block-reason.test.ts` — every rule × both slots: missing
  quali SR1/SR2, modus mismatch SR1/SR2, blocktermin, zeitraumBlockiert,
  fully eligible, and rule precedence (e.g. missing quali wins over
  blocktermin).
- **New** `use-candidate-search.test.tsx` — with a mocked API client:
  pages append in order, `hasMore` flips false at `loaded >= total`,
  changing `search` resets to one page.
- **Updated** `candidate-picker.test.tsx` — eligible-only by default;
  toggle reveals ineligible rows with reasons; sentinel intersection triggers
  the next page (IntersectionObserver mocked); Assign click calls `onPick`;
  empty state.
- **Updated** `slot-card.test.tsx` — open slot renders the trigger, not an
  inline list; trigger opens the picker; successful assign closes the
  popover and fires `onChange`; error path still shows the error chip.

jsdom note: Radix Popover needs the usual jsdom shims
(`ResizeObserver`, `IntersectionObserver`, possibly `scrollIntoView`) — add
to the test setup where missing.

## Gates

- `pnpm --filter @dragons/web test`
- `pnpm --filter @dragons/web typecheck`
- `pnpm --filter @dragons/web lint`
- `apps/web` coverage must not drop (the new helper + hook are fully
  unit-tested, which should raise it).

## Out of scope

- API/contract changes; server-side global ranking across federation pages
  (the federation paginates pre-rank — accepted limitation, revisit if it
  hurts in practice).
- Shared mutation hook for SlotCard assign/unassign.
- `slots-filter-sidebar.tsx` refactor.
- `open-games-list.tsx` (its virtualized pagination is separate and works).
