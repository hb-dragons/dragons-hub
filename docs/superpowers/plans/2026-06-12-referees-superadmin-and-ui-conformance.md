# Referees: superadmin fix + UI conformance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the superadmin 403 on `/admin/referees` at its root (a missing "superadmin ⊇ admin" implication in the role-name gates) and bring the referee hub UI in line with the admin design system.

**Architecture:** Part A adds one shared predicate, `satisfiesRole`, and routes both role-name gate middlewares through it — fixing the referee 403 and the latent 403s on every other `requireAnyRole("admin")` gate, with no per-route edits. Part B is a styling-only conformance pass over the referee-hub components: adopt `PageHeader`, standard `space-y-6`, design-system tonal surfaces in place of 1px section borders, `font-display` typography, and `truncate` on name cells.

**Tech Stack:** TypeScript, Hono, better-auth, Vitest, Next.js (App Router), Tailwind v4, `@dragons/ui` design tokens.

Branch: `fix/referees-superadmin-and-ui-conformance` (already created; spec committed).

---

## Part A — Authorization fix

### Task 1: `satisfiesRole` predicate in `@dragons/shared`

**Files:**
- Modify: `packages/shared/src/rbac.ts` (add export after `hasRole`, ~line 123)
- Modify: `packages/shared/src/index.ts` (add to the rbac re-exports, near the existing `hasRole` export ~line 237)
- Test: `packages/shared/src/rbac.test.ts` (extend the existing `superadmin role` describe block, ~line 228)

- [ ] **Step 1: Write the failing test.** Add this describe block to `packages/shared/src/rbac.test.ts` (and add `satisfiesRole` to the import list at the top, line 2-12):

```ts
describe("satisfiesRole", () => {
  it("is true when the user literally holds the required role", () => {
    expect(satisfiesRole({ role: "admin" }, "admin")).toBe(true);
    expect(satisfiesRole({ role: "refereeAdmin" }, "refereeAdmin")).toBe(true);
    expect(satisfiesRole({ role: "superadmin" }, "superadmin")).toBe(true);
  });

  it("treats superadmin as satisfying an admin requirement", () => {
    expect(satisfiesRole({ role: "superadmin" }, "admin")).toBe(true);
  });

  it("does NOT treat admin as satisfying a superadmin requirement", () => {
    expect(satisfiesRole({ role: "admin" }, "superadmin")).toBe(false);
  });

  it("does not widen superadmin to non-admin roles", () => {
    expect(satisfiesRole({ role: "superadmin" }, "refereeAdmin")).toBe(false);
    expect(satisfiesRole({ role: "superadmin" }, "venueManager")).toBe(false);
  });

  it("is false for null/undefined users", () => {
    expect(satisfiesRole(null, "admin")).toBe(false);
    expect(satisfiesRole(undefined, "admin")).toBe(false);
    expect(satisfiesRole({ role: null }, "admin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --filter @dragons/shared test -- rbac`
Expected: FAIL — `satisfiesRole is not exported` / `not a function`.

- [ ] **Step 3: Implement the predicate.** In `packages/shared/src/rbac.ts`, immediately after the `hasRole` function (after line 123), add:

```ts
// superadmin is a strict superset of admin: any gate that admits `admin` must
// also admit `superadmin`. A gate that names `superadmin` still admits
// superadmin only (admin does NOT satisfy a superadmin requirement).
export function satisfiesRole(
  user: { role?: string | null } | null | undefined,
  role: RoleName,
): boolean {
  if (hasRole(user, role)) return true;
  return role === "admin" && hasRole(user, "superadmin");
}
```

- [ ] **Step 4: Re-export it.** In `packages/shared/src/index.ts`, add `satisfiesRole` to the existing rbac export list (the block that already exports `hasRole`, ~line 237). For example, if that block reads `hasRole,` add a sibling line `satisfiesRole,`.

- [ ] **Step 5: Run tests to verify they pass.**

Run: `pnpm --filter @dragons/shared test -- rbac`
Expected: PASS (all `satisfiesRole` cases green; existing cases still green).

