# Twitch Broadcast Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-controlled live broadcast layer on top of the existing Stramatel ingest, exposing a single OBS-friendly `/overlay` URL that switches between a pre-game card and a live score bug.

**Architecture:** New `broadcastConfigs` table holds the per-device match binding plus broadcast-only display fields (`homeAbbr`, `guestAbbr`, optional color overrides) and an `isLive` toggle. The existing ingest pipeline keeps writing all frames to `liveScoreboards` + `scoreboardSnapshots` (forensics intact); a second Redis channel `broadcast:<deviceId>` publishes only when `isLive=true`. Phase (`idle` / `pregame` / `live`) is computed server-side from `(isLive, period, clockRunning)`. Admin UI under `/admin/broadcast` drives the binding + Go Live toggle. Public `/overlay` page consumes the broadcast SSE channel and renders whichever layout the server says.

**Tech Stack:** Drizzle ORM + Postgres, Hono 4 + hono-openapi + Zod, ioredis pub/sub, vitest 4 (pglite for service tests), Next.js 16 App Router with next-intl, Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-04-30-twitch-broadcast-overlay-design.md`](../specs/2026-04-30-twitch-broadcast-overlay-design.md)

**Repo policy reminders:**
- **No Co-Authored-By trailers** or AI signatures on commits.
- Commit messages follow the existing scope-prefix style (e.g. `broadcast: add ...`).
- Every task ends in a commit. Tasks are independent — re-ordering should not break compilation.

**Rollout:**
- **PR 1 — Backend + admin UI** — Tasks 1–11. Ships the API surface and the admin control page. No public overlay yet.
- **PR 2 — Public overlay + pipeline test** — Tasks 12–17. Ships `/overlay` and the end-to-end fixture replay test that closes the gap exposed by the prior `changed:false` curl bug.

---

## File Structure

### Files to create

```
packages/db/src/schema/broadcast-configs.ts            new Drizzle schema
packages/db/drizzle/00XX_<name>.sql                    generated migration
packages/shared/src/broadcast.ts                       BroadcastConfig, BroadcastPhase, BroadcastState, BroadcastMatchTeam
apps/api/src/services/broadcast/
  ├── config.ts                                        CRUD + cached match join
  ├── config.test.ts
  ├── phase.ts                                         pure phase-computation function
  ├── phase.test.ts
  ├── publisher.ts                                     merge scoreboard + config → broadcast event; pubsub helpers
  └── publisher.test.ts
apps/api/src/routes/admin/broadcast.routes.ts          admin endpoints
apps/api/src/routes/admin/broadcast.routes.test.ts
apps/api/src/routes/public/broadcast.routes.ts        public state + SSE
apps/api/src/routes/public/broadcast.routes.test.ts
apps/web/src/app/[locale]/admin/broadcast/
  ├── page.tsx                                         server component (initial fetch)
  ├── broadcast-control.tsx                            client form + Go Live button
  └── match-picker.tsx                                 modal with today + search tabs
apps/web/src/app/[locale]/overlay/
  ├── layout.tsx                                       transparent standalone layout
  ├── page.tsx                                         server component (initial state)
  ├── overlay-client.tsx                               SSE consumer; phase-driven branch
  ├── pregame-card.tsx
  └── score-bug.tsx
apps/api/src/services/broadcast/replay-fixture.test.ts pipeline test (PR 2)
```

### Files to modify

```
packages/db/src/schema/index.ts                        export broadcast-configs
packages/shared/src/index.ts                           re-export broadcast types
apps/api/src/services/scoreboard/ingest.ts             also publish broadcast event when isLive=true
apps/api/src/services/scoreboard/pubsub.ts             new broadcast channel helpers
apps/api/src/routes/index.ts                           wire admin + public broadcast routes
apps/web/src/components/admin/app-sidebar.tsx          add "Broadcast" sidebar entry
apps/web/src/messages/en.json + de.json                add broadcast.* namespace
```

---

## Task 1: Schema for `broadcastConfigs`

**Files:**
- Create: `packages/db/src/schema/broadcast-configs.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generated: `packages/db/drizzle/00XX_<auto>.sql`

- [ ] **Step 1: Write the schema file**

```ts
// packages/db/src/schema/broadcast-configs.ts
import {
  pgTable,
  text,
  integer,
  boolean,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const broadcastConfigs = pgTable("broadcast_configs", {
  deviceId: text("device_id").primaryKey(),
  matchId: integer("match_id").references(() => matches.id),
  isLive: boolean("is_live").notNull().default(false),
  homeAbbr: varchar("home_abbr", { length: 8 }),
  guestAbbr: varchar("guest_abbr", { length: 8 }),
  homeColorOverride: varchar("home_color_override", { length: 20 }),
  guestColorOverride: varchar("guest_color_override", { length: 20 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BroadcastConfigRow = typeof broadcastConfigs.$inferSelect;
export type NewBroadcastConfigRow = typeof broadcastConfigs.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

Append one line to `packages/db/src/schema/index.ts`:

```ts
export * from "./broadcast-configs";
```

- [ ] **Step 3: Generate migration**

Run: `pnpm --filter @dragons/db drizzle-kit generate`
Expected: a new `00XX_<random_name>.sql` file appears in `packages/db/drizzle/`. Open it and verify it contains a `CREATE TABLE "broadcast_configs"` with all columns plus the FK to `matches.id`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @dragons/db typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/broadcast-configs.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "broadcast: add broadcastConfigs table"
```

---

## Task 2: Shared types

**Files:**
- Create: `packages/shared/src/broadcast.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the shared types file**

```ts
// packages/shared/src/broadcast.ts
import type { PublicLiveSnapshot } from "./scoreboard";

export type BroadcastPhase = "idle" | "pregame" | "live";

export interface BroadcastMatchTeam {
  name: string;       // customName ?? name
  abbr: string;       // homeAbbr / guestAbbr or derived fallback
  color: string;      // homeColorOverride / guestColorOverride or team.badgeColor
  clubId: number;     // for /assets/clubs/<clubId>.webp
}

export interface BroadcastMatch {
  id: number;
  kickoffDate: string;       // ISO date
  kickoffTime: string;       // "HH:MM:SS"
  league: { id: number; name: string } | null;
  home: BroadcastMatchTeam;
  guest: BroadcastMatchTeam;
}

