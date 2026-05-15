# Referee Hub Unification — Design

**Date:** 2026-05-15
**Status:** Draft — pending user review
**Owner:** James Neumann
**Related:** [referee-assignment-rules](2026-03-16-referee-assignment-rules-design.md), [referee-history-restructure](2026-04-22-referee-history-restructure-design.md), [referee-game-visibility](2026-04-16-referee-game-visibility-design.md)

## Summary

Collapse three separate admin pages into one unified hub at `/admin/referees` with two tabs. Replace the modal rules dialog with an in-page right panel that auto-saves on change. The transactional combined-settings endpoint shipped today (`PATCH /admin/referees/:id`) makes this safe.

## Problem

Three admin pages cover overlapping referee concerns:

| Page | Purpose | Pain |
|------|---------|------|
| `/admin/referees` | List + configure own-club refs | Modal rules dialog loses context; intermittent save failures (FIXED today) |
| `/admin/referee/matches` | Open slot assignments | Separate route, no context with directory or history |
| `/admin/referee/history` | Workload + per-ref history | Lives in isolation; can't get to it from the other two |

User's stated top pain: **switching between all three**. Context lost on every navigation; can't view a ref's config + workload + eligible open slots side-by-side.

Secondary issues already resolved:
- Intermittent save failure when toggling `isOwnClub` + editing rules together — fixed by the transactional `PATCH /admin/referees/:id` endpoint (commit pending).

## Goals

1. One route, two tabs. No more cross-page navigation for routine referee work.
2. Game-focused open-slot assignment with inline (no-modal) eligible-ref picker that calls the federation-backed candidate search.
3. Ref-focused configuration with inline rule editing and auto-save.
4. Workload visible without a separate page — fold it into the Referees tab's no-selection state.
5. Deep-linkable URL state (tab + selection + filters survive refresh).

## Non-goals

- **RBAC role management.** Granting `admin` / `refereeAdmin` lives in `/admin/users` (separate concern; user-not-referee surface). Out of scope here.
- **Federation prefill of `isOwnClub`.** Confirmed manual-only; no sync writes this flag. May revisit if a federation signal becomes available.
- **Mobile/native parity.** Hub is admin-only for web. Native app shows the referee-facing view, not this admin hub.
- **Public/referee-facing changes.** `/referee/games` (own-club refs claiming slots) is untouched.

## Audience

Primary users: club admin + `refereeAdmin` role. Internal staff only.

## Architecture

### Routes

Open Slots is the default tab (primary work — filling open slots is what brought you to the hub).

```
/admin/referees                                       → Open Slots tab (default)
/admin/referees?tab=open-slots&game=<spielplanId>     → Open Slots tab, game drilldown
/admin/referees?tab=referees                          → Referees tab (no selection = leaderboard view)
/admin/referees?tab=referees&id=<refId>               → Referees tab, ref drilldown
/admin/referees?tab=referees&subtab=history           → Referees tab, deep-link a sub-tab
/admin/referees?range=<preset>                        → date range filter (cross-tab)
```

Redirects (301):
- `/admin/referee/matches` → `/admin/referees` (default Open Slots tab)
- `/admin/referee/history` → `/admin/referees?tab=referees` (no-selection Referees tab IS the workload view)

### Information architecture

```
/admin/referees
├── Open Slots tab          (game-focused)
│   ├── Left:   games needing refs (filterable: week / league / slot / status)
│   └── Right:  selected game → SR1 card + SR2 card
│                  each card → inline candidate picker (federation-backed)
│                  assign / unassign actions
│
└── Referees tab            (ref-focused, with workload as no-selection state)
    ├── Left:   referee list with inline isOwnClub toggle + Games count
    │            sort by name / workload / license
    │            KPI row above (period total / refs assigned / avg workload / CSV export)
    │            "Show all" link reveals federation refs read-only
    └── Right:  selected ref → sub-tabs
                  • Profile:  visibility toggles + per-team rules editor (auto-save)
                  • Upcoming: assigned games + eligible open slots they could take
                  • History:  past games + per-ref CSV export
```

## Component design

### `<RefereeHubPage>`

Top-level page component. Owns tab routing via URL search params (Next.js `useSearchParams` + `useRouter`).

- Reads `tab`, `id`, `game`, `range` from URL.
- Renders the relevant tab; the tab owns its own master-detail state.
- Top header: page title + tab switcher + global filters that apply across tabs (date range preset).