- [ ] **Step 6: Typecheck shared.**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add packages/shared/src/rbac.ts packages/shared/src/index.ts packages/shared/src/rbac.test.ts
git commit -m "feat(rbac): add satisfiesRole so superadmin satisfies admin gates"
```

---

### Task 2: Route the gate middlewares through `satisfiesRole`

**Files:**
- Modify: `apps/api/src/middleware/rbac.ts` (line 5 import; line 69 `requireAnyRole`; line 103 `requireRefereeSelfOrAdminRole`)
- Modify: `apps/api/src/routes/referee/games.routes.ts` (comment at lines 21-23)
- Test: `apps/api/src/middleware/rbac.test.ts` (add superadmin cases)

- [ ] **Step 1: Write the failing tests.** In `apps/api/src/middleware/rbac.test.ts`, add a superadmin case to the `requireAnyRole` describe block (after line 103) and to the `requireRefereeSelfOrAdminRole` describe block (after line 306):

In `describe("requireAnyRole", ...)`:

```ts
  it("passes a superadmin on an admin-named gate", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "superadmin" },
      session: { id: "s1" },
    });
    const res = await app.request("/adm/panel");
    expect(res.status).toBe(200);
  });

  it("denies a plain admin on a superadmin-named gate", async () => {
    const sa = new Hono();
    sa.use("/sa/*", requireAnyRole("superadmin"));
    sa.get("/sa/x", (c) => c.json({ ok: true }));
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    const res = await sa.request("/sa/x");
    expect(res.status).toBe(403);
  });
```

In `describe("requireRefereeSelfOrAdminRole", ...)`:

```ts
  it("passes a superadmin and leaves refereeId unset (wide view)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "superadmin", refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/either/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: null });
  });
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `pnpm --filter @dragons/api test -- rbac`
Expected: FAIL — the two superadmin-pass cases return 403 (current `hasRole` exact match).

- [ ] **Step 3: Switch the middlewares to `satisfiesRole`.** In `apps/api/src/middleware/rbac.ts`:

Change the import on line 5 from:

```ts
import { isReferee, hasRole } from "@dragons/shared";
```

to:

```ts
import { isReferee, satisfiesRole } from "@dragons/shared";
```

In `requireAnyRole` (line 69), change:

```ts
    if (!names.some((n) => hasRole(user, n))) {
```

to:

```ts
    if (!names.some((n) => satisfiesRole(user, n))) {
```

In `requireRefereeSelfOrAdminRole` (line 103), change:

```ts
    const isAdmin = roleNames.some((n) => hasRole(user, n));
```

to:

```ts
    const isAdmin = roleNames.some((n) => satisfiesRole(user, n));
```

- [ ] **Step 4: Update the gate comment.** In `apps/api/src/routes/referee/games.routes.ts`, replace the comment at lines 21-22:

```ts
// admin and refereeAdmin get cross-referee (wide) visibility; a referee without
// either role is scoped to their own games via c.get("refereeId").
```

with:

```ts
// admin (and superadmin, which satisfies the admin requirement) and refereeAdmin
// get cross-referee (wide) visibility; a referee without any of these roles is
// scoped to their own games via c.get("refereeId").
```

- [ ] **Step 5: Run tests to verify they pass.**

Run: `pnpm --filter @dragons/api test -- rbac`
Expected: PASS — all new superadmin cases green; existing gate cases still green.

- [ ] **Step 6: Run the referee games route tests (no regression).**

Run: `pnpm --filter @dragons/api test -- games.routes`
Expected: PASS.

- [ ] **Step 7: Typecheck the API.**

Run: `pnpm --filter @dragons/api typecheck`
Expected: no errors (confirms `hasRole` has no remaining references in this file).

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/middleware/rbac.ts apps/api/src/middleware/rbac.test.ts apps/api/src/routes/referee/games.routes.ts
git commit -m "fix(rbac): superadmin satisfies admin-named gates (referee games 403)"
```

---

## Part B — UI conformance pass

> These tasks are styling-only. There are no new behaviors to test; the rule is **existing component tests stay green**, and update only class-based assertions that query markup that actually changed. After each task, run the named test file. Final visual check happens in Task 7.

### Task 3: Hub shell — PageHeader + standard spacing

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referee-hub.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/hub-header.tsx`
- Modify: `apps/web/src/messages/en.json` (add `refereeHub.subtitle`)
- Modify: `apps/web/src/messages/de.json` (add `refereeHub.subtitle`)

