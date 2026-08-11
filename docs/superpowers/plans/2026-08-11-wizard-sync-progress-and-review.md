# Wizard Sync Progress and Review Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the new-season onboarding wizard a streamed sync log in step 4 and a real review summary in step 5, closing the last two gaps against the seasons design spec.

**Architecture:** A new read-only endpoint `GET /admin/seasons/:id/summary` returns league and game counts from the database plus a placeholder-slot count read live from the federation. The wizard captures the `syncRunId` it currently discards, renders the existing `SyncLiveLogs` component against it, waits for the run to reach a terminal status before trusting any counts, then renders the summary.

**Tech Stack:** Hono + Zod (`hono-openapi` validator), Drizzle ORM, Vitest v4 against real PGlite for API tests, Next.js App Router + SWR + next-intl for web, Testing Library with happy-dom for web tests.

**Spec:** `docs/superpowers/specs/2026-08-11-wizard-sync-progress-and-review-design.md`

## Global Constraints

- **Never lower a coverage threshold.** Read the live numbers in each package's `vitest.config.ts`. `apps/api` holds the high bar.
- **No `any`.** Use proper typing or `unknown`. `consistent-type-imports` is an error — use `import type` for type-only imports.
- **API tests run against real PGlite.** Never mock `drizzle-orm` or `@dragons/db/schema`. Use `setupTestDb` / `resetTestDb` / `closeTestDb` from `apps/api/src/test/setup-test-db.ts`.
- **`leagues.seasonRefId` is NOT NULL.** Any fixture seeding a league needs a season. Use `seedActiveSeason(ctx)` from `apps/api/src/test/seed-season.ts` — **once per test**, since a partial unique index allows only one active season.
- **The active-season id is cached for 60s across tests.** Any test touching a season-scoped read must call `invalidateActiveSeasonCache()` in `beforeEach`.
- **Do not pair Testing Library's `waitFor` with `vi.useFakeTimers()`.** `waitFor` only pumps jest fake timers, so under vitest it hangs to the suite timeout. Advance inside `act`: `await act(async () => { await vi.advanceTimersByTimeAsync(800); })`.
- **`docs-drift.test.ts` enforces `AGENTS.md`** against the real Hono route tree in both directions. Add the endpoint row in the same commit as the route.
- **Every route group's request contract lives in `@dragons/contracts`.** Never redeclare a schema in a route or the client.
- **Writing style:** no banned phrases (`pnpm check:ai-slop`). Direct, specific prose in comments and docs.
- **Commits carry no `Co-Authored-By` or AI-credit trailer.**
- **Package-scoped iteration is much faster than the full suite.** Note `pnpm --filter X test -- --flag` silently drops the flag — omit the `--`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/shared/src/seasons.ts` | Add `SeasonSummary` DTO | 1 |
| `apps/api/src/services/admin/season.service.ts` | Add `getSeasonSummary` | 1 |
| `apps/api/src/services/admin/season.service.test.ts` | Cover counts, scoping, SDK failure | 1 |
| `apps/api/src/routes/admin/season.routes.ts` | Add the `summary` route | 2 |
| `apps/api/src/routes/admin/season.routes.test.ts` | Cover auth + 404 + success | 2 |
| `packages/api-client/src/endpoints/seasons.ts` | Add `summary(id)` | 2 |
| `AGENTS.md` | Endpoint table row | 2 |
| `apps/web/src/components/admin/seasons/season-wizard.tsx` | Steps 4 and 5, close guard | 3, 4 |
| `apps/web/src/components/admin/seasons/season-wizard.test.tsx` | Wizard behaviour | 3, 4 |
| `apps/web/messages/en.json`, `apps/web/messages/de.json` | New `settings.seasons.wizard.*` keys | 4 |

---

### Task 1: `getSeasonSummary` service and `SeasonSummary` type

**Files:**
- Modify: `packages/shared/src/seasons.ts`
- Modify: `apps/api/src/services/admin/season.service.ts`
- Test: `apps/api/src/services/admin/season.service.test.ts`

**Interfaces:**
- Consumes: `seedActiveSeason(ctx, name?)` from `apps/api/src/test/seed-season.ts`; `sdkClient.getSpielplan(competitionId: number): Promise<SdkSpielplanMatch[]>` from `../sync/sdk-client`.
- Produces: `getSeasonSummary(seasonId: number): Promise<SeasonSummary>` where `SeasonSummary = { leagueCount: number; gameCount: number; placeholderSlots: number | null }`.

**Context:** Placeholder fixtures arrive from the federation with `teamPermanentId: 0`. `data-fetcher.ts` drops those teams and `matches.sync.ts` skips the whole match, so neither `teams` nor `matches` records the slot — the count must come from the live Spielplan. `leagueCount` and `gameCount` are plain database reads.

- [ ] **Step 1: Add the DTO**

In `packages/shared/src/seasons.ts`, after `SetSeasonLeaguesResult`:

```ts
export interface SeasonSummary {
  leagueCount: number;
  gameCount: number;
  /**
   * Fixture slots the federation has not yet assigned a team to. `null` when
   * the federation could not be read — a partial count is indistinguishable
   * from a genuinely low one, so we report nothing rather than a wrong number.
   */
  placeholderSlots: number | null;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/src/services/admin/season.service.test.ts`. Match the file's existing setup (it already has `setupTestDb` / `resetTestDb` / `closeTestDb` wiring and mocks `../sync/sdk-client`; reuse them rather than adding a second mock factory).

```ts
describe("getSeasonSummary", () => {
  it("counts the season's leagues and games, and its unassigned fixture slots", async () => {
    const seasonId = await seedActiveSeason(ctx);
    const [league] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 501,
        ligaNr: 1,
        name: "Oberliga",
        seasonId: 0,
        seasonName: "",
        seasonRefId: seasonId,
        isTracked: true,
      })
      .returning({ id: leagues.id });

    await ctx.db.insert(teams).values([
      { apiTeamPermanentId: 11, seasonTeamId: 1, teamCompetitionId: 1, name: "A", clubId: 1 },
      { apiTeamPermanentId: 22, seasonTeamId: 2, teamCompetitionId: 2, name: "B", clubId: 2 },
    ]);
    await ctx.db.insert(matches).values({
      apiMatchId: 9001,
      leagueId: league!.id,
      homeTeamApiId: 11,
      guestTeamApiId: 22,
      kickoffAt: new Date("2026-09-01T18:00:00Z"),
    });

    // Two slots unassigned: one guest, one home.
    getSpielplan.mockResolvedValue([
      { matchId: 9001, homeTeam: { teamPermanentId: 11 }, guestTeam: { teamPermanentId: 22 } },
      { matchId: 9002, homeTeam: { teamPermanentId: 11 }, guestTeam: { teamPermanentId: 0 } },
      { matchId: 9003, homeTeam: { teamPermanentId: 0 }, guestTeam: { teamPermanentId: 22 } },
    ]);

    const summary = await getSeasonSummary(seasonId);

    expect(summary).toEqual({ leagueCount: 1, gameCount: 1, placeholderSlots: 2 });
  });