### `<OpenSlotsTab>`

Master-detail. Receives `game` (selected `spielplanId`) from URL.

**Left list** — `<OpenGamesList>`:
- Data source: `GET /referee/games?limit=500&offset=0` (existing endpoint, filtered to games with at least one open slot)
- Filters (URL-synced): `week`, `league`, `slot` (SR1 / SR2 / either), `status` (active / cancelled / forfeited)
- Renders rows: date + time + matchup + slot status badges (SR1/SR2 open|offered|assigned with color coding)
- Clicking a row updates `?game=<spielplanId>`

**Right panel** — `<OpenSlotDetail>`:
- Header: matchup, date, league, match number, link to match detail page
- Two `<SlotCard>` components (SR1, SR2)
- Each `<SlotCard>`:
  - Assigned state: shows ref name + license + "Unassign" button (calls `DELETE /admin/referee/games/:id/assignment/:slot`)
  - Open state: shows inline `<CandidatePicker>`
- `<CandidatePicker>`:
  - Text search input (debounced 300ms)
  - Calls `GET /admin/referee/games/:spielplanId/candidates?search=<text>&pageFrom=0&pageSize=15`
  - Federation-validated results (qualifications, availability)
  - Each result enriched client-side with: workload count (from local DB join), rule disposition (allow/deny/sr-restricted)
  - Order: federation default (we do NOT re-sort by workload — federation order preserved for pagination consistency)
  - Workload shown as a badge, not a sort key
  - Rule-blocked refs greyed out with reason ("SR1 disallowed by rule", "Denied for team X")
  - Each row: "Assign SR1" / "Assign SR2" button → `POST /admin/referee/games/:spielplanId/assign`
  - "Load more" pagination

### `<RefereesTab>`

Master-detail. Receives `id` (selected `refereeId`) from URL.

**Left list** — `<RefereeList>`:
- Data source: `GET /admin/referees?ownClub=true` (existing endpoint)
- KPI row at top: period total games, refs assigned, avg workload, CSV export button
- Columns: Referee (name + license + roles), Own (inline toggle ☑), Games (workload count)
- Inline `isOwnClub` toggle: clicking fires `PATCH /admin/referees/:id` (combined endpoint, visibility-only payload) — optimistic UI with rollback on error
- Sort selector: Name (default) / Games desc / Games asc / Last refereed
- Filter: search box + "Show all" toggle (own-club-only by default; "Show all" includes federation refs as read-only entries)
- Clicking a row updates `?id=<refId>`

**Right panel** — `<RefereeDetail>`:
- Header: name, license, roles, own-club badge
- Sub-tabs: Profile | Upcoming | History (URL-synced via `?subtab=`)

**Profile sub-tab** (`<RefereeProfile>`):
- Visibility section: three switches (isOwnClub, allowAllHomeGames, allowAwayGames)
- Rules section: per-team rule list with Add Rule button
- Each rule row: team selector | Allow/Deny toggle | SR1 checkbox | SR2 checkbox | delete button
- **Auto-save**: debounce changes 800ms, then `PATCH /admin/referees/:id` with current state
- Save indicator: "Saving…" / "Saved Ns ago" / "Unsaved changes"
- Explicit "Save now" button to commit immediately
- Backed by the combined transactional endpoint shipped today

**Upcoming sub-tab** (`<RefereeUpcoming>`):
- Data: assigned games (from `matchReferees` join, filtered to future) + eligible open slots they could take
- Each row: date + matchup + slot + status; assigned rows have "Unassign", eligible rows have "Assign" buttons
- Reuses `/admin/referee/games/:id/candidates` server-side filtering logic, scoped to one ref

**History sub-tab** (`<RefereeHistory>`):
- Data: existing `GET /admin/referee/history/games?refereeId=<id>` with per-ref filter
- Same columns as today's history page games tab; per-ref CSV export
- KPIs: total games this season, last refereed date, role split (SR1 vs SR2 counts)

### Shared

- URL state hook (`useReferenceHubUrl`) centralizes parsing/writing search params.
- Date range preset selector at the page header level (applies to both tabs).
- Toast notifications for save state, errors.

## Data flow

No schema changes. Existing tables sufficient:
- `referees` (id, apiId, names, license, isOwnClub, allowAllHomeGames, allowAwayGames)
- `referee_assignment_rules` (refereeId, teamId, deny, allowSr1, allowSr2)
- `referee_games` (federation open-slots data)
- `match_referees` (assignments to our matches)