- [ ] **Step 1: Add the subtitle i18n key.** In `apps/web/src/messages/en.json`, in the `refereeHub` object, add a `subtitle` key next to `title`:

```json
    "title": "Referees",
    "subtitle": "Manage referees and fill open game slots",
```

In `apps/web/src/messages/de.json`, in the `refereeHub` object:

```json
    "title": "Schiedsrichter",
    "subtitle": "Schiedsrichter verwalten und offene Spiele besetzen",
```

- [ ] **Step 2: Update the top wrapper spacing.** In `referee-hub.tsx`, change `className="space-y-2"` to `className="space-y-6"`:

```tsx
  return (
    <div className="space-y-6">
      <HubHeader />
      {state.tab === "open-slots" ? <OpenSlotsTab /> : <RefereesTab />}
    </div>
  );
```

- [ ] **Step 3: Rewrite `hub-header.tsx` to use `PageHeader`.** Replace the whole component body with:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl, type HubTab } from "./use-referee-hub-url";
import { PageHeader } from "@/components/admin/shared/page-header";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";

const TABS = ["open-slots", "referees"] as const satisfies HubTab[];

export function HubHeader() {
  const t = useTranslations("refereeHub");
  const { state, update } = useRefereeHubUrl();

  return (
    <PageHeader title={t("title")} subtitle={t("subtitle")}>
      <Tabs value={state.tab} onValueChange={(v) => update({ tab: v as HubTab })}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab === "open-slots" ? "openSlots" : "referees"}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </PageHeader>
  );
}
```

(`PageHeader` renders `children` in a `flex items-center gap-2` row beneath the title — the tab switcher sits there, no `border-b`.)

- [ ] **Step 4: Run the hub tests (if any) and the i18n integrity check.**

Run: `pnpm --filter @dragons/web test -- referee-hub hub-header`
Expected: PASS or "no test files" for these names (there is no `hub-header.test`; that is fine).

Run: `pnpm --filter @dragons/web test -- messages`
Expected: PASS if a message-parity test exists; otherwise "no test files" — fine.

- [ ] **Step 5: Typecheck web.**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/components/admin/referee-hub/referee-hub.tsx apps/web/src/components/admin/referee-hub/hub-header.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "refactor(web): referee hub uses PageHeader + standard spacing"
```

---

### Task 4: Referees master-detail — tonal surfaces

