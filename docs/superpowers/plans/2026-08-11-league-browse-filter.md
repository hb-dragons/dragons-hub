# League Browse Vorabliga Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hardcoded `vorabligaOnly: true` league-browse filter into a visible switch, defaulting on in the season wizard and off in the manage-leagues dialog, so committed (no-longer-vorabliga) leagues become selectable mid-season.

**Architecture:** `LeaguePicker` gains a controlled `vorabligaOnly` prop pair beside the existing `ownClubOnly` pair and stays presentational. Each call site owns the state and its default: `season-wizard.tsx` keeps `true` (onboarding browses preliminary leagues), `manage-leagues-dialog.tsx` flips to `false` (mid-season leagues are committed, which is the bug being fixed). No API, contract, or route changes — `browseLeaguesQuerySchema.vorabligaOnly` is already optional and the server already treats a falsy value as "no filter".

**Tech Stack:** Next.js 16 client components, next-intl, Radix Switch via `@dragons/ui`, Vitest + Testing Library (happy-dom).

**Spec:** `docs/superpowers/specs/2026-08-11-league-browse-filter-design.md`

## Global Constraints

- No changes under `apps/api`, `packages/contracts`, or `packages/api-client` — the wire contract already supports this (`packages/contracts/src/season.ts:16-25`). No `AGENTS.md` endpoint-table row, no `docs-drift.test.ts` churn.
- Sending `vorabligaOnly: false` over the wire is safe and intentional: `buildQueryString` (`packages/api-client/src/query-string.ts:4-7`) drops only `undefined`, the contract's `optionalBoolFromQuery` parses the string `"false"` to boolean `false`, and `browseLeagues` (`apps/api/src/services/admin/league-discovery.service.ts:45-47`) applies no tier filter for any falsy value.
- Every new i18n key goes into **both** `apps/web/src/messages/en.json` and `apps/web/src/messages/de.json`; `pnpm check:i18n` fails otherwise.
- The wizard's initial browse must keep sending `{ vorabligaOnly: true, ownClubOnly: true }` — the existing test `season-wizard.test.tsx:71-81` pins this and must stay passing, unchanged.
- `LeaguePicker` stays presentational: it owns no filter state, only props and callbacks.
- Coverage thresholds in `apps/web/vitest.config.ts` are a ratchet — never lower them. These tasks only add tests.
- Commits are authored solely by the human developer — no `Co-Authored-By` or other AI-credit trailers.
- Run tests with `pnpm --filter @dragons/web exec vitest run <path>` (no `--` before flags; pnpm drops what follows it).

---

### Task 1: `LeaguePicker` — second switch for the vorabliga filter

**Files:**
- Modify: `apps/web/src/components/admin/seasons/league-picker.tsx`
- Modify: `apps/web/src/messages/en.json` (after the `"ownClubOnly"` line, ~989)
- Modify: `apps/web/src/messages/de.json` (after the `"ownClubOnly"` line, ~989)
- Modify: `apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx:146-147` (inert props, replaced in Task 3)
- Modify: `apps/web/src/components/admin/seasons/season-wizard.tsx:409-410` (inert props, replaced in Task 2)
- Test: `apps/web/src/components/admin/seasons/league-picker.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `LeaguePickerProps` gains two **required** props — `vorabligaOnly: boolean` and `onVorabligaOnlyChange: (v: boolean) => void` — and the i18n key `settings.seasons.wizard.vorabligaOnly`, labelling a `Switch` with `id="vorabliga-only"`. Tasks 2 and 3 rely on all three.

Because the props are required, this task also touches both call sites with hardcoded values that reproduce today's behavior exactly (`vorabligaOnly` on, toggle a no-op). Tasks 2 and 3 replace those literals with real state. The intermediate state is honest: the switch shows "on" and the list really is filtered.

- [ ] **Step 1: Write the failing test**

In `league-picker.test.tsx`, first extend `renderPicker`'s defaults (the new props are required, so every existing test needs them supplied):

```tsx
function renderPicker(props: Partial<React.ComponentProps<typeof LeaguePicker>> = {}) {
  const onToggle = vi.fn();
  render(
    <LeaguePicker
      leagues={LEAGUES}
      selected={new Set<number>()}
      onToggle={onToggle}
      filter=""
      onFilterChange={() => {}}
      ownClubOnly
      onOwnClubOnlyChange={() => {}}
      vorabligaOnly
      onVorabligaOnlyChange={() => {}}
      loading={false}
      {...props}
    />,
  );
  return { onToggle };
}
```

Then add inside the `describe("LeaguePicker", ...)` block:

```tsx
  it("renders the vorabliga switch and reports toggles", () => {
    const onVorabligaOnlyChange = vi.fn();
    renderPicker({ onVorabligaOnlyChange });
    const sw = screen.getByLabelText("settings.seasons.wizard.vorabligaOnly");
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    expect(onVorabligaOnlyChange).toHaveBeenCalledWith(false);
  });