No new API endpoints. Existing endpoints sufficient:
- `GET /admin/referees` — list (already has `ownClub` filter)
- `PATCH /admin/referees/:id` — combined visibility + rules (shipped today, transactional)
- `GET /referee/games` — open slots (already exists, used by current matches page)
- `GET /admin/referee/games/:spielplanId/candidates` — federation-backed eligibility search
- `POST /admin/referee/games/:spielplanId/assign`, `DELETE …/assignment/:slot`
- `GET /admin/referee/history/{summary,games}` — workload + per-ref history

Deprecated (no callers after migration):
- `PUT /admin/referees/:id/rules` — supplanted by combined endpoint
- `PATCH /admin/referees/:id/visibility` — supplanted by combined endpoint

These stay for now to avoid breaking external callers (none known), to be removed in a follow-up cleanup PR once the new UI ships.

## Auto-save behavior

**When it fires:**
- Any toggle change on Profile sub-tab
- Any rule add / edit / delete
- Inline `isOwnClub` toggle in left list

**Mechanics:**
- 800ms debounce after last edit
- One request per save: `PATCH /admin/referees/:id` with the full current state (visibility + rules)
- Save indicator three states: Saving / Saved (with relative time) / Unsaved
- On error: toast + revert to last server-confirmed state
- "Save now" button bypasses debounce
- Navigation guard: warn if `Unsaved` state when changing selection

**Why this is safe:**
- The combined endpoint is transactional. No partial writes.
- All-or-nothing: if rules fail validation, visibility is rolled back too.
- Eliminates the batched-save failure path we shipped a fix for today.

## Migration

1. Build new hub at `/admin/referees`. Leave old routes serving existing pages until parity verified.
2. Verify behavioral parity in dev: all three current pages' tasks doable in the hub.
3. Flip redirects from old routes to new tabs.
4. Remove old page files + their imports in a follow-up.

Old routes during migration: keep functional, add a banner "Now in unified hub — try it at /admin/referees".

## Testing strategy

**Unit / integration (vitest):**
- URL state hook: parsing, writing, edge cases (missing params, invalid ids).
- `<OpenGamesList>` filtering, sorting.
- `<CandidatePicker>` debounce, pagination, rule enrichment.
- `<RefereeDetail>` sub-tab routing.
- Auto-save debounce: fires once after rapid changes, retries on transient failure, reverts on permanent failure.

**Service layer (existing):**
- `updateRefereeSettings` already covered by the tests shipped today.
- `searchCandidates` exists with federation mock coverage.

**E2E spot checks (manual, no test infrastructure):**
- Toggle `isOwnClub` ON + add a rule + change to another ref → both save persist.
- Open slot → search for a ref → assign → list updates without reload.
- Refresh on `/admin/referees?tab=open-slots&game=4287` → state restored.

**Coverage target:** maintain current thresholds (95% lines/funcs/statements, 90% branches in `apps/api`).

## Risks & open questions

| Risk | Mitigation |
|------|------------|
| Existing modal rules dialog has muscle memory for some admins | Old route stays during migration period; banner points to new hub |
| Auto-save causes accidental rule changes | Save indicator + "Saved Ns ago" + 800ms debounce + Save now button; could add a confirm-on-deny-rule for destructive changes if needed |
| Federation candidate search latency feels worse inline vs. modal | Modal already shows the latency; same UX. Add skeleton/spinner state |
| Workload-as-default Referees state may not be discoverable | KPI row at top of the list state makes it obvious; the leaderboard sort options too |

Open questions (none blocking; can be settled during implementation):
- Should the inline `isOwnClub` toggle in the left list show a confirmation on uncheck (drops a ref from own-club, may surprise)? Lean: yes, only on uncheck.
- Date range presets — does Workload share the same presets as the existing history page (season/30d/month/custom)? Lean: yes, reuse exactly.

## Out of scope (follow-ups)

- RBAC role-assignment UI improvements at `/admin/users` (separate "save fails" complaint mentioned by user; needs its own investigation).
- Federation `isOwnClub` prefill mechanism (user opted out for now).
- Bulk rule editing (apply a rule to multiple refs at once).
- Removing deprecated `PUT /rules` and `PATCH /visibility` endpoints (after hub ships and proves stable).
