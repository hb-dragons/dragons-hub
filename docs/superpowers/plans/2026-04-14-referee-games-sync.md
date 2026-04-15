# Referee Games Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the derived referee notification detection with a dedicated sync from the federation's `offenespiele/search` endpoint, storing all club referee games in a new `referee_games` table.

**Architecture:** New `referee_games` table synced from a dedicated federation endpoint using separate referee credentials. The sync detects state changes (open slots, filled slots, cancellations) and emits domain events. Replaces the `isOwnClubRefsMatch()` chain in match sync. Reminder jobs use `apiMatchId` for deterministic IDs.

**Tech Stack:** Drizzle ORM, BullMQ, Vitest, Zod, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-14-referee-games-sync-design.md`

---

### Task 1: SDK Types for Offenespiele Response

The existing `SdkOpenGame` / `SdkOpenGamesSearchParams` / `SdkOpenGamesResponse` types in `packages/sdk/src/types/game-details.ts` are simplified stubs that don't match the actual API response. Replace them with accurate types matching the real response structure.

**Files:**
- Modify: `packages/sdk/src/types/game-details.ts:102-135`
- Modify: `packages/sdk/src/index.ts:27-32` (update exports)

- [ ] **Step 1: Replace the three stub types with accurate ones**

In `packages/sdk/src/types/game-details.ts`, replace lines 102-135 (`SdkOpenGamesSearchParams`, `SdkOpenGame`, `SdkOpenGamesResponse`) with:

```typescript
export interface SdkOpenGamesSearchParams {
  ats: null;
  datum: string;
  ligaKurz: string | null;
  pageFrom: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  spielStatus: "ALLE" | "OFFEN" | "BESETZT";
  srName: string | null;
  vereinsDelegation: "ALLE";
  vereinsSpiele: "VEREIN" | "STANDARD" | "ALLE" | "NUR_HM" | "NUR_AM";
  zeitraum: "all" | "heute" | "woche" | "monat";
}

export interface SdkOffeneSpieleLiga {
  ligaId: number;
  liganr: number;
  liganame: string;
  ligaKurzname: string | null;
  srKurzname: string | null;
  sr1modus: string | null;
  sr2modus: string | null;
}

export interface SdkOffeneSpieleSp {
  spielplanId: number;
  spielnr: number;
  spieltag: number;
  spieldatum: number; // epoch ms
  spielfeldId: number | null;
  liga: SdkOffeneSpieleLiga;
  heimMannschaftLiga: SdkMannschaftLiga;
  gastMannschaftLiga: SdkMannschaftLiga;
  spielfeld: SdkSpielfeld | null;
  sr1Verein: SdkVerein | null;
  sr2Verein: SdkVerein | null;
  sr1VereinInformiert: boolean | null;
  sr2VereinInformiert: boolean | null;
  ergebnisbestaetigt: boolean;
  verzicht: boolean;
  abgesagt: boolean;
  spielortGeandert: boolean;
  spielzeitGeandert: boolean;
}

export interface SdkOffeneSpielResult {
  sp: SdkOffeneSpieleSp;
  sr1: SdkSpielleitung | null;
  sr2: SdkSpielleitung | null;
  sr1MeinVerein: boolean;
  sr2MeinVerein: boolean;
  sr1OffenAngeboten: boolean;
  sr2OffenAngeboten: boolean;
}

export interface SdkOffeneSpieleResponse {
  total: number;
  results: SdkOffeneSpielResult[];
}
```

- [ ] **Step 2: Update exports in index.ts**

In `packages/sdk/src/index.ts`, replace lines 27-32 (the `SdkOpenGamesSearchParams`, `SdkOpenGame`, `SdkOpenGamesResponse` exports) with:

```typescript
  SdkOpenGamesSearchParams,
  SdkOffeneSpieleLiga,
  SdkOffeneSpieleSp,
  SdkOffeneSpielResult,
  SdkOffeneSpieleResponse,
```

Remove `SdkOpenGame` and `SdkOpenGamesResponse` from the export list.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no consumers of the removed types exist in the codebase)

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/types/game-details.ts packages/sdk/src/index.ts
git commit -m "feat: replace stub offenespiele SDK types with accurate response types"
```

---

### Task 2: `referee_games` Database Schema

**Files:**
- Create: `packages/db/src/schema/referee-games.ts`
- Modify: `packages/db/src/schema/index.ts:25` (add export)

- [ ] **Step 1: Create the schema file**

Create `packages/db/src/schema/referee-games.ts`:

```typescript
import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  date,
  time,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const refereeGames = pgTable(
  "referee_games",
  {
    id: serial("id").primaryKey(),
    apiMatchId: integer("api_match_id").notNull().unique(),
    matchId: integer("match_id").references(() => matches.id),
    matchNo: integer("match_no").notNull(),
    kickoffDate: date("kickoff_date").notNull(),
    kickoffTime: time("kickoff_time").notNull(),
    homeTeamName: varchar("home_team_name", { length: 200 }).notNull(),
    guestTeamName: varchar("guest_team_name", { length: 200 }).notNull(),
    leagueName: varchar("league_name", { length: 200 }),
    leagueShort: varchar("league_short", { length: 50 }),
    venueName: varchar("venue_name", { length: 200 }),
    venueCity: varchar("venue_city", { length: 100 }),
    sr1OurClub: boolean("sr1_our_club").notNull(),
    sr2OurClub: boolean("sr2_our_club").notNull(),
    sr1Name: varchar("sr1_name", { length: 150 }),
    sr2Name: varchar("sr2_name", { length: 150 }),
    sr1RefereeApiId: integer("sr1_referee_api_id"),
    sr2RefereeApiId: integer("sr2_referee_api_id"),
    sr1Status: varchar("sr1_status", { length: 20 }).notNull().default("open"),
    sr2Status: varchar("sr2_status", { length: 20 }).notNull().default("open"),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    isForfeited: boolean("is_forfeited").notNull().default(false),
    homeClubId: integer("home_club_id"),
    guestClubId: integer("guest_club_id"),
    dataHash: varchar("data_hash", { length: 64 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("referee_games_match_id_idx").on(table.matchId),
    index("referee_games_kickoff_date_idx").on(table.kickoffDate),
  ],
);
```