```

(`getByLabelText` works through the `htmlFor`/`id` pairing, same as the existing own-club switch. Radix `Switch` renders `role="switch"` with `aria-checked`, which `toBeChecked` reads.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/league-picker.test.tsx`
Expected: FAIL — `getByLabelText("settings.seasons.wizard.vorabligaOnly")` finds nothing.

- [ ] **Step 3: Implement**

In `league-picker.tsx`, add the props to the interface and destructuring:

```tsx
export interface LeaguePickerProps {
  leagues: BrowsableLeague[];
  selected: Set<number>;
  onToggle: (ligaId: number, checked: boolean) => void;
  filter: string;
  onFilterChange: (v: string) => void;
  ownClubOnly: boolean;
  onOwnClubOnlyChange: (v: boolean) => void;
  vorabligaOnly: boolean;
  onVorabligaOnlyChange: (v: boolean) => void;
  loading: boolean;
}
```

Replace the single switch block (lines 45-55) with a two-switch row:

```tsx
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Switch
            id="own-club-only"
            checked={ownClubOnly}
            disabled={loading}
            onCheckedChange={onOwnClubOnlyChange}
          />
          <label htmlFor="own-club-only" className="cursor-pointer">
            {t("settings.seasons.wizard.ownClubOnly")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="vorabliga-only"
            checked={vorabligaOnly}
            disabled={loading}
            onCheckedChange={onVorabligaOnlyChange}
          />
          <label htmlFor="vorabliga-only" className="cursor-pointer">
            {t("settings.seasons.wizard.vorabligaOnly")}
          </label>
        </div>
      </div>
```

Add the key directly after `"ownClubOnly"` in **both** message files:

`en.json` (inside `settings.seasons.wizard`):
```json
        "vorabligaOnly": "Preliminary (Vorabliga) leagues only",
```

`de.json` (same position):
```json
        "vorabligaOnly": "Nur vorläufige Ligen (Vorabliga)",
```

Wire the two call sites with today's behavior so the workspace compiles:

`manage-leagues-dialog.tsx` — the `<LeaguePicker …>` element gains, after `onOwnClubOnlyChange={toggleOwnClubOnly}`:
```tsx
          vorabligaOnly
          onVorabligaOnlyChange={() => {}}
```

