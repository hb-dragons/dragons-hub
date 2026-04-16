# Referee Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable referees to self-assign to open game slots and admins to assign/unassign any referee, proxying calls to the Basketball-Bund federation API and updating local state on success.

**Architecture:** Thin proxy — all assignment calls go directly to the federation API; local `refereeGames` table is updated optimistically on success. Federation is source of truth for qualification. Local `refereeAssignmentRules` add a club-level deny layer checked before the federation call. Domain events (`REFEREE_ASSIGNED` / `REFEREE_UNASSIGNED`) are published after each successful mutation.

**Tech Stack:** Hono 4.12, Drizzle ORM 0.45, Zod 4.3, Vitest 4, Next.js 16, SWR, TypeScript 6 strict mode.

---

## File Map

### Create
| File | Purpose |
|------|---------|
| `packages/sdk/src/types/referee-assignment.ts` | Federation API types (candidates, submit payloads, response) |
| `packages/shared/src/referee-assignment.ts` | Shared request/response types used by both API and web |
| `apps/api/src/services/referee/referee-assignment.service.ts` | `assignReferee`, `unassignReferee`, `searchCandidates` |
| `apps/api/src/services/referee/referee-assignment.service.test.ts` | Service unit tests |
| `apps/api/src/routes/referee/assignment.routes.ts` | `POST /referee/games/:spielplanId/assign` |
| `apps/api/src/routes/referee/assignment.routes.test.ts` | Route integration tests |
| `apps/api/src/routes/admin/referee-assignment.routes.ts` | Candidate search, admin assign, admin unassign |
| `apps/api/src/routes/admin/referee-assignment.routes.test.ts` | Admin route integration tests |
| `apps/web/src/components/referee/assign-game-dialog.tsx` | Confirmation dialog for self-assign |
| `apps/web/src/components/admin/referees/assign-referee-dialog.tsx` | Candidate search + select + confirm for admin assign |
| `apps/web/src/components/admin/referees/unassign-referee-button.tsx` | Confirmation popover for admin unassign |

### Modify
| File | Change |
|------|--------|
| `packages/sdk/src/index.ts` | Export new types |
| `packages/shared/src/index.ts` | Export new shared types |
| `apps/api/src/services/sync/sdk-client.ts` | Add `searchRefereesForGame`, `submitRefereeAssignment`, `submitRefereeUnassignment` |
| `apps/api/src/routes/index.ts` | Mount new route modules |
| `apps/web/src/components/referee/referee-games-list.tsx` | Add "Take" buttons for referee self-assign |
| `apps/web/src/app/[locale]/admin/referee/matches/page.tsx` | Wire admin assign/unassign dialogs |
| `AGENTS.md` | Document new endpoints |

---

## Task 1: SDK Types

**Files:**
- Create: `packages/sdk/src/types/referee-assignment.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Create the SDK types file**

```typescript
// packages/sdk/src/types/referee-assignment.ts

export interface SdkRefCandidateMeta {
  schiedsrichterId: number;
  lizenzNr: number;
  heimTotal: number;
  gastTotal: number;
  total: number;
  va: number;
  eh: number;
  qmaxSr1: string | null;
  qmaxSr2: string | null;
  tnaCount: number;
  sperrvereinCount: number;
  sperrzeitenCount: number;
  qualiSr1: number;
  qualiSr2: number;
  qualiSr3: number;
  qualiCoa: number;
  qualiKom: number;
  entfernung: number;
  maxDatumBefore: number | null;
  minDatumAfter: number | null;
  anzAmTag: number;
  anzInWoche: number;
  anzImMonat: number;
}

export interface SdkRefCandidate {
  srId: number;
  vorname: string;
  nachName: string;
  email: string;
  lizenznr: number;
  strasse: string;
  plz: string;
  ort: string;
  distanceKm: string;
  qmaxSr1: string | null;
  qmaxSr2: string | null;
  warning: string[];
  meta: SdkRefCandidateMeta;
  qualiSr1: boolean;
  qualiSr2: boolean;
  qualiSr3: boolean;
  qualiCoa: boolean;
  qualiKom: boolean;
  srModusMismatchSr1: boolean;
  srModusMismatchSr2: boolean;
  ansetzungAmTag: boolean;
  blocktermin: boolean;
  zeitraumBlockiert: string | null;
  srGruppen: string[];
}

export interface SdkGetRefsPayload {
  spielId: number;
  textSearch: string | null;
  maxDistanz: number | null;
  qmaxIds: number[];
  mode: "EINSETZBAR" | "ALLE";
  globalerEinsatz: boolean;
  rollenIds: number[];
  gruppenIds: number[];
  sortBy: "distance" | "name";
  pageFrom: number;
  pageSize: number;
}

export interface SdkGetRefsResponse {
  total: number;
  results: SdkRefCandidate[];
}

export interface SdkAufheben {
  typ: "AUFHEBEN";
  grund: string | null;
}

export interface SdkSubmitSlotPayload {
  ansetzen: SdkRefCandidate | null;
  aufheben: SdkAufheben | null;
  ansetzenFix: boolean;
  ansetzenVerein: null;
  aufhebenVerein: null;
  ansetzenFuerSpiel: 0;
}

export type SdkSubmitPayload = {
  sr1: SdkSubmitSlotPayload;
  sr2: SdkSubmitSlotPayload;
  sr3: SdkSubmitSlotPayload;
  coa: SdkSubmitSlotPayload;
  kom: SdkSubmitSlotPayload;
};

export interface SdkSubmitResponse {
  game1: { spielplanId: number };
  gameInfoMessages: string[];
  editAnythingPossible: boolean;
}
```

- [ ] **Step 2: Export from the SDK index**

In `packages/sdk/src/index.ts`, add before the `// Helpers` line:

```typescript
export type {
  SdkRefCandidateMeta,
  SdkRefCandidate,
  SdkGetRefsPayload,
  SdkGetRefsResponse,
  SdkAufheben,
  SdkSubmitSlotPayload,
  SdkSubmitPayload,
  SdkSubmitResponse,
} from "./types/referee-assignment";
```

- [ ] **Step 3: Verify types compile**

```bash
pnpm --filter @dragons/sdk typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/types/referee-assignment.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add referee assignment federation types"
```

---

## Task 2: Shared API Types

**Files:**
- Create: `packages/shared/src/referee-assignment.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// packages/shared/src/referee-assignment.ts

import type { SdkRefCandidate } from "@dragons/sdk";

export interface AssignRefereeBody {
  slotNumber: 1 | 2;
  refereeApiId: number;
}

export interface AssignRefereeResponse {
  success: true;
  slot: "sr1" | "sr2";
  status: "assigned";
  refereeName: string;
}

export interface UnassignRefereeResponse {
  success: true;
  slot: "sr1" | "sr2";
  status: "open";
}

export interface CandidateSearchResponse {
  total: number;
  results: SdkRefCandidate[];
}
```

- [ ] **Step 2: Export from shared index**

In `packages/shared/src/index.ts`, add at the end:

```typescript
export type {
  AssignRefereeBody,
  AssignRefereeResponse,
  UnassignRefereeResponse,
  CandidateSearchResponse,
} from "./referee-assignment";
```

- [ ] **Step 3: Verify types compile**

```bash
pnpm --filter @dragons/shared typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/referee-assignment.ts packages/shared/src/index.ts
git commit -m "feat(shared): add referee assignment API types"
```

---

## Task 3: SdkClient — Federation Assignment Methods

**Files:**
- Modify: `apps/api/src/services/sync/sdk-client.ts`

- [ ] **Step 1: Add imports at the top of sdk-client.ts**

After the existing type imports from `@dragons/sdk`, add:

```typescript
import type {
  SdkGetRefsPayload,
  SdkGetRefsResponse,
  SdkRefCandidate,
  SdkSubmitPayload,
  SdkSubmitSlotPayload,
  SdkSubmitResponse,
} from "@dragons/sdk";
```

- [ ] **Step 2: Add constants and payload builder inside the SdkClient class**

Add these before the first method in `SdkClient`:

```typescript
private static readonly NOOP_SLOT: SdkSubmitSlotPayload = {
  ansetzen: null,
  aufheben: null,
  ansetzenFix: false,
  ansetzenVerein: null,
  aufhebenVerein: null,
  ansetzenFuerSpiel: 0,
};

private static readonly SLOT_KEY_MAP = {
  1: "sr1",
  2: "sr2",
  3: "sr3",
} as const;

private buildSubmitPayload(
  slotNumber: 1 | 2 | 3,
  slot: SdkSubmitSlotPayload,
): SdkSubmitPayload {
  const slotKey = SdkClient.SLOT_KEY_MAP[slotNumber];
  return {
    sr1: slotKey === "sr1" ? slot : SdkClient.NOOP_SLOT,
    sr2: slotKey === "sr2" ? slot : SdkClient.NOOP_SLOT,
    sr3: slotKey === "sr3" ? slot : SdkClient.NOOP_SLOT,
    coa: SdkClient.NOOP_SLOT,
    kom: SdkClient.NOOP_SLOT,
  };
}
```

- [ ] **Step 3: Add `searchRefereesForGame`**

Add after `getGameDetailsBatch`:

```typescript
async searchRefereesForGame(
  spielplanId: number,
  options: {
    textSearch?: string | null;
    pageFrom?: number;
    pageSize?: number;
  } = {},
): Promise<SdkGetRefsResponse> {
  await this.ensureAuthenticated();
  await this.rateLimiter.acquire();

  const payload: SdkGetRefsPayload = {
    spielId: spielplanId,
    textSearch: options.textSearch ?? null,
    maxDistanz: null,
    qmaxIds: [],
    mode: "EINSETZBAR",
    globalerEinsatz: false,
    rollenIds: [1, 2, 3, 4, 5],
    gruppenIds: [],
    sortBy: "distance",
    pageFrom: options.pageFrom ?? 0,
    pageSize: options.pageSize ?? 15,
  };

  return withRetry(
    async () => {
      const res = await this.authClient.authenticatedFetch(
        `/rest/assignschiri/getRefs/${spielplanId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (res.status === 401 || res.status === 403) {
        await this.authClient.login();
        const retry = await this.authClient.authenticatedFetch(
          `/rest/assignschiri/getRefs/${spielplanId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!retry.ok)
          throw new Error(`getRefs failed: ${retry.status}`);
        return retry.json() as Promise<SdkGetRefsResponse>;
      }
      if (!res.ok) throw new Error(`getRefs failed: ${res.status}`);
      return res.json() as Promise<SdkGetRefsResponse>;
    },
    3,
    `searchRefereesForGame(${spielplanId})`,
  );
}
```

- [ ] **Step 4: Add `submitRefereeAssignment`**

```typescript
async submitRefereeAssignment(
  spielplanId: number,
  slotNumber: 1 | 2 | 3,
  candidate: SdkRefCandidate,
): Promise<SdkSubmitResponse> {
  await this.ensureAuthenticated();
  await this.rateLimiter.acquire();

  const slotPayload: SdkSubmitSlotPayload = {
    ansetzen: candidate,
    aufheben: null,
    ansetzenFix: true,
    ansetzenVerein: null,
    aufhebenVerein: null,
    ansetzenFuerSpiel: 0,
  };
  const body = this.buildSubmitPayload(slotNumber, slotPayload);

  return withRetry(
    async () => {
      const res = await this.authClient.authenticatedFetch(
        `/rest/assignschiri/submit/${spielplanId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (res.status === 401 || res.status === 403) {
        await this.authClient.login();
        const retry = await this.authClient.authenticatedFetch(
          `/rest/assignschiri/submit/${spielplanId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!retry.ok)
          throw new Error(`submit assignment failed: ${retry.status}`);
        return retry.json() as Promise<SdkSubmitResponse>;
      }
      if (!res.ok)
        throw new Error(`submit assignment failed: ${res.status}`);
      return res.json() as Promise<SdkSubmitResponse>;
    },
    3,
    `submitRefereeAssignment(${spielplanId}, slot=${slotNumber})`,
  );
}
```

- [ ] **Step 5: Add `submitRefereeUnassignment`**

```typescript
async submitRefereeUnassignment(
  spielplanId: number,
  slotNumber: 1 | 2 | 3,
): Promise<SdkSubmitResponse> {
  await this.ensureAuthenticated();
  await this.rateLimiter.acquire();

  const slotPayload: SdkSubmitSlotPayload = {
    ansetzen: null,
    aufheben: { typ: "AUFHEBEN", grund: null },
    ansetzenFix: false,
    ansetzenVerein: null,
    aufhebenVerein: null,
    ansetzenFuerSpiel: 0,
  };
  const body = this.buildSubmitPayload(slotNumber, slotPayload);

  return withRetry(
    async () => {
      const res = await this.authClient.authenticatedFetch(
        `/rest/assignschiri/submit/${spielplanId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (res.status === 401 || res.status === 403) {
        await this.authClient.login();
        const retry = await this.authClient.authenticatedFetch(
          `/rest/assignschiri/submit/${spielplanId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!retry.ok)
          throw new Error(`submit unassignment failed: ${retry.status}`);
        return retry.json() as Promise<SdkSubmitResponse>;
      }
      if (!res.ok)
        throw new Error(`submit unassignment failed: ${res.status}`);
      return res.json() as Promise<SdkSubmitResponse>;
    },
    3,
    `submitRefereeUnassignment(${spielplanId}, slot=${slotNumber})`,
  );
}
```

- [ ] **Step 6: Verify types compile**

```bash
pnpm --filter @dragons/api typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/sync/sdk-client.ts
git commit -m "feat(api): add federation referee assignment methods to SdkClient"
```

---

## Task 4: Assignment Service (TDD)

**Files:**
- Create: `apps/api/src/services/referee/referee-assignment.service.test.ts`
- Create: `apps/api/src/services/referee/referee-assignment.service.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/services/referee/referee-assignment.service.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted so vi.mock calls below can reference them) ──────────────

const mocks = vi.hoisted(() => ({
  // DB rows returned sequentially per select call
  selectCalls: [] as unknown[][],
  updateWhere: vi.fn().mockResolvedValue(undefined),
  insertOnConflict: vi.fn().mockResolvedValue(undefined),
  deleteWhere: vi.fn().mockResolvedValue(undefined),
  // SDK
  searchRefereesForGame: vi.fn(),
  submitRefereeAssignment: vi.fn(),
  submitRefereeUnassignment: vi.fn(),
  // Events
  publishDomainEvent: vi.fn().mockResolvedValue({ id: "evt-1" }),
}));

// Track how many selects have been called to return the right mock data
let selectCallIndex = 0;

vi.mock("../../config/database", () => ({
  db: {
    select: () => {
      const idx = selectCallIndex++;
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(mocks.selectCalls[idx] ?? []),
          }),
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(mocks.selectCalls[idx] ?? []),
            }),
          }),
        }),
      };
    },
    update: () => ({ set: () => ({ where: mocks.updateWhere }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: mocks.insertOnConflict }),
    }),
    delete: () => ({ where: mocks.deleteWhere }),
  },
}));

vi.mock("../../services/sync/sdk-client", () => ({
  sdkClient: {
    searchRefereesForGame: mocks.searchRefereesForGame,
    submitRefereeAssignment: mocks.submitRefereeAssignment,
    submitRefereeUnassignment: mocks.submitRefereeUnassignment,
  },
}));

vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: mocks.publishDomainEvent,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((_col: unknown, vals: unknown) => ({ inArray: vals })),
}));

vi.mock("@dragons/db/schema", () => ({
  refereeGames: { apiMatchId: "rg.apiMatchId", matchId: "rg.matchId" },
  referees: { apiId: "r.apiId", id: "r.id" },
  matches: { id: "m.id", homeTeamApiId: "m.homeTeamApiId", guestTeamApiId: "m.guestTeamApiId" },
  teams: { id: "t.id", apiTeamPermanentId: "t.apiTeamPermanentId" },
  refereeAssignmentRules: { refereeId: "rar.refereeId", teamId: "rar.teamId", deny: "rar.deny" },
  refereeAssignmentIntents: { matchId: "rai.matchId", refereeId: "rai.refereeId", slotNumber: "rai.slotNumber" },
}));

// Import after mocks
import { assignReferee, unassignReferee, searchCandidates } from "./referee-assignment.service";

// ── Test fixtures ──────────────────────────────────────────────────────────

const GAME_ROW = {
  id: 1,
  apiMatchId: 12345,
  matchId: 100,
  matchNo: 42,
  homeTeamName: "Dragons A",
  guestTeamName: "Lions B",
  sr1Status: "open",
  sr2Status: "open",
  sr1Name: null,
  sr2Name: null,
  sr1RefereeApiId: null,
  sr2RefereeApiId: null,
};

const REFEREE_ROW = { id: 7, apiId: 9001, firstName: "Max", lastName: "Muster" };

const CANDIDATE = {
  srId: 9001,
  vorname: "Max",
  nachName: "Muster",
  email: "max@example.com",
  lizenznr: 12345,
  strasse: "Musterstr. 1",
  plz: "12345",
  ort: "Berlin",
  distanceKm: "5.2",
  qmaxSr1: null,
  qmaxSr2: null,
  warning: [],
  meta: {} as never,
  qualiSr1: true,
  qualiSr2: true,
  qualiSr3: false,
  qualiCoa: false,
  qualiKom: false,
  srModusMismatchSr1: false,
  srModusMismatchSr2: false,
  ansetzungAmTag: false,
  blocktermin: false,
  zeitraumBlockiert: null,
  srGruppen: [],
};

const SUCCESS_RESPONSE = {
  game1: { spielplanId: 12345 },
  gameInfoMessages: ["Änderungen erfolgreich übernommen"],
  editAnythingPossible: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  selectCallIndex = 0;
  mocks.selectCalls = [];
});

// ── assignReferee ──────────────────────────────────────────────────────────

describe("assignReferee", () => {
  it("happy path: assigns sr1, updates local state, emits event", async () => {
    // selectCalls[0] = refereeGames lookup
    // selectCalls[1] = referees lookup
    // selectCalls[2] = matches lookup (matchId present, for deny check)
    // selectCalls[3] = teams lookup
    // selectCalls[4] = deny rules check (empty = no deny)
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [], // no deny rules
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ total: 1, results: [CANDIDATE] });
    mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await assignReferee(12345, 1, 9001);

    expect(result).toEqual({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });
    expect(mocks.submitRefereeAssignment).toHaveBeenCalledWith(12345, 1, CANDIDATE);
    expect(mocks.updateWhere).toHaveBeenCalled();
    expect(mocks.publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "referee.assigned" }),
    );
  });

  it("throws GAME_NOT_FOUND when spielplanId not in refereeGames", async () => {
    mocks.selectCalls = [[]]; // no game found

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
    });
    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
  });

  it("throws DENY_RULE when local deny rule blocks assignment", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [{ id: 1, deny: true }], // deny rule present
    ];

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "DENY_RULE",
    });
    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
  });

  it("throws NOT_QUALIFIED when referee not in getRefs results", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [],
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ total: 0, results: [] });

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "NOT_QUALIFIED",
    });
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("throws FEDERATION_ERROR when submit response lacks success message", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [],
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ total: 1, results: [CANDIDATE] });
    mocks.submitRefereeAssignment.mockResolvedValue({
      game1: { spielplanId: 12345 },
      gameInfoMessages: ["Fehler: Slot belegt"],
      editAnythingPossible: false,
    });

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "FEDERATION_ERROR",
    });
    expect(mocks.updateWhere).not.toHaveBeenCalled();
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips deny check when matchId is null", async () => {
    const gameNoMatch = { ...GAME_ROW, matchId: null };
    mocks.selectCalls = [
      [gameNoMatch],
      [REFEREE_ROW],
      // No further selects (no deny check without matchId)
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ total: 1, results: [CANDIDATE] });
    mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await assignReferee(12345, 1, 9001);
    expect(result.success).toBe(true);
  });
});

// ── unassignReferee ────────────────────────────────────────────────────────

describe("unassignReferee", () => {
  it("happy path: unassigns sr1, clears local state, emits event", async () => {
    const assignedGame = {
      ...GAME_ROW,
      sr1Status: "assigned",
      sr1Name: "Max Muster",
      sr1RefereeApiId: 9001,
    };
    mocks.selectCalls = [[assignedGame]];
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(12345, 1);

    expect(result).toEqual({ success: true, slot: "sr1", status: "open" });
    expect(mocks.submitRefereeUnassignment).toHaveBeenCalledWith(12345, 1);
    expect(mocks.updateWhere).toHaveBeenCalled();
    expect(mocks.publishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "referee.unassigned" }),
    );
  });

  it("throws GAME_NOT_FOUND when spielplanId not in refereeGames", async () => {
    mocks.selectCalls = [[]];

    await expect(unassignReferee(12345, 1)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
    });
  });

  it("throws FEDERATION_ERROR when unassign response lacks success message", async () => {
    mocks.selectCalls = [[GAME_ROW]];
    mocks.submitRefereeUnassignment.mockResolvedValue({
      game1: { spielplanId: 12345 },
      gameInfoMessages: [],
      editAnythingPossible: false,
    });

    await expect(unassignReferee(12345, 1)).rejects.toMatchObject({
      code: "FEDERATION_ERROR",
    });
    expect(mocks.updateWhere).not.toHaveBeenCalled();
  });
});

// ── searchCandidates ───────────────────────────────────────────────────────

describe("searchCandidates", () => {
  it("proxies to sdkClient and returns results", async () => {
    mocks.searchRefereesForGame.mockResolvedValue({
      total: 2,
      results: [CANDIDATE, { ...CANDIDATE, srId: 9002 }],
    });

    const result = await searchCandidates(12345, "Max", 0, 15);

    expect(result).toEqual({ total: 2, results: expect.arrayContaining([]) });
    expect(mocks.searchRefereesForGame).toHaveBeenCalledWith(12345, {
      textSearch: "Max",
      pageFrom: 0,
      pageSize: 15,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api test -- referee-assignment.service
```

Expected: FAIL — `Cannot find module './referee-assignment.service'`.

- [ ] **Step 3: Implement the service**

```typescript
// apps/api/src/services/referee/referee-assignment.service.ts

import { db } from "../../config/database";
import {
  refereeGames,
  referees,
  matches,
  teams,
  refereeAssignmentRules,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
import type { AssignRefereeResponse, UnassignRefereeResponse, CandidateSearchResponse } from "@dragons/shared";

const FEDERATION_SUCCESS = "Änderungen erfolgreich übernommen";

export class AssignmentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AssignmentError";
  }
}

export async function assignReferee(
  spielplanId: number,
  slotNumber: 1 | 2,
  refereeApiId: number,
): Promise<AssignRefereeResponse> {
  // 1. Look up game
  const [game] = await db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.apiMatchId, spielplanId))
    .limit(1);

  if (!game) {
    throw new AssignmentError(`Game not found: spielplanId=${spielplanId}`, "GAME_NOT_FOUND");
  }

  // 2. Look up referee
  const [referee] = await db
    .select()
    .from(referees)
    .where(eq(referees.apiId, refereeApiId))
    .limit(1);

  if (!referee) {
    throw new AssignmentError(`Referee not found: apiId=${refereeApiId}`, "NOT_QUALIFIED");
  }

  // 3. Deny check (only when matchId is present)
  if (game.matchId) {
    const [matchRow] = await db
      .select({ homeTeamApiId: matches.homeTeamApiId, guestTeamApiId: matches.guestTeamApiId })
      .from(matches)
      .where(eq(matches.id, game.matchId))
      .limit(1);

    if (matchRow) {
      const teamRows = await db
        .select({ id: teams.id })
        .from(teams)
        .where(
          inArray(teams.apiTeamPermanentId, [
            matchRow.homeTeamApiId,
            matchRow.guestTeamApiId,
          ]),
        );

      const teamIds = teamRows.map((r) => r.id);

      if (teamIds.length > 0) {
        const denyRules = await db
          .select({ id: refereeAssignmentRules.id })
          .from(refereeAssignmentRules)
          .where(
            and(
              eq(refereeAssignmentRules.refereeId, referee.id),
              inArray(refereeAssignmentRules.teamId, teamIds),
              eq(refereeAssignmentRules.deny, true),
            ),
          )
          .limit(1);

        if (denyRules.length > 0) {
          throw new AssignmentError("Assignment blocked by club rule", "DENY_RULE");
        }
      }
    }
  }

  // 4. Verify qualification via federation getRefs
  const refsResponse = await sdkClient.searchRefereesForGame(spielplanId, {
    pageSize: 200,
  });

  const candidate = refsResponse.results.find((r) => r.srId === refereeApiId);
  if (!candidate) {
    throw new AssignmentError(
      `Referee ${refereeApiId} not found in qualified candidates for game ${spielplanId}`,
      "NOT_QUALIFIED",
    );
  }

  // 5. Submit to federation
  const submitResponse = await sdkClient.submitRefereeAssignment(
    spielplanId,
    slotNumber,
    candidate,
  );

  if (!submitResponse.gameInfoMessages.includes(FEDERATION_SUCCESS)) {
    throw new AssignmentError(
      `Federation rejected assignment: ${submitResponse.gameInfoMessages.join(", ")}`,
      "FEDERATION_ERROR",
    );
  }

  // 6. Update local state
  const refereeName = `${candidate.vorname} ${candidate.nachName}`;
  const slotKey = slotNumber === 1 ? "sr1" : "sr2";

  const slotUpdate =
    slotNumber === 1
      ? { sr1Name: refereeName, sr1RefereeApiId: refereeApiId, sr1Status: "assigned" as const }
      : { sr2Name: refereeName, sr2RefereeApiId: refereeApiId, sr2Status: "assigned" as const };

  await db
    .update(refereeGames)
    .set(slotUpdate)
    .where(eq(refereeGames.apiMatchId, spielplanId));

  // 7. Upsert intent (only when matchId is present)
  if (game.matchId) {
    await db
      .insert(refereeAssignmentIntents)
      .values({
        matchId: game.matchId,
        refereeId: referee.id,
        slotNumber,
        clickedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          refereeAssignmentIntents.matchId,
          refereeAssignmentIntents.refereeId,
          refereeAssignmentIntents.slotNumber,
        ],
        set: { clickedAt: new Date() },
      });
  }

  // 8. Publish domain event
  await publishDomainEvent({
    type: EVENT_TYPES.REFEREE_ASSIGNED,
    source: "manual",
    entityType: "referee",
    entityId: referee.id,
    entityName: refereeName,
    deepLinkPath: "/admin/referee/matches",
    payload: {
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      refereeName,
      role: slotKey.toUpperCase(),
      teamIds: [],
    },
  });

  return { success: true, slot: slotKey, status: "assigned", refereeName };
}

export async function unassignReferee(
  spielplanId: number,
  slotNumber: 1 | 2,
): Promise<UnassignRefereeResponse> {
  // 1. Look up game
  const [game] = await db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.apiMatchId, spielplanId))
    .limit(1);

  if (!game) {
    throw new AssignmentError(`Game not found: spielplanId=${spielplanId}`, "GAME_NOT_FOUND");
  }

  // 2. Submit unassignment to federation
  const submitResponse = await sdkClient.submitRefereeUnassignment(spielplanId, slotNumber);

  if (!submitResponse.gameInfoMessages.includes(FEDERATION_SUCCESS)) {
    throw new AssignmentError(
      `Federation rejected unassignment: ${submitResponse.gameInfoMessages.join(", ")}`,
      "FEDERATION_ERROR",
    );
  }

  // 3. Clear local state
  const slotKey = slotNumber === 1 ? "sr1" : "sr2";
  const currentName = slotNumber === 1 ? game.sr1Name : game.sr2Name;

  const slotClear =
    slotNumber === 1
      ? { sr1Name: null, sr1RefereeApiId: null, sr1Status: "open" as const }
      : { sr2Name: null, sr2RefereeApiId: null, sr2Status: "open" as const };

  await db
    .update(refereeGames)
    .set(slotClear)
    .where(eq(refereeGames.apiMatchId, spielplanId));

  // 4. Delete intent (only when matchId is present)
  if (game.matchId) {
    // Find the referee record by name or apiId to delete the intent
    const srApiId = slotNumber === 1 ? game.sr1RefereeApiId : game.sr2RefereeApiId;
    if (srApiId) {
      const [referee] = await db
        .select({ id: referees.id })
        .from(referees)
        .where(eq(referees.apiId, srApiId))
        .limit(1);

      if (referee) {
        await db
          .delete(refereeAssignmentIntents)
          .where(
            and(
              eq(refereeAssignmentIntents.matchId, game.matchId),
              eq(refereeAssignmentIntents.refereeId, referee.id),
              eq(refereeAssignmentIntents.slotNumber, slotNumber),
            ),
          );
      }
    }
  }

  // 5. Publish domain event
  await publishDomainEvent({
    type: EVENT_TYPES.REFEREE_UNASSIGNED,
    source: "manual",
    entityType: "referee",
    entityId: 0,
    entityName: currentName ?? "Unknown",
    deepLinkPath: "/admin/referee/matches",
    payload: {
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      refereeName: currentName ?? "Unknown",
      role: slotKey.toUpperCase(),
      teamIds: [],
    },
  });

  return { success: true, slot: slotKey, status: "open" };
}

export async function searchCandidates(
  spielplanId: number,
  search: string,
  pageFrom: number,
  pageSize: number,
): Promise<CandidateSearchResponse> {
  return sdkClient.searchRefereesForGame(spielplanId, {
    textSearch: search || null,
    pageFrom,
    pageSize,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @dragons/api test -- referee-assignment.service
```

Expected: all tests PASS.

- [ ] **Step 5: Check type errors**

```bash
pnpm --filter @dragons/api typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/referee/referee-assignment.service.ts apps/api/src/services/referee/referee-assignment.service.test.ts
git commit -m "feat(api): add referee assignment service with TDD"
```

---

## Task 5: Referee Assign Route (TDD)

**Files:**
- Create: `apps/api/src/routes/referee/assignment.routes.test.ts`
- Create: `apps/api/src/routes/referee/assignment.routes.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/routes/referee/assignment.routes.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  assignReferee: vi.fn(),
  getSession: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock("../../services/referee/referee-assignment.service", () => ({
  assignReferee: mocks.assignReferee,
}));

vi.mock("../../config/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.dbSelect }) }) }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
}));

vi.mock("@dragons/db/schema", () => ({
  referees: { id: "r.id", apiId: "r.apiId" },
}));

import { refereeAssignmentRoutes } from "./assignment.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeAssignmentRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /games/:spielplanId/assign", () => {
  const validBody = { slotNumber: 1, refereeApiId: 9001 };

  it("returns 401 when no session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when referee tries to assign a different refereeApiId", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    // referees.apiId lookup returns apiId=9999 (not 9001 in the body)
    mocks.dbSelect.mockResolvedValue([{ apiId: 9999 }]);

    const res = await app.request("/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("allows admin to assign any referee without the self-assign check", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin", refereeId: null },
      session: {},
    });
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });

    const res = await app.request("/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, slot: "sr1" });
  });

  it("happy path: referee assigns themselves", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    mocks.dbSelect.mockResolvedValue([{ apiId: 9001 }]);
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });

    const res = await app.request("/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, refereeName: "Max Muster" });
    expect(mocks.assignReferee).toHaveBeenCalledWith(12345, 1, 9001);
  });

  it("returns 400 for invalid body (slotNumber out of range)", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin", refereeId: null },
      session: {},
    });

    const res = await app.request("/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 5, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(400);
  });

  it("maps AssignmentError codes to HTTP status codes", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin", refereeId: null },
      session: {},
    });
    const { AssignmentError } = await import("../../services/referee/referee-assignment.service");
    mocks.assignReferee.mockRejectedValue(new AssignmentError("slot taken", "SLOT_TAKEN"));

    const res = await app.request("/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "SLOT_TAKEN" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api test -- assignment.routes.test
```

Expected: FAIL — `Cannot find module './assignment.routes'`.

- [ ] **Step 3: Implement the route**

```typescript
// apps/api/src/routes/referee/assignment.routes.ts

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { auth } from "../../config/auth";
import { db } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { assignReferee, AssignmentError } from "../../services/referee/referee-assignment.service";

const assignBodySchema = z.object({
  slotNumber: z.union([z.literal(1), z.literal(2)]),
  refereeApiId: z.number().int().positive(),
});

const ERROR_STATUS_MAP: Record<string, number> = {
  GAME_NOT_FOUND: 404,
  NOT_QUALIFIED: 422,
  SLOT_TAKEN: 409,
  DENY_RULE: 403,
  FEDERATION_ERROR: 502,
  FORBIDDEN: 403,
};

const refereeAssignmentRoutes = new Hono<AppEnv>();

refereeAssignmentRoutes.post(
  "/games/:spielplanId/assign",
  zValidator("json", assignBodySchema),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }

    const spielplanId = Number(c.req.param("spielplanId"));
    if (!Number.isInteger(spielplanId) || spielplanId <= 0) {
      return c.json({ error: "Invalid spielplanId", code: "VALIDATION_ERROR" }, 400);
    }

    const { slotNumber, refereeApiId } = c.req.valid("json");

    // Self-assign guard: referees can only assign themselves
    if (session.user.role === "referee") {
      if (!session.user.refereeId) {
        return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
      }
      const [refereeRow] = await db
        .select({ apiId: referees.apiId })
        .from(referees)
        .where(eq(referees.id, session.user.refereeId))
        .limit(1);

      if (!refereeRow || refereeRow.apiId !== refereeApiId) {
        return c.json({ error: "Cannot assign another referee", code: "FORBIDDEN" }, 403);
      }
    }

    try {
      const result = await assignReferee(spielplanId, slotNumber, refereeApiId);
      return c.json(result);
    } catch (error) {
      if (error instanceof AssignmentError) {
        const status = ERROR_STATUS_MAP[error.code] ?? 500;
        return c.json({ error: error.message, code: error.code }, status as never);
      }
      throw error;
    }
  },
);

export { refereeAssignmentRoutes };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @dragons/api test -- assignment.routes.test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/referee/assignment.routes.ts apps/api/src/routes/referee/assignment.routes.test.ts
git commit -m "feat(api): add referee self-assign route with auth guard"
```

---

## Task 6: Admin Routes (TDD)

**Files:**
- Create: `apps/api/src/routes/admin/referee-assignment.routes.test.ts`
- Create: `apps/api/src/routes/admin/referee-assignment.routes.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/routes/admin/referee-assignment.routes.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  assignReferee: vi.fn(),
  unassignReferee: vi.fn(),
  searchCandidates: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../../services/referee/referee-assignment.service", () => ({
  assignReferee: mocks.assignReferee,
  unassignReferee: mocks.unassignReferee,
  searchCandidates: mocks.searchCandidates,
  AssignmentError: class AssignmentError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

vi.mock("../../config/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

import { adminRefereeAssignmentRoutes } from "./referee-assignment.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", adminRefereeAssignmentRoutes);

const adminSession = {
  user: { id: "u1", role: "admin", refereeId: null },
  session: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /referee/games/:spielplanId/candidates", () => {
  it("returns 401 without session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/referee/games/12345/candidates?slotNumber=1");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    const res = await app.request("/referee/games/12345/candidates?slotNumber=1");
    expect(res.status).toBe(403);
  });

  it("returns candidates for admin", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.searchCandidates.mockResolvedValue({ total: 3, results: [] });

    const res = await app.request(
      "/referee/games/12345/candidates?slotNumber=1&search=Max&pageFrom=0&pageSize=15",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 3 });
    expect(mocks.searchCandidates).toHaveBeenCalledWith(12345, "Max", 0, 15);
  });
});

describe("POST /referee/games/:spielplanId/assign", () => {
  const validBody = { slotNumber: 1, refereeApiId: 9001 };

  it("returns 401 without session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(403);
  });

  it("assigns referee and returns result", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });

    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, slot: "sr1" });
    expect(mocks.assignReferee).toHaveBeenCalledWith(12345, 1, 9001);
  });
});

describe("DELETE /referee/games/:spielplanId/assignment/:slotNumber", () => {
  it("returns 401 without session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
  });

  it("unassigns and returns open status", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.unassignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "open",
    });

    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, slot: "sr1", status: "open" });
    expect(mocks.unassignReferee).toHaveBeenCalledWith(12345, 1);
  });

  it("returns 400 for non-numeric slotNumber", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const res = await app.request("/referee/games/12345/assignment/abc", {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api test -- referee-assignment.routes.test
```

Expected: FAIL — `Cannot find module './referee-assignment.routes'`.

- [ ] **Step 3: Implement the admin routes**

```typescript
// apps/api/src/routes/admin/referee-assignment.routes.ts

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { auth } from "../../config/auth";
import {
  assignReferee,
  unassignReferee,
  searchCandidates,
  AssignmentError,
} from "../../services/referee/referee-assignment.service";

const assignBodySchema = z.object({
  slotNumber: z.union([z.literal(1), z.literal(2)]),
  refereeApiId: z.number().int().positive(),
});

const ERROR_STATUS_MAP: Record<string, number> = {
  GAME_NOT_FOUND: 404,
  NOT_QUALIFIED: 422,
  SLOT_TAKEN: 409,
  DENY_RULE: 403,
  FEDERATION_ERROR: 502,
  FORBIDDEN: 403,
};

async function requireAdmin(c: Parameters<Parameters<Hono["use"]>[0]>[0]) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return { error: "Unauthorized", code: "UNAUTHORIZED", status: 401 as const };
  if (session.user.role !== "admin")
    return { error: "Forbidden", code: "FORBIDDEN", status: 403 as const };
  return { session };
}

const adminRefereeAssignmentRoutes = new Hono<AppEnv>();

// GET /referee/games/:spielplanId/candidates
adminRefereeAssignmentRoutes.get("/referee/games/:spielplanId/candidates", async (c) => {
  const check = await requireAdmin(c);
  if ("error" in check) return c.json({ error: check.error, code: check.code }, check.status);

  const spielplanId = Number(c.req.param("spielplanId"));
  if (!Number.isInteger(spielplanId) || spielplanId <= 0) {
    return c.json({ error: "Invalid spielplanId", code: "VALIDATION_ERROR" }, 400);
  }

  const search = c.req.query("search") ?? "";
  const pageFrom = Number(c.req.query("pageFrom") ?? 0);
  const pageSize = Math.min(Number(c.req.query("pageSize") ?? 15), 50);

  const result = await searchCandidates(spielplanId, search, pageFrom, pageSize);
  return c.json(result);
});

// POST /referee/games/:spielplanId/assign
adminRefereeAssignmentRoutes.post(
  "/referee/games/:spielplanId/assign",
  zValidator("json", assignBodySchema),
  async (c) => {
    const check = await requireAdmin(c);
    if ("error" in check) return c.json({ error: check.error, code: check.code }, check.status);

    const spielplanId = Number(c.req.param("spielplanId"));
    if (!Number.isInteger(spielplanId) || spielplanId <= 0) {
      return c.json({ error: "Invalid spielplanId", code: "VALIDATION_ERROR" }, 400);
    }

    const { slotNumber, refereeApiId } = c.req.valid("json");

    try {
      const result = await assignReferee(spielplanId, slotNumber, refereeApiId);
      return c.json(result);
    } catch (error) {
      if (error instanceof AssignmentError) {
        const status = ERROR_STATUS_MAP[error.code] ?? 500;
        return c.json({ error: error.message, code: error.code }, status as never);
      }
      throw error;
    }
  },
);

// DELETE /referee/games/:spielplanId/assignment/:slotNumber
adminRefereeAssignmentRoutes.delete(
  "/referee/games/:spielplanId/assignment/:slotNumber",
  async (c) => {
    const check = await requireAdmin(c);
    if ("error" in check) return c.json({ error: check.error, code: check.code }, check.status);

    const spielplanId = Number(c.req.param("spielplanId"));
    if (!Number.isInteger(spielplanId) || spielplanId <= 0) {
      return c.json({ error: "Invalid spielplanId", code: "VALIDATION_ERROR" }, 400);
    }

    const slotNumberRaw = Number(c.req.param("slotNumber"));
    if (slotNumberRaw !== 1 && slotNumberRaw !== 2) {
      return c.json({ error: "slotNumber must be 1 or 2", code: "VALIDATION_ERROR" }, 400);
    }
    const slotNumber = slotNumberRaw as 1 | 2;

    try {
      const result = await unassignReferee(spielplanId, slotNumber);
      return c.json(result);
    } catch (error) {
      if (error instanceof AssignmentError) {
        const status = ERROR_STATUS_MAP[error.code] ?? 500;
        return c.json({ error: error.message, code: error.code }, status as never);
      }
      throw error;
    }
  },
);

export { adminRefereeAssignmentRoutes };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @dragons/api test -- referee-assignment.routes.test
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
pnpm --filter @dragons/api test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/referee-assignment.routes.ts apps/api/src/routes/admin/referee-assignment.routes.test.ts
git commit -m "feat(api): add admin referee assignment and candidate search routes"
```

---

## Task 7: Wire Routes + Update AGENTS.md

**Files:**
- Modify: `apps/api/src/routes/index.ts`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add routes to index.ts**

In `apps/api/src/routes/index.ts`, add the two new imports after the existing referee-related imports:

```typescript
import { refereeAssignmentRoutes } from "./referee/assignment.routes";
import { adminRefereeAssignmentRoutes } from "./admin/referee-assignment.routes";
```

Then add two `routes.route` calls after `routes.route("/referee", refereeGamesRoutes)`:

```typescript
routes.route("/referee", refereeAssignmentRoutes);
routes.route("/admin", adminRefereeAssignmentRoutes);
```

- [ ] **Step 2: Update AGENTS.md with new endpoints**

Find the API endpoints section in `AGENTS.md` and add under the referee routes section:

```
### Referee Assignment (role: referee | admin)
POST   /referee/games/:spielplanId/assign          Assign self to a game slot
       Body: { slotNumber: 1|2, refereeApiId: number }
       Returns: { success, slot, status, refereeName }

### Admin Referee Assignment (role: admin)
GET    /admin/referee/games/:spielplanId/candidates  Search qualified candidates
       Query: ?slotNumber=1&search=&pageFrom=0&pageSize=15
POST   /admin/referee/games/:spielplanId/assign     Assign referee to slot
       Body: { slotNumber: 1|2, refereeApiId: number }
DELETE /admin/referee/games/:spielplanId/assignment/:slotNumber  Remove referee from slot
```

- [ ] **Step 3: Run tests to verify routing is correct**

```bash
pnpm --filter @dragons/api test
```

Expected: all tests PASS.

- [ ] **Step 4: Run full typecheck and lint**

```bash
pnpm --filter @dragons/api typecheck
pnpm --filter @dragons/api lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/index.ts AGENTS.md
git commit -m "feat(api): wire referee assignment routes and update AGENTS.md"
```

---

## Task 8: Web — Referee Self-Assign

**Files:**
- Create: `apps/web/src/components/referee/assign-game-dialog.tsx`
- Modify: `apps/web/src/components/referee/referee-games-list.tsx`

- [ ] **Step 1: Create the AssignGameDialog component**

```tsx
// apps/web/src/components/referee/assign-game-dialog.tsx

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { useToast } from "@dragons/ui/components/use-toast";
import { fetchAPI, APIError } from "@/lib/api";
import type { RefereeGameListItem, AssignRefereeResponse } from "@dragons/shared";

interface AssignGameDialogProps {
  open: boolean;
  game: RefereeGameListItem | null;
  slotNumber: 1 | 2;
  refereeApiId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignGameDialog({
  open,
  game,
  slotNumber,
  refereeApiId,
  onClose,
  onSuccess,
}: AssignGameDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (!game) return null;

  const slotLabel = slotNumber === 1 ? "SR1" : "SR2";

  async function handleConfirm() {
    if (!game) return;
    setLoading(true);
    try {
      await fetchAPI<AssignRefereeResponse>(
        `/referee/games/${game.apiMatchId}/assign`,
        {
          method: "POST",
          body: JSON.stringify({ slotNumber, refereeApiId }),
        },
      );
      onSuccess();
      onClose();
      toast({ title: "Assignment confirmed", description: `You are assigned as ${slotLabel}.` });
    } catch (error) {
      const message =
        error instanceof APIError ? error.message : "Assignment failed. Please try again.";
      toast({ variant: "destructive", title: "Assignment failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take {slotLabel}</DialogTitle>
          <DialogDescription>
            {game.homeTeamName} vs. {game.guestTeamName}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm space-y-2 py-2">
          <p>
            <span className="text-muted-foreground">Date:</span>{" "}
            {game.kickoffDate} {game.kickoffTime?.slice(0, 5)}
          </p>
          {game.venueName && (
            <p>
              <span className="text-muted-foreground">Venue:</span> {game.venueName}
              {game.venueCity ? `, ${game.venueCity}` : ""}
            </p>
          )}
          <p className="text-muted-foreground mt-3">
            By continuing, this assignment will be officially submitted to the federation.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Submitting…" : "Take game"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update RefereeGamesList to support "Take" buttons**

In `apps/web/src/components/referee/referee-games-list.tsx`:

a) Import the new dialog at the top:

```tsx
import { AssignGameDialog } from "./assign-game-dialog";
```

b) Update the `RefereeGamesList` function signature to accept an optional `refereeApiId` prop (passed from the server page, which knows the session):

```tsx
interface RefereeGamesListProps {
  refereeApiId?: number;
}
```

c) Add dialog state inside the `RefereeGamesList` function, after the existing state:

```tsx
const [assignDialog, setAssignDialog] = useState<{
  game: RefereeGameListItem;
  slotNumber: 1 | 2;
} | null>(null);
```

d) Update the `getColumns` function signature to accept an action callback:

```tsx
function getColumns(
  t: ReturnType<typeof useTranslations<"refereeGames">>,
  format: ReturnType<typeof useFormatter>,
  onTakeSlot?: (game: RefereeGameListItem, slotNumber: 1 | 2) => void,
): ColumnDef<RefereeGameListItem, unknown>[] {
```

e) Replace the `sr1` and `sr2` column cell renderers to conditionally show "Take" buttons. In the `sr1` column cell:

```tsx
cell: ({ row }) => {
  const m = row.original;
  if (m.isCancelled || m.isForfeited) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <SrSlotBadge status={m.sr1Status} ourClub={m.sr1OurClub} name={m.sr1Name} t={t} />
      {onTakeSlot && m.sr1OurClub && m.sr1Status === "open" && (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onTakeSlot(m, 1)}>
          Take
        </Button>
      )}
    </div>
  );
},
```

Apply the same pattern to the `sr2` column (using `sr2OurClub`, `sr2Status`, `slotNumber: 2`).

f) Pass the callback to `getColumns` in the component:

```tsx
// Inside RefereeGamesList:
const onTakeSlot = refereeApiId
  ? (game: RefereeGameListItem, slotNumber: 1 | 2) => setAssignDialog({ game, slotNumber })
  : undefined;

const columns = useMemo(() => getColumns(t, format, onTakeSlot), [t, format, onTakeSlot]);
```

g) Add the dialog just before the closing `</DataTable>` wrapper:

```tsx
{assignDialog && refereeApiId && (
  <AssignGameDialog
    open
    game={assignDialog.game}
    slotNumber={assignDialog.slotNumber}
    refereeApiId={refereeApiId}
    onClose={() => setAssignDialog(null)}
    onSuccess={() => mutate()}
  />
)}
```

Also add `mutate` to the SWR destructure:

```tsx
const { data, mutate } = useSWR<PaginatedResponse<RefereeGameListItem>>(
  SWR_KEYS.refereeGames,
  apiFetcher,
);
```

h) Add `Button` import from `@dragons/ui/components/button` at the top of the file.

- [ ] **Step 3: Update the admin referee matches page to pass refereeApiId from session**

The referee's own game page doesn't exist yet as a separate route. For now, `RefereeGamesList` is used in the admin page at `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`. The self-assign feature is intentionally wired here for testing, since a dedicated referee page is out of scope for this task.

The admin page doesn't need `refereeApiId` (it's passing undefined, disabling "Take" buttons). No change needed for the admin page.

To use the "Take" button, a referee user would need a page that passes their `refereeApiId`. Add a note in the page for future wiring:

```tsx
// TODO: Pass refereeApiId from session when adding referee-specific page
<RefereeGamesList />
```

- [ ] **Step 4: Run typecheck on the web package**

```bash
pnpm --filter @dragons/web typecheck
```

Expected: no errors.

- [ ] **Step 5: Start the dev server and verify the dialog renders**

```bash
pnpm dev
```

Open the referee matches page (`/admin/referee/matches`) in the browser. Verify the SR column cells still render correctly. No "Take" buttons should appear (since `refereeApiId` is undefined in the current page). The dialog import should not cause any errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/referee/assign-game-dialog.tsx apps/web/src/components/referee/referee-games-list.tsx
git commit -m "feat(web): add referee self-assign dialog and Take button wiring"
```

---

## Task 9: Web — Admin Assign/Unassign

**Files:**
- Create: `apps/web/src/components/admin/referees/assign-referee-dialog.tsx`
- Create: `apps/web/src/components/admin/referees/unassign-referee-button.tsx`
- Modify: `apps/web/src/components/referee/referee-games-list.tsx`
- Modify: `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`

- [ ] **Step 1: Create UnassignRefereeButton**

```tsx
// apps/web/src/components/admin/referees/unassign-referee-button.tsx

"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover";
import { Button } from "@dragons/ui/components/button";
import { useToast } from "@dragons/ui/components/use-toast";
import { fetchAPI, APIError } from "@/lib/api";
import type { UnassignRefereeResponse } from "@dragons/shared";

interface UnassignRefereeButtonProps {
  spielplanId: number;
  slotNumber: 1 | 2;
  refereeName: string;
  onSuccess: () => void;
}

export function UnassignRefereeButton({
  spielplanId,
  slotNumber,
  refereeName,
  onSuccess,
}: UnassignRefereeButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleConfirm() {
    setLoading(true);
    try {
      await fetchAPI<UnassignRefereeResponse>(
        `/admin/referee/games/${spielplanId}/assignment/${slotNumber}`,
        { method: "DELETE" },
      );
      setOpen(false);
      onSuccess();
      toast({ title: "Referee removed", description: `${refereeName} unassigned.` });
    } catch (error) {
      const message =
        error instanceof APIError ? error.message : "Unassignment failed. Please try again.";
      toast({ variant: "destructive", title: "Unassignment failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive">
          Remove
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <p className="text-sm mb-3">
          Remove <strong>{refereeName}</strong>? This will be submitted to the federation.
        </p>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? "Removing…" : "Remove"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Create AssignRefereeDialog**

```tsx
// apps/web/src/components/admin/referees/assign-referee-dialog.tsx

"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { useToast } from "@dragons/ui/components/use-toast";
import { apiFetcher } from "@/lib/swr";
import { fetchAPI, APIError } from "@/lib/api";
import type {
  RefereeGameListItem,
  CandidateSearchResponse,
  AssignRefereeResponse,
} from "@dragons/shared";
import type { SdkRefCandidate } from "@dragons/sdk";

interface AssignRefereeDialogProps {
  open: boolean;
  game: RefereeGameListItem | null;
  slotNumber: 1 | 2;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignRefereeDialog({
  open,
  game,
  slotNumber,
  onClose,
  onSuccess,
}: AssignRefereeDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SdkRefCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const candidatesKey =
    open && game
      ? `/admin/referee/games/${game.apiMatchId}/candidates?slotNumber=${slotNumber}&search=${encodeURIComponent(search)}&pageFrom=0&pageSize=15`
      : null;

  const { data } = useSWR<CandidateSearchResponse>(candidatesKey, apiFetcher);

  const slotLabel = slotNumber === 1 ? "SR1" : "SR2";

  function handleClose() {
    setSearch("");
    setSelected(null);
    onClose();
  }

  async function handleConfirm() {
    if (!game || !selected) return;
    setLoading(true);
    try {
      await fetchAPI<AssignRefereeResponse>(
        `/admin/referee/games/${game.apiMatchId}/assign`,
        {
          method: "POST",
          body: JSON.stringify({ slotNumber, refereeApiId: selected.srId }),
        },
      );
      handleClose();
      onSuccess();
      toast({
        title: "Referee assigned",
        description: `${selected.vorname} ${selected.nachName} assigned as ${slotLabel}.`,
      });
    } catch (error) {
      const message =
        error instanceof APIError ? error.message : "Assignment failed. Please try again.";
      toast({ variant: "destructive", title: "Assignment failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign {slotLabel}</DialogTitle>
          {game && (
            <DialogDescription>
              {game.homeTeamName} vs. {game.guestTeamName} — {game.kickoffDate}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
            }}
            autoFocus
          />

          <div className="max-h-64 overflow-y-auto space-y-1">
            {data?.results.map((candidate) => (
              <button
                key={candidate.srId}
                type="button"
                onClick={() => setSelected(candidate)}
                className={`w-full text-left rounded px-3 py-2 text-sm transition-colors ${
                  selected?.srId === candidate.srId
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
              >
                <span className="font-medium">
                  {candidate.vorname} {candidate.nachName}
                </span>
                {candidate.distanceKm && (
                  <span className="ml-2 text-muted-foreground">{candidate.distanceKm} km</span>
                )}
                {candidate.warning.length > 0 && (
                  <span className="ml-2 text-destructive text-xs">⚠ {candidate.warning[0]}</span>
                )}
              </button>
            ))}
            {data && data.results.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-4 text-center">
                No qualified referees found
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || loading}>
            {loading ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add admin actions support to RefereeGamesList**

In `apps/web/src/components/referee/referee-games-list.tsx`:

a) Import the new admin components:

```tsx
import { AssignRefereeDialog } from "@/components/admin/referees/assign-referee-dialog";
import { UnassignRefereeButton } from "@/components/admin/referees/unassign-referee-button";
```

b) Update `RefereeGamesListProps`:

```tsx
interface RefereeGamesListProps {
  refereeApiId?: number;
  isAdmin?: boolean;
}
```

c) Add admin dialog state inside `RefereeGamesList`:

```tsx
const [adminAssignDialog, setAdminAssignDialog] = useState<{
  game: RefereeGameListItem;
  slotNumber: 1 | 2;
} | null>(null);
```

d) Update `getColumns` to accept admin action callbacks:

```tsx
function getColumns(
  t: ReturnType<typeof useTranslations<"refereeGames">>,
  format: ReturnType<typeof useFormatter>,
  onTakeSlot?: (game: RefereeGameListItem, slotNumber: 1 | 2) => void,
  adminActions?: {
    onAssign: (game: RefereeGameListItem, slotNumber: 1 | 2) => void;
    onUnassign: (game: RefereeGameListItem, slotNumber: 1 | 2, mutate: () => void) => React.ReactNode;
  },
): ColumnDef<RefereeGameListItem, unknown>[] {
```

Actually, to avoid passing complex callbacks through column definitions, keep it simpler: pass the whole `mutate` function into the dialog via props, not through columns. Instead, update the sr1/sr2 columns to accept a single `slotActions` helper:

Replace the SR column cell rendering with this pattern (for `sr1`):

```tsx
cell: ({ row }) => {
  const m = row.original;
  if (m.isCancelled || m.isForfeited) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SrSlotBadge status={m.sr1Status} ourClub={m.sr1OurClub} name={m.sr1Name} t={t} />
      {onTakeSlot && m.sr1OurClub && m.sr1Status === "open" && (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onTakeSlot(m, 1)}>
          Take
        </Button>
      )}
      {onAdminAssign && m.sr1Status === "open" && (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onAdminAssign(m, 1)}>
          Assign
        </Button>
      )}
      {onAdminUnassign && m.sr1Status === "assigned" && m.sr1Name && (
        <UnassignRefereeButton
          spielplanId={m.apiMatchId}
          slotNumber={1}
          refereeName={m.sr1Name}
          onSuccess={onAdminUnassign}
        />
      )}
    </div>
  );
},
```

Update `getColumns` signature to:

```tsx
function getColumns(
  t: ReturnType<typeof useTranslations<"refereeGames">>,
  format: ReturnType<typeof useFormatter>,
  onTakeSlot?: (game: RefereeGameListItem, slotNumber: 1 | 2) => void,
  onAdminAssign?: (game: RefereeGameListItem, slotNumber: 1 | 2) => void,
  onAdminUnassign?: () => void,
): ColumnDef<RefereeGameListItem, unknown>[] {
```

Apply the equivalent changes to `sr2` column (using `sr2OurClub`, `sr2Status`, `sr2Name`, `slotNumber: 2`).

e) In `RefereeGamesList`, add the admin callbacks:

```tsx
const { isAdmin = false } = props;

const onAdminAssign = isAdmin
  ? (game: RefereeGameListItem, slotNumber: 1 | 2) =>
      setAdminAssignDialog({ game, slotNumber })
  : undefined;

const onAdminUnassign = isAdmin ? () => mutate() : undefined;

const columns = useMemo(
  () => getColumns(t, format, onTakeSlot, onAdminAssign, onAdminUnassign),
  [t, format, onTakeSlot, onAdminAssign, onAdminUnassign],
);
```

f) Add the admin dialog before the closing `</DataTable>` wrapper:

```tsx
{adminAssignDialog && (
  <AssignRefereeDialog
    open
    game={adminAssignDialog.game}
    slotNumber={adminAssignDialog.slotNumber}
    onClose={() => setAdminAssignDialog(null)}
    onSuccess={() => mutate()}
  />
)}
```

- [ ] **Step 4: Update the admin referee matches page to pass isAdmin**

In `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`, update the `RefereeGamesList` usage:

```tsx
<SWRConfig value={{ fallback: { [SWR_KEYS.refereeGames]: data } }}>
  <RefereeGamesList isAdmin />
</SWRConfig>
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm --filter @dragons/web typecheck
```

Expected: no errors.

- [ ] **Step 6: Start dev server and verify admin UI**

```bash
pnpm dev
```

Log in as an admin and visit `/admin/referee/matches`. Verify:

- Open slots show "Assign" button → click opens `AssignRefereeDialog` with a search input
- Type a name in the search → candidates list updates via SWR
- Select a candidate → "Assign" button becomes active
- Assigned slots show "Remove" button → click shows confirmation popover
- Confirming remove updates the row

- [ ] **Step 7: Commit**

```bash
git add \
  apps/web/src/components/admin/referees/assign-referee-dialog.tsx \
  apps/web/src/components/admin/referees/unassign-referee-button.tsx \
  apps/web/src/components/referee/referee-games-list.tsx \
  apps/web/src/app/[locale]/admin/referee/matches/page.tsx
git commit -m "feat(web): add admin assign/unassign referee UI"
```

---

## Coverage Check

After all tasks, verify coverage thresholds are still met:

```bash
pnpm --filter @dragons/api coverage
```

Expected: branches ≥ 90%, functions/lines/statements ≥ 95%.

If coverage drops, add targeted tests for uncovered branches (especially error paths in the service).

---

## Spec Coverage Verification

| Spec requirement | Implemented in |
|-----------------|----------------|
| Self-assign via `POST /referee/games/:id/assign` | Task 5 |
| Admin assign via `POST /admin/referee/games/:id/assign` | Task 6 |
| Admin unassign via `DELETE /admin/referee/games/:id/assignment/:slot` | Task 6 |
| Candidate search via `GET /admin/referee/games/:id/candidates` | Task 6 |
| Deny rule check before federation call | Task 4 |
| NOT_QUALIFIED when not in getRefs | Task 4 |
| FEDERATION_ERROR when response lacks success message | Task 4 |
| Optimistic local state update on success | Task 4 |
| refereeAssignmentIntents upsert | Task 4 |
| REFEREE_ASSIGNED / REFEREE_UNASSIGNED domain events | Task 4 |
| Self-assign guard (referee can't assign others) | Task 5 |
| SDK types: SdkRefCandidate, SdkSubmitPayload, etc. | Task 1 |
| Shared types: AssignRefereeBody, AssignRefereeResponse, etc. | Task 2 |
| SdkClient: searchRefereesForGame, submitAssignment, submitUnassignment | Task 3 |
| Web: confirmation dialog for referee | Task 8 |
| Web: candidate search + assign dialog for admin | Task 9 |
| Web: unassign popover for admin | Task 9 |