- [ ] **Step 2: Export from index**

In `packages/db/src/schema/index.ts`, add after the last export line (line 25):

```typescript
export * from "./referee-games";
```

- [ ] **Step 3: Generate migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: A new migration file is created in the migrations directory.

- [ ] **Step 4: Apply migration**

Run: `pnpm --filter @dragons/db db:migrate`
Expected: Migration applies successfully.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/referee-games.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "feat: add referee_games table schema and migration"
```

---

### Task 3: Environment Variables

**Files:**
- Modify: `apps/api/src/config/env.ts:23-25`

- [ ] **Step 1: Add referee SDK env vars**

In `apps/api/src/config/env.ts`, after the WAHA vars (line 25, after `WAHA_SESSION`), add:

```typescript
  // Referee SDK (separate federation account for offenespiele sync)
  REFEREE_SDK_USERNAME: z.string().min(1).optional(),
  REFEREE_SDK_PASSWORD: z.string().min(1).optional(),
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "feat: add optional REFEREE_SDK_USERNAME/PASSWORD env vars"
```

---

### Task 4: Update `RefereeSlotsPayload` and Reminder Service

Update the shared payload type to support nullable fields, and change the reminder service to use `apiMatchId` instead of DB `matchId`.

**Files:**
- Modify: `packages/shared/src/domain-events.ts:197-214`
- Modify: `apps/api/src/services/referee/referee-reminders.service.ts`
- Modify: `apps/api/src/services/referee/referee-reminders.service.test.ts`
- Modify: `apps/api/src/workers/referee-reminder.worker.ts`
- Modify: `apps/api/src/workers/referee-reminder.worker.test.ts`

- [ ] **Step 1: Update `RefereeSlotsPayload`**

In `packages/shared/src/domain-events.ts`, replace lines 197-214:

```typescript
export interface RefereeSlotsPayload {
  matchId: number | null;
  matchNo: number | null;
  homeTeam: string;
  guestTeam: string;
  leagueId: number | null;
  leagueName: string;
  kickoffDate: string;
  kickoffTime: string;
  venueId: number | null;
  venueName: string | null;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
  reminderLevel?: number;
  deepLink: string;
}
```

- [ ] **Step 2: Update `buildReminderJobId` to use `apiMatchId`**

In `apps/api/src/services/referee/referee-reminders.service.ts`, change `buildReminderJobId` (line 20):

```typescript
export function buildReminderJobId(apiMatchId: number, days: number): string {
  return `reminder:${apiMatchId}:${days}`;
}
```

- [ ] **Step 3: Update `scheduleReminderJobs` signature**

In the same file, change `scheduleReminderJobs` (line 100):

```typescript
export async function scheduleReminderJobs(
  apiMatchId: number,
  refereeGameId: number,
  kickoffDate: string,
  kickoffTime: string,
): Promise<void> {
```

Update the job enqueue inside (around line 118) — change the job data and jobId:

```typescript
    await refereeRemindersQueue.add(
      "reminder",
      { apiMatchId, refereeGameId, reminderDays: delay.days },
      {
        delay: delay.delayMs,
        jobId: buildReminderJobId(apiMatchId, delay.days),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
```

- [ ] **Step 4: Update `cancelReminderJobs` signature**

In the same file, change `cancelReminderJobs` (line 127):

```typescript
export async function cancelReminderJobs(apiMatchId: number): Promise<void> {
```

Update the internals to use `apiMatchId`:

```typescript
  const reminderDays = await getReminderDays();
  for (const days of reminderDays) {
    const jobId = buildReminderJobId(apiMatchId, days);
    const job = await refereeRemindersQueue.getJob(jobId);
    if (job) await job.remove();
  }
```

- [ ] **Step 5: Update `ReminderJobData` interface**

In `apps/api/src/workers/referee-reminder.worker.ts`, replace the `ReminderJobData` interface (line 11):

```typescript
export interface ReminderJobData {
  apiMatchId: number;
  refereeGameId: number;
  reminderDays: number;
}
```

- [ ] **Step 6: Rewrite `loadMatchWithSlots` to use `referee_games`**

In `apps/api/src/workers/referee-reminder.worker.ts`, replace the `loadMatchWithSlots` function (lines 36-93) with:

```typescript
async function loadRefereeGame(refereeGameId: number) {
  const [row] = await db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.id, refereeGameId));
  return row ?? null;
}
```

Update the import at the top — replace the schema imports (line 6):

```typescript
import { refereeGames } from "@dragons/db/schema";
```

Remove unused imports: `matches`, `teams`, `leagues`, `matchReferees`, `referees`, `venues`.

- [ ] **Step 7: Rewrite the worker processor**

Replace the worker processor function (inside the `new Worker(...)` callback, approximately lines 97-153) with:

```typescript
  async (job: Job<ReminderJobData>) => {
    const { apiMatchId, refereeGameId, reminderDays } = job.data;
    const log = logger.child({ worker: "referee-reminder", apiMatchId, refereeGameId, reminderDays });

    log.info("Processing referee reminder job");

    const game = await loadRefereeGame(refereeGameId);
    if (!game) {
      log.warn("Referee game not found, skipping");
      return;
    }

    const sr1Assigned = game.sr1Status === "assigned" ? game.sr1Name : null;
    const sr2Assigned = game.sr2Status === "assigned" ? game.sr2Name : null;

    const state = {
      isCancelled: game.isCancelled,
      isForfeited: game.isForfeited,
      sr1Assigned,
      sr2Assigned,
    };

    if (!shouldEmitReminder(state)) {
      log.info({ state }, "Skipping reminder — match cancelled/forfeited or both slots filled");
      return;
    }

    const sr1Open = game.sr1OurClub && game.sr1Status !== "assigned";
    const sr2Open = game.sr2OurClub && game.sr2Status !== "assigned";

    const deepLink = game.matchId
      ? `/referee/matches?take=${game.matchId}`
      : `/referee/games?apiMatchId=${game.apiMatchId}`;

    const payload: RefereeSlotsPayload = {
      matchId: game.matchId,
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      leagueId: null,
      leagueName: game.leagueName ?? "",
      kickoffDate: game.kickoffDate,
      kickoffTime: game.kickoffTime,
      venueId: null,
      venueName: game.venueName,
      sr1Open,
      sr2Open,
      sr1Assigned,
      sr2Assigned,
      reminderLevel: reminderDays,
      deepLink,
    };

    await publishDomainEvent(EVENT_TYPES.REFEREE_SLOTS_REMINDER, payload);
    log.info({ sr1Open, sr2Open }, "Published referee slots reminder event");
  },
```

- [ ] **Step 8: Update tests**

In `apps/api/src/services/referee/referee-reminders.service.test.ts`, update the `buildReminderJobId` test:

```typescript
describe("buildReminderJobId", () => {
  it("builds deterministic job ID from apiMatchId", () => {
    expect(buildReminderJobId(2675740, 7)).toBe("reminder:2675740:7");
    expect(buildReminderJobId(2836773, 1)).toBe("reminder:2836773:1");
  });
});
```

The `referee-reminder.worker.test.ts` tests for `shouldEmitReminder` don't change — that function's interface stays the same.

- [ ] **Step 9: Verify typecheck and tests**

Run: `pnpm typecheck && pnpm --filter @dragons/api test -- --run apps/api/src/services/referee/referee-reminders.service.test.ts apps/api/src/workers/referee-reminder.worker.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/domain-events.ts apps/api/src/services/referee/referee-reminders.service.ts apps/api/src/services/referee/referee-reminders.service.test.ts apps/api/src/workers/referee-reminder.worker.ts apps/api/src/workers/referee-reminder.worker.test.ts
git commit -m "refactor: change reminder system to use apiMatchId and load from referee_games"
```

---

### Task 5: Referee SDK Client

**Files:**
- Create: `apps/api/src/services/sync/referee-sdk-client.ts`
- Create: `apps/api/src/services/sync/referee-sdk-client.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/services/sync/referee-sdk-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnv = {
  REFEREE_SDK_USERNAME: "ref-user",
  REFEREE_SDK_PASSWORD: "ref-pass",
} as Record<string, string | undefined>;

vi.mock("../../config/env", () => ({ env: mockEnv }));
vi.mock("../../config/logger", () => {
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() };
  log.child.mockReturnValue(log);
  return { logger: log };
});

import { createRefereeSdkClient } from "./referee-sdk-client";

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.REFEREE_SDK_USERNAME = "ref-user";
  mockEnv.REFEREE_SDK_PASSWORD = "ref-pass";
  vi.stubGlobal("fetch", vi.fn());
});