`season-wizard.tsx` — same two lines after its `onOwnClubOnlyChange={toggleOwnClubOnly}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/ && pnpm --filter @dragons/web typecheck && pnpm check:i18n`
Expected: all four seasons suites PASS (the dialog and wizard suites prove the inert wiring changed nothing), typecheck clean, i18n check clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/seasons/league-picker.tsx apps/web/src/components/admin/seasons/league-picker.test.tsx apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx apps/web/src/components/admin/seasons/season-wizard.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add a vorabliga switch to the league picker"
```

---

### Task 2: Season wizard — vorabliga filter stays on by default, becomes overridable

**Files:**
- Modify: `apps/web/src/components/admin/seasons/season-wizard.tsx`
- Test: `apps/web/src/components/admin/seasons/season-wizard.test.tsx`

**Interfaces:**
- Consumes: `LeaguePicker`'s `vorabligaOnly` / `onVorabligaOnlyChange` props and the `settings.seasons.wizard.vorabligaOnly` label (Task 1).
- Produces: nothing other tasks rely on.

**Context:** The wizard's browse call is `season-wizard.tsx:159`. State lives beside `ownClubOnly` (line 80); `reset()` is at line 131; the club-filter toggle handler `toggleOwnClubOnly` (line 173) is the pattern to copy. Task 1 left inert `vorabligaOnly` / `onVorabligaOnlyChange={() => {}}` props on the `<LeaguePicker>` at ~line 409.

- [ ] **Step 1: Write the failing test**

Add to `season-wizard.test.tsx`, after the existing `"re-browses without the club filter when the toggle is switched off"` test (line 83-91):

```tsx
  it("re-browses with the vorabliga filter off when its switch is flipped", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("settings.seasons.wizard.vorabligaOnly"));
    await waitFor(() =>
      expect(browse).toHaveBeenLastCalledWith({ vorabligaOnly: false, ownClubOnly: true }),
    );
  });
```

The spec's "SeasonWizard still requests with `vorabligaOnly: true` on open" requirement is already pinned by the existing test at line 71-81 — leave it untouched.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/season-wizard.test.tsx`
Expected: FAIL — the switch's callback is Task 1's no-op, so `browse` is never called a second time and `toHaveBeenLastCalledWith` still sees `{ vorabligaOnly: true, ownClubOnly: true }`.

- [ ] **Step 3: Implement**

In `season-wizard.tsx`, add state directly under the `ownClubOnly` state (line 80):

```tsx
  // Vorabliga-only matches onboarding: a new season's leagues are usually
  // still preliminary. The switch widens the browse to committed leagues too.
  const [vorabligaOnly, setVorabligaOnly] = useState(true);
```

In `reset()`, after `setOwnClubOnly(true);`:

```tsx
    setVorabligaOnly(true);
```

Change `loadLeagues` to thread both filters (and reword its comment, which currently presents the vorabliga filter as unconditional):

```tsx
  // Browse the upcoming season's leagues from the federation. By default only
  // the vorabligas plus the top tiers (Regionalliga) that are never flagged
  // vorabliga; the switch widens this to every league. Nothing is persisted
  // yet — the season does not exist until the user confirms.
  async function loadLeagues(clubOnly = ownClubOnly, vorabOnly = vorabligaOnly) {
    setStep("select");
    setLoadingLeagues(true);
    try {
      const found = await api.seasons.browse({ vorabligaOnly: vorabOnly, ownClubOnly: clubOnly });
```

(The rest of `loadLeagues` and the existing `toggleOwnClubOnly` stay as they are — `loadLeagues(v)` still picks up the current `vorabligaOnly` through the default parameter.)

Add the toggle handler after `toggleOwnClubOnly`:

```tsx
  function toggleVorabligaOnly(v: boolean) {
    setVorabligaOnly(v);
    void loadLeagues(ownClubOnly, v);
  }
```

Replace Task 1's inert props on the `<LeaguePicker>`:

```tsx
              vorabligaOnly={vorabligaOnly}
              onVorabligaOnlyChange={toggleVorabligaOnly}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/season-wizard.test.tsx && pnpm --filter @dragons/web typecheck`
