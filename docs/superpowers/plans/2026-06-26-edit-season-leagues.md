# Edit an upcoming season's tracked leagues (add/remove + team preview) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator add and remove the leagues tracked by an *upcoming* season after it has been created, identifying the right league by expanding it to see its team roster.

**Architecture:** A new read-only endpoint lists a league's teams from the federation (`getTabelle`, fallback `getSpielplan`). The existing `PUT /admin/seasons/:id/leagues` reconcile is reused for add/remove. On the web, the wizard's league list is extracted into a shared `LeaguePicker` (with an expandable `LeagueRow` that lazy-loads teams), reused by a new `ManageLeaguesDialog` opened from each upcoming season row.

**Tech Stack:** Hono + hono-openapi (API), Drizzle (DB, untouched here), Zod (`@dragons/contracts`), `@dragons/api-client`, Next.js + SWR + next-intl + shadcn/Radix (web), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-26-edit-season-leagues-design.md`

## Global Constraints

- TDD: write the failing test first, watch it fail, implement, watch it pass, commit.
- Request schemas live ONLY in `@dragons/contracts`; routes validate with `validator(target, schema, validationHook)`; never redeclare a schema in a route or the client.
- No `any`. Strict TS, `verbatimModuleSyntax` → use `import type` for type-only imports.
- Coverage gates per package must stay green; `apps/api` is the high bar (90% branches / 95% funcs/lines/statements). Never lower a threshold.
- File naming: lowercase-with-hyphens; tests co-located as `*.test.ts(x)`.
- No `Co-Authored-By` / AI trailers in commits.
- No banned prose phrases in any `.md` (CI `check:ai-slop`).
- Federation `ligaId` (a.k.a. `apiLigaId` in the DB) is the external league id used by browse/discover/teams. The DB row id is separate — do not conflate.

---

## Task 1: Backend — `getLeagueTeams` service + shared types

**Files:**
- Modify: `packages/shared/src/leagues.ts` (add `LeagueTeam`, `LeagueTeamsResponse`)
- Modify: `packages/shared/src/index.ts:172-177` (export the two new types)
- Modify: `apps/api/src/services/admin/league-discovery.service.ts` (add `getLeagueTeams`)
- Test: `apps/api/src/services/admin/league-discovery.service.test.ts`

**Interfaces:**
- Produces: `getLeagueTeams(ligaId: number): Promise<LeagueTeamsResponse>` where
  `LeagueTeam = { teamPermanentId: number; name: string; clubId: number | null; isOwnClub: boolean }`
  and `LeagueTeamsResponse = { teams: LeagueTeam[] }`.
- Consumes: existing `sdkClient.getTabelle(ligaId): Promise<SdkTabelleEntry[]>`,
  `sdkClient.getSpielplan(ligaId): Promise<SdkSpielplanMatch[]>`, and `getClubConfig()` (already
  imported in this service).

- [ ] **Step 1: Add the shared types.** Append to `packages/shared/src/leagues.ts`:

```ts
export interface LeagueTeam {
  teamPermanentId: number;
  name: string;
  clubId: number | null;
  isOwnClub: boolean;
}