describe("createRefereeSdkClient", () => {
  it("returns empty results when credentials are not configured", async () => {
    mockEnv.REFEREE_SDK_USERNAME = undefined;
    const client = createRefereeSdkClient();

    const result = await client.fetchOffeneSpiele();

    expect(result).toEqual({ total: 0, results: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs in and fetches offene spiele", async () => {
    const mockFetch = vi.fn()
      // login call
      .mockResolvedValueOnce({
        text: () => Promise.resolve("redirect"),
        headers: { getSetCookie: () => ["SESSION=abc123; Path=/"] },
      })
      // verify call
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { loginName: "ref-user" } }),
      })
      // offenespiele call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 1, results: [{ sp: { spielplanId: 1 } }] }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = createRefereeSdkClient();

    const result = await client.fetchOffeneSpiele();

    expect(result.total).toBe(1);
    expect(result.results).toHaveLength(1);
    // Login was called with referee credentials
    expect(mockFetch.mock.calls[0]![0]).toContain("/login.do");
    expect(mockFetch.mock.calls[0]![1]?.body).toContain("ref-user");
  });

  it("reuses session within TTL", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        text: () => Promise.resolve("redirect"),
        headers: { getSetCookie: () => ["SESSION=abc123; Path=/"] },
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { loginName: "ref-user" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 0, results: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 0, results: [] }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = createRefereeSdkClient();

    await client.fetchOffeneSpiele();
    await client.fetchOffeneSpiele();

    // Login called only once (2 calls), then 2 data calls = 4 total
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("throws on invalid credentials", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      text: () => Promise.resolve("Die Kombination aus Benutzername und Passwort ist nicht bekannt!"),
      headers: { getSetCookie: () => [] },
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = createRefereeSdkClient();

    await expect(client.fetchOffeneSpiele()).rejects.toThrow("Invalid referee credentials");
  });

  it("paginates when total exceeds page size", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        text: () => Promise.resolve("redirect"),
        headers: { getSetCookie: () => ["SESSION=abc123; Path=/"] },
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { loginName: "ref-user" } }),
      })
      // Page 1: 200 results, total 250
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          total: 250,
          results: Array.from({ length: 200 }, (_, i) => ({ sp: { spielplanId: i } })),
        }),
      })
      // Page 2: 50 results
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          total: 250,
          results: Array.from({ length: 50 }, (_, i) => ({ sp: { spielplanId: 200 + i } })),
        }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = createRefereeSdkClient();

    const result = await client.fetchOffeneSpiele();

    expect(result.total).toBe(250);
    expect(result.results).toHaveLength(250);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/referee-sdk-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the client**