Expected: PASS, including the untouched line-71 test proving the default is still `vorabligaOnly: true`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/seasons/season-wizard.tsx apps/web/src/components/admin/seasons/season-wizard.test.tsx
git commit -m "feat(web): make the wizard's vorabliga filter toggleable"
```

---

### Task 3: Manage-leagues dialog — default the vorabliga filter off

**Files:**
- Modify: `apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx`
- Test: `apps/web/src/components/admin/seasons/manage-leagues-dialog.test.tsx`

**Interfaces:**
- Consumes: `LeaguePicker`'s `vorabligaOnly` / `onVorabligaOnlyChange` props and the `settings.seasons.wizard.vorabligaOnly` label (Task 1).
- Produces: nothing other tasks rely on.

**Context:** This is the user-visible fix — the dialog stops hiding leagues whose `vorabliga` flag the federation has cleared. The hardcoded literal is `manage-leagues-dialog.tsx:51`; state lives at line 35; the open-effect that resets filters is lines 83-90; `toggleOwnClubOnly` (line 92) is the pattern to copy. Task 1 left inert props on the `<LeaguePicker>` at ~line 146. No existing dialog test asserts `discover`'s arguments, so nothing needs rewriting — the new test adds the assertion.

- [ ] **Step 1: Write the failing test**

Add to `manage-leagues-dialog.test.tsx` inside the `describe` block:

```tsx
  it("browses without the vorabliga filter on open and re-requests when it is switched on", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Herren 2");
    // Mid-season the missing leagues are exactly the ones the federation no
    // longer flags vorabliga, so the dialog must not filter by default.
    expect(discover).toHaveBeenCalledWith(9, { vorabligaOnly: false, ownClubOnly: true });
    fireEvent.click(screen.getByLabelText("settings.seasons.wizard.vorabligaOnly"));
    await waitFor(() =>
      expect(discover).toHaveBeenLastCalledWith(9, { vorabligaOnly: true, ownClubOnly: true }),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/manage-leagues-dialog.test.tsx`
Expected: FAIL — the dialog still sends `{ vorabligaOnly: true, ownClubOnly: true }` on open.

- [ ] **Step 3: Implement**

In `manage-leagues-dialog.tsx`, add state directly under the `ownClubOnly` state (line 35):

```tsx
  // Off by default: mid-season the leagues being added are committed ones,
  // and the federation clears their `vorabliga` flag once they are.
  const [vorabligaOnly, setVorabligaOnly] = useState(false);
```

Thread the filter through `load` and replace the line-51 literal:

```tsx
  async function load(clubOnly = ownClubOnly, vorabOnly = vorabligaOnly, seed = false) {
    setLoading(true);
    try {
      const [tracked, candidates] = await Promise.all([
        api.seasons.getLeagues(seasonId),
        api.seasons.discover(seasonId, { vorabligaOnly: vorabOnly, ownClubOnly: clubOnly }),
      ]);
```

Update the open-effect to reset the new state and match the new signature:

```tsx
  useEffect(() => {
    if (open) {
      setFilter("");
      setOwnClubOnly(true);
      setVorabligaOnly(false);
      void load(true, false, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seasonId]);
```

Add the toggle handler after `toggleOwnClubOnly` (which itself stays `void load(v)` — the default parameter reads the current `vorabligaOnly`):

```tsx
  function toggleVorabligaOnly(v: boolean) {
    setVorabligaOnly(v);
    void load(ownClubOnly, v);
  }
```

Replace Task 1's inert props on the `<LeaguePicker>`:

```tsx
          vorabligaOnly={vorabligaOnly}
          onVorabligaOnlyChange={toggleVorabligaOnly}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/ && pnpm --filter @dragons/web typecheck`
Expected: PASS across all four seasons suites — including the existing merge behavior test ("seeds the checked set…"): a tracked league missing from the now-unfiltered candidates is still injected by the merge loop at lines 57-71, which this change does not touch.

- [ ] **Step 5: Run the full web suite**

Run: `pnpm --filter @dragons/web test`
Expected: PASS. This is the behavior-changing task, so check the whole package, not just the seasons folder.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx apps/web/src/components/admin/seasons/manage-leagues-dialog.test.tsx
git commit -m "fix(web): stop hiding committed leagues in the manage-leagues dialog"
```

---

## After merge — Phase 2 gate (manual check, not a task)

From the spec: open the manage-leagues dialog with **both** switches off and look for the nine league numbers `4102 4039 4015 41010 42080 44012 45010 46011 2007`.

- All nine appear → done; the manual-add-by-Liganr idea stays dropped.
- The `4xxxx` family is still missing → the next suspect is `verbandIds: number[] = [7]` at `apps/api/src/services/sync/sdk-client.ts:348` (leagues run by other regional associations are invisible regardless of filters). That widening is a separate follow-up, decided from this observation.