Tonal scheme: outer grid uses a `gap-px bg-border/15` ghost separator (the design-approved `bg-border/15` line — NOT a `border`) with `bg-card` cells; the list's controls header is a `bg-surface-low` zone; KPI cards lift with `bg-card`; the scrollable list is `bg-card`; selected rows keep the current strong fill.

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/referees-tab.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx`
- Test: `apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx`, `referee-detail.test.tsx`

- [ ] **Step 1: `referees-tab.tsx` — replace the bordered grid.** Change the outer container and drop the `border-r`:

```tsx
  return (
    <div className="grid grid-cols-[minmax(320px,1fr)_2fr] gap-px bg-border/15 rounded-md overflow-hidden min-h-[600px]">
      <div className="bg-surface-low">
        <RefereeList
          selectedId={state.refereeId}
          onSelect={(id) => update({ refereeId: id })}
        />
      </div>
      <div className="bg-card">
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
```

- [ ] **Step 2: `referee-list.tsx` — collapse the three bordered zones into one surface-low controls header + a card list.** Replace the returned JSX (lines 70-139) with:

```tsx
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-3 bg-surface-low">
        <div className="flex gap-2">
          <Button
            variant={state.scope === "own" ? "default" : "outline"}
            size="sm"
            onClick={() => update({ scope: "own" })}
          >
            {t("scope.own", { n: String(counts?.own ?? "") })}
          </Button>
          <Button
            variant={state.scope === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => update({ scope: "all" })}
          >
            {t("scope.all", { n: String(counts?.all ?? "") })}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Kpi label={t("kpi.ownClubRefs")} value={counts?.own ?? 0} />
          <Kpi label={t("kpi.avgMatches")} value={avg} />
        </div>

        <div className="flex gap-2">
          <Input
            value={searchLocal}
            onChange={(e) => setSearchLocal(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
          <Select value={state.sort} onValueChange={(v) => update({ sort: v as never })}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t("sort.name")}</SelectItem>
              <SelectItem value="workloadDesc">{t("sort.workloadDesc")}</SelectItem>
              <SelectItem value="workloadAsc">{t("sort.workloadAsc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-card">
        {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>}
        {items.map((r) => (
          <div
            key={r.id}
            className={cn(
              "grid grid-cols-[1fr_36px_44px] items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-high",
              selectedId === r.id && "bg-primary text-primary-foreground hover:bg-primary",
            )}
            onClick={() => onSelect(r.id)}
            data-selected={selectedId === r.id}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{r.lastName}, {r.firstName}</div>
              <div className="text-xs opacity-70 truncate">Lic {r.licenseNumber ?? "—"}</div>
            </div>
            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                aria-label={t("columns.own")}
                checked={r.isOwnClub}
                onCheckedChange={(checked) => { void toggleOwnClub(r, checked === true); }}
              />
            </div>
            <div className="text-sm text-center tabular-nums">{r.matchCount}</div>
          </div>
        ))}
      </div>
    </div>
  );
```

- [ ] **Step 3: `referee-list.tsx` — conform the `Kpi` helper** (lines 142-149). Replace with:

```tsx
function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-card p-2 text-center">
      <div className="font-display text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: `referee-detail.tsx` — drop the header border, use display heading.** Change the header block (lines 28-34):

```tsx
      <div className="p-4 flex justify-between items-start">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold truncate">{ref.lastName}, {ref.firstName}</h2>
          <div className="text-xs text-muted-foreground">Lic {ref.licenseNumber ?? "—"} · API {ref.apiId}</div>
        </div>
        {ref.isOwnClub && <Badge variant="secondary">{t("ownClubBadge")}</Badge>}
      </div>
```

- [ ] **Step 5: Run the affected component tests.**

Run: `pnpm --filter @dragons/web test -- referee-list referee-detail`
Expected: PASS. If a test queries a removed class (e.g. `border-b`) or the old `text-xl font-semibold`, update that single assertion to the new class; do not change test intent.

- [ ] **Step 6: Typecheck web.**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/components/admin/referee-hub/referees/
git commit -m "refactor(web): tonal surfaces + truncation in referees master-detail"
```

---

### Task 5: Open-slots — tonal surfaces

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/slots-filter-sidebar.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx`
- Test: `slots-filter-sidebar.test.tsx`, `open-games-list.test.tsx`

- [ ] **Step 1: `open-slots-tab.tsx` — ghost-gap grid, tonal cells.** Replace the container (lines 22-46):

```tsx
  return (
    <div className="grid grid-cols-[200px_320px_1fr] gap-px bg-border/15 rounded-md overflow-hidden min-h-[600px]">
      <SlotsFilterSidebar
        filters={state.filters}
        onChange={(patch) => update({ filters: { ...state.filters, ...patch } })}
        leagueOptions={leagueOptions}
      />
      <div className="bg-card">
        <OpenGamesList
          filters={state.filters}
          selectedGameId={state.gameId}
          onSelect={(gameId) => update({ gameId })}
        />
      </div>
      <div className="bg-card">
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
```

- [ ] **Step 2: `slots-filter-sidebar.tsx` — surface-low rail, no border-r, ghost-bordered date inputs.** Change the `<aside>` opening tag (line 53):

```tsx
    <aside className="flex flex-col gap-4 p-3 bg-surface-low text-sm">
```

Add `font-display` to each section label. There are four lines reading `className="text-xs uppercase tracking-wide text-muted-foreground mb-2"` (lines 55, 71, 88, 121); change each to:

```tsx
className="font-display text-xs uppercase tracking-wide text-muted-foreground mb-2"
```

Change both native date inputs (lines 107 and 114) from `className="border rounded px-2 py-1 text-xs"` to:

```tsx
className="border border-border/20 rounded-md px-2 py-1 text-xs bg-input"
```

- [ ] **Step 3: `open-games-list.tsx` — surface-low search zone, card list, no row borders.** Change the search header (line 89) from `className="p-3 border-b"` to:

```tsx
      <div className="p-3 bg-surface-low">
```

Change the row `<button>` className (lines 70-73) from:

```tsx
        className={cn(
          "w-full text-left px-3 py-2 border-b hover:bg-muted/50 transition-colors block",
          selected && "bg-primary text-primary-foreground hover:bg-primary",
        )}
```

to:

```tsx
        className={cn(
          "w-full text-left px-3 py-2 hover:bg-surface-high transition-colors block",
          selected && "bg-primary text-primary-foreground hover:bg-primary",
        )}
```

- [ ] **Step 4: Run the affected component tests.**

Run: `pnpm --filter @dragons/web test -- slots-filter-sidebar open-games-list`
Expected: PASS. Update only class-based assertions that referenced removed classes (`border-r`, `border-b`, `bg-muted/30`), keeping intent.

- [ ] **Step 5: Typecheck web.**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-slots-tab.tsx apps/web/src/components/admin/referee-hub/open-slots/slots-filter-sidebar.tsx apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx
git commit -m "refactor(web): tonal surfaces in referee open-slots panels"
```

---

### Task 6: Slot card — tonal surface + heat token

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx`
- Test: `apps/web/src/components/admin/referee-hub/open-slots/slot-card.test.tsx`

- [ ] **Step 1: Replace the bordered card + raw amber.** Change the root container (line 58) from `className="border rounded-md p-3 space-y-3"` to:

```tsx
    <div className="bg-surface-low rounded-md p-3 space-y-3">
```

Change the "open" status text (line 63) from `className="text-sm font-semibold text-amber-700 dark:text-amber-400"` to:

```tsx
            <div className="text-sm font-semibold text-heat">{t("slot.open")}</div>
```

- [ ] **Step 2: Run the slot-card tests.**

Run: `pnpm --filter @dragons/web test -- slot-card`
Expected: PASS. If a test asserts the `text-amber-700` class, update it to `text-heat`.

- [ ] **Step 3: Typecheck web.**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx
git commit -m "refactor(web): slot card uses tonal surface + heat token"
```

---

### Task 7: Full verification

- [ ] **Step 1: Lint, typecheck, and the full web + api + shared test suites.**

Run:
```bash
pnpm --filter @dragons/shared --filter @dragons/api --filter @dragons/web lint
pnpm --filter @dragons/shared --filter @dragons/api --filter @dragons/web typecheck
pnpm --filter @dragons/shared --filter @dragons/api --filter @dragons/web test
```
Expected: all PASS.

- [ ] **Step 2: Coverage for the touched packages (thresholds must not drop).**

Run: `pnpm --filter @dragons/web --filter @dragons/api --filter @dragons/shared coverage`
Expected: PASS — thresholds met.

- [ ] **Step 3: Manual visual check (verify skill).** Start the app (`pnpm dev`), sign in as a superadmin, open `/admin/referees`. Confirm:
  - The page header matches other admin pages (display font, uppercase, subtitle).
  - The open-slots/referees tab switch sits under the header with no hard divider line.
  - Loading games no longer returns 403 — the open-games list and referee list populate.
  - Long referee names truncate rather than wrap/overflow.
  - Columns read as tonal panels (no heavy 1px borders), selection still clearly highlighted.

- [ ] **Step 4: Final review.** Use `superpowers:requesting-code-review` against the merge-base, then `superpowers:finishing-a-development-branch` to open the PR.

---

## Self-review notes

- **Spec coverage:** Part A Task 1-2 cover the `satisfiesRole` predicate, both middleware call sites, the behavior matrix, and both test layers. Part B Tasks 3-6 cover every file and bullet in the spec's "Changes per file" (PageHeader+spacing → T3; no-line/tonal + truncate + typography + KPI → T4/T5; slot-card heat → T6); Task 7 covers verification + coverage guard.
- **Type consistency:** `satisfiesRole(user, role: RoleName)` signature matches its use in both middlewares; the import swap removes `hasRole` from `middleware/rbac.ts` so no dangling reference remains.
- **No new behavior in Part B:** styling-only; the guard is "existing tests stay green, update only changed class assertions."