export interface BroadcastState {
  deviceId: string;
  isLive: boolean;
  phase: BroadcastPhase;
  match: BroadcastMatch | null;
  scoreboard: PublicLiveSnapshot | null;
  stale: boolean;            // true when last frame > 30s ago while isLive
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface BroadcastConfig {
  deviceId: string;
  matchId: number | null;
  isLive: boolean;
  homeAbbr: string | null;
  guestAbbr: string | null;
  homeColorOverride: string | null;
  guestColorOverride: string | null;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface AdminBroadcastMatchListItem {
  id: number;
  kickoffDate: string;
  kickoffTime: string;
  homeName: string;
  guestName: string;
  leagueName: string | null;
}
```

- [ ] **Step 2: Re-export from shared index**

Add to `packages/shared/src/index.ts` (location: append after the scoreboard exports):

```ts
export type {
  BroadcastPhase,
  BroadcastMatchTeam,
  BroadcastMatch,
  BroadcastState,
  BroadcastConfig,
  AdminBroadcastMatchListItem,
} from "./broadcast";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/broadcast.ts packages/shared/src/index.ts
git commit -m "broadcast: add shared types"
```

---

## Task 3: Pure phase computation

**Files:**
- Create: `apps/api/src/services/broadcast/phase.ts`
- Test: `apps/api/src/services/broadcast/phase.test.ts`

The phase function is pure and tested in isolation so the merge logic in Task 5 can rely on it.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/broadcast/phase.test.ts
import { describe, expect, it } from "vitest";
import { computePhase } from "./phase";

describe("computePhase", () => {
  it("returns idle when not live", () => {
    expect(
      computePhase({
        isLive: false,
        matchId: 1,
        period: 0,
        clockRunning: false,
      }),
    ).toBe("idle");
  });

  it("returns idle when matchId is null even if isLive", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: null,
        period: 0,
        clockRunning: false,
      }),
    ).toBe("idle");
  });

  it("returns pregame when live, period=0, clock stopped", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 0,
        clockRunning: false,
      }),
    ).toBe("pregame");
  });

  it("returns live when clock starts in Q1", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 1,
        clockRunning: true,
      }),
    ).toBe("live");
  });

  it("stays live during halftime (clock stopped, period > 0)", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 2,
        clockRunning: false,
      }),
    ).toBe("live");
  });

  it("returns live even when scoreboard data is missing if period > 0", () => {
    expect(
      computePhase({
        isLive: true,
        matchId: 1,
        period: 4,
        clockRunning: false,
      }),
    ).toBe("live");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- phase.test.ts`
Expected: FAIL — `computePhase` not defined.

- [ ] **Step 3: Implement the function**

```ts
// apps/api/src/services/broadcast/phase.ts
import type { BroadcastPhase } from "@dragons/shared";

export interface PhaseInputs {
  isLive: boolean;
  matchId: number | null;
  period: number;
  clockRunning: boolean;
}

export function computePhase(input: PhaseInputs): BroadcastPhase {
  if (!input.isLive || input.matchId === null) return "idle";
  if (input.period === 0 && !input.clockRunning) return "pregame";
  return "live";
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- phase.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/broadcast/phase.ts apps/api/src/services/broadcast/phase.test.ts
git commit -m "broadcast: add pure phase-computation function"
```

---

## Task 4: Broadcast config service (CRUD + match join)

**Files:**
- Create: `apps/api/src/services/broadcast/config.ts`
- Test: `apps/api/src/services/broadcast/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/broadcast/config.test.ts
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import {
  getBroadcastConfig,
  upsertBroadcastConfig,
  setBroadcastLive,
  loadJoinedMatch,
} from "./config";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
});
afterAll(async () => {
  await closeTestDb(ctx);
});

async function seed(): Promise<{ matchId: number }> {
  await ctx.db.insert(leagues).values({
    id: 100,
    apiLeagueId: 100,
    name: "Test Liga",
    seasonId: 2026,
  });
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: 1,
      seasonTeamId: 1,
      teamCompetitionId: 1,
      name: "Dragons",
      nameShort: "Dragons",
      clubId: 42,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: 2,
      seasonTeamId: 2,
      teamCompetitionId: 2,
      name: "Visitors",
      nameShort: "Visitors",
      clubId: 99,
      isOwnClub: false,
    },
  ]);
  const [m] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 1000,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: "2026-05-02",
      kickoffTime: "19:30:00",
      leagueId: 100,
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    })
    .returning({ id: matches.id });
  return { matchId: m!.id };
}

describe("broadcast/config", () => {
  it("returns null for unknown deviceId", async () => {
    expect(await getBroadcastConfig("nope")).toBeNull();
  });

  it("upserts a config row", async () => {
    const { matchId } = await seed();
    const row = await upsertBroadcastConfig({
      deviceId: "d1",
      matchId,
      homeAbbr: "DRA",
      guestAbbr: "VIS",
    });
    expect(row.deviceId).toBe("d1");
    expect(row.homeAbbr).toBe("DRA");
    const again = await upsertBroadcastConfig({
      deviceId: "d1",
      homeAbbr: "DGN",
    });
    expect(again.homeAbbr).toBe("DGN");
    expect(again.matchId).toBe(matchId); // unchanged
  });

  it("setBroadcastLive(true) requires a matchId", async () => {
    await upsertBroadcastConfig({ deviceId: "d1" });
    await expect(setBroadcastLive("d1", true)).rejects.toThrow(/matchId/);
  });

  it("setBroadcastLive sets startedAt/endedAt timestamps", async () => {
    const { matchId } = await seed();
    await upsertBroadcastConfig({ deviceId: "d1", matchId });
    const onRow = await setBroadcastLive("d1", true);
    expect(onRow.isLive).toBe(true);
    expect(onRow.startedAt).not.toBeNull();
    const offRow = await setBroadcastLive("d1", false);
    expect(offRow.isLive).toBe(false);
    expect(offRow.endedAt).not.toBeNull();
  });

  it("loadJoinedMatch returns home/guest with abbr fallback", async () => {
    const { matchId } = await seed();
    const m = await loadJoinedMatch({
      matchId,
      homeAbbr: null,
      guestAbbr: null,
      homeColorOverride: null,
      guestColorOverride: null,
    });
    expect(m).not.toBeNull();
    expect(m!.home.clubId).toBe(42);
    expect(m!.home.abbr).toBe("DRA"); // first 3 of nameShort.toUpperCase
    expect(m!.guest.abbr).toBe("VIS");
    expect(m!.league?.name).toBe("Test Liga");
  });

  it("loadJoinedMatch uses overrides when present", async () => {
    const { matchId } = await seed();
    const m = await loadJoinedMatch({
      matchId,
      homeAbbr: "DGN",
      guestAbbr: "OPP",
      homeColorOverride: "#000000",
      guestColorOverride: "#ffffff",
    });
    expect(m!.home.abbr).toBe("DGN");
    expect(m!.home.color).toBe("#000000");
    expect(m!.guest.abbr).toBe("OPP");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/services/broadcast/config.ts
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import type {
  BroadcastConfig,
  BroadcastMatch,
  BroadcastMatchTeam,
} from "@dragons/shared";

const DEFAULT_HOME_COLOR = "#1e90ff";
const DEFAULT_GUEST_COLOR = "#dc2626";

function deriveAbbr(team: { nameShort: string | null; name: string }): string {
  const src = team.nameShort ?? team.name;
  return src.slice(0, 3).toUpperCase();
}

function rowToConfig(
  row: typeof broadcastConfigs.$inferSelect,
): BroadcastConfig {
  return {
    deviceId: row.deviceId,
    matchId: row.matchId,
    isLive: row.isLive,
    homeAbbr: row.homeAbbr,
    guestAbbr: row.guestAbbr,
    homeColorOverride: row.homeColorOverride,
    guestColorOverride: row.guestColorOverride,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getBroadcastConfig(
  deviceId: string,
): Promise<BroadcastConfig | null> {
  const rows = await db
    .select()
    .from(broadcastConfigs)
    .where(eq(broadcastConfigs.deviceId, deviceId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToConfig(rows[0]!);
}

export interface UpsertInput {
  deviceId: string;
  matchId?: number | null;
  homeAbbr?: string | null;
  guestAbbr?: string | null;
  homeColorOverride?: string | null;
  guestColorOverride?: string | null;
}

export async function upsertBroadcastConfig(
  input: UpsertInput,
): Promise<BroadcastConfig> {
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (input.matchId !== undefined) set.matchId = input.matchId;
  if (input.homeAbbr !== undefined) set.homeAbbr = input.homeAbbr;
  if (input.guestAbbr !== undefined) set.guestAbbr = input.guestAbbr;
  if (input.homeColorOverride !== undefined)
    set.homeColorOverride = input.homeColorOverride;
  if (input.guestColorOverride !== undefined)
    set.guestColorOverride = input.guestColorOverride;
  await db
    .insert(broadcastConfigs)
    .values({
      deviceId: input.deviceId,
      matchId: input.matchId ?? null,
      homeAbbr: input.homeAbbr ?? null,
      guestAbbr: input.guestAbbr ?? null,
      homeColorOverride: input.homeColorOverride ?? null,
      guestColorOverride: input.guestColorOverride ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: broadcastConfigs.deviceId,
      set,
    });
  const out = await getBroadcastConfig(input.deviceId);
  if (!out) throw new Error("upsert failed");
  return out;
}

export async function setBroadcastLive(
  deviceId: string,
  isLive: boolean,
): Promise<BroadcastConfig> {
  if (isLive) {
    const existing = await getBroadcastConfig(deviceId);
    if (!existing || existing.matchId === null) {
      throw new Error("Cannot go live without matchId");
    }
  }
  const now = new Date();
  await db
    .update(broadcastConfigs)
    .set({
      isLive,
      startedAt: isLive ? now : undefined,
      endedAt: isLive ? undefined : now,
      updatedAt: now,
    })
    .where(eq(broadcastConfigs.deviceId, deviceId));
  const out = await getBroadcastConfig(deviceId);
  if (!out) throw new Error("config row missing");
  return out;
}

export interface JoinedMatchInputs {
  matchId: number | null;
  homeAbbr: string | null;
  guestAbbr: string | null;
  homeColorOverride: string | null;
  guestColorOverride: string | null;
}

export async function loadJoinedMatch(
  inputs: JoinedMatchInputs,
): Promise<BroadcastMatch | null> {
  if (inputs.matchId === null) return null;
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, inputs.matchId))
    .limit(1);
  if (!match) return null;
  const [home] = await db
    .select()
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, match.homeTeamApiId))
    .limit(1);
  const [guest] = await db
    .select()
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, match.guestTeamApiId))
    .limit(1);
  if (!home || !guest) return null;

  let league: { id: number; name: string } | null = null;
  if (match.leagueId !== null) {
    const [lg] = await db
      .select()
      .from(leagues)
      .where(eq(leagues.id, match.leagueId))
      .limit(1);
    if (lg) league = { id: lg.id, name: lg.name };
  }

  const homeTeam: BroadcastMatchTeam = {
    name: home.customName ?? home.name,
    abbr: inputs.homeAbbr ?? deriveAbbr(home),
    color: inputs.homeColorOverride ?? home.badgeColor ?? DEFAULT_HOME_COLOR,
    clubId: home.clubId,
  };
  const guestTeam: BroadcastMatchTeam = {
    name: guest.customName ?? guest.name,
    abbr: inputs.guestAbbr ?? deriveAbbr(guest),
    color: inputs.guestColorOverride ?? guest.badgeColor ?? DEFAULT_GUEST_COLOR,
    clubId: guest.clubId,
  };

  return {
    id: match.id,
    kickoffDate: match.kickoffDate,
    kickoffTime: match.kickoffTime,
    league,
    home: homeTeam,
    guest: guestTeam,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- config.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/broadcast/config.ts apps/api/src/services/broadcast/config.test.ts
git commit -m "broadcast: add config service with match-join loader"
```

---

## Task 5: Broadcast publisher (channel + state merger)

**Files:**
- Modify: `apps/api/src/services/scoreboard/pubsub.ts`
- Create: `apps/api/src/services/broadcast/publisher.ts`
- Test: `apps/api/src/services/broadcast/publisher.test.ts`

- [ ] **Step 1: Add broadcast channel helpers to pubsub.ts**

Append to `apps/api/src/services/scoreboard/pubsub.ts` (after the existing exports):

```ts
export function broadcastChannelFor(deviceId: string): string {
  return `broadcast:${deviceId}`;
}

export async function publishBroadcast(
  deviceId: string,
  payload: unknown,
): Promise<void> {
  await getPublisher().publish(
    broadcastChannelFor(deviceId),
    JSON.stringify(payload),
  );
}

export async function subscribeBroadcast(
  deviceId: string,
  onMessage: (state: unknown) => void,
): Promise<() => Promise<void>> {
  const subscriber = createRedisClient();
  const channel = broadcastChannelFor(deviceId);
  await subscriber.subscribe(channel);
  subscriber.on("message", (received: string, message: string) => {
    if (received !== channel) return;
    try {
      onMessage(JSON.parse(message));
    } catch {
      // discard non-JSON
    }
  });
  return async () => {
    await subscriber.unsubscribe(channel);
    await subscriber.quit();
  };
}
```

- [ ] **Step 2: Write the failing test for the publisher**

```ts
// apps/api/src/services/broadcast/publisher.test.ts
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishBroadcast: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../scoreboard/pubsub", () => ({
  publishBroadcast: (...a: unknown[]) => mocks.publishBroadcast(...a),
}));

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  liveScoreboards,
  matches,
  teams,
} from "@dragons/db/schema";
import {
  buildBroadcastState,
  publishBroadcastForDevice,
  invalidateMatchCache,
} from "./publisher";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishBroadcast.mockReset();
  mocks.publishBroadcast.mockResolvedValue(undefined);
  invalidateMatchCache();
});
afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedConfig(opts: {
  isLive: boolean;
  withMatch: boolean;
  scoreboard?: Partial<typeof liveScoreboards.$inferInsert>;
}): Promise<void> {
  let matchId: number | null = null;
  if (opts.withMatch) {
    await ctx.db.insert(leagues).values({
      id: 100,
      apiLeagueId: 100,
      name: "Liga",
      seasonId: 2026,
    });
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 1,
        seasonTeamId: 1,
        teamCompetitionId: 1,
        name: "Dragons",
        nameShort: "Dragons",
        clubId: 42,
        isOwnClub: true,
      },
      {
        apiTeamPermanentId: 2,
        seasonTeamId: 2,
        teamCompetitionId: 2,
        name: "Visitors",
        nameShort: "Visitors",
        clubId: 99,
        isOwnClub: false,
      },
    ]);
    const [m] = await ctx.db
      .insert(matches)
      .values({
        apiMatchId: 1,
        matchNo: 1,
        matchDay: 1,
        kickoffDate: "2026-05-02",
        kickoffTime: "19:30:00",
        leagueId: 100,
        homeTeamApiId: 1,
        guestTeamApiId: 2,
      })
      .returning({ id: matches.id });
    matchId = m!.id;
  }
  await ctx.db.insert(broadcastConfigs).values({
    deviceId: "d1",
    matchId,
    isLive: opts.isLive,
  });
  if (opts.scoreboard) {
    await ctx.db.insert(liveScoreboards).values({
      deviceId: "d1",
      ...opts.scoreboard,
    });
  }
}

describe("buildBroadcastState", () => {
  it("returns idle state when not live", async () => {
    await seedConfig({ isLive: false, withMatch: true });
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("idle");
    expect(state.match).not.toBeNull();
  });

  it("returns pregame phase when live + period 0 + clock stopped", async () => {
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: { period: 0, clockRunning: false },
    });
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("pregame");
  });

  it("returns live phase when clockRunning", async () => {
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: { period: 1, clockRunning: true, scoreHome: 7 },
    });
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("live");
    expect(state.scoreboard?.scoreHome).toBe(7);
  });

  it("flags stale=true when last frame older than 30s", async () => {
    const old = new Date(Date.now() - 60_000);
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: {
        period: 1,
        clockRunning: false,
        lastFrameAt: old,
        updatedAt: old,
      },
    });
    const state = await buildBroadcastState("d1");
    expect(state.stale).toBe(true);
  });

  it("returns empty state when no config row", async () => {
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("idle");
    expect(state.match).toBeNull();
    expect(state.isLive).toBe(false);
  });
});

describe("publishBroadcastForDevice", () => {
  it("calls publishBroadcast with the merged state", async () => {
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: { period: 1, clockRunning: true },
    });
    await publishBroadcastForDevice("d1");
    expect(mocks.publishBroadcast).toHaveBeenCalledTimes(1);
    const [device, payload] = mocks.publishBroadcast.mock.calls[0]!;
    expect(device).toBe("d1");
    expect((payload as { phase: string }).phase).toBe("live");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test -- publisher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the publisher**

```ts
// apps/api/src/services/broadcast/publisher.ts
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { broadcastConfigs, liveScoreboards } from "@dragons/db/schema";
import type {
  BroadcastConfig,
  BroadcastMatch,
  BroadcastState,
  PublicLiveSnapshot,
} from "@dragons/shared";
import { publishBroadcast } from "../scoreboard/pubsub";
import { computePhase } from "./phase";
import { loadJoinedMatch } from "./config";

const STALE_MS = 30_000;

interface CacheEntry {
  matchId: number;
  homeAbbr: string | null;
  guestAbbr: string | null;
  homeColorOverride: string | null;
  guestColorOverride: string | null;
  match: BroadcastMatch;
}

const matchCache = new Map<string, CacheEntry>();

export function invalidateMatchCache(deviceId?: string): void {
  if (deviceId === undefined) {
    matchCache.clear();
  } else {
    matchCache.delete(deviceId);
  }
}

async function getCachedMatch(
  deviceId: string,
  config: BroadcastConfig,
): Promise<BroadcastMatch | null> {
  if (config.matchId === null) return null;
  const cached = matchCache.get(deviceId);
  if (
    cached &&
    cached.matchId === config.matchId &&
    cached.homeAbbr === config.homeAbbr &&
    cached.guestAbbr === config.guestAbbr &&
    cached.homeColorOverride === config.homeColorOverride &&
    cached.guestColorOverride === config.guestColorOverride
  ) {
    return cached.match;
  }
  const match = await loadJoinedMatch({
    matchId: config.matchId,
    homeAbbr: config.homeAbbr,
    guestAbbr: config.guestAbbr,
    homeColorOverride: config.homeColorOverride,
    guestColorOverride: config.guestColorOverride,
  });
  if (match) {
    matchCache.set(deviceId, {
      matchId: config.matchId,
      homeAbbr: config.homeAbbr,
      guestAbbr: config.guestAbbr,
      homeColorOverride: config.homeColorOverride,
      guestColorOverride: config.guestColorOverride,
      match,
    });
  }
  return match;
}

function rowToConfig(
  row: typeof broadcastConfigs.$inferSelect,
): BroadcastConfig {
  return {
    deviceId: row.deviceId,
    matchId: row.matchId,
    isLive: row.isLive,
    homeAbbr: row.homeAbbr,
    guestAbbr: row.guestAbbr,
    homeColorOverride: row.homeColorOverride,
    guestColorOverride: row.guestColorOverride,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToScoreboard(
  row: typeof liveScoreboards.$inferSelect,
): PublicLiveSnapshot {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(row.lastFrameAt).getTime()) / 1000),
  );
  return {
    scoreHome: row.scoreHome,
    scoreGuest: row.scoreGuest,
    foulsHome: row.foulsHome,
    foulsGuest: row.foulsGuest,
    timeoutsHome: row.timeoutsHome,
    timeoutsGuest: row.timeoutsGuest,
    period: row.period,
    clockText: row.clockText,
    clockSeconds: row.clockSeconds,
    clockRunning: row.clockRunning,
    shotClock: row.shotClock,
    timeoutActive: row.timeoutActive,
    timeoutDuration: row.timeoutDuration,
    deviceId: row.deviceId,
    panelName: row.panelName,
    lastFrameAt: row.lastFrameAt.toISOString(),
    secondsSinceLastFrame: seconds,
  };
}

export async function buildBroadcastState(
  deviceId: string,
): Promise<BroadcastState> {
  const [configRow] = await db
    .select()
    .from(broadcastConfigs)
    .where(eq(broadcastConfigs.deviceId, deviceId))
    .limit(1);

  const config: BroadcastConfig = configRow
    ? rowToConfig(configRow)
    : {
        deviceId,
        matchId: null,
        isLive: false,
        homeAbbr: null,
        guestAbbr: null,
        homeColorOverride: null,
        guestColorOverride: null,
        startedAt: null,
        endedAt: null,
        updatedAt: new Date().toISOString(),
      };

  const [scoreRow] = await db
    .select()
    .from(liveScoreboards)
    .where(eq(liveScoreboards.deviceId, deviceId))
    .limit(1);

  const scoreboard = scoreRow ? rowToScoreboard(scoreRow) : null;
  const match = await getCachedMatch(deviceId, config);
  const phase = computePhase({
    isLive: config.isLive,
    matchId: config.matchId,
    period: scoreRow?.period ?? 0,
    clockRunning: scoreRow?.clockRunning ?? false,
  });
  const stale =
    config.isLive &&
    scoreRow !== undefined &&
    Date.now() - new Date(scoreRow.lastFrameAt).getTime() > STALE_MS;

  return {
    deviceId,
    isLive: config.isLive,
    phase,
    match,
    scoreboard,
    stale,
    startedAt: config.startedAt,
    endedAt: config.endedAt,
    updatedAt: config.updatedAt,
  };
}

export async function publishBroadcastForDevice(
  deviceId: string,
): Promise<void> {
  const state = await buildBroadcastState(deviceId);
  await publishBroadcast(deviceId, state);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api test -- publisher.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/scoreboard/pubsub.ts apps/api/src/services/broadcast/publisher.ts apps/api/src/services/broadcast/publisher.test.ts
git commit -m "broadcast: add publisher and broadcast pubsub channel"
```

---

## Task 6: Wire ingest to publish broadcast events

**Files:**
- Modify: `apps/api/src/services/scoreboard/ingest.ts`
- Modify: `apps/api/src/services/scoreboard/ingest.test.ts`

The existing ingest already publishes to the `scoreboard:` channel. Add a fire-and-forget broadcast publish that runs after the DB transaction commits — this keeps the admin debug page wired exactly as before, and adds the broadcast layer non-disruptively.

- [ ] **Step 1: Add a failing test in ingest.test.ts**

Append to `apps/api/src/services/scoreboard/ingest.test.ts`:

```ts
import { broadcastConfigs } from "@dragons/db/schema";

describe("processIngest broadcast publish", () => {
  it("publishes broadcast state when isLive=true", async () => {
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      isLive: true,
      matchId: null, // intentionally null — broadcast still publishes idle
    });
    await processIngest({ deviceId: "d1", hex: frameOk });
    // The publish helper is mocked at module scope below in Step 2.
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });

  it("does not publish broadcast when isLive=false", async () => {
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      isLive: false,
      matchId: null,
    });
    await processIngest({ deviceId: "d1", hex: frameOk });
    expect(mocks.publishBroadcastForDevice).not.toHaveBeenCalled();
  });

  it("does not publish broadcast when no config row exists", async () => {
    await processIngest({ deviceId: "d1", hex: frameOk });
    expect(mocks.publishBroadcastForDevice).not.toHaveBeenCalled();
  });
});
```

Then, at the top of the file (in the existing `mocks` hoisted block), add:

```ts
const mocks = vi.hoisted(() => ({
  publishSnapshot: vi.fn(),
  publishBroadcastForDevice: vi.fn(),  // NEW
}));
```

And add a new vi.mock above `import { processIngest }`:

```ts
vi.mock("../broadcast/publisher", () => ({
  publishBroadcastForDevice: (...a: unknown[]) =>
    mocks.publishBroadcastForDevice(...a),
}));
```

In `beforeEach`, also reset the new mock:

```ts
mocks.publishBroadcastForDevice.mockReset();
mocks.publishBroadcastForDevice.mockResolvedValue(undefined);
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `pnpm --filter @dragons/api test -- ingest.test.ts`
Expected: 3 new tests fail (the import path is fine; the implementation doesn't yet call the broadcast publish).

- [ ] **Step 3: Modify ingest.ts**

In `apps/api/src/services/scoreboard/ingest.ts`, add the import:

```ts
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import {
  broadcastConfigs,         // NEW
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import {
  decodeScoreFrame,
  findScoreFrames,
  type StramatelSnapshot,
} from "./stramatel-decoder";
import { publishSnapshot } from "./pubsub";
import { publishBroadcastForDevice } from "../broadcast/publisher"; // NEW
import { logger } from "../../config/logger";
```

After the existing `publishSnapshot` block at the bottom of `processIngest`, add:

```ts
  try {
    const [cfg] = await db
      .select({ isLive: broadcastConfigs.isLive })
      .from(broadcastConfigs)
      .where(eq(broadcastConfigs.deviceId, deviceId))
      .limit(1);
    if (cfg?.isLive === true) {
      await publishBroadcastForDevice(deviceId);
    }
  } catch (err) {
    logger.warn(
      { err, deviceId, snapshotId: result.snapshotId },
      "broadcast.publish failed",
    );
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- ingest.test.ts`
Expected: all (existing + 3 new) PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/scoreboard/ingest.ts apps/api/src/services/scoreboard/ingest.test.ts
git commit -m "broadcast: publish broadcast state from ingest when live"
```

---

## Task 7: Public broadcast routes (state + SSE)

**Files:**
- Create: `apps/api/src/routes/public/broadcast.routes.ts`
- Test: `apps/api/src/routes/public/broadcast.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/routes/public/broadcast.routes.test.ts
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Hono } from "hono";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  closeSub: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../../services/scoreboard/pubsub", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/scoreboard/pubsub")
  >("../../services/scoreboard/pubsub");
  return {
    ...actual,
    subscribeBroadcast: (...a: unknown[]) => mocks.subscribe(...a),
  };
});

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import { broadcastConfigs } from "@dragons/db/schema";
import { publicBroadcastRoutes } from "./broadcast.routes";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.subscribe.mockReset();
  mocks.subscribe.mockResolvedValue(async () => mocks.closeSub());
});
afterAll(async () => {
  await closeTestDb(ctx);
});