  it("ignores leagues the season does not track", async () => {
    const seasonId = await seedActiveSeason(ctx);
    await ctx.db.insert(leagues).values({
      apiLigaId: 502,
      ligaNr: 2,
      name: "Untracked",
      seasonId: 0,
      seasonName: "",
      seasonRefId: seasonId,
      isTracked: false,
    });
    getSpielplan.mockResolvedValue([
      { matchId: 1, homeTeam: { teamPermanentId: 0 }, guestTeam: { teamPermanentId: 0 } },
    ]);

    const summary = await getSeasonSummary(seasonId);

    // The league still counts toward leagueCount; only the placeholder scan is
    // tracked-only, so an untracked league contributes no slots.
    expect(summary.placeholderSlots).toBe(0);
    expect(getSpielplan).not.toHaveBeenCalled();
  });

  it("reports placeholderSlots as null when the federation cannot be read", async () => {
    const seasonId = await seedActiveSeason(ctx);
    await ctx.db.insert(leagues).values({
      apiLigaId: 503,
      ligaNr: 3,
      name: "Oberliga",
      seasonId: 0,
      seasonName: "",
      seasonRefId: seasonId,
      isTracked: true,
    });
    getSpielplan.mockRejectedValue(new Error("federation down"));

    const summary = await getSeasonSummary(seasonId);

    expect(summary.placeholderSlots).toBeNull();
    // The database-backed counts survive a federation outage.
    expect(summary.leagueCount).toBe(1);
    expect(summary.gameCount).toBe(0);
  });