Create `apps/api/src/services/sync/referee-sdk-client.ts`:

```typescript
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import type { SdkOffeneSpieleResponse, SdkOpenGamesSearchParams } from "@dragons/sdk";

const BASE_URL = "https://www.basketball-bund.net";
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const PAGE_SIZE = 200;

const log = logger.child({ service: "referee-sdk-client" });

export interface RefereeSdkClient {
  fetchOffeneSpiele(): Promise<SdkOffeneSpieleResponse>;
}

export function createRefereeSdkClient(): RefereeSdkClient {
  let sessionCookie: string | null = null;
  let lastAuthAt = 0;

  function isConfigured(): boolean {
    return !!(env.REFEREE_SDK_USERNAME && env.REFEREE_SDK_PASSWORD);
  }

  async function ensureAuthenticated(): Promise<void> {
    if (sessionCookie && Date.now() - lastAuthAt < SESSION_MAX_AGE_MS) return;
    await login();
  }

  async function login(): Promise<void> {
    const username = env.REFEREE_SDK_USERNAME!;
    const password = env.REFEREE_SDK_PASSWORD!;

    const res = await fetch(`${BASE_URL}/login.do?reqCode=login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }).toString(),
      redirect: "manual",
    });

    const text = await res.text();
    if (text.includes("Die Kombination aus Benutzername und Passwort ist nicht bekannt!")) {
      throw new Error("Invalid referee credentials");
    }

    const setCookies = res.headers.getSetCookie();
    for (const raw of setCookies) {
      const kv = raw.split(";")[0]?.trim();
      if (kv?.startsWith("SESSION=")) {
        sessionCookie = kv;
        break;
      }
    }
    if (!sessionCookie) throw new Error("No SESSION cookie in referee login response");

    // Verify
    const verifyRes = await fetch(`${BASE_URL}/rest/user/lc`, {
      headers: { Cookie: sessionCookie, Accept: "application/json, text/plain, */*" },
    });
    const userData = await verifyRes.json();
    if (!userData?.data?.loginName) {
      throw new Error("Referee session verification failed");
    }

    lastAuthAt = Date.now();
    log.info({ loginName: userData.data.loginName }, "Referee SDK authenticated");
  }

  async function authFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Cookie: sessionCookie!,
        Accept: "application/json, text/plain, */*",
        ...init?.headers,
      },
    });
  }

  async function fetchOffeneSpiele(): Promise<SdkOffeneSpieleResponse> {
    if (!isConfigured()) {
      log.info("Referee SDK credentials not configured, skipping offenespiele fetch");
      return { total: 0, results: [] };
    }

    await ensureAuthenticated();

    const allResults: SdkOffeneSpieleResponse["results"] = [];
    let pageFrom = 0;
    let total = 0;

    do {
      const body: SdkOpenGamesSearchParams = {
        ats: null,
        datum: new Date().toISOString(),
        ligaKurz: null,
        pageFrom,
        pageSize: PAGE_SIZE,
        sortBy: "sp.spieldatum",
        sortOrder: "asc",
        spielStatus: "ALLE",
        srName: null,
        vereinsDelegation: "ALLE",
        vereinsSpiele: "VEREIN",
        zeitraum: "all",
      };

      const res = await authFetch("/rest/offenespiele/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`offenespiele/search failed: ${res.status} ${errText.slice(0, 200)}`);
      }

      const page: SdkOffeneSpieleResponse = await res.json();
      total = page.total;
      allResults.push(...page.results);
      pageFrom += PAGE_SIZE;
    } while (allResults.length < total);

    log.info({ total: allResults.length }, "Fetched offenespiele results");
    return { total, results: allResults };
  }

  return { fetchOffeneSpiele };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/referee-sdk-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sync/referee-sdk-client.ts apps/api/src/services/sync/referee-sdk-client.test.ts
git commit -m "feat: add referee SDK client for offenespiele endpoint"
```

---

### Task 6: Referee Games Sync Service

The core sync logic: fetch from API, map to DB rows, detect changes, emit events, manage reminders.

**Files:**
- Create: `apps/api/src/services/sync/referee-games.sync.ts`
- Create: `apps/api/src/services/sync/referee-games.sync.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/services/sync/referee-games.sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("../../config/logger", () => {
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() };
  log.child.mockReturnValue(log);
  return { logger: log };
});

const mockFetchOffeneSpiele = vi.fn();
vi.mock("./referee-sdk-client", () => ({
  createRefereeSdkClient: () => ({ fetchOffeneSpiele: mockFetchOffeneSpiele }),
}));

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  refereeGames: { id: "id", apiMatchId: "apiMatchId", dataHash: "dataHash" },
  matches: { apiMatchId: "apiMatchId", id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _type: "eq", args })),
}));

const mockPublishDomainEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

const mockScheduleReminderJobs = vi.fn().mockResolvedValue(undefined);
const mockCancelReminderJobs = vi.fn().mockResolvedValue(undefined);
vi.mock("../referee/referee-reminders.service", () => ({
  scheduleReminderJobs: (...args: unknown[]) => mockScheduleReminderJobs(...args),
  cancelReminderJobs: (...args: unknown[]) => mockCancelReminderJobs(...args),
}));

vi.mock("@dragons/shared", () => ({
  EVENT_TYPES: {
    REFEREE_SLOTS_NEEDED: "referee.slots.needed",
    REFEREE_SLOTS_REMINDER: "referee.slots.reminder",
  },
}));