function makeApp() {
  return new Hono().route("/public/broadcast", publicBroadcastRoutes);
}

describe("GET /public/broadcast/state", () => {
  it("returns 400 without deviceId", async () => {
    const res = await makeApp().request("/public/broadcast/state");
    expect(res.status).toBe(400);
  });

  it("returns idle state when no config exists", async () => {
    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=d1",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { phase: string; isLive: boolean };
    expect(body.phase).toBe("idle");
    expect(body.isLive).toBe(false);
  });

  it("reflects isLive=true when config is live", async () => {
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      isLive: true,
    });
    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=d1",
    );
    const body = (await res.json()) as { isLive: boolean };
    expect(body.isLive).toBe(true);
  });
});

describe("GET /public/broadcast/stream", () => {
  it("returns text/event-stream", async () => {
    const res = await makeApp().request(
      "/public/broadcast/stream?deviceId=d1",
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    res.body?.cancel();
  });

  it("returns 400 without deviceId", async () => {
    const res = await makeApp().request("/public/broadcast/stream");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `pnpm --filter @dragons/api test -- broadcast.routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement public broadcast routes**

```ts
// apps/api/src/routes/public/broadcast.routes.ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { buildBroadcastState } from "../../services/broadcast/publisher";
import { subscribeBroadcast } from "../../services/scoreboard/pubsub";

const HEARTBEAT_MS = 15_000;

const publicBroadcastRoutes = new Hono();

publicBroadcastRoutes.get(
  "/state",
  describeRoute({
    description: "Current broadcast state for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Broadcast state" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const state = await buildBroadcastState(deviceId);
    c.header("Cache-Control", "no-store");
    return c.json(state);
  },
);

publicBroadcastRoutes.get(
  "/stream",
  describeRoute({
    description: "SSE stream of broadcast state changes",
    tags: ["Broadcast"],
    responses: { 200: { description: "text/event-stream" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => Promise<void>) | undefined;
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function safe(text: string) {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // closed
          }
        }
        safe("retry: 2000\n\n");

        const initial = await buildBroadcastState(deviceId);
        if (cancelled) return;
        safe(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);

        const sub = await subscribeBroadcast(deviceId, (state) => {
          safe(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`);
        });
        if (cancelled) {
          await sub();
          return;
        }
        unsubscribe = sub;

        heartbeat = setInterval(() => safe(": ping\n\n"), HEARTBEAT_MS);
      },
      async cancel() {
        cancelled = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) await unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  },
);

export { publicBroadcastRoutes };
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- broadcast.routes.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/public/broadcast.routes.ts apps/api/src/routes/public/broadcast.routes.test.ts
git commit -m "broadcast: add public state + SSE routes"
```

---

## Task 8: Admin broadcast routes (config GET/PUT, start, stop)

**Files:**
- Create: `apps/api/src/routes/admin/broadcast.routes.ts`
- Test: `apps/api/src/routes/admin/broadcast.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/routes/admin/broadcast.routes.test.ts
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Hono } from "hono";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishBroadcastForDevice: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../../middleware/rbac", () => ({
  requireAnyRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../../services/broadcast/publisher", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/broadcast/publisher")
  >("../../services/broadcast/publisher");
  return {
    ...actual,
    publishBroadcastForDevice: (...a: unknown[]) =>
      mocks.publishBroadcastForDevice(...a),
  };
});

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import { adminBroadcastRoutes } from "./broadcast.routes";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishBroadcastForDevice.mockReset();
  mocks.publishBroadcastForDevice.mockResolvedValue(undefined);
});
afterAll(async () => {
  await closeTestDb(ctx);
});

function app() {
  return new Hono().route("/admin/broadcast", adminBroadcastRoutes);
}

async function seedMatch(): Promise<{ matchId: number }> {
  await ctx.db.insert(leagues).values({
    id: 100,
    apiLeagueId: 100,
    name: "Liga",
    seasonId: 2026,
  });
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: 1,
      seasonTeamId: 1,
      teamCompetitionId: 1,
      name: "Dragons",
      nameShort: "Dragons",
      clubId: 42,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: 2,
      seasonTeamId: 2,
      teamCompetitionId: 2,
      name: "Visitors",
      nameShort: "Visitors",
      clubId: 99,
      isOwnClub: false,
    },
  ]);
  const [m] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 1,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: new Date().toISOString().slice(0, 10),
      kickoffTime: "19:30:00",
      leagueId: 100,
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    })
    .returning({ id: matches.id });
  return { matchId: m!.id };
}

describe("GET /admin/broadcast/config", () => {
  it("returns 400 without deviceId", async () => {
    const res = await app().request("/admin/broadcast/config");
    expect(res.status).toBe(400);
  });

  it("returns null config for unknown device", async () => {
    const res = await app().request("/admin/broadcast/config?deviceId=x");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: unknown };
    expect(body.config).toBeNull();
  });

  it("returns the config row when present", async () => {
    const { matchId } = await seedMatch();
    await ctx.db.insert(broadcastConfigs).values({ deviceId: "d1", matchId });
    const res = await app().request("/admin/broadcast/config?deviceId=d1");
    const body = (await res.json()) as {
      config: { deviceId: string };
      match: unknown;
    };
    expect(body.config.deviceId).toBe("d1");
    expect(body.match).not.toBeNull();
  });
});

describe("PUT /admin/broadcast/config", () => {
  it("upserts and triggers a publish", async () => {
    const { matchId } = await seedMatch();
    const res = await app().request("/admin/broadcast/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "d1",
        matchId,
        homeAbbr: "DRA",
        guestAbbr: "VIS",
      }),
    });
    expect(res.status).toBe(200);
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });

  it("rejects invalid body", async () => {
    const res = await app().request("/admin/broadcast/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /admin/broadcast/start", () => {
  it("400 if no matchId bound", async () => {
    await ctx.db.insert(broadcastConfigs).values({ deviceId: "d1" });
    const res = await app().request("/admin/broadcast/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });
    expect(res.status).toBe(400);
  });

  it("flips isLive=true and publishes", async () => {
    const { matchId } = await seedMatch();
    await ctx.db.insert(broadcastConfigs).values({ deviceId: "d1", matchId });
    const res = await app().request("/admin/broadcast/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });
    expect(res.status).toBe(200);
    const [row] = await ctx.db.select().from(broadcastConfigs);
    expect(row!.isLive).toBe(true);
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });
});

describe("POST /admin/broadcast/stop", () => {
  it("flips isLive=false and publishes", async () => {
    const { matchId } = await seedMatch();
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      matchId,
      isLive: true,
    });
    const res = await app().request("/admin/broadcast/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });
    expect(res.status).toBe(200);
    const [row] = await ctx.db.select().from(broadcastConfigs);
    expect(row!.isLive).toBe(false);
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `pnpm --filter @dragons/api test -- admin/broadcast.routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement admin broadcast routes**

```ts
// apps/api/src/routes/admin/broadcast.routes.ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { requireAnyRole } from "../../middleware/rbac";
import {
  getBroadcastConfig,
  loadJoinedMatch,
  setBroadcastLive,
  upsertBroadcastConfig,
} from "../../services/broadcast/config";
import {
  invalidateMatchCache,
  publishBroadcastForDevice,
} from "../../services/broadcast/publisher";
import type { AppEnv } from "../../types";

const adminBroadcastRoutes = new Hono<AppEnv>();

const upsertSchema = z.object({
  deviceId: z.string().min(1),
  matchId: z.number().int().positive().nullable().optional(),
  homeAbbr: z.string().max(8).nullable().optional(),
  guestAbbr: z.string().max(8).nullable().optional(),
  homeColorOverride: z.string().max(20).nullable().optional(),
  guestColorOverride: z.string().max(20).nullable().optional(),
});

const startStopSchema = z.object({ deviceId: z.string().min(1) });

adminBroadcastRoutes.get(
  "/config",
  requireAnyRole("admin"),
  describeRoute({
    description: "Get the broadcast config for a device",
    tags: ["Broadcast"],
    responses: { 200: { description: "Config + joined match" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const config = await getBroadcastConfig(deviceId);
    const match = config
      ? await loadJoinedMatch({
          matchId: config.matchId,
          homeAbbr: config.homeAbbr,
          guestAbbr: config.guestAbbr,
          homeColorOverride: config.homeColorOverride,
          guestColorOverride: config.guestColorOverride,
        })
      : null;
    return c.json({ config, match });
  },
);

adminBroadcastRoutes.put(
  "/config",
  requireAnyRole("admin"),
  describeRoute({
    description: "Upsert the broadcast config for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid body" },
    },
  }),
  async (c) => {
    const parsed = upsertSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    const config = await upsertBroadcastConfig(parsed.data);
    invalidateMatchCache(parsed.data.deviceId);
    await publishBroadcastForDevice(parsed.data.deviceId);
    return c.json({ config });
  },
);

adminBroadcastRoutes.post(
  "/start",
  requireAnyRole("admin"),
  describeRoute({
    description: "Set isLive=true",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Started" },
      400: { description: "No match bound" },
    },
  }),
  async (c) => {
    const parsed = startStopSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    try {
      const config = await setBroadcastLive(parsed.data.deviceId, true);
      await publishBroadcastForDevice(parsed.data.deviceId);
      return c.json({ config });
    } catch (err) {
      return c.json(
        { error: (err as Error).message, code: "BAD_REQUEST" },
        400,
      );
    }
  },
);

adminBroadcastRoutes.post(
  "/stop",
  requireAnyRole("admin"),
  describeRoute({
    description: "Set isLive=false",
    tags: ["Broadcast"],
    responses: { 200: { description: "Stopped" } },
  }),
  async (c) => {
    const parsed = startStopSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    const config = await setBroadcastLive(parsed.data.deviceId, false);
    await publishBroadcastForDevice(parsed.data.deviceId);
    return c.json({ config });
  },
);

export { adminBroadcastRoutes };
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- admin/broadcast.routes.test.ts`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/broadcast.routes.ts apps/api/src/routes/admin/broadcast.routes.test.ts
git commit -m "broadcast: add admin config/start/stop routes"
```

---

## Task 9: Admin matches search route

**Files:**
- Modify: `apps/api/src/routes/admin/broadcast.routes.ts`
- Modify: `apps/api/src/routes/admin/broadcast.routes.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `broadcast.routes.test.ts`:

```ts
describe("GET /admin/broadcast/matches", () => {
  it("returns own-club matches scheduled today by default", async () => {
    await ctx.db.insert(leagues).values({
      id: 100,
      apiLeagueId: 100,
      name: "Liga",
      seasonId: 2026,
    });
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 1,
        seasonTeamId: 1,
        teamCompetitionId: 1,
        name: "Dragons",
        nameShort: "Dragons",
        clubId: 42,
        isOwnClub: true,
      },
      {
        apiTeamPermanentId: 2,
        seasonTeamId: 2,
        teamCompetitionId: 2,
        name: "Visitors",
        nameShort: "Visitors",
        clubId: 99,
        isOwnClub: false,
      },
      {
        apiTeamPermanentId: 3,
        seasonTeamId: 3,
        teamCompetitionId: 3,
        name: "Other A",
        nameShort: "OtherA",
        clubId: 80,
        isOwnClub: false,
      },
      {
        apiTeamPermanentId: 4,
        seasonTeamId: 4,
        teamCompetitionId: 4,
        name: "Other B",
        nameShort: "OtherB",
        clubId: 81,
        isOwnClub: false,
      },
    ]);
    const today = new Date().toISOString().slice(0, 10);
    await ctx.db.insert(matches).values([
      {
        apiMatchId: 10,
        matchNo: 1,
        matchDay: 1,
        kickoffDate: today,
        kickoffTime: "19:30:00",
        leagueId: 100,
        homeTeamApiId: 1,
        guestTeamApiId: 2,
      },
      {
        apiMatchId: 11,
        matchNo: 2,
        matchDay: 1,
        kickoffDate: today,
        kickoffTime: "21:00:00",
        leagueId: 100,
        homeTeamApiId: 3,
        guestTeamApiId: 4, // own-club not involved
      },
    ]);
    const res = await app().request("/admin/broadcast/matches?scope=today");
    const body = (await res.json()) as { matches: Array<{ id: number }> };
    expect(body.matches).toHaveLength(1);
  });

  it("scope=all with q filters by team name", async () => {
    await ctx.db.insert(leagues).values({
      id: 100,
      apiLeagueId: 100,
      name: "Liga",
      seasonId: 2026,
    });
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 1,
        seasonTeamId: 1,
        teamCompetitionId: 1,
        name: "Dragons",
        nameShort: "Dragons",
        clubId: 42,
        isOwnClub: true,
      },
      {
        apiTeamPermanentId: 2,
        seasonTeamId: 2,
        teamCompetitionId: 2,
        name: "Visitors X",
        nameShort: "VisX",
        clubId: 99,
        isOwnClub: false,
      },
    ]);
    await ctx.db.insert(matches).values({
      apiMatchId: 12,
      matchNo: 3,
      matchDay: 2,
      kickoffDate: "2026-06-15",
      kickoffTime: "20:00:00",
      leagueId: 100,
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    });
    const res = await app().request(
      "/admin/broadcast/matches?scope=all&q=Visitors",
    );
    const body = (await res.json()) as { matches: Array<{ id: number }> };
    expect(body.matches).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm --filter @dragons/api test -- admin/broadcast.routes.test.ts`
Expected: 2 new tests fail (route not found).

- [ ] **Step 3: Add the route**

In `apps/api/src/routes/admin/broadcast.routes.ts`, add imports:

```ts
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../config/database";
import {
  matches,
  leagues,
  teams,
} from "@dragons/db/schema";
```

Append the route below the existing ones:

```ts
const matchesQuerySchema = z.object({
  q: z.string().optional(),
  scope: z.enum(["today", "all"]).default("today"),
});

const homeTeam = teams;

adminBroadcastRoutes.get(
  "/matches",
  requireAnyRole("admin"),
  describeRoute({
    description: "Own-club matches available for broadcast binding",
    tags: ["Broadcast"],
    responses: { 200: { description: "List of matches" } },
  }),
  async (c) => {
    const parsed = matchesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "invalid query", code: "BAD_REQUEST" }, 400);
    }
    const { q, scope } = parsed.data;

    const today = new Date().toISOString().slice(0, 10);

    // Subquery: own-club team api ids.
    const ownIds = await db
      .select({ id: teams.apiTeamPermanentId })
      .from(teams)
      .where(eq(teams.isOwnClub, true));
    const ownIdValues = ownIds.map((r) => r.id);
    if (ownIdValues.length === 0) {
      return c.json({ matches: [] });
    }

    const ownClubFilter = or(
      sql`${matches.homeTeamApiId} = ANY(${ownIdValues})`,
      sql`${matches.guestTeamApiId} = ANY(${ownIdValues})`,
    );

    let dateFilter = undefined;
    if (scope === "today") {
      dateFilter = eq(matches.kickoffDate, today);
    }

    let textFilter = undefined;
    if (q && q.trim().length > 0) {
      const pattern = `%${q.trim()}%`;
      // Subquery for matching team api ids.
      const matchedTeams = await db
        .select({ id: teams.apiTeamPermanentId })
        .from(teams)
        .where(or(ilike(teams.name, pattern), ilike(teams.nameShort, pattern)));
      const matchedIds = matchedTeams.map((r) => r.id);
      if (matchedIds.length === 0) {
        return c.json({ matches: [] });
      }
      textFilter = or(
        sql`${matches.homeTeamApiId} = ANY(${matchedIds})`,
        sql`${matches.guestTeamApiId} = ANY(${matchedIds})`,
      );
    }

    const filters = [ownClubFilter];
    if (dateFilter) filters.push(dateFilter);
    if (textFilter) filters.push(textFilter);

    const guestTeam = teams;
    const rows = await db
      .select({
        id: matches.id,
        kickoffDate: matches.kickoffDate,
        kickoffTime: matches.kickoffTime,
        homeName: homeTeam.name,
        guestName: guestTeam.name,
        leagueName: leagues.name,
      })
      .from(matches)
      .leftJoin(homeTeam, eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId))
      .leftJoin(
        guestTeam,
        eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId),
      )
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(and(...filters))
      .orderBy(asc(matches.kickoffDate), asc(matches.kickoffTime))
      .limit(100);

    return c.json({ matches: rows });
  },
);
```

Note on the `homeTeam`/`guestTeam` aliases: Drizzle requires distinct aliases when joining the same table twice. If your version's API differs, replace the alias-pattern with two `db.select` calls and merge in JS — the test asserts only count and shape, not SQL.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- admin/broadcast.routes.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/broadcast.routes.ts apps/api/src/routes/admin/broadcast.routes.test.ts
git commit -m "broadcast: add admin matches search route"
```

---

## Task 10: Wire routes + sidebar nav

**Files:**
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/web/src/components/admin/app-sidebar.tsx`
- Modify: `apps/web/src/messages/en.json` and `de.json`

- [ ] **Step 1: Wire API routes**

In `apps/api/src/routes/index.ts`, add the imports next to the scoreboard ones (around line 32–34):

```ts
import { publicBroadcastRoutes } from "./public/broadcast.routes";
import { adminBroadcastRoutes } from "./admin/broadcast.routes";
```

And register them next to the existing `route("/public/scoreboard", …)` and `route("/admin/scoreboard", …)` calls:

```ts
routes.route("/public/broadcast", publicBroadcastRoutes);
routes.route("/admin/broadcast", adminBroadcastRoutes);
```

- [ ] **Step 2: Add sidebar entry**

In `apps/web/src/components/admin/app-sidebar.tsx`, find the Operations group (the one with `/admin/boards`, `/admin/bookings`) and add a new item:

```tsx
{
  href: "/admin/broadcast",
  labelKey: "nav.broadcast" as const,
  perm: { resource: "scoreboard", action: "view" } as const,
},
```

If `nav.broadcast` is not yet a known label key in the sidebar's `LabelKey` type, also add it to the union type or the relevant message-keys map (locate it via `grep -n "nav\\.matches" apps/web/src/components/admin/app-sidebar.tsx` to find the precedent pattern).

- [ ] **Step 3: Add i18n strings**

In `apps/web/src/messages/en.json`, add at the same depth as other `nav.*` keys:

```json
"nav.broadcast": "Broadcast",
```

Then add a top-level `broadcast` section (sibling of `scoreboard`):

```json
"broadcast": {
  "title": "Broadcast Control",
  "device": "Device",
  "live": "Live",
  "idle": "Idle",
  "selectedMatch": "Selected Match",
  "changeMatch": "Change match…",
  "config": "Broadcast Config",
  "homeAbbr": "Home abbr",
  "guestAbbr": "Guest abbr",
  "homeColor": "Home color",
  "guestColor": "Guest color",
  "save": "Save",
  "goLive": "Go Live",
  "endBroadcast": "End broadcast",
  "obsUrl": "OBS URL",
  "copy": "Copy",
  "noMatch": "No match selected",
  "today": "Today",
  "search": "Search",
  "kickoff": "Kickoff",
  "league": "League",
  "noMatchesToday": "No matches scheduled for today.",
  "pickerTitle": "Pick match",
  "useDefault": "(default)",
  "errors": {
    "matchRequired": "Pick a match before going live."
  },
  "overlay": {
    "live": "Live",
    "offline": "Off air",
    "stale": "Connection stalled"
  }
}
```

Mirror in `apps/web/src/messages/de.json`:

```json
"nav.broadcast": "Übertragung",
```

```json
"broadcast": {
  "title": "Übertragungs-Steuerung",
  "device": "Gerät",
  "live": "Live",
  "idle": "Aus",
  "selectedMatch": "Ausgewähltes Spiel",
  "changeMatch": "Spiel ändern…",
  "config": "Übertragungs-Konfiguration",
  "homeAbbr": "Heim-Kürzel",
  "guestAbbr": "Gast-Kürzel",
  "homeColor": "Heim-Farbe",
  "guestColor": "Gast-Farbe",
  "save": "Speichern",
  "goLive": "Live gehen",
  "endBroadcast": "Übertragung beenden",
  "obsUrl": "OBS-URL",
  "copy": "Kopieren",
  "noMatch": "Kein Spiel ausgewählt",
  "today": "Heute",
  "search": "Suche",
  "kickoff": "Anwurf",
  "league": "Liga",
  "noMatchesToday": "Heute keine Spiele angesetzt.",
  "pickerTitle": "Spiel wählen",
  "useDefault": "(Standard)",
  "errors": {
    "matchRequired": "Vor dem Live-Gang ein Spiel auswählen."
  },
  "overlay": {
    "live": "Live",
    "offline": "Aus",
    "stale": "Verbindung instabil"
  }
}
```

- [ ] **Step 4: Run i18n + typecheck**

Run: `pnpm --filter @dragons/web i18n:check`
Expected: PASS (de mirrors en).

Run: `pnpm --filter @dragons/api typecheck && pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/index.ts apps/web/src/components/admin/app-sidebar.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "broadcast: wire routes and sidebar entry"
```

---

## Task 11: Admin broadcast page

**Files:**
- Create: `apps/web/src/app/[locale]/admin/broadcast/page.tsx`
- Create: `apps/web/src/app/[locale]/admin/broadcast/broadcast-control.tsx`
- Create: `apps/web/src/app/[locale]/admin/broadcast/match-picker.tsx`

The admin page is large; split into three files (server entry, control panel, picker modal). Tests for client React components require user-event setup, which is non-trivial — for this plan we rely on the route tests in Task 8/9 plus manual smoke testing. Don't add client-component vitest specs here unless the implementer is comfortable with happy-dom + React Testing Library (the repo has both).

- [ ] **Step 1: Server component**

```tsx
// apps/web/src/app/[locale]/admin/broadcast/page.tsx
import { fetchAPI } from "@/lib/api";
import type { BroadcastConfig, BroadcastMatch } from "@dragons/shared";
import { BroadcastControl } from "./broadcast-control";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

interface ConfigResponse {
  config: BroadcastConfig | null;
  match: BroadcastMatch | null;
}

export default async function AdminBroadcastPage() {
  let initial: ConfigResponse = { config: null, match: null };
  if (deviceId) {
    try {
      initial = await fetchAPI<ConfigResponse>(
        `/admin/broadcast/config?deviceId=${encodeURIComponent(deviceId)}`,
      );
    } catch {
      initial = { config: null, match: null };
    }
  }
  return (
    <div className="flex flex-col gap-4 p-6">
      <BroadcastControl deviceId={deviceId} initial={initial} />
    </div>
  );
}
```

- [ ] **Step 2: Client control panel**

```tsx
// apps/web/src/app/[locale]/admin/broadcast/broadcast-control.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fetchAPI } from "@/lib/api";
import type { BroadcastConfig, BroadcastMatch } from "@dragons/shared";
import { MatchPicker } from "./match-picker";

interface Props {
  deviceId: string;
  initial: { config: BroadcastConfig | null; match: BroadcastMatch | null };
}

export function BroadcastControl({ deviceId, initial }: Props) {
  const t = useTranslations("broadcast");
  const [config, setConfig] = useState<BroadcastConfig | null>(initial.config);
  const [match, setMatch] = useState<BroadcastMatch | null>(initial.match);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLive = config?.isLive ?? false;
  const overlayUrl =
    typeof window !== "undefined" ? `${window.location.origin}/de/overlay` : "";

  async function reload() {
    const next = await fetchAPI<{
      config: BroadcastConfig | null;
      match: BroadcastMatch | null;
    }>(`/admin/broadcast/config?deviceId=${encodeURIComponent(deviceId)}`);
    setConfig(next.config);
    setMatch(next.match);
  }

  async function save(partial: Partial<BroadcastConfig>) {
    setError(null);
    await fetchAPI(`/admin/broadcast/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, ...partial }),
    });
    await reload();
  }

  async function goLive() {
    setError(null);
    try {
      await fetchAPI(`/admin/broadcast/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      await reload();
    } catch (err) {
      setError(t("errors.matchRequired"));
    }
  }

  async function endBroadcast() {
    await fetchAPI(`/admin/broadcast/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    await reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block size-2 rounded-full ${
              isLive ? "bg-emerald-500" : "bg-zinc-500"
            }`}
          />
          <span>{isLive ? t("live") : t("idle")}</span>
        </div>
      </div>

      <section className="rounded border border-zinc-800 p-4">
        <div className="mb-2 text-sm uppercase text-zinc-400">
          {t("selectedMatch")}
        </div>
        {match ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium">
                {match.home.name} vs {match.guest.name}
              </div>
              <div className="text-sm text-zinc-400">
                {match.kickoffDate} — {match.kickoffTime.slice(0, 5)} —{" "}
                {match.league?.name ?? ""}
              </div>
            </div>
            <button
              type="button"
              className="rounded border border-zinc-700 px-3 py-1"
              onClick={() => setPickerOpen(true)}
            >
              {t("changeMatch")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="rounded border border-zinc-700 px-3 py-1"
            onClick={() => setPickerOpen(true)}
          >
            {t("changeMatch")}
          </button>
        )}
      </section>

      <section className="rounded border border-zinc-800 p-4">
        <div className="mb-2 text-sm uppercase text-zinc-400">{t("config")}</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("homeAbbr")}</span>
            <input
              type="text"
              defaultValue={config?.homeAbbr ?? ""}
              maxLength={8}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ homeAbbr: e.target.value || null })
              }
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("guestAbbr")}</span>
            <input
              type="text"
              defaultValue={config?.guestAbbr ?? ""}
              maxLength={8}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ guestAbbr: e.target.value || null })
              }
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("homeColor")}</span>
            <input
              type="text"
              placeholder={t("useDefault")}
              defaultValue={config?.homeColorOverride ?? ""}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ homeColorOverride: e.target.value || null })
              }
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-400">{t("guestColor")}</span>
            <input
              type="text"
              placeholder={t("useDefault")}
              defaultValue={config?.guestColorOverride ?? ""}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              onBlur={(e) =>
                save({ guestColorOverride: e.target.value || null })
              }
            />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        {!isLive ? (
          <button
            type="button"
            disabled={!match}
            onClick={goLive}
            className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            ▶ {t("goLive")}
          </button>
        ) : (
          <button
            type="button"
            onClick={endBroadcast}
            className="rounded bg-rose-600 px-4 py-2 font-semibold text-white"
          >
            ■ {t("endBroadcast")}
          </button>
        )}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>

      <div className="text-sm text-zinc-400">
        {t("obsUrl")}: <code className="text-zinc-200">{overlayUrl}</code>
        <button
          type="button"
          className="ml-2 rounded border border-zinc-700 px-2 py-0.5"
          onClick={() => navigator.clipboard.writeText(overlayUrl)}
        >
          {t("copy")}
        </button>
      </div>

      {pickerOpen && (
        <MatchPicker
          onClose={() => setPickerOpen(false)}
          onPick={async (matchId) => {
            await save({ matchId });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Match-picker modal**

```tsx
// apps/web/src/app/[locale]/admin/broadcast/match-picker.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchAPI } from "@/lib/api";
import type { AdminBroadcastMatchListItem } from "@dragons/shared";

interface Props {
  onClose: () => void;
  onPick: (matchId: number) => Promise<void> | void;
}

export function MatchPicker({ onClose, onPick }: Props) {
  const t = useTranslations("broadcast");
  const [tab, setTab] = useState<"today" | "search">("today");
  const [q, setQ] = useState("");
  const [list, setList] = useState<AdminBroadcastMatchListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ scope: tab });
    if (tab === "search" && q) params.set("q", q);
    fetchAPI<{ matches: AdminBroadcastMatchListItem[] }>(
      `/admin/broadcast/matches?${params.toString()}`,
    ).then((res) => {
      if (!cancelled) setList(res.matches);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl rounded border border-zinc-700 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("pickerTitle")}</h2>
          <button onClick={onClose} className="px-2">
            ✕
          </button>
        </div>
        <div className="mb-2 flex gap-2">
          <button
            className={`rounded px-3 py-1 ${
              tab === "today" ? "bg-zinc-700" : "border border-zinc-700"
            }`}
            onClick={() => setTab("today")}
          >
            {t("today")}
          </button>
          <button
            className={`rounded px-3 py-1 ${
              tab === "search" ? "bg-zinc-700" : "border border-zinc-700"
            }`}
            onClick={() => setTab("search")}
          >
            {t("search")}
          </button>
          {tab === "search" && (
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2"
              placeholder={t("search")}
            />
          )}
        </div>
        <ul className="max-h-80 overflow-auto">
          {list.length === 0 && tab === "today" && (
            <li className="py-4 text-center text-zinc-400">
              {t("noMatchesToday")}
            </li>
          )}
          {list.map((m) => (
            <li
              key={m.id}
              className="flex cursor-pointer items-center justify-between rounded px-2 py-2 hover:bg-zinc-800"
              onClick={() => onPick(m.id)}
            >
              <div>
                {m.homeName} vs {m.guestName}
              </div>
              <div className="text-sm text-zinc-400">
                {m.kickoffDate} {m.kickoffTime.slice(0, 5)}
                {m.leagueName ? ` — ${m.leagueName}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Start the API and web (`pnpm dev`). Visit `/de/admin/broadcast`. Confirm:
1. Sidebar nav shows "Übertragung" entry.
2. Match picker today tab shows own-club matches scheduled for today (or empty-state text).
3. Selecting a match displays it; setting `homeAbbr`/`guestAbbr` and blurring saves to DB.
4. **Go Live** is disabled until a match is selected; once enabled, clicking it sets `isLive=true` (verify via `/admin/broadcast/config?deviceId=…`).
5. **End Broadcast** flips back.
6. OBS URL copy works.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[locale]/admin/broadcast/
git commit -m "broadcast: add admin control page"
```

---

## Task 12: Overlay layout + initial server fetch

**Files:**
- Create: `apps/web/src/app/[locale]/overlay/layout.tsx`
- Create: `apps/web/src/app/[locale]/overlay/page.tsx`

This task starts PR 2.

- [ ] **Step 1: Standalone transparent layout**

```tsx
// apps/web/src/app/[locale]/overlay/layout.tsx
// OBS browser-source loads this URL. Body must be transparent so the
// scoreboard composites cleanly over the gameplay capture. No navbar,
// no global chrome, no padding from /[locale]/(public) layouts.
export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full overflow-hidden bg-transparent text-white">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Server page (initial state)**

```tsx
// apps/web/src/app/[locale]/overlay/page.tsx
import { fetchAPI } from "@/lib/api";
import type { BroadcastState } from "@dragons/shared";
import { OverlayClient } from "./overlay-client";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default async function OverlayPage() {
  let initial: BroadcastState | null = null;
  if (deviceId) {
    try {
      initial = await fetchAPI<BroadcastState>(
        `/public/broadcast/state?deviceId=${encodeURIComponent(deviceId)}`,
      );
    } catch {
      initial = null;
    }
  }
  return <OverlayClient deviceId={deviceId} initial={initial} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: FAIL — `OverlayClient` not yet implemented (next task).

- [ ] **Step 4: Commit (with placeholder client to make it compile)**

Create a minimal placeholder so this commit is buildable. We replace it in Task 13.

```tsx
// apps/web/src/app/[locale]/overlay/overlay-client.tsx
"use client";
import type { BroadcastState } from "@dragons/shared";
export function OverlayClient(_props: {
  deviceId: string;
  initial: BroadcastState | null;
}) {
  return null;
}
```

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

```bash
git add apps/web/src/app/[locale]/overlay/
git commit -m "broadcast: scaffold overlay route with transparent layout"
```

---

## Task 13: Overlay client (SSE + phase switch)

**Files:**
- Modify: `apps/web/src/app/[locale]/overlay/overlay-client.tsx`

- [ ] **Step 1: Implement the SSE consumer**

Replace the placeholder file:

```tsx
// apps/web/src/app/[locale]/overlay/overlay-client.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { BroadcastState } from "@dragons/shared";
import { PregameCard } from "./pregame-card";
import { ScoreBug } from "./score-bug";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Props {
  deviceId: string;
  initial: BroadcastState | null;
}

export function OverlayClient({ deviceId, initial }: Props) {
  const [state, setState] = useState<BroadcastState | null>(initial);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    const url = `${apiBase}/public/broadcast/stream?deviceId=${encodeURIComponent(
      deviceId,
    )}`;
    const es = new EventSource(url);
    esRef.current = es;
    const onSnapshot = (ev: MessageEvent) => {
      try {
        setState(JSON.parse(ev.data) as BroadcastState);
      } catch {
        // discard
      }
    };
    es.addEventListener("snapshot", onSnapshot);
    return () => {
      es.removeEventListener("snapshot", onSnapshot);
      es.close();
      esRef.current = null;
    };
  }, [deviceId]);

  if (!state || state.phase === "idle") {
    // OBS source stays loaded but invisible.
    return null;
  }

  if (state.phase === "pregame" && state.match) {
    return <PregameCard match={state.match} />;
  }

  if (state.phase === "live" && state.match && state.scoreboard) {
    return (
      <ScoreBug
        match={state.match}
        scoreboard={state.scoreboard}
        stale={state.stale}
      />
    );
  }
  return null;
}
```

- [ ] **Step 2: Add a tiny test for the phase switch**

Most overlay logic lives in the server-side `buildBroadcastState`; the client renders mechanically. Add a happy-dom test only for the phase fallback.

```tsx
// apps/web/src/app/[locale]/overlay/overlay-client.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { OverlayClient } from "./overlay-client";

vi.mock("./pregame-card", () => ({
  PregameCard: () => <div data-testid="pregame">PRE</div>,
}));
vi.mock("./score-bug", () => ({
  ScoreBug: () => <div data-testid="bug">BUG</div>,
}));

class MockEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

describe("OverlayClient", () => {
  it("renders nothing when phase=idle", () => {
    const { container } = render(
      <OverlayClient
        deviceId="d1"
        initial={{
          deviceId: "d1",
          isLive: false,
          phase: "idle",
          match: null,
          scoreboard: null,
          stale: false,
          startedAt: null,
          endedAt: null,
          updatedAt: new Date().toISOString(),
        }}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders pregame card when phase=pregame", () => {
    const { getByTestId } = render(
      <OverlayClient
        deviceId="d1"
        initial={{
          deviceId: "d1",
          isLive: true,
          phase: "pregame",
          match: {
            id: 1,
            kickoffDate: "2026-05-02",
            kickoffTime: "19:30:00",
            league: { id: 1, name: "Liga" },
            home: { name: "Dragons", abbr: "DRA", color: "#000", clubId: 42 },
            guest: { name: "Visitors", abbr: "VIS", color: "#fff", clubId: 99 },
          },
          scoreboard: null,
          stale: false,
          startedAt: null,
          endedAt: null,
          updatedAt: new Date().toISOString(),
        }}
      />,
    );
    expect(getByTestId("pregame")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests (will fail until child components exist)**

Run: `pnpm --filter @dragons/web test -- overlay-client`
Expected: FAIL — `pregame-card` and `score-bug` don't exist. The mock catches that, but typecheck still needs the files. Complete with stubs in this commit and replace in Tasks 14–15.

Add minimal stubs:

```tsx
// apps/web/src/app/[locale]/overlay/pregame-card.tsx
"use client";
import type { BroadcastMatch } from "@dragons/shared";
export function PregameCard(_p: { match: BroadcastMatch }) {
  return null;
}
```

```tsx
// apps/web/src/app/[locale]/overlay/score-bug.tsx
"use client";
import type { BroadcastMatch, PublicLiveSnapshot } from "@dragons/shared";
export function ScoreBug(_p: {
  match: BroadcastMatch;
  scoreboard: PublicLiveSnapshot;
  stale: boolean;
}) {
  return null;
}
```

Re-run: `pnpm --filter @dragons/web test -- overlay-client`
Expected: 2/2 PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/overlay/
git commit -m "broadcast: add overlay SSE consumer with phase switch"
```

---

## Task 14: Pre-game card

**Files:**
- Modify: `apps/web/src/app/[locale]/overlay/pregame-card.tsx`

- [ ] **Step 1: Implement the pre-game card**

```tsx
// apps/web/src/app/[locale]/overlay/pregame-card.tsx
"use client";

import type { BroadcastMatch } from "@dragons/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function logoUrl(clubId: number): string {
  return `${apiBase}/assets/clubs/${clubId}.webp`;
}

export function PregameCard({ match }: { match: BroadcastMatch }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{ bottom: "8vh", width: "min(720px, 80vw)" }}
    >
      <div
        className="flex items-center gap-6 rounded-xl px-8 py-6 backdrop-blur"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0.85))",
          borderTop: `6px solid ${match.home.color}`,
          borderBottom: `6px solid ${match.guest.color}`,
        }}
      >
        <TeamSide team={match.home} side="left" />
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="text-sm uppercase tracking-widest text-white/70">
            {match.league?.name ?? ""}
          </div>
          <div
            className="font-black tabular-nums"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
          >
            {match.kickoffTime.slice(0, 5)}
          </div>
          <div className="text-sm text-white/60">{match.kickoffDate}</div>
        </div>
        <TeamSide team={match.guest} side="right" />
      </div>
    </div>
  );
}

function TeamSide({
  team,
  side,
}: {
  team: BroadcastMatch["home"];
  side: "left" | "right";
}) {
  const align = side === "left" ? "items-start" : "items-end";
  return (
    <div className={`flex flex-col gap-3 ${align}`}>
      <img
        src={logoUrl(team.clubId)}
        alt={team.name}
        style={{ width: "96px", height: "96px", objectFit: "contain" }}
      />
      <div
        className="font-black uppercase"
        style={{ fontSize: "clamp(1rem, 1.6vw, 1.5rem)" }}
      >
        {team.name}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/overlay/pregame-card.tsx
git commit -m "broadcast: add pre-game overlay card"
```

---

## Task 15: Live score bug

**Files:**
- Modify: `apps/web/src/app/[locale]/overlay/score-bug.tsx`

- [ ] **Step 1: Implement the score bug**

```tsx
// apps/web/src/app/[locale]/overlay/score-bug.tsx
"use client";

import { useEffect, useState } from "react";
import type { BroadcastMatch, PublicLiveSnapshot } from "@dragons/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MAX_FOUL_PIPS = 5;
const SHOT_CLOCK_RED_AT = 5;

function logoUrl(clubId: number): string {
  return `${apiBase}/assets/clubs/${clubId}.webp`;
}

interface Props {
  match: BroadcastMatch;
  scoreboard: PublicLiveSnapshot;
  stale: boolean;
}

export function ScoreBug({ match, scoreboard, stale }: Props) {
  return (
    <div
      className="absolute"
      style={{
        bottom: "4vh",
        left: "4vw",
        width: "min(560px, 60vw)",
        opacity: stale ? 0.5 : 1,
        transition: "opacity 200ms",
      }}
    >
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(6px)",
        }}
      >
        <TeamRow
          team={match.home}
          score={scoreboard.scoreHome}
          fouls={scoreboard.foulsHome}
        />
        <div
          className="flex items-center gap-2 border-t border-white/10 px-3 py-2"
        >
          <PeriodClock
            period={scoreboard.period}
            clockText={scoreboard.clockText}
            clockRunning={scoreboard.clockRunning}
          />
          <ShotClock value={scoreboard.shotClock} />
        </div>
        <TeamRow
          team={match.guest}
          score={scoreboard.scoreGuest}
          fouls={scoreboard.foulsGuest}
        />
      </div>
    </div>
  );
}

function TeamRow({
  team,
  score,
  fouls,
}: {
  team: BroadcastMatch["home"];
  score: number;
  fouls: number;
}) {
  return (
    <div className="grid items-center gap-2 px-3 py-2"
         style={{ gridTemplateColumns: "auto auto 1fr auto" }}>
      <div
        style={{
          width: "1rem",
          height: "2rem",
          background: team.color,
        }}
      />
      <img
        src={logoUrl(team.clubId)}
        alt={team.name}
        style={{ width: "32px", height: "32px", objectFit: "contain" }}
      />
      <div className="flex items-center gap-3">
        <span
          className="font-black uppercase tracking-wider"
          style={{ fontSize: "1.5rem" }}
        >
          {team.abbr}
        </span>
        <FoulPips fouls={fouls} />
      </div>
      <AnimatedScore value={score} />
    </div>
  );
}

function FoulPips({ fouls }: { fouls: number }) {
  const bonus = fouls >= MAX_FOUL_PIPS;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: MAX_FOUL_PIPS }, (_, i) => (
        <span
          key={i}
          style={{
            width: "0.6rem",
            height: "0.6rem",
            borderRadius: "9999px",
            background:
              i < fouls
                ? bonus
                  ? "rgb(250 204 21)"
                  : "rgb(244 63 94)"
                : "rgba(255,255,255,0.2)",
          }}
        />
      ))}
      {bonus && (
        <span
          className="ml-1 rounded bg-amber-400 px-1 font-black uppercase text-black"
          style={{ fontSize: "0.7rem" }}
        >
          BONUS
        </span>
      )}
    </div>
  );
}

function AnimatedScore({ value }: { value: number }) {
  const [prev, setPrev] = useState(value);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (value !== prev) {
      setPop(true);
      setPrev(value);
      const t = setTimeout(() => setPop(false), 200);
      return () => clearTimeout(t);
    }
  }, [value, prev]);
  return (
    <span
      className="font-black tabular-nums"
      style={{
        fontSize: "2.5rem",
        transform: pop ? "scale(1.15)" : "scale(1)",
        transition: "transform 200ms",
      }}
    >
      {value}
    </span>
  );
}

function PeriodClock({
  period,
  clockText,
  clockRunning,
}: {
  period: number;
  clockText: string;
  clockRunning: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider"
      >
        {period > 0 ? `Q${period}` : "—"}
      </span>
      <span
        className="font-black tabular-nums"
        style={{
          fontSize: "1.6rem",
          color: clockRunning ? "white" : "rgba(255,255,255,0.6)",
        }}
      >
        {clockText || "--:--"}
      </span>
    </div>
  );
}

function ShotClock({ value }: { value: number }) {
  const red = value > 0 && value <= SHOT_CLOCK_RED_AT;
  return (
    <span
      className="ml-auto rounded font-black tabular-nums"
      style={{
        fontSize: "1.4rem",
        padding: "0.1rem 0.5rem",
        background: red ? "rgba(244,63,94,0.2)" : "rgba(255,255,255,0.1)",
        color: red ? "rgb(244 63 94)" : "white",
        border: `1px solid ${red ? "rgb(244 63 94)" : "rgba(255,255,255,0.2)"}`,
      }}
    >
      {String(value).padStart(2, "0")}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke (visual)**

Run dev stack. With ingest replay running (`apps/pi/scripts/replay-fixture.mjs`) and a config row with `isLive=true` plus a bound match, open `/de/overlay`. Confirm:
1. Score bug renders bottom-left.
2. Score animates on change.
3. Foul pips fill correctly; bonus indicator appears at fouls=5.
4. Shot clock turns red at ≤5.
5. Clock dims when stopped.
6. Logos load from `/assets/clubs/<clubId>.webp`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/overlay/score-bug.tsx
git commit -m "broadcast: add live score bug with foul pips and shot clock"
```

---

## Task 16: Admin preview iframe

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/broadcast/broadcast-control.tsx`

Add the preview now that the overlay exists.

- [ ] **Step 1: Add the iframe block**

In `broadcast-control.tsx`, above the Go-Live buttons, insert:

```tsx
{deviceId && (
  <section className="rounded border border-zinc-800 p-4">
    <div className="mb-2 text-sm uppercase text-zinc-400">Preview</div>
    <div
      className="overflow-hidden rounded border border-dashed border-zinc-700"
      style={{ aspectRatio: "16 / 9", background: "#222" }}
    >
      <iframe
        src="/de/overlay"
        title="overlay-preview"
        className="size-full"
      />
    </div>
  </section>
)}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/admin/broadcast/broadcast-control.tsx
git commit -m "broadcast: add overlay preview iframe to admin"
```

---

## Task 17: End-to-end pipeline test

**Files:**
- Create: `apps/api/src/services/broadcast/replay-fixture.test.ts`

This test closes the gap that allowed the prior `changed:false` curl bug to slip through: it exercises the **whole** ingest → DB → broadcast publish → SSE-payload pipeline against the bundled Stramatel fixture.

- [ ] **Step 1: Write the test**

```ts
// apps/api/src/services/broadcast/replay-fixture.test.ts
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishSnapshot: vi.fn(),
  publishBroadcast: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../scoreboard/pubsub", async () => {
  const actual = await vi.importActual<
    typeof import("../scoreboard/pubsub")
  >("../scoreboard/pubsub");
  return {
    ...actual,
    publishSnapshot: (...a: unknown[]) => mocks.publishSnapshot(...a),
    publishBroadcast: (...a: unknown[]) => mocks.publishBroadcast(...a),
  };
});

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import { processIngest } from "../scoreboard/ingest";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishSnapshot.mockReset();
  mocks.publishBroadcast.mockReset();
  mocks.publishSnapshot.mockResolvedValue(undefined);
  mocks.publishBroadcast.mockResolvedValue(undefined);
});
afterAll(async () => {
  await closeTestDb(ctx);
});

const FIXTURE = resolve(
  __dirname,
  "../scoreboard/__fixtures__/stramatel-sample.bin",
);

function findFrames(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  const start = Buffer.from([0xf8, 0x33]);
  let cursor = 0;
  while (cursor < buf.length) {
    const s = buf.indexOf(start, cursor);
    if (s === -1) break;
    const e = buf.indexOf(0x0d, s + 2);
    if (e === -1) break;
    out.push(buf.subarray(s, e + 1));
    cursor = e + 1;
  }
  return out;
}

async function seed(): Promise<void> {
  await ctx.db.insert(leagues).values({
    id: 100,
    apiLeagueId: 100,
    name: "Liga",
    seasonId: 2026,
  });
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: 1,
      seasonTeamId: 1,
      teamCompetitionId: 1,
      name: "Dragons",
      nameShort: "Dragons",
      clubId: 42,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: 2,
      seasonTeamId: 2,
      teamCompetitionId: 2,
      name: "Visitors",
      nameShort: "Visitors",
      clubId: 99,
      isOwnClub: false,
    },
  ]);
  const [m] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 1,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: "2026-05-02",
      kickoffTime: "19:30:00",
      leagueId: 100,
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    })
    .returning({ id: matches.id });
  await ctx.db.insert(broadcastConfigs).values({
    deviceId: "d1",
    matchId: m!.id,
    isLive: true,
  });
}

describe("ingest → broadcast pipeline (fixture replay)", () => {
  it("replays fixture frames and publishes a phase=live event", async () => {
    await seed();
    const buf = readFileSync(FIXTURE);
    const frames = findFrames(buf);
    expect(frames.length).toBeGreaterThan(0);

    // Replay first 50 frames in chunks of 10 (mimics the wire chunking).
    for (let i = 0; i < 5; i++) {
      const chunk = Buffer.concat(frames.slice(i * 10, (i + 1) * 10));
      await processIngest({ deviceId: "d1", hex: chunk.toString("hex") });
    }

    expect(mocks.publishBroadcast).toHaveBeenCalled();
    const calls = mocks.publishBroadcast.mock.calls as Array<
      [string, { phase: string; scoreboard: unknown }]
    >;
    const phases = calls.map((c) => c[1].phase);
    expect(phases).toContain("live");
    // The last published payload must carry a non-null scoreboard.
    const last = calls[calls.length - 1]![1];
    expect(last.scoreboard).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @dragons/api test -- replay-fixture.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/broadcast/replay-fixture.test.ts
git commit -m "broadcast: add end-to-end fixture-replay pipeline test"
```

---

## Final Steps

After all 17 tasks are complete:

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: PASS. Total test count should grow by ~25 from baseline.

- [ ] **Run typecheck across the monorepo**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Run i18n check**

```bash
pnpm check:i18n
```

Expected: PASS — both locales contain the same `broadcast.*` keys.

- [ ] **Manual end-to-end smoke**

1. Apply the migration: `pnpm --filter @dragons/db drizzle-kit migrate`.
2. Start dev: `pnpm dev`.
3. Visit `/de/admin/broadcast`. Pick today's own-club match. Set abbrs.
4. Start the Pi replay (`apps/pi/scripts/replay-fixture.mjs`).
5. Click **Go Live**. Confirm preview iframe shows the pre-game card.
6. As the fixture replay advances past tip-off (period flips to 1 with clock running), confirm the overlay swaps to the score bug.
7. Open `/de/overlay` in a separate browser window — confirm identical render.
8. Click **End Broadcast**. Confirm overlay goes blank.