  it("counts zero for a season with no leagues", async () => {
    const seasonId = await seedActiveSeason(ctx);

    const summary = await getSeasonSummary(seasonId);

    expect(summary).toEqual({ leagueCount: 0, gameCount: 0, placeholderSlots: 0 });
  });
});
```

Add `getSeasonSummary` to the file's existing import from `./season.service`, and `teams` / `matches` to its `@dragons/db/schema` import if absent. `getSpielplan` is the `vi.hoisted` mock fn already wired into the `../sync/sdk-client` mock — extend that factory with `getSpielplan` if it does not yet expose it.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/api exec vitest run src/services/admin/season.service.test.ts`
Expected: FAIL — `getSeasonSummary is not a function` (or an import error).

- [ ] **Step 4: Implement `getSeasonSummary`**

In `apps/api/src/services/admin/season.service.ts`. Add `and`, `isNull` are not needed; extend the existing `drizzle-orm` import with `inArray` only if you use it (the version below does not).

```ts
/**
 * Counts for the wizard's review step.
 *
 * `leagueCount` / `gameCount` are database reads. `placeholderSlots` cannot be:
 * a fixture whose teams the federation has not yet assigned arrives with
 * `teamPermanentId: 0`, `data-fetcher` drops those teams, and `matches.sync`
 * then skips the whole match because the team FKs are non-deferrable (#133).
 * Neither table records the slot, so we re-read the schedule to count them —
 * which is also what explains `gameCount` trailing the published schedule.
 */
export async function getSeasonSummary(seasonId: number): Promise<SeasonSummary> {
  const [counts] = await getDb()
    .select({
      leagueCount: sql<number>`count(distinct ${leagues.id})::int`,
      gameCount: sql<number>`count(distinct ${matches.id})::int`,
    })
    .from(seasons)
    .leftJoin(leagues, eq(leagues.seasonRefId, seasons.id))
    .leftJoin(matches, eq(matches.leagueId, leagues.id))
    .where(eq(seasons.id, seasonId))
    .groupBy(seasons.id);

  const tracked = await getDb()
    .select({ apiLigaId: leagues.apiLigaId })
    .from(leagues)
    .where(and(eq(leagues.seasonRefId, seasonId), eq(leagues.isTracked, true)));

  let placeholderSlots: number | null = 0;
  for (const league of tracked) {
    try {
      const schedule = await sdkClient.getSpielplan(league.apiLigaId);
      for (const match of schedule) {
        if (!match.homeTeam?.teamPermanentId) placeholderSlots += 1;
        if (!match.guestTeam?.teamPermanentId) placeholderSlots += 1;
      }
    } catch {
      // One unreadable league makes the whole count untrustworthy: a partial
      // total reads as a confidently low one. Report nothing instead.
      placeholderSlots = null;
      break;
    }
  }

  return {
    leagueCount: counts?.leagueCount ?? 0,
    gameCount: counts?.gameCount ?? 0,
    placeholderSlots,
  };
}
```

Add to the imports at the top of the file: `and` from `drizzle-orm`, `sdkClient` from `../sync/sdk-client`, and `SeasonSummary` to the `@dragons/shared` type import.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api exec vitest run src/services/admin/season.service.test.ts`
Expected: PASS, all four new tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/seasons.ts apps/api/src/services/admin/season.service.ts apps/api/src/services/admin/season.service.test.ts
git commit -m "feat(api): getSeasonSummary with federation-read placeholder slot count"
```

---

### Task 2: `GET /admin/seasons/:id/summary` route and client method

**Files:**
- Modify: `apps/api/src/routes/admin/season.routes.ts`
- Test: `apps/api/src/routes/admin/season.routes.test.ts`
- Modify: `packages/api-client/src/endpoints/seasons.ts`
- Modify: `AGENTS.md` (endpoint table, around line 548)

**Interfaces:**
- Consumes: `getSeasonSummary(seasonId)` from Task 1; the existing `seasonIdParamSchema` from `@dragons/contracts` (defined in `packages/contracts/src/season.ts`).
- Produces: `api.seasons.summary(id: number): Promise<SeasonSummary>`.