export interface LeagueTeamsResponse {
  teams: LeagueTeam[];
}
```

- [ ] **Step 2: Export them.** In `packages/shared/src/index.ts`, extend the `from "./leagues"` block (currently `ResolvedLeague, ResolveResult, TrackedLeague, TrackedLeaguesResponse`) to:

```ts
export type {
  ResolvedLeague,
  ResolveResult,
  TrackedLeague,
  TrackedLeaguesResponse,
  LeagueTeam,
  LeagueTeamsResponse,
} from "./leagues";
```

- [ ] **Step 3: Write the failing test.** Add to `league-discovery.service.test.ts`. First extend the hoisted sdk-client mock to include the two methods. Change:

```ts
const { dbHolder, getAllLigen, getClubMatches } = vi.hoisted(() => ({
  dbHolder: { ref: null as unknown },
  getAllLigen: vi.fn(),
  getClubMatches: vi.fn(),
}));
vi.mock("../sync/sdk-client", () => ({ sdkClient: { getAllLigen, getClubMatches } }));
```

to:

```ts
const { dbHolder, getAllLigen, getClubMatches, getTabelle, getSpielplan } = vi.hoisted(() => ({
  dbHolder: { ref: null as unknown },
  getAllLigen: vi.fn(),
  getClubMatches: vi.fn(),
  getTabelle: vi.fn(),
  getSpielplan: vi.fn(),
}));
vi.mock("../sync/sdk-client", () => ({
  sdkClient: { getAllLigen, getClubMatches, getTabelle, getSpielplan },
}));
```

Add `getLeagueTeams` to the import from the service, and append this describe block at the end of the file (before the final close):

```ts
describe("getLeagueTeams", () => {
  function teamRef(teamPermanentId: number, teamname: string, clubId: number | null) {
    return { seasonTeamId: 0, teamCompetitionId: 0, teamPermanentId, teamname, teamnameSmall: "", clubId, verzicht: false };
  }

  it("lists teams from the standings table and marks our club", async () => {
    getTabelle.mockResolvedValue([
      { team: teamRef(1, "Opponents", 9999) },
      { team: teamRef(2, "Hanover Dragons I", 4121) },
    ]);
    const res = await getLeagueTeams(54141);
    expect(getSpielplan).not.toHaveBeenCalled();
    expect(res.teams).toEqual([
      { teamPermanentId: 1, name: "Opponents", clubId: 9999, isOwnClub: false },
      { teamPermanentId: 2, name: "Hanover Dragons I", clubId: 4121, isOwnClub: true },
    ]);
  });

  it("falls back to the schedule when the table is empty, deduping by teamPermanentId", async () => {
    getTabelle.mockResolvedValue([]);
    getSpielplan.mockResolvedValue([
      { homeTeam: teamRef(1, "A", 4121), guestTeam: teamRef(2, "B", 10) },
      { homeTeam: teamRef(1, "A", 4121), guestTeam: null },
    ]);
    const res = await getLeagueTeams(54141);
    expect(res.teams.map((t) => t.teamPermanentId)).toEqual([1, 2]);
    expect(res.teams[0]).toMatchObject({ isOwnClub: true });
  });

  it("keeps placeholder slots (clubId null) and never marks them own-club", async () => {
    mockGetClubConfig.mockResolvedValue(null); // no club configured
    getTabelle.mockResolvedValue([{ team: teamRef(5, "Platzhalter 6", null) }]);
    const res = await getLeagueTeams(54144);
    expect(res.teams).toEqual([
      { teamPermanentId: 5, name: "Platzhalter 6", clubId: null, isOwnClub: false },
    ]);
  });
});
```

- [ ] **Step 4: Run the test, verify it fails.**

Run: `pnpm --filter @dragons/api test -- --run league-discovery.service`
Expected: FAIL — `getLeagueTeams is not a function` (not exported yet).

- [ ] **Step 5: Implement `getLeagueTeams`.** Add to `league-discovery.service.ts`. First ensure the type import exists at the top (extend the existing `@dragons/shared` import):

```ts
import type {
  BrowsableLeague,
  SetSeasonLeaguesResult,
  TrackedLeaguesResponse,
  LeagueTeamsResponse,
  LeagueTeam,
} from "@dragons/shared";
import type { SdkTeamRef } from "@dragons/sdk";
```

Then append the function:

```ts
// List the teams assigned to a league, so an operator can confirm they are
// tracking the right one. The standings table lists the roster even for a
// preliminary (vorabliga) league; fall back to the schedule if it is empty.
export async function getLeagueTeams(ligaId: number): Promise<LeagueTeamsResponse> {
  const ownClubId = (await getClubConfig())?.clubId ?? null;

  const refs: SdkTeamRef[] = [];
  const table = await sdkClient.getTabelle(ligaId);
  if (table.length > 0) {
    for (const entry of table) refs.push(entry.team);
  } else {
    const matches = await sdkClient.getSpielplan(ligaId);
    for (const m of matches) {
      if (m.homeTeam) refs.push(m.homeTeam);
      if (m.guestTeam) refs.push(m.guestTeam);
    }
  }

  const byId = new Map<number, LeagueTeam>();
  for (const ref of refs) {
    if (byId.has(ref.teamPermanentId)) continue;
    const clubId = ref.clubId ?? null;
    byId.set(ref.teamPermanentId, {
      teamPermanentId: ref.teamPermanentId,
      name: ref.teamname,
      clubId,
      isOwnClub: clubId !== null && ownClubId !== null && clubId === ownClubId,
    });
  }
  return { teams: [...byId.values()] };
}
```

- [ ] **Step 6: Run the test, verify it passes.**

Run: `pnpm --filter @dragons/api test -- --run league-discovery.service`
Expected: PASS (all describe blocks).

- [ ] **Step 7: Typecheck shared + api.**

Run: `pnpm --filter @dragons/shared --filter @dragons/api typecheck`
Expected: no errors.

- [ ] **Step 8: Commit.**

```bash
git add packages/shared/src/leagues.ts packages/shared/src/index.ts \
  apps/api/src/services/admin/league-discovery.service.ts \
  apps/api/src/services/admin/league-discovery.service.test.ts