import { mapApiResultToRow, deriveSrStatus, computeRefereeGameHash } from "./referee-games.sync";

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deriveSrStatus", () => {
  it('returns "assigned" when sr is not null', () => {
    expect(deriveSrStatus({ schiedsrichter: {} } as never, false)).toBe("assigned");
  });

  it('returns "offered" when sr is null and offenAngeboten is true', () => {
    expect(deriveSrStatus(null, true)).toBe("offered");
  });

  it('returns "open" when sr is null and offenAngeboten is false', () => {
    expect(deriveSrStatus(null, false)).toBe("open");
  });
});

describe("computeRefereeGameHash", () => {
  it("produces consistent hash for same input", () => {
    const row = {
      sr1Status: "open", sr2Status: "open",
      sr1Name: null, sr2Name: null,
      kickoffDate: "2026-04-20", kickoffTime: "14:00",
      isCancelled: false, isForfeited: false,
    };
    const h1 = computeRefereeGameHash(row as never);
    const h2 = computeRefereeGameHash(row as never);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("produces different hash when sr status changes", () => {
    const row1 = {
      sr1Status: "open", sr2Status: "open",
      sr1Name: null, sr2Name: null,
      kickoffDate: "2026-04-20", kickoffTime: "14:00",
      isCancelled: false, isForfeited: false,
    };
    const row2 = { ...row1, sr1Status: "assigned", sr1Name: "Max Müller" };
    expect(computeRefereeGameHash(row1 as never)).not.toBe(computeRefereeGameHash(row2 as never));
  });
});

describe("mapApiResultToRow", () => {
  const baseResult = {
    sp: {
      spielplanId: 2675740,
      spielnr: 2288,
      spieldatum: 1777118400000, // 2026-04-23T10:00:00Z
      liga: { liganame: "Regionsklasse Herren", ligaKurzname: "RGKH", srKurzname: "RKH" },
      heimMannschaftLiga: {
        mannschaftName: "Dragons 2",
        mannschaft: { verein: { vereinId: 4121 } },
      },
      gastMannschaftLiga: {
        mannschaftName: "Linden Dudes 3",
        mannschaft: { verein: { vereinId: 4144 } },
      },
      spielfeld: { bezeichnung: "Friedrich-Ebert-Schule", ort: "Hannover" },
      verzicht: false,
      abgesagt: false,
    },
    sr1: null,
    sr2: null,
    sr1MeinVerein: true,
    sr2MeinVerein: true,
    sr1OffenAngeboten: false,
    sr2OffenAngeboten: false,
  };

  it("maps API result to referee_games row shape", () => {
    const row = mapApiResultToRow(baseResult as never);

    expect(row.apiMatchId).toBe(2675740);
    expect(row.matchNo).toBe(2288);
    expect(row.homeTeamName).toBe("Dragons 2");
    expect(row.guestTeamName).toBe("Linden Dudes 3");
    expect(row.leagueName).toBe("Regionsklasse Herren");
    expect(row.leagueShort).toBe("RKH");
    expect(row.venueName).toBe("Friedrich-Ebert-Schule");
    expect(row.venueCity).toBe("Hannover");
    expect(row.sr1OurClub).toBe(true);
    expect(row.sr2OurClub).toBe(true);
    expect(row.sr1Status).toBe("open");
    expect(row.sr2Status).toBe("open");
    expect(row.sr1Name).toBeNull();
    expect(row.sr2Name).toBeNull();
    expect(row.isCancelled).toBe(false);
    expect(row.isForfeited).toBe(false);
    expect(row.homeClubId).toBe(4121);
    expect(row.guestClubId).toBe(4144);
  });

  it("extracts referee name when assigned", () => {
    const withRef = {
      ...baseResult,
      sr1: {
        schiedsrichter: {
          schiedsrichterId: 573738,
          personVO: { vorname: "Steffen", nachname: "Wieting" },
        },
      },
      sr1OffenAngeboten: false,
    };
    const row = mapApiResultToRow(withRef as never);

    expect(row.sr1Status).toBe("assigned");
    expect(row.sr1Name).toBe("Steffen Wieting");
    expect(row.sr1RefereeApiId).toBe(573738);
  });

  it("handles null spielfeld", () => {
    const noVenue = {
      ...baseResult,
      sp: { ...baseResult.sp, spielfeld: null },
    };
    const row = mapApiResultToRow(noVenue as never);

    expect(row.venueName).toBeNull();
    expect(row.venueCity).toBeNull();
  });

  it("converts spieldatum to Europe/Berlin date and time", () => {
    const row = mapApiResultToRow(baseResult as never);

    // 1777118400000 = 2026-04-23T10:00:00Z = 2026-04-23 12:00 CEST
    expect(row.kickoffDate).toBe("2026-04-23");
    expect(row.kickoffTime).toBe("12:00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/referee-games.sync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the sync service**

Create `apps/api/src/services/sync/referee-games.sync.ts`:

```typescript
import { createHash } from "crypto";
import { db } from "../../config/database";
import { refereeGames, matches } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../config/logger";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
import type { RefereeSlotsPayload } from "@dragons/shared";
import type { SdkOffeneSpielResult, SdkSpielleitung } from "@dragons/sdk";
import { scheduleReminderJobs, cancelReminderJobs } from "../referee/referee-reminders.service";
import { createRefereeSdkClient } from "./referee-sdk-client";

const log = logger.child({ service: "referee-games-sync" });

type RefereeGameRow = typeof refereeGames.$inferInsert;

export function deriveSrStatus(
  sr: SdkSpielleitung | null,
  offenAngeboten: boolean,
): "assigned" | "offered" | "open" {
  if (sr !== null) return "assigned";
  if (offenAngeboten) return "offered";
  return "open";
}

function extractRefereeName(sr: SdkSpielleitung | null): string | null {
  if (!sr) return null;
  const p = sr.schiedsrichter.personVO;
  return `${p.vorname} ${p.nachname}`;
}

function extractRefereeApiId(sr: SdkSpielleitung | null): number | null {
  return sr?.schiedsrichter.schiedsrichterId ?? null;
}

function epochMsToBerlin(epochMs: number): { date: string; time: string } {
  const d = new Date(epochMs);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function mapApiResultToRow(result: SdkOffeneSpielResult): Omit<RefereeGameRow, "id" | "matchId" | "dataHash" | "lastSyncedAt" | "createdAt" | "updatedAt"> {
  const sp = result.sp;
  const { date, time } = epochMsToBerlin(sp.spieldatum);

  return {
    apiMatchId: sp.spielplanId,
    matchNo: sp.spielnr,
    kickoffDate: date,
    kickoffTime: time,
    homeTeamName: sp.heimMannschaftLiga.mannschaftName,
    guestTeamName: sp.gastMannschaftLiga.mannschaftName,
    leagueName: sp.liga.liganame,
    leagueShort: sp.liga.srKurzname ?? sp.liga.ligaKurzname,
    venueName: sp.spielfeld?.bezeichnung ?? null,
    venueCity: sp.spielfeld?.ort ?? null,
    sr1OurClub: result.sr1MeinVerein,
    sr2OurClub: result.sr2MeinVerein,
    sr1Name: extractRefereeName(result.sr1),
    sr2Name: extractRefereeName(result.sr2),
    sr1RefereeApiId: extractRefereeApiId(result.sr1),
    sr2RefereeApiId: extractRefereeApiId(result.sr2),
    sr1Status: deriveSrStatus(result.sr1, result.sr1OffenAngeboten),
    sr2Status: deriveSrStatus(result.sr2, result.sr2OffenAngeboten),
    isCancelled: sp.abgesagt,
    isForfeited: sp.verzicht,
    homeClubId: sp.heimMannschaftLiga.mannschaft.verein.vereinId,
    guestClubId: sp.gastMannschaftLiga.mannschaft.verein.vereinId,
  };
}

export function computeRefereeGameHash(row: Pick<RefereeGameRow, "sr1Status" | "sr2Status" | "sr1Name" | "sr2Name" | "kickoffDate" | "kickoffTime" | "isCancelled" | "isForfeited">): string {
  const data = JSON.stringify([
    row.sr1Status, row.sr2Status,
    row.sr1Name, row.sr2Name,
    row.kickoffDate, row.kickoffTime,
    row.isCancelled, row.isForfeited,
  ]);
  return createHash("sha256").update(data).digest("hex");
}

function hasOpenOurClubSlot(row: Pick<RefereeGameRow, "sr1OurClub" | "sr2OurClub" | "sr1Status" | "sr2Status">): boolean {
  return (row.sr1OurClub === true && row.sr1Status !== "assigned") ||
         (row.sr2OurClub === true && row.sr2Status !== "assigned");
}

function bothSlotsFilled(row: Pick<RefereeGameRow, "sr1Status" | "sr2Status">): boolean {
  return row.sr1Status === "assigned" && row.sr2Status === "assigned";
}

function buildPayload(row: RefereeGameRow & { matchId: number | null }): RefereeSlotsPayload {
  const sr1Open = row.sr1OurClub === true && row.sr1Status !== "assigned";
  const sr2Open = row.sr2OurClub === true && row.sr2Status !== "assigned";
  const deepLink = row.matchId
    ? `/referee/matches?take=${row.matchId}`
    : `/referee/games?apiMatchId=${row.apiMatchId}`;

  return {
    matchId: row.matchId ?? null,
    matchNo: row.matchNo ?? null,
    homeTeam: row.homeTeamName!,
    guestTeam: row.guestTeamName!,
    leagueId: null,
    leagueName: row.leagueName ?? "",
    kickoffDate: row.kickoffDate!,
    kickoffTime: row.kickoffTime!,
    venueId: null,
    venueName: row.venueName ?? null,
    sr1Open,
    sr2Open,
    sr1Assigned: row.sr1Status === "assigned" ? (row.sr1Name ?? null) : null,
    sr2Assigned: row.sr2Status === "assigned" ? (row.sr2Name ?? null) : null,
    deepLink,
  };
}

async function findMatchId(apiMatchId: number): Promise<number | null> {
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.apiMatchId, apiMatchId));
  return match?.id ?? null;
}

export async function syncRefereeGames(): Promise<{ created: number; updated: number; unchanged: number }> {
  const client = createRefereeSdkClient();
  const response = await client.fetchOffeneSpiele();

  if (response.total === 0 && response.results.length === 0) {
    log.info("No offenespiele results (credentials not configured or no games)");
    return { created: 0, updated: 0, unchanged: 0 };
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const result of response.results) {
    try {
      const mapped = mapApiResultToRow(result);
      const hash = computeRefereeGameHash(mapped as never);
      const matchId = await findMatchId(mapped.apiMatchId!);

      // Look up existing row
      const [existing] = await db
        .select()
        .from(refereeGames)
        .where(eq(refereeGames.apiMatchId, mapped.apiMatchId!));

      if (!existing) {
        // INSERT
        const [inserted] = await db
          .insert(refereeGames)
          .values({ ...mapped, matchId, dataHash: hash, lastSyncedAt: new Date() })
          .returning();

        // Emit event if open slots for our club
        if (hasOpenOurClubSlot(mapped) && !mapped.isCancelled && !mapped.isForfeited) {
          const payload = buildPayload({ ...inserted!, matchId });
          await publishDomainEvent(EVENT_TYPES.REFEREE_SLOTS_NEEDED, payload);
          await scheduleReminderJobs(mapped.apiMatchId!, inserted!.id, mapped.kickoffDate!, mapped.kickoffTime!);
        }

        created++;
      } else if (existing.dataHash !== hash) {
        // UPDATE
        await db
          .update(refereeGames)
          .set({ ...mapped, matchId, dataHash: hash, lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(refereeGames.id, existing.id));

        const oldBothFilled = bothSlotsFilled(existing);
        const newBothFilled = bothSlotsFilled(mapped);
        const newHasOpen = hasOpenOurClubSlot(mapped);
        const oldHasOpen = hasOpenOurClubSlot(existing);

        // Slot opened up
        if (newHasOpen && !oldHasOpen && !mapped.isCancelled && !mapped.isForfeited) {
          const payload = buildPayload({ ...mapped, id: existing.id, matchId } as never);
          await publishDomainEvent(EVENT_TYPES.REFEREE_SLOTS_NEEDED, payload);
        }

        // Both filled → cancel reminders
        if (newBothFilled && !oldBothFilled) {
          await cancelReminderJobs(mapped.apiMatchId!);
        }

        // Cancelled or forfeited → cancel reminders
        if ((mapped.isCancelled || mapped.isForfeited) && !(existing.isCancelled || existing.isForfeited)) {
          await cancelReminderJobs(mapped.apiMatchId!);
        }

        // Kickoff changed → reschedule reminders
        if ((mapped.kickoffDate !== existing.kickoffDate || mapped.kickoffTime !== existing.kickoffTime) && newHasOpen && !mapped.isCancelled && !mapped.isForfeited) {
          await cancelReminderJobs(mapped.apiMatchId!);
          await scheduleReminderJobs(mapped.apiMatchId!, existing.id, mapped.kickoffDate!, mapped.kickoffTime!);
        }

        updated++;
      } else {
        // Update lastSyncedAt and matchId even if hash unchanged
        if (existing.matchId !== matchId) {
          await db.update(refereeGames).set({ matchId, lastSyncedAt: new Date() }).where(eq(refereeGames.id, existing.id));
        }
        unchanged++;
      }
    } catch (error) {
      log.error({ err: error, spielplanId: result.sp.spielplanId }, "Failed to process referee game");
    }
  }

  log.info({ created, updated, unchanged, total: response.total }, "Referee games sync complete");
  return { created, updated, unchanged };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/referee-games.sync.test.ts`
Expected: PASS for the pure function tests (deriveSrStatus, computeRefereeGameHash, mapApiResultToRow)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sync/referee-games.sync.ts apps/api/src/services/sync/referee-games.sync.test.ts
git commit -m "feat: add referee games sync service with change detection and event emission"
```

---

### Task 7: Worker Registration and Scheduling

Wire the referee games sync into the worker system — scheduled job, post-sync trigger, startup.

**Files:**
- Modify: `apps/api/src/workers/queues.ts`
- Modify: `apps/api/src/workers/index.ts`

- [ ] **Step 1: Add referee games sync job to queues**

In `apps/api/src/workers/queues.ts`, after the `refereeRemindersQueue` definition (around line 42), add:

```typescript
export async function triggerRefereeGamesSync(): Promise<void> {
  const existing = await syncQueue.getJob("referee-games-sync");
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting") {
      logger.info("Referee games sync already queued, skipping");
      return;
    }
  }
  await syncQueue.add("referee-games-sync", { type: "referee-games" }, {
    jobId: "referee-games-sync",
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
```

- [ ] **Step 2: Register scheduled repeatable job in initializeScheduledJobs**

In `apps/api/src/workers/queues.ts`, inside `initializeScheduledJobs()` (around line 55), after the existing daily-sync repeatable job setup, add:

```typescript
  // Referee games sync — every 30 minutes
  await syncQueue.add("referee-games-sync-scheduled", { type: "referee-games" }, {
    repeat: { every: 30 * 60 * 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
  logger.info("Referee games sync scheduled (every 30 minutes)");
```

- [ ] **Step 3: Handle referee-games job type in sync worker**

In `apps/api/src/workers/index.ts`, import the sync function at the top:

```typescript
import { syncRefereeGames } from "../services/sync/referee-games.sync";
```

In `initializeWorkers()`, after `seedRefereeNotificationConfig()` is called, add a post-main-sync trigger. Find where the sync worker completion is handled (or add one). The simplest approach: in the sync worker's processor, check the job type. Add at the end of `initializeWorkers()`:

```typescript
  // Trigger referee games sync after main sync completes
  syncWorker.on("completed", async (job) => {
    if (job?.data?.type !== "referee-games" && job?.name !== "referee-games-sync-scheduled") {
      try {
        await syncRefereeGames();
      } catch (error) {
        logger.warn({ err: error }, "Failed to run referee games sync after main sync");
      }
    }
  });
```

Also add a handler for the referee-games sync job itself. In the sync worker processor (if it uses a switch on job type), add:

```typescript
  // In the syncWorker processor, add handling for referee-games jobs:
  if (job.data?.type === "referee-games") {
    await syncRefereeGames();
    return;
  }
```

- [ ] **Step 4: Add referee games sync to shutdownWorkers**

No change needed — the sync runs on the existing `syncQueue`/`syncWorker`, which are already closed in `shutdownWorkers()`.

- [ ] **Step 5: Update tests**

In `apps/api/src/workers/index.test.ts`, add a mock for the new import and verify the referee games sync integration doesn't break existing tests.

Add to the mock section:

```typescript
vi.mock("../services/sync/referee-games.sync", () => ({
  syncRefereeGames: vi.fn().mockResolvedValue({ created: 0, updated: 0, unchanged: 0 }),
}));
```

- [ ] **Step 6: Verify tests pass**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/workers/index.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/workers/queues.ts apps/api/src/workers/index.ts apps/api/src/workers/index.test.ts
git commit -m "feat: register referee games sync scheduling and post-sync trigger"
```

---

### Task 8: Remove Old Referee Detection from Match Sync

Remove `isOwnClubRefsMatch()`, referee event emission, and reminder scheduling from `matches.sync.ts`.

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts`

- [ ] **Step 1: Remove imports**

In `apps/api/src/services/sync/matches.sync.ts`, remove line 4:

```typescript
import { scheduleReminderJobs, cancelReminderJobs } from "../referee/referee-reminders.service";
```

- [ ] **Step 2: Remove `isOwnClubRefsMatch()` function**

Delete lines 502-528 (the entire `isOwnClubRefsMatch` function).

- [ ] **Step 3: Remove referee logic from update path**

In the update path (around lines 878-941), remove:
- The `isOwnClubRefsMatch()` call (line 880)
- The entire block that checks `refCtx.isOwnClubHome` and emits `REFEREE_SLOTS_NEEDED` (lines 885-921)
- The entire block that checks `refCtx.isOwnClubRefsLeague` for cancellation/rescheduling (lines 924-937)

- [ ] **Step 4: Remove referee logic from create path**

In the create path (around lines 1044-1085), remove:
- The `isOwnClubRefsMatch()` call (line 1046)
- The entire block that emits `REFEREE_SLOTS_NEEDED` and calls `scheduleReminderJobs` (lines 1051-1085)

- [ ] **Step 5: Clean up unused imports**

If `EVENT_TYPES` and `publishDomainEvent` are still used elsewhere in the file for non-referee events (e.g., `MATCH_CREATED`, `MATCH_UPDATED`), keep them. Only remove if they become unused. Check if `leagues` import from the schema is still needed (it may be used elsewhere in the file for league queries).

- [ ] **Step 6: Verify tests pass**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/matches.sync.test.ts`
Expected: PASS — some tests related to referee notification logic may need updating (expectations about event emission or reminder scheduling that no longer happen). Remove or update those test cases.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/sync/matches.sync.ts
git commit -m "refactor: remove isOwnClubRefsMatch and referee notification triggers from match sync"
```

---

### Task 9: Remove Old Reminder Cancellation from Referees Sync

**Files:**
- Modify: `apps/api/src/services/sync/referees.sync.ts`

- [ ] **Step 1: Remove the cancel-reminders block**

In `apps/api/src/services/sync/referees.sync.ts`, delete lines 313-332 (the try/catch block that checks both slots filled and cancels reminder jobs).

- [ ] **Step 2: Remove unused imports**

Remove from line 10-11:
```typescript
import { refereeRemindersQueue } from "../../workers/queues";
import { buildReminderJobId, getReminderDays } from "../referee/referee-reminders.service";
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/referees.sync.test.ts`
Expected: PASS — the test that checked `db.select` count may need updating (was previously 5, might now be 4 since one query is removed).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/sync/referees.sync.ts
git commit -m "refactor: remove reminder cancellation from referees sync (moved to referee-games sync)"
```

---

### Task 10: Admin API Endpoint for Manual Trigger

**Files:**
- Modify: `apps/api/src/routes/admin/settings.routes.ts`

- [ ] **Step 1: Add manual trigger endpoint**

In `apps/api/src/routes/admin/settings.routes.ts`, add a new route:

```typescript
// POST /admin/settings/referee-games-sync — trigger manual referee games sync
settingsRoutes.post(
  "/settings/referee-games-sync",
  describeRoute({
    description: "Trigger a manual referee games sync",
    tags: ["Settings"],
    responses: { 200: { description: "Sync triggered" } },
  }),
  async (c) => {
    const { triggerRefereeGamesSync } = await import("../../workers/queues");
    await triggerRefereeGamesSync();
    return c.json({ success: true, message: "Referee games sync triggered" });
  },
);
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/settings.routes.ts
git commit -m "feat: add admin endpoint for manual referee games sync trigger"
```

---

### Task 11: Full Integration Test and Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @dragons/api test`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS (fix any issues)

- [ ] **Step 4: Run coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: Coverage thresholds met (90% branches, 95% functions/lines/statements)

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix lint and coverage for referee games sync"
```

---

## File Structure Summary

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/sdk/src/types/game-details.ts` | Modify | Accurate offenespiele API types |
| `packages/sdk/src/index.ts` | Modify | Export new types |
| `packages/db/src/schema/referee-games.ts` | Create | `referee_games` table definition |
| `packages/db/src/schema/index.ts` | Modify | Export new schema |
| `apps/api/src/config/env.ts` | Modify | Add `REFEREE_SDK_USERNAME`/`PASSWORD` |
| `packages/shared/src/domain-events.ts` | Modify | Nullable `matchId`/`matchNo`/`leagueId` |
| `apps/api/src/services/referee/referee-reminders.service.ts` | Modify | `apiMatchId` signatures, new job payload |
| `apps/api/src/services/referee/referee-reminders.service.test.ts` | Modify | Updated test values |
| `apps/api/src/workers/referee-reminder.worker.ts` | Modify | Load from `referee_games` |
| `apps/api/src/workers/referee-reminder.worker.test.ts` | Modify | Updated for new interface |
| `apps/api/src/services/sync/referee-sdk-client.ts` | Create | Federation login + offenespiele fetch |
| `apps/api/src/services/sync/referee-sdk-client.test.ts` | Create | Tests for SDK client |
| `apps/api/src/services/sync/referee-games.sync.ts` | Create | Core sync logic |
| `apps/api/src/services/sync/referee-games.sync.test.ts` | Create | Tests for sync service |
| `apps/api/src/workers/queues.ts` | Modify | Scheduled job + manual trigger |
| `apps/api/src/workers/index.ts` | Modify | Post-sync trigger, import |
| `apps/api/src/workers/index.test.ts` | Modify | Mock new import |
| `apps/api/src/services/sync/matches.sync.ts` | Modify | Remove referee detection code |
| `apps/api/src/services/sync/referees.sync.ts` | Modify | Remove reminder cancellation |
| `apps/api/src/routes/admin/settings.routes.ts` | Modify | Manual sync endpoint |