**Context:** No new contract schema — the endpoint takes no body and no query, so the existing `seasonIdParamSchema` covers it. The route sits behind `settingsUpdate`, matching every other season route.

- [ ] **Step 1: Write the failing route test**

Append to `apps/api/src/routes/admin/season.routes.test.ts`, following the file's existing app-construction and auth helpers.

```ts
describe("GET /admin/seasons/:id/summary", () => {
  it("returns the season's counts", async () => {
    const seasonId = await seedActiveSeason(ctx);

    const res = await request(`/admin/seasons/${seasonId}/summary`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      leagueCount: 0,
      gameCount: 0,
      placeholderSlots: 0,
    });
  });

  it("rejects a non-numeric id", async () => {
    const res = await request("/admin/seasons/not-a-number/summary");

    expect(res.status).toBe(400);
  });
});
```

Use whatever `request` / auth wrapper the surrounding tests already use — do not introduce a new one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api exec vitest run src/routes/admin/season.routes.test.ts`
Expected: FAIL — 404, because the route does not exist yet.

- [ ] **Step 3: Add the route**

In `apps/api/src/routes/admin/season.routes.ts`, after the `/seasons/:id/leagues` PUT handler. Add `getSeasonSummary` to the existing import from `../../services/admin/season.service`.

```ts
seasonRoutes.get(
  "/seasons/:id/summary",
  settingsUpdate,
  validator("param", seasonIdParamSchema, validationHook),
  describeRoute({
    description: "League, game and unassigned-slot counts for a season",
    tags: ["Seasons"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => c.json(await getSeasonSummary(c.req.valid("param").id)),
);
```

- [ ] **Step 4: Add the client method**

In `packages/api-client/src/endpoints/seasons.ts`, after `getLeagues`. Add `SeasonSummary` to the `@dragons/shared` type import.

```ts
    /** League, game and unassigned-slot counts, for the onboarding review. */
    summary(id: number): Promise<SeasonSummary> {
      return client.get(`/admin/seasons/${id}/summary`);
    },
```

- [ ] **Step 5: Add the AGENTS.md row**

In the seasons endpoint table, after the `PUT /admin/seasons/:id/leagues` row:

```markdown
| GET | `/admin/seasons/:id/summary` | League, game and unassigned-slot counts for a season |
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api exec vitest run src/routes/admin/season.routes.test.ts src/test/docs-drift.test.ts`
Expected: PASS. `docs-drift` confirms the route and the table agree in both directions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/season.routes.ts apps/api/src/routes/admin/season.routes.test.ts packages/api-client/src/endpoints/seasons.ts AGENTS.md
git commit -m "feat(api): GET /admin/seasons/:id/summary route + api-client method"
```

---

### Task 3: Wizard step 4 — streamed sync log, gated on a terminal run

**Files:**
- Modify: `apps/web/src/components/admin/seasons/season-wizard.tsx`
- Test: `apps/web/src/components/admin/seasons/season-wizard.test.tsx`

**Interfaces:**
- Consumes: `api.sync.trigger(): Promise<TriggerResponse>` where `TriggerResponse = { jobId: string; syncRunId: number; status: string; message: string }`; `api.sync.logs(query?): Promise<PaginatedResponse<SyncRun>>` where each `SyncRun` has `{ id: number; status: SyncStatus; ... }`; `<SyncLiveLogs syncRunId={number} onComplete={() => void} />` from `@/components/admin/sync/sync-live-logs`.
- Produces: wizard state `syncRunId`, and a `done` step reached only after the tracked run leaves `running`/`pending`.

**Context:** The SSE `complete` event can fire before the job starts processing — this is why the sync dashboard confirms separately via `SyncCompletionWatcher`, which polls the logs list until the run's status is neither `running` nor `pending`. The wizard lives outside `SyncRunProvider`, so it polls on its own. `confirm()` currently discards the trigger response at `season-wizard.tsx:113` and advances straight to `done`.

- [ ] **Step 1: Write the failing tests**

In `season-wizard.test.tsx`, first update the shared mock so `trigger` returns a run id and `api.sync.logs` exists:

```ts
const { browse, create, setLeagues, trigger, syncLogs, summary, toastError, toastSuccess } =
  vi.hoisted(() => ({
    browse: vi.fn(),
    create: vi.fn(),
    setLeagues: vi.fn(),
    trigger: vi.fn(),
    syncLogs: vi.fn(),
    summary: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  }));

vi.mock("@/lib/api", () => ({
  api: {
    seasons: { browse, create, setLeagues, summary, discover: vi.fn(), leagueTeams: vi.fn() },
    sync: { trigger, logs: syncLogs },
  },
}));

// The real component opens an EventSource; the wizard only needs its
// onComplete callback, so stand in a button that fires it on demand.
vi.mock("@/components/admin/sync/sync-live-logs", () => ({
  SyncLiveLogs: ({ syncRunId, onComplete }: { syncRunId: number; onComplete: () => void }) => (
    <button data-testid="live-logs" data-run-id={syncRunId} onClick={onComplete}>
      live
    </button>
  ),
}));
```

and extend `beforeEach`:

```ts
  trigger.mockResolvedValue({ jobId: "j1", syncRunId: 77, status: "queued", message: "" });
  syncLogs.mockResolvedValue({ items: [{ id: 77, status: "completed" }] });
  summary.mockResolvedValue({ leagueCount: 1, gameCount: 12, placeholderSlots: 0 });
```

Then add the tests:

```ts
  it("streams the triggered run's log instead of a bare spinner", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    const logs = await screen.findByTestId("live-logs");
    // The run id from trigger() reaches the log stream rather than being dropped.
    expect(logs).toHaveAttribute("data-run-id", "77");
  });

  it("stays on the sync step when the stream completes before the run does", async () => {
    // The SSE 'complete' event can arrive before the job starts processing.
    syncLogs.mockResolvedValue({ items: [{ id: 77, status: "running" }] });
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    fireEvent.click(await screen.findByTestId("live-logs"));

    await waitFor(() => expect(syncLogs).toHaveBeenCalled());
    expect(screen.queryByText("settings.seasons.wizard.close")).not.toBeInTheDocument();
    expect(summary).not.toHaveBeenCalled();
  });

  it("advances to the review once the run reaches a terminal status", async () => {
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    fireEvent.click(await screen.findByTestId("live-logs"));

    await screen.findByText("settings.seasons.wizard.close");
    expect(summary).toHaveBeenCalledWith(9);
  });

  it("still reaches the review when the sync could not be triggered", async () => {
    trigger.mockRejectedValue(new Error("queue down"));
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    // Season and leagues are saved; only the sync kick-off failed.
    await screen.findByText("settings.seasons.wizard.close");
    expect(toastError).toHaveBeenCalledWith("settings.seasons.wizard.syncFailed");
  });

  it("keeps the dialog shut while committing but releases it once the sync starts", async () => {
    const pending = deferred<{ tracked: number; untracked: number }>();
    setLeagues.mockReturnValue(pending.promise);
    const onOpenChange = vi.fn();
    render(<SeasonWizard open onOpenChange={onOpenChange} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));

    // Mid-commit: an interrupted commit would orphan the created season.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    pending.resolve({ tracked: 1, untracked: 0 });
    await screen.findByTestId("live-logs");

    // Syncing: the work is committed and the sync continues server-side, so the
    // admin must not be held in the modal for its whole duration.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
```

Note on that last test: it locks in behaviour this task *creates*, rather than
driving a separate change. Because `confirm()` now returns as soon as the run id
is stored, its `finally` clears `submitting` before the sync wait begins — so the
existing `if (submitting)` guard already covers exactly the commit window and
nothing more. No new flag is needed; the test exists so a later refactor cannot
silently re-trap the admin in the modal for a multi-minute sync.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/season-wizard.test.tsx`
Expected: FAIL — no `live-logs` element; the wizard jumps straight to `done`.

- [ ] **Step 3: Implement**

In `season-wizard.tsx`:

Add the import:

```tsx
import { SyncLiveLogs } from "@/components/admin/sync/sync-live-logs";
import type { SeasonSummary } from "@dragons/shared";
```

Add state beside `createdId`:

```tsx
  // The triggered run, so step 4 can stream its log. `null` means the sync was
  // never kicked off (the trigger call failed) — the review still renders.
  const [syncRunId, setSyncRunId] = useState<number | null>(null);
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
```

Reset both in `reset()`:

```tsx
    setSyncRunId(null);
    setSummary(null);
```

Replace the sync block inside `confirm()` (currently lines 111-120) with:

```tsx
      setStep("syncing");
      try {
        const run = await api.sync.trigger();
        if (!openRef.current) return;
        setSyncRunId(run.syncRunId);
        // Step 4 now owns the rest: it streams the run's log and advances once
        // the run is actually finished.
        return;
      } catch {
        // The season and its leagues are saved; only the sync kick-off failed.
        toast.error(t("settings.seasons.wizard.syncFailed"));
        await finishWithSummary(id);
      }
```

Add the completion helpers above `confirm()`:

```tsx
  // The SSE "complete" event can fire before the job has started processing, so
  // it is not proof the sync is done. Poll the run the way the sync dashboard's
  // SyncCompletionWatcher does — until its status is neither running nor
  // pending — before trusting any counts. The wizard lives outside
  // SyncRunProvider, so it cannot reuse that watcher.
  async function waitForRun(runId: number) {
    while (openRef.current) {
      const page = await api.sync.logs({ limit: 20, offset: 0 });
      const run = page.items.find((r) => r.id === runId);
      if (run && run.status !== "running" && run.status !== "pending") return;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  async function finishWithSummary(id: number) {
    try {
      const counts = await api.seasons.summary(id);
      if (!openRef.current) return;
      setSummary(counts);
    } catch {
      // Counts are the nice-to-have; the season exists either way.
      if (!openRef.current) return;
      setSummary(null);
    }
    await mutate(SWR_KEYS.seasons);
    if (openRef.current) setStep("done");
  }

  async function handleSyncStreamComplete() {
    if (createdId === null || syncRunId === null) return;
    await waitForRun(syncRunId);
    if (!openRef.current) return;
    await finishWithSummary(createdId);
  }
```

with the constant beside `type Step`:

```tsx
const POLL_INTERVAL_MS = 2000;
```

Replace the `step === "syncing"` block (currently lines 231-236):

```tsx
        {step === "syncing" && (
          syncRunId === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("settings.seasons.wizard.syncing")}
            </div>
          ) : (
            <SyncLiveLogs
              syncRunId={syncRunId}
              onComplete={() => { void handleSyncStreamComplete(); }}
            />
          )
        )}
```

Widen the dialog for this step by giving `DialogContent` a conditional class:

```tsx
        className={step === "syncing" ? "sm:max-w-3xl" : undefined}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/season-wizard.test.tsx`
Expected: PASS, all four new tests green plus the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/seasons/season-wizard.tsx apps/web/src/components/admin/seasons/season-wizard.test.tsx
git commit -m "feat(web): stream the sync log in the season wizard, gated on run completion"
```

---

### Task 4: Wizard step 5 — the review summary

**Files:**
- Modify: `apps/web/src/components/admin/seasons/season-wizard.tsx`
- Modify: `apps/web/messages/en.json`, `apps/web/messages/de.json`
- Test: `apps/web/src/components/admin/seasons/season-wizard.test.tsx`

**Interfaces:**
- Consumes: the `summary` state from Task 3 (`SeasonSummary | null`).
- Produces: the rendered review; no new exports.

**Context:** A non-zero `placeholderSlots` is the explanation for `gameCount` trailing the federation's published schedule, so it gets a sentence rather than a bare number. `null` means unreadable, not zero.

- [ ] **Step 1: Write the failing tests**

```ts
  it("reviews what the sync produced", async () => {
    summary.mockResolvedValue({ leagueCount: 3, gameCount: 42, placeholderSlots: 0 });
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    fireEvent.click(await screen.findByTestId("live-logs"));

    await screen.findByText("settings.seasons.wizard.reviewLeagues");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    // No unassigned slots, so the explanatory line stays out of the way.
    expect(
      screen.queryByText("settings.seasons.wizard.reviewPlaceholderHint"),
    ).not.toBeInTheDocument();
  });

  it("explains unassigned fixture slots when there are any", async () => {
    summary.mockResolvedValue({ leagueCount: 1, gameCount: 8, placeholderSlots: 4 });
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    fireEvent.click(await screen.findByTestId("live-logs"));

    await screen.findByText("settings.seasons.wizard.reviewPlaceholderHint");
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("marks the counts unavailable when the summary could not be read", async () => {
    summary.mockRejectedValue(new Error("api down"));
    render(<SeasonWizard open onOpenChange={() => {}} />);
    nameAndAdvance();
    await screen.findByText("Oberliga Herren Ost");
    fireEvent.click(screen.getByLabelText("Oberliga Herren Ost"));
    fireEvent.click(screen.getByText("settings.seasons.wizard.confirm"));
    fireEvent.click(await screen.findByTestId("live-logs"));

    await screen.findByText("settings.seasons.wizard.reviewUnavailable");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/season-wizard.test.tsx`
Expected: FAIL — the review keys are not rendered.

- [ ] **Step 3: Add the i18n keys**

In `apps/web/messages/en.json`, under `settings.seasons.wizard`:

```json
"reviewTitle": "Season ready",
"reviewLeagues": "Leagues tracked",
"reviewGames": "Games pulled",
"reviewPlaceholders": "Unassigned fixture slots",
"reviewPlaceholderHint": "The federation has not yet named both teams for these fixtures, so they are not imported yet. They arrive on a later sync once the teams are set.",
"reviewUnavailable": "Counts could not be loaded. The season and its leagues are saved.",
```

In `apps/web/messages/de.json`, the same keys:

```json
"reviewTitle": "Saison bereit",
"reviewLeagues": "Ligen übernommen",
"reviewGames": "Spiele geladen",
"reviewPlaceholders": "Offene Spielpaarungen",
"reviewPlaceholderHint": "Der Verband hat für diese Spiele noch nicht beide Mannschaften benannt, daher werden sie noch nicht importiert. Sie kommen mit einem späteren Sync dazu.",
"reviewUnavailable": "Zahlen konnten nicht geladen werden. Die Saison und ihre Ligen sind gespeichert.",
```

- [ ] **Step 4: Render the review**

Replace the `step === "done"` block in `season-wizard.tsx`:

```tsx
        {step === "done" && (
          <div className="space-y-4 py-2">
            {summary === null ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.seasons.wizard.reviewUnavailable")}
              </p>
            ) : (
              <div className="space-y-3">
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t("settings.seasons.wizard.reviewLeagues")}
                    </dt>
                    <dd className="text-2xl font-semibold">{summary.leagueCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("settings.seasons.wizard.reviewGames")}
                    </dt>
                    <dd className="text-2xl font-semibold">{summary.gameCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("settings.seasons.wizard.reviewPlaceholders")}
                    </dt>
                    <dd className="text-2xl font-semibold">
                      {summary.placeholderSlots ?? "—"}
                    </dd>
                  </div>
                </dl>
                {/* Unassigned slots are why the game count trails the published
                    schedule, so say so rather than leaving a bare number. */}
                {summary.placeholderSlots !== null && summary.placeholderSlots > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("settings.seasons.wizard.reviewPlaceholderHint")}
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>
                {t("settings.seasons.wizard.close")}
              </Button>
            </DialogFooter>
          </div>
        )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/season-wizard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify translations are complete**

Run: `pnpm check:i18n`
Expected: PASS — en and de agree on the new keys.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/admin/seasons/season-wizard.tsx apps/web/src/components/admin/seasons/season-wizard.test.tsx apps/web/messages/en.json apps/web/messages/de.json
git commit -m "feat(web): review summary on the season wizard's final step"
```

---

### Task 5: Full verification

**Files:** none — this task only runs gates.

- [ ] **Step 1: Run the type and lint gates**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS, 0 errors.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS across all 11 test packages.

- [ ] **Step 3: Run coverage**

Run: `pnpm coverage`
Expected: PASS. If a package now falls below its threshold, add tests — never lower the number.

- [ ] **Step 4: Run the build and the remaining guards**

Run: `pnpm build && pnpm check:i18n && pnpm knip`
Expected: PASS. `apps/site` printing "collection does not exist or is empty" is the CMS being unreachable without `CMS_URL`, not a failure.

Run: `pnpm check:ai-slop && pnpm check:skipped-tests && pnpm check:coverage-scripts && pnpm check:design-tokens`
Expected: PASS.

- [ ] **Step 5: Commit any fixes**

Only if the gates required changes:

```bash
git add -A
git commit -m "chore(seasons): satisfy the verification gates"
```