git commit -m "feat(api): getLeagueTeams service + LeagueTeam shared types"
```

---

## Task 2: Backend — `ligaIdParamSchema` contract + `GET /admin/leagues/:ligaId/teams` route

**Files:**
- Modify: `packages/contracts/src/league.ts` (add `ligaIdParamSchema`)
- Modify: `packages/contracts/src/index.ts:198-203` (export it)
- Modify: `packages/contracts/src/league.test.ts` (coercion test)
- Modify: `apps/api/src/routes/admin/league.routes.ts` (add route)
- Test: `apps/api/src/routes/admin/league.routes.test.ts`

**Interfaces:**
- Consumes: `getLeagueTeams` (Task 1).
- Produces: `GET /admin/leagues/:ligaId/teams` → `LeagueTeamsResponse`; `ligaIdParamSchema` parsing
  `{ ligaId: number }` from the path.

- [ ] **Step 1: Write the failing contract test.** Append to `packages/contracts/src/league.test.ts` (import `ligaIdParamSchema` at the top):

```ts
it("coerces ligaId path param to a positive integer", () => {
  expect(ligaIdParamSchema.parse({ ligaId: "54141" }).ligaId).toBe(54141);
  expect(ligaIdParamSchema.safeParse({ ligaId: "abc" }).success).toBe(false);
  expect(ligaIdParamSchema.safeParse({ ligaId: "-1" }).success).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @dragons/contracts test -- --run league`
Expected: FAIL — `ligaIdParamSchema` is not exported.

- [ ] **Step 3: Add the schema + export.** In `packages/contracts/src/league.ts` append:

```ts
/** Path param for GET /admin/leagues/:ligaId/teams (federation ligaId). */
export const ligaIdParamSchema = z.object({
  ligaId: z.coerce.number().int().positive(),
});

export type LigaIdParam = z.infer<typeof ligaIdParamSchema>;
```

In `packages/contracts/src/index.ts`, extend the `from "./league"` export block:

```ts
export {
  leagueOwnClubRefsSchema,
  leagueIdParamSchema,
  ligaIdParamSchema,
  type LeagueOwnClubRefsBody,
  type LeagueIdParam,
  type LigaIdParam,
} from "./league";
```

- [ ] **Step 4: Run the contract test, verify it passes.**

Run: `pnpm --filter @dragons/contracts test -- --run league`
Expected: PASS.

- [ ] **Step 5: Write the failing route test.** In `apps/api/src/routes/admin/league.routes.test.ts`, add `getLeagueTeams: vi.fn()` to the hoisted `mocks` object and to the `vi.mock(".../league-discovery.service", ...)` factory. Then append:

```ts
describe("GET /leagues/:ligaId/teams", () => {
  it("returns the league's teams", async () => {
    const result = {
      teams: [
        { teamPermanentId: 1, name: "Opponents", clubId: 9999, isOwnClub: false },
        { teamPermanentId: 2, name: "Hanover Dragons I", clubId: 4121, isOwnClub: true },
      ],
    };
    mocks.getLeagueTeams.mockResolvedValue(result);
    const res = await app.request("/leagues/54141/teams");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(result);
    expect(mocks.getLeagueTeams).toHaveBeenCalledWith(54141);
  });

  it("rejects a non-numeric ligaId with 400", async () => {
    const res = await app.request("/leagues/abc/teams");
    expect(res.status).toBe(400);
    expect(mocks.getLeagueTeams).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it, verify it fails.**

Run: `pnpm --filter @dragons/api test -- --run league.routes`
Expected: FAIL — route returns 404 (not defined) / `getLeagueTeams` undefined.

- [ ] **Step 7: Implement the route.** In `apps/api/src/routes/admin/league.routes.ts`:
  - extend the service import to include `getLeagueTeams`,
  - extend the contracts import to include `ligaIdParamSchema`,
  - add the route before `export { leagueRoutes }`:

```ts
// GET /admin/leagues/:ligaId/teams - list a federation league's team roster
leagueRoutes.get(
  "/leagues/:ligaId/teams",
  settingsUpdate,
  validator("param", ligaIdParamSchema, validationHook),
  describeRoute({
    description: "List the teams in a federation league",
    tags: ["Leagues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { ligaId } = c.req.valid("param");
    return c.json(await getLeagueTeams(ligaId));
  },
);
```

- [ ] **Step 8: Run the route test, verify it passes.**

Run: `pnpm --filter @dragons/api test -- --run league.routes`
Expected: PASS.

- [ ] **Step 9: Typecheck + lint touched packages.**

Run: `pnpm --filter @dragons/contracts --filter @dragons/api typecheck && pnpm --filter @dragons/contracts --filter @dragons/api lint`
Expected: no type errors; 0 lint errors.

- [ ] **Step 10: Commit.**

```bash
git add packages/contracts/src/league.ts packages/contracts/src/index.ts \
  packages/contracts/src/league.test.ts \
  apps/api/src/routes/admin/league.routes.ts apps/api/src/routes/admin/league.routes.test.ts
git commit -m "feat(api): GET /admin/leagues/:ligaId/teams route + ligaIdParamSchema"
```

---

## Task 3: api-client — `seasons.leagueTeams(ligaId)`

**Files:**
- Modify: `packages/api-client/src/endpoints/seasons.ts`
- Test: `packages/api-client/src/endpoints/seasons.contract.test.ts`

**Interfaces:**
- Produces: `api.seasons.leagueTeams(ligaId: number): Promise<LeagueTeamsResponse>` hitting
  `GET /admin/leagues/:ligaId/teams`.

- [ ] **Step 1: Write the failing test.** Append to `seasons.contract.test.ts` (inside the existing `describe`):

```ts
it("leagueTeams hits the federation-league teams path", async () => {
  const { api, calls } = recordingClient();
  await api.leagueTeams(54141);
  expect(calls[0]!.url).toContain("/admin/leagues/54141/teams");
  expect(calls[0]!.method).toBe("GET");
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @dragons/api-client test -- --run seasons.contract`
Expected: FAIL — `api.leagueTeams is not a function`.

- [ ] **Step 3: Implement.** In `packages/api-client/src/endpoints/seasons.ts`, add to the imported types and the returned object:

```ts
import type {
  Season,
  SeasonWithCounts,
  BrowsableLeague,
  SetSeasonLeaguesResult,
  TrackedLeaguesResponse,
  LeagueTeamsResponse,
} from "@dragons/shared";
```

and inside the returned object (e.g. after `getLeagues`):

```ts
    leagueTeams(ligaId: number): Promise<LeagueTeamsResponse> {
      return client.get(`/admin/leagues/${ligaId}/teams`);
    },
```

- [ ] **Step 4: Run the test, verify it passes.**

Run: `pnpm --filter @dragons/api-client test -- --run seasons.contract`
Expected: PASS.

- [ ] **Step 5: Typecheck.**

Run: `pnpm --filter @dragons/api-client typecheck`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add packages/api-client/src/endpoints/seasons.ts packages/api-client/src/endpoints/seasons.contract.test.ts
git commit -m "feat(api-client): seasons.leagueTeams(ligaId)"
```

---

## Task 4: Web — extract shared `LeaguePicker` (with expandable `LeagueRow`), wizard uses it

**Files:**
- Create: `apps/web/src/components/admin/seasons/league-picker.tsx`
- Create: `apps/web/src/components/admin/seasons/league-picker.test.tsx`
- Modify: `apps/web/src/components/admin/seasons/season-wizard.tsx` (render `LeaguePicker`)
- Modify: `apps/web/src/components/admin/seasons/season-wizard.test.tsx` (add `leagueTeams` to api mock)
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json` (team keys)

**Interfaces:**
- Consumes: `api.seasons.leagueTeams` (Task 3), `BrowsableLeague`, `LeagueTeam`.
- Produces: `LeaguePicker` (default export-free named export) with props
  `{ leagues: BrowsableLeague[]; selected: Set<number>; onToggle(ligaId, checked): void; filter: string; onFilterChange(v): void; ownClubOnly: boolean; onOwnClubOnlyChange(v): void; loading: boolean }`.

- [ ] **Step 1: Add i18n keys.** In `apps/web/src/messages/en.json` under `settings.seasons.wizard`, add after `"ownClubOnly"`:

```json
        "showTeams": "Show teams",
        "hideTeams": "Hide teams",
        "teamsLoading": "Loading teams…",
        "teamsError": "Could not load teams",
        "noTeams": "No teams listed yet",
```

In `apps/web/src/messages/de.json` under `settings.seasons.wizard`, the same keys:

```json
        "showTeams": "Mannschaften anzeigen",
        "hideTeams": "Mannschaften ausblenden",
        "teamsLoading": "Mannschaften werden geladen…",
        "teamsError": "Mannschaften konnten nicht geladen werden",
        "noTeams": "Noch keine Mannschaften eingetragen",
```

- [ ] **Step 2: Write the failing test.** Create `league-picker.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { leagueTeams } = vi.hoisted(() => ({ leagueTeams: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { seasons: { leagueTeams } } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { LeaguePicker } from "./league-picker";
import type { BrowsableLeague } from "@dragons/shared";

const LEAGUES: BrowsableLeague[] = [
  { ligaId: 1, ligaNr: null, name: "Landesliga Herren 2", skName: "Landesliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: false },
  { ligaId: 2, ligaNr: null, name: "Landesliga Damen 2", skName: "Landesliga", akName: "Senioren", geschlecht: "weiblich", vorabliga: true, alreadyTracked: false },
];

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
      loading={false}
      {...props}
    />,
  );
  return { onToggle };
}

beforeEach(() => {
  vi.clearAllMocks();
  leagueTeams.mockResolvedValue({ teams: [{ teamPermanentId: 9, name: "Hanover Dragons I", clubId: 4121, isOwnClub: true }] });
});
afterEach(cleanup);

describe("LeaguePicker", () => {
  it("toggles a league when its checkbox is clicked", () => {
    const { onToggle } = renderPicker();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onToggle).toHaveBeenCalledWith(1, true);
  });

  it("filters by search query", () => {
    renderPicker({ filter: "damen" });
    expect(screen.queryByText("Landesliga Herren 2")).not.toBeInTheDocument();
    expect(screen.getByText("Landesliga Damen 2")).toBeInTheDocument();
  });

  it("lazy-loads and shows a league's teams when expanded", async () => {
    renderPicker();
    fireEvent.click(screen.getAllByText("settings.seasons.wizard.showTeams")[0]!);
    expect(await screen.findByText("Hanover Dragons I")).toBeInTheDocument();
    expect(leagueTeams).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 3: Run it, verify it fails.**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/league-picker.test.tsx`
Expected: FAIL — module `./league-picker` not found.

- [ ] **Step 4: Implement `LeaguePicker` + `LeagueRow`.** Create `league-picker.tsx`:

```tsx
"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { BrowsableLeague, LeagueTeam } from "@dragons/shared";
import { Input } from "@dragons/ui/components/input";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Switch } from "@dragons/ui/components/switch";
import { Badge } from "@dragons/ui/components/badge";

export interface LeaguePickerProps {
  leagues: BrowsableLeague[];
  selected: Set<number>;
  onToggle: (ligaId: number, checked: boolean) => void;
  filter: string;
  onFilterChange: (v: string) => void;
  ownClubOnly: boolean;
  onOwnClubOnlyChange: (v: boolean) => void;
  loading: boolean;
}

export function LeaguePicker({
  leagues,
  selected,
  onToggle,
  filter,
  onFilterChange,
  ownClubOnly,
  onOwnClubOnlyChange,
  loading,
}: LeaguePickerProps) {
  const t = useTranslations();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leagues;
    return leagues.filter((l) =>
      [l.name, l.skName, l.akName, l.geschlecht].some((s) => s?.toLowerCase().includes(q)),
    );
  }, [leagues, filter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
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

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("settings.seasons.wizard.loadingLeagues")}
        </div>
      ) : leagues.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("settings.seasons.wizard.noLeagues")}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Input
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={t("settings.seasons.wizard.searchPlaceholder")}
              aria-label={t("settings.seasons.wizard.searchPlaceholder")}
            />
            <Badge variant="secondary" className="shrink-0">
              {t("settings.seasons.wizard.selectedCount", { count: selected.size })}
            </Badge>
          </div>
          <ul className="max-h-72 overflow-auto rounded-md bg-surface-low p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("settings.seasons.wizard.noMatches")}
              </li>
            ) : (
              filtered.map((l) => (
                <LeagueRow
                  key={l.ligaId}
                  league={l}
                  checked={selected.has(l.ligaId)}
                  onToggle={onToggle}
                />
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function LeagueRow({
  league,
  checked,
  onToggle,
}: {
  league: BrowsableLeague;
  checked: boolean;
  onToggle: (ligaId: number, checked: boolean) => void;
}) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const [teams, setTeams] = useState<LeagueTeam[] | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError] = useState(false);

  async function expand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (teams !== null || loadingTeams) return; // already loaded / loading
    setLoadingTeams(true);
    setError(false);
    try {
      const res = await api.seasons.leagueTeams(league.ligaId);
      setTeams(res.teams);
    } catch {
      setError(true);
    } finally {
      setLoadingTeams(false);
    }
  }

  return (
    <li>
      <div className="flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-high">
        <Checkbox
          className="mt-0.5"
          checked={checked}
          onCheckedChange={(c) => onToggle(league.ligaId, c === true)}
        />
        <span className="flex flex-1 flex-col">
          <span className="text-sm font-medium">{league.name}</span>
          <span className="text-xs text-muted-foreground">
            {[league.skName, league.akName, league.geschlecht].filter(Boolean).join(" · ")}
          </span>
          <button
            type="button"
            className="mt-1 self-start text-xs text-primary hover:underline"
            onClick={() => { void expand(); }}
          >
            {expanded ? t("settings.seasons.wizard.hideTeams") : t("settings.seasons.wizard.showTeams")}
          </button>
          {expanded && (
            <span className="mt-1 text-xs text-muted-foreground">
              {loadingTeams ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  {t("settings.seasons.wizard.teamsLoading")}
                </span>
              ) : error ? (
                t("settings.seasons.wizard.teamsError")
              ) : teams && teams.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {teams.map((tm) => (
                    <span key={tm.teamPermanentId} className={tm.isOwnClub ? "font-medium text-foreground" : ""}>
                      {tm.isOwnClub ? "★ " : ""}{tm.name}
                    </span>
                  ))}
                </span>
              ) : (
                t("settings.seasons.wizard.noTeams")
              )}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}
```

- [ ] **Step 5: Run the picker test, verify it passes.**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/league-picker.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Use `LeaguePicker` in the wizard.** In `season-wizard.tsx`:
  - remove now-unused imports `useMemo`, `Input` (still used for the name step — keep `Input`), `Checkbox`, `Switch`, `Badge` that move into the picker. Keep `Input` (name field). Remove `Checkbox`, `Switch`, `Badge`, and `useMemo` if no longer referenced.
  - delete the local `filtered` `useMemo`.
  - add `import { LeaguePicker } from "./league-picker";`.
  - replace the entire `{step === "select" && ( ... )}` block with:

```tsx
        {step === "select" && (
          <div className="space-y-3">
            <LeaguePicker
              leagues={leagues}
              selected={selected}
              onToggle={toggle}
              filter={filter}
              onFilterChange={setFilter}
              ownClubOnly={ownClubOnly}
              onOwnClubOnlyChange={toggleOwnClubOnly}
              loading={loadingLeagues}
            />
            {!loadingLeagues && leagues.length > 0 && (
              <DialogFooter>
                <Button disabled={selected.size === 0 || submitting} onClick={() => { void confirm(); }}>
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {t("settings.seasons.wizard.confirm")}
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
```

- [ ] **Step 7: Keep the wizard test green.** In `season-wizard.test.tsx`, add `leagueTeams: vi.fn()` to the mocked `api.seasons` object:

```ts
vi.mock("@/lib/api", () => ({
  api: {
    seasons: { browse, create, setLeagues, discover: vi.fn(), leagueTeams: vi.fn() },
    sync: { trigger },
  },
}));
```

- [ ] **Step 8: Run wizard + picker tests, verify they pass.**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/season-wizard.test.tsx src/components/admin/seasons/league-picker.test.tsx`
Expected: PASS (wizard 10 + picker 3).

- [ ] **Step 9: Typecheck + lint web.**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no type errors; no NEW lint errors in the touched files (pre-existing warnings elsewhere are fine).

- [ ] **Step 10: Commit.**

```bash
git add apps/web/src/components/admin/seasons/league-picker.tsx \
  apps/web/src/components/admin/seasons/league-picker.test.tsx \
  apps/web/src/components/admin/seasons/season-wizard.tsx \
  apps/web/src/components/admin/seasons/season-wizard.test.tsx \
  apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): shared LeaguePicker with expandable team rosters; wizard reuses it"
```

---

## Task 5: Web — `ManageLeaguesDialog`

**Files:**
- Create: `apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx`
- Create: `apps/web/src/components/admin/seasons/manage-leagues-dialog.test.tsx`
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json` (manage keys)

**Interfaces:**
- Consumes: `api.seasons.getLeagues`, `api.seasons.discover`, `api.seasons.setLeagues`,
  `api.sync.trigger`, `LeaguePicker` (Task 4), `SWR_KEYS.seasons`.
- Produces: `ManageLeaguesDialog({ seasonId: number; open: boolean; onOpenChange(v): void })`.

- [ ] **Step 1: Add i18n keys.** In `apps/web/src/messages/en.json`, add a `manage` object under `settings.seasons` (sibling of `wizard`):

```json
      "manage": {
        "button": "Manage leagues",
        "title": "Manage leagues",
        "description": "Add or remove the leagues this season tracks.",
        "save": "Save & sync",
        "saved": "Leagues updated",
        "saveFailed": "Could not save leagues",
        "loadFailed": "Could not load leagues from the federation"
      },
```

In `apps/web/src/messages/de.json` the same key path:

```json
      "manage": {
        "button": "Ligen verwalten",
        "title": "Ligen verwalten",
        "description": "Ligen dieser Saison hinzufügen oder entfernen.",
        "save": "Speichern & synchronisieren",
        "saved": "Ligen aktualisiert",
        "saveFailed": "Ligen konnten nicht gespeichert werden",
        "loadFailed": "Ligen konnten nicht vom Verband geladen werden"
      },
```

- [ ] **Step 2: Write the failing test.** Create `manage-leagues-dialog.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { getLeagues, discover, setLeagues, trigger, leagueTeams, toastError, toastSuccess } = vi.hoisted(() => ({
  getLeagues: vi.fn(), discover: vi.fn(), setLeagues: vi.fn(), trigger: vi.fn(),
  leagueTeams: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: { seasons: { getLeagues, discover, setLeagues, leagueTeams }, sync: { trigger } },
}));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { ManageLeaguesDialog } from "./manage-leagues-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  // Season already tracks league 1; discover returns 1 (tracked) and 2 (untracked).
  getLeagues.mockResolvedValue({
    leagueNumbers: [],
    leagues: [{ id: 11, ligaNr: 0, apiLigaId: 1, name: "Landesliga Herren 2", seasonName: "2026/27", ownClubRefs: false }],
  });
  discover.mockResolvedValue([
    { ligaId: 1, ligaNr: null, name: "Landesliga Herren 2", skName: "Landesliga", akName: "Senioren", geschlecht: "männlich", vorabliga: true, alreadyTracked: true },
    { ligaId: 2, ligaNr: null, name: "Landesliga Damen 2", skName: "Landesliga", akName: "Senioren", geschlecht: "weiblich", vorabliga: true, alreadyTracked: false },
  ]);
  setLeagues.mockResolvedValue({ tracked: 2, untracked: 0 });
  trigger.mockResolvedValue({ ok: true });
  leagueTeams.mockResolvedValue({ teams: [] });
});
afterEach(cleanup);

describe("ManageLeaguesDialog", () => {
  it("seeds the checked set from the season's current leagues", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Herren 2");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toBeChecked();   // league 1, already tracked
    expect(boxes[1]).not.toBeChecked(); // league 2
  });

  it("saves the new set and triggers a sync", async () => {
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Damen 2");
    fireEvent.click(screen.getAllByRole("checkbox")[1]!); // add league 2
    fireEvent.click(screen.getByText("settings.seasons.manage.save"));
    await waitFor(() => expect(setLeagues).toHaveBeenCalledWith(9, { ligaIds: [1, 2] }));
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith("settings.seasons.manage.saved");
  });

  it("keeps the dialog open and toasts when saving fails", async () => {
    setLeagues.mockRejectedValueOnce(new Error("boom"));
    render(<ManageLeaguesDialog seasonId={9} open onOpenChange={() => {}} />);
    await screen.findByText("Landesliga Herren 2");
    fireEvent.click(screen.getByText("settings.seasons.manage.save"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("settings.seasons.manage.saveFailed"));
    expect(screen.getByText("settings.seasons.manage.save")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it, verify it fails.**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/manage-leagues-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `ManageLeaguesDialog`.** Create `manage-leagues-dialog.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import type { BrowsableLeague } from "@dragons/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { LeaguePicker } from "./league-picker";

export function ManageLeaguesDialog({
  seasonId,
  open,
  onOpenChange,
}: {
  seasonId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const [leagues, setLeaguesState] = useState<BrowsableLeague[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [ownClubOnly, setOwnClubOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Load the season's current leagues plus the browse candidates, then merge so
  // a currently-tracked league that the active filter would hide still appears
  // (checked) and can be removed.
  async function load(clubOnly = ownClubOnly) {
    setLoading(true);
    try {
      const [tracked, candidates] = await Promise.all([
        api.seasons.getLeagues(seasonId),
        api.seasons.discover(seasonId, { vorabligaOnly: true, ownClubOnly: clubOnly }),
      ]);
      if (!openRef.current) return;
      const trackedIds = new Set(tracked.leagues.map((l) => l.apiLigaId));
      const byId = new Map<number, BrowsableLeague>();
      for (const c of candidates) byId.set(c.ligaId, c);
      // Ensure tracked leagues missing from the candidate list are still shown.
      for (const l of tracked.leagues) {
        if (!byId.has(l.apiLigaId)) {
          byId.set(l.apiLigaId, {
            ligaId: l.apiLigaId,
            ligaNr: l.ligaNr,
            name: l.name,
            skName: "",
            akName: "",
            geschlecht: "",
            vorabliga: false,
            alreadyTracked: true,
          });
        }
      }
      setLeaguesState([...byId.values()]);
      setSelected(trackedIds);
    } catch {
      if (!openRef.current) return;
      toast.error(t("settings.seasons.manage.loadFailed"));
    } finally {
      if (openRef.current) setLoading(false);
    }
  }

  // Load once each time the dialog opens.
  useEffect(() => {
    if (open) {
      setFilter("");
      setOwnClubOnly(true);
      void load(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seasonId]);

  function toggleOwnClubOnly(v: boolean) {
    setOwnClubOnly(v);
    void load(v);
  }

  function toggle(ligaId: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ligaId);
      else next.delete(ligaId);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api.seasons.setLeagues(seasonId, { ligaIds: [...selected] });
      try {
        await api.sync.trigger();
      } catch {
        // Leagues are saved; only the sync kick-off failed.
      }
      await mutate(SWR_KEYS.seasons);
      toast.success(t("settings.seasons.manage.saved"));
      onOpenChange(false);
    } catch {
      toast.error(t("settings.seasons.manage.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (saving) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.seasons.manage.title")}</DialogTitle>
          <DialogDescription>{t("settings.seasons.manage.description")}</DialogDescription>
        </DialogHeader>
        <LeaguePicker
          leagues={leagues}
          selected={selected}
          onToggle={toggle}
          filter={filter}
          onFilterChange={setFilter}
          ownClubOnly={ownClubOnly}
          onOwnClubOnlyChange={toggleOwnClubOnly}
          loading={loading}
        />
        <DialogFooter>
          <Button disabled={saving || loading} onClick={() => { void save(); }}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("settings.seasons.manage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the dialog test, verify it passes.**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/manage-leagues-dialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + lint web.**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: no type errors; no new lint errors.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx \
  apps/web/src/components/admin/seasons/manage-leagues-dialog.test.tsx \
  apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): ManageLeaguesDialog to add/remove an upcoming season's leagues"
```

---

## Task 6: Web — wire "Manage leagues" into the seasons list (upcoming rows)

**Files:**
- Modify: `apps/web/src/components/admin/seasons/seasons-list.tsx`
- Modify: `apps/web/src/components/admin/seasons/seasons-list.test.tsx`

**Interfaces:**
- Consumes: `ManageLeaguesDialog` (Task 5).

The existing `seasons-list.test.tsx` already mocks `swr` (default returns two seasons — `id 1`
active, `id 2` upcoming), `next-intl`, `sonner`, and `@/lib/api`. Build on it.

- [ ] **Step 1: Write the failing test.** In `seasons-list.test.tsx`:
  - add `fireEvent` to the `@testing-library/react` import,
  - mock the dialog so this stays a unit test (add near the other `vi.mock`s):

```ts
vi.mock("./manage-leagues-dialog", () => ({
  ManageLeaguesDialog: ({ open, seasonId }: { open: boolean; seasonId: number }) =>
    open ? <div>manage-open:{seasonId}</div> : null,
}));
```

  - add the test inside the `describe`:

```ts
it("opens the manage-leagues dialog for the upcoming season", async () => {
  render(<SeasonsList />);
  // Only the upcoming season (id 2) shows the button.
  fireEvent.click(screen.getByText("settings.seasons.manage.button"));
  expect(await screen.findByText("manage-open:2")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/seasons-list.test.tsx`
Expected: FAIL — no "Manage leagues" button.

- [ ] **Step 3: Implement.** In `seasons-list.tsx`:
  - add `import { useState } from "react";` already present; add `ManageLeaguesDialog` import:
    `import { ManageLeaguesDialog } from "./manage-leagues-dialog";`
  - add state: `const [manageSeasonId, setManageSeasonId] = useState<number | null>(null);`
  - render the dialog once (after `<SeasonWizard .../>`):

```tsx
    <ManageLeaguesDialog
      seasonId={manageSeasonId ?? 0}
      open={manageSeasonId !== null}
      onOpenChange={(v) => { if (!v) setManageSeasonId(null); }}
    />
```

  - in the season row, for `upcoming` seasons add a button next to "Activate":

```tsx
            {s.status === "upcoming" && (
              <Button variant="outline" onClick={() => setManageSeasonId(s.id)}>
                {t("settings.seasons.manage.button")}
              </Button>
            )}
```

  Place it inside the existing row's action area, alongside the Activate button (wrap the two
  buttons in a `<div className="flex gap-2">` if needed).

- [ ] **Step 4: Run the test, verify it passes.**

Run: `pnpm --filter @dragons/web exec vitest run src/components/admin/seasons/seasons-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint web.**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web lint`
Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/components/admin/seasons/seasons-list.tsx \
  apps/web/src/components/admin/seasons/seasons-list.test.tsx
git commit -m "feat(web): Manage leagues button on upcoming season rows"
```

---

## Task 7: Docs + full verification

**Files:**
- Modify: `AGENTS.md` (endpoint list)

- [ ] **Step 1: Document the endpoint.** In `AGENTS.md`, find the admin endpoint list (search for
  `/admin/seasons/` or `/admin/settings/leagues`) and add a line:

```
GET /admin/leagues/:ligaId/teams — list a federation league's team roster (own club marked)
```

- [ ] **Step 2: Run the full affected test suites.**

Run: `pnpm --filter @dragons/shared --filter @dragons/contracts --filter @dragons/api-client --filter @dragons/api --filter @dragons/web test -- --run`
Expected: all green.

- [ ] **Step 3: Run coverage on the high-bar package.**

Run: `pnpm --filter @dragons/api coverage`
Expected: thresholds met (90/95/95/95).

- [ ] **Step 4: Full lint + typecheck.**

Run: `pnpm lint && pnpm typecheck`
Expected: 0 errors (pre-existing warnings allowed).

- [ ] **Step 5: Commit.**

```bash
git add AGENTS.md
git commit -m "docs: document GET /admin/leagues/:ligaId/teams"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** team endpoint (Tasks 1–3), expand-to-see-teams (Task 4), manage dialog
  upcoming-only (Tasks 5–6), merge-tracked-leagues guard (Task 5), sync-on-save (Task 5),
  untrack-only removal (reuses `setSeasonLeagues`, no new code). All covered.
- **`ligaId` vs DB id:** the teams endpoint and picker use the federation `ligaId` (`apiLigaId`).
  `getLeagues` returns `apiLigaId` — seed/selection use that, never the DB `id`.
- **Hooks-in-loops:** team loading lives in the per-row `LeagueRow` component (one `useState` each),
  never a hook inside `.map`.
- **Wizard test:** Task 4 Step 7 adds `leagueTeams` to the api mock so the shared picker's row code
  has the method available even though existing tests never expand a row.
```
