# Game Rescheduling Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an AI chat copilot that suggests alternative dates/times/venues for a game that must move — the AI reasons over synced club data from natural-language rules, with one deterministic `verify_slot` tool flooring physical correctness, suggest-only against the read-only federation.

**Architecture:** A provider-neutral **shared tool registry** (read tools + `verify_slot`) wraps existing services in `apps/api`. Two adapters consume it: the Vercel AI SDK (in-app chat, Gemini) and an MCP server (external hosts). The registry is built and tested first (Phases 0–1), then the in-app chat (Phases 2–3 — the user's primary ask), then the MCP adapter (Phase 4).

**Tech Stack:** Hono + Drizzle + Zod + Vitest/PGlite (`apps/api`); Vercel AI SDK v5 (`ai`, `@ai-sdk/google`); MCP (`@modelcontextprotocol/sdk`); Next 16 / React 19 + `@ai-sdk/react` v2 (`apps/web`). Default model `gemini-2.5-flash`, swappable via `ASSISTANT_MODEL`.

Design spec: `docs/superpowers/specs/2026-06-08-game-rescheduling-copilot-design.md`.

---

## Conventions every task must follow (from the codebase)

- **ESM, extensionless imports.** `import { env } from "../config/env"`. `import type { X }` for type-only (verbatimModuleSyntax is on).
- **Times are strings.** `matches.kickoffDate` = `"YYYY-MM-DD"`, `matches.kickoffTime`/booking windows = `"HH:MM:SS"`. Never call `Date` methods on them. `calculateTimeWindow` returns `"HH:MM:SS"` strings.
- **ID asymmetry.** `matches.id`/`leagues.id`/`venues.id`/`teams.id` are internal serial PKs. `matches.homeTeamApiId`/`guestTeamApiId` reference `teams.apiTeamPermanentId` (external). `matches.leagueId`→`leagues.id`, `matches.venueId`→`venues.id` (internal, nullable). `leagues` external id is `apiLigaId` (not `apiId`).
- **Config singletons** use the lazy-Proxy pattern (mirror `config/redis.ts`).
- **Env vars** go in `apps/api/src/config/env.ts` `envSchema.object()` (before `.superRefine`), then root `.env.example`, then `CLAUDE.md`, then `apps/api/vitest.setup.ts` if non-optional.
- **Routes:** `new Hono<AppEnv>()`; per-handler order is `requirePermission(...)` → `describeRoute({...})` → `async (c) => {...}`. Register in `apps/api/src/routes/index.ts`. `/admin/*` is auto-authed in `app.ts`.
- **Tests:** co-located `*.test.ts`. DB tests use the PGlite harness (`src/test/setup-test-db.ts`) with the hoisted-`dbHolder` Proxy mock of `config/database`. Route tests use `app.request(...)` (never `serve()`). Import order: vitest → framework → `vi.hoisted` → `vi.mock` → SUT imports. Coverage gates: **90 branches / 95 functions / lines / statements** — cover every error/empty branch.
- **No new DB tables in v1** → `setup-test-db.ts` TRUNCATE list is unchanged.
- **No AI-slop phrases in any `.md`** — CI runs `pnpm check:ai-slop`; avoid every phrase in the CLAUDE.md banned-phrase list (or add an inline `ai-slop-ignore-line` comment where genuinely needed).

---

# Phase 0 — Dependencies & config

### Task 1: Add API dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install the runtime deps**

Run from repo root:
```bash
pnpm --filter @dragons/api add ai @ai-sdk/google @modelcontextprotocol/sdk
```
Expected: `package.json` gains `ai`, `@ai-sdk/google`, `@modelcontextprotocol/sdk` under `dependencies`; lockfile updates.

- [ ] **Step 2: Verify install + AI SDK v5 surface**

Run:
```bash
pnpm --filter @dragons/api exec node -e "const ai=require('ai'); console.log(typeof ai.streamText, typeof ai.tool, typeof ai.stepCountIs, typeof ai.convertToModelMessages)"
```
Expected: `function function function function`. If any is `undefined`, the installed `ai` is not v5 — check the version and consult the AI SDK docs before proceeding (v5 renamed tool `parameters`→`inputSchema` and added `convertToModelMessages`/`stepCountIs`).

- [ ] **Step 3: Commit**
```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add ai sdk, google provider, mcp sdk deps"
```

---

### Task 2: Add env vars

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/vitest.setup.ts`
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Test: `apps/api/src/config/env.test.ts` (create if absent; else add cases)

- [ ] **Step 1: Write the failing test**

Create/append `apps/api/src/config/env.test.ts`:
```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("assistant env vars", () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => { process.env = { ...ORIGINAL }; });
  afterEach(() => { process.env = { ...ORIGINAL }; });

  it("defaults ASSISTANT_ENABLED to false and ASSISTANT_MODEL to gemini-2.5-flash", async () => {
    delete process.env.ASSISTANT_ENABLED;
    delete process.env.ASSISTANT_MODEL;
    const { envSchema } = await import("./env");
    const parsed = envSchema.parse(process.env);
    expect(parsed.ASSISTANT_ENABLED).toBe(false);
    expect(parsed.ASSISTANT_MODEL).toBe("gemini-2.5-flash");
  });

  it("requires GOOGLE_GENERATIVE_AI_API_KEY when ASSISTANT_ENABLED=true", async () => {
    process.env.ASSISTANT_ENABLED = "true";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const { envSchema } = await import("./env");
    expect(() => envSchema.parse(process.env)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/api test src/config/env.test`
Expected: FAIL — `ASSISTANT_ENABLED`/`ASSISTANT_MODEL` undefined, or `envSchema` not exporting the new keys.

- [ ] **Step 3: Add the keys to `envSchema`**

In `apps/api/src/config/env.ts`, add these keys inside the `.object({...})` (before `.superRefine`):
```ts
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    ASSISTANT_ENABLED: z
      .union([z.boolean(), z.string()])
      .default(false)
      .transform((v) => v === true || v === "true"),
    ASSISTANT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    MCP_TOKEN: z.string().min(32).optional(),
```
Then add a check inside the existing `.superRefine((env, ctx) => { ... })` body:
```ts
    if (env.ASSISTANT_ENABLED && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
        message: "GOOGLE_GENERATIVE_AI_API_KEY is required when ASSISTANT_ENABLED=true",
      });
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test src/config/env.test`
Expected: PASS.

- [ ] **Step 5: Seed test env + docs**

In `apps/api/vitest.setup.ts` add (so other test files that import `config/env` don't break — all new keys are optional/defaulted, so this is belt-and-suspenders for ASSISTANT_ENABLED-on test files):
```ts
process.env.ASSISTANT_ENABLED = process.env.ASSISTANT_ENABLED ?? "false";
```

In `.env.example`, under a new `# AI assistant (game rescheduling copilot)` heading:
```
ASSISTANT_ENABLED=false
ASSISTANT_MODEL=gemini-2.5-flash
GOOGLE_GENERATIVE_AI_API_KEY=<google ai studio key; required when ASSISTANT_ENABLED=true>
MCP_TOKEN=<random string min 32 chars; bearer token for the /mcp endpoint>
```

In `CLAUDE.md`, under "Optional with defaults", add the same four lines with one-line descriptions, matching the existing style.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/vitest.setup.ts .env.example CLAUDE.md
git commit -m "feat(api): add assistant env vars (gemini, mcp token, enable flag)"
```

---

### Task 3: AI provider singleton (`config/ai.ts`)

**Files:**
- Create: `apps/api/src/config/ai.ts`
- Test: `apps/api/src/config/ai.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/config/ai.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ createGoogleGenerativeAI: vi.fn() }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: mocks.createGoogleGenerativeAI }));
vi.mock("../config/env", () => ({
  env: { GOOGLE_GENERATIVE_AI_API_KEY: "test-key", ASSISTANT_MODEL: "gemini-2.5-flash" },
}));

// --- Imports (after mocks) ---
import { assistantModel } from "./ai";

describe("assistantModel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the google provider with the configured key and returns the configured model", () => {
    const modelFactory = vi.fn().mockReturnValue({ id: "gemini-2.5-flash" });
    mocks.createGoogleGenerativeAI.mockReturnValue(modelFactory);
    const model = assistantModel();
    expect(mocks.createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(modelFactory).toHaveBeenCalledWith("gemini-2.5-flash");
    expect(model).toEqual({ id: "gemini-2.5-flash" });
  });
});
```
Note the mock path is `../config/env` because `ai.test.ts` sits in `config/` and the mock target must match the import specifier used by `ai.ts` (`./env`). Adjust to `./env` to match — see Step 3.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/api test src/config/ai.test`
Expected: FAIL — `Cannot find module './ai'`.

- [ ] **Step 3: Implement `config/ai.ts`**

```ts
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { env } from "./env";

let _provider: ReturnType<typeof createGoogleGenerativeAI> | undefined;

function provider() {
  if (!_provider) {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    }
    _provider = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  }
  return _provider;
}

export function assistantModel(): LanguageModel {
  return provider()(env.ASSISTANT_MODEL);
}
```
In the test, change `vi.mock("../config/env", ...)` to `vi.mock("./env", ...)` so it matches the `./env` import above.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test src/config/ai.test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/config/ai.ts apps/api/src/config/ai.test.ts
git commit -m "feat(api): add gemini provider singleton (config/ai)"
```

---

# Phase 1 — Shared tool registry, verify_slot & read tools (provider-neutral)

### Task 4: Reschedule domain types (Zod)

**Files:**
- Create: `apps/api/src/services/reschedule/reschedule.types.ts`
- Test: `apps/api/src/services/reschedule/reschedule.types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { verifySlotInputSchema } from "./reschedule.types";

describe("verifySlotInputSchema", () => {
  it("accepts a well-formed slot and normalizes HH:MM time to HH:MM:SS", () => {
    const parsed = verifySlotInputSchema.parse({ matchId: 1, date: "2026-02-14", time: "18:00", venueId: 3 });
    expect(parsed.time).toBe("18:00:00");
  });
  it("rejects a malformed date", () => {
    expect(() => verifySlotInputSchema.parse({ matchId: 1, date: "14.02.2026", time: "18:00", venueId: 3 })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test reschedule.types`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the types**

```ts
import { z } from "zod";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const TIME = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "time must be HH:MM or HH:MM:SS")
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

export const verifySlotInputSchema = z.object({
  matchId: z.number().int().positive(),
  date: DATE,
  time: TIME,
  venueId: z.number().int().positive(),
});
export type VerifySlotInput = z.infer<typeof verifySlotInputSchema>;

export type ConflictType =
  | "venue-busy"
  | "team-double-book"
  | "outside-round-window"
  | "round-window-unknown"
  | "match-not-found"
  | "venue-not-found";

export interface SlotConflict {
  type: ConflictType;
  detail: string;
  severity: "blocking" | "warning";
}

export interface VerifySlotResult {
  ok: boolean; // true when there is no blocking conflict
  conflicts: SlotConflict[];
}

// Read-tool input schemas
export const dateRangeSchema = z.object({ from: DATE, to: DATE });
export const listVenueBookingsSchema = z.object({
  from: DATE,
  to: DATE,
  venueId: z.number().int().positive().optional(),
});
export const matchIdSchema = z.object({ matchId: z.number().int().positive() });
export const roundWindowSchema = z.object({
  leagueId: z.number().int().positive(),
  matchDay: z.number().int().nonnegative(),
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/api test reschedule.types`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/services/reschedule/reschedule.types.ts apps/api/src/services/reschedule/reschedule.types.test.ts
git commit -m "feat(api): reschedule domain zod types"
```

---

### Task 5: `verify_slot` service (the correctness floor)

**Files:**
- Create: `apps/api/src/services/reschedule/verify-slot.service.ts`
- Test: `apps/api/src/services/reschedule/verify-slot.service.test.ts`

This is the load-bearing task. It reuses `calculateTimeWindow` + `getBookingConfig` and adds an interval-overlap check (the codebase has none — existing booking code compares windows by exact string equality because distinct `(venueId,date)` groups never overlap by construction; a *proposed* slot can overlap an existing booking, so we need real overlap).

- [ ] **Step 1: Write the failing tests (DB-backed, PGlite)**

```ts
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  db: new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

// --- Imports (after mocks) ---
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
import { matches, teams, venues, leagues, venueBookings, venueBookingMatches } from "@dragons/db/schema";
import { verifySlot } from "./verify-slot.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });
afterAll(async () => { await closeTestDb(ctx); });

async function seedOwnTeam(apiId: number, name = `T${apiId}`) {
  await ctx.db.insert(teams).values({
    apiTeamPermanentId: apiId, seasonTeamId: apiId, teamCompetitionId: apiId,
    name, clubId: 1, isOwnClub: true,
  });
}
async function seedVenue(id: number) {
  await ctx.db.insert(venues).values({ id, apiId: 1000 + id, name: `Hall ${id}` });
}
async function seedLeague(id: number) {
  await ctx.db.insert(leagues).values({
    id, apiLigaId: 9000 + id, ligaNr: id, name: `L${id}`, seasonId: 1, seasonName: "25/26",
  });
}
async function seedMatch(o: {
  id: number; apiMatchId: number; home: number; guest: number;
  date: string; time: string; venueId: number | null; leagueId: number | null; matchDay: number;
}) {
  await ctx.db.insert(matches).values({
    id: o.id, apiMatchId: o.apiMatchId, matchNo: o.id, matchDay: o.matchDay,
    kickoffDate: o.date, kickoffTime: o.time, homeTeamApiId: o.home, guestTeamApiId: o.guest,
    venueId: o.venueId, leagueId: o.leagueId,
  });
}

describe("verifySlot", () => {
  it("returns ok with no conflicts for a free venue/date inside the round window", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    // round window: two other matches in league 1, matchDay 5
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-20", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });

    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(true);
    expect(res.conflicts).toEqual([]);
  });

  it("flags venue-busy when the proposed window overlaps an existing booking", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    // a booking for ANOTHER match at venue 1 on the target date, 17:00-19:30
    const [b] = await ctx.db.insert(venueBookings).values({
      venueId: 1, date: "2026-02-16", calculatedStartTime: "17:00:00", calculatedEndTime: "19:30:00", status: "confirmed",
    }).returning();
    await ctx.db.insert(venueBookingMatches).values({ venueBookingId: b!.id, matchId: 2 });

    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("venue-busy");
  });

  it("ignores a booking that belongs to the match being moved", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const [b] = await ctx.db.insert(venueBookings).values({
      venueId: 1, date: "2026-02-16", calculatedStartTime: "17:00:00", calculatedEndTime: "19:30:00", status: "confirmed",
    }).returning();
    await ctx.db.insert(venueBookingMatches).values({ venueBookingId: b!.id, matchId: 1 }); // same match

    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.conflicts.map((c) => c.type)).not.toContain("venue-busy");
  });

  it("flags team-double-book when one of the teams already plays that day", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedOwnTeam(300); await seedVenue(1); await seedVenue(2); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    // team 100 also plays match 2 on the target date at another venue
    await seedMatch({ id: 2, apiMatchId: 12, home: 300, guest: 100, date: "2026-02-16", time: "12:00:00", venueId: 2, leagueId: 1, matchDay: 5 });

    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("team-double-book");
  });

  it("flags outside-round-window as blocking when the date is past the matchday range", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-16", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const res = await verifySlot({ matchId: 1, date: "2026-03-30", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("outside-round-window");
  });

  it("returns a non-blocking round-window-unknown warning when the match has no league", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: null, matchDay: 5 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(true);
    expect(res.conflicts.map((c) => c.type)).toContain("round-window-unknown");
  });

  it("returns match-not-found (blocking) for an unknown matchId", async () => {
    const res = await verifySlot({ matchId: 999, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("match-not-found");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test verify-slot.service`
Expected: FAIL — `verify-slot.service` missing.

- [ ] **Step 3: Implement `verify-slot.service.ts`**

```ts
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "../../config/database";
import { matches, teams, venues, venueBookings, venueBookingMatches } from "@dragons/db/schema";
import { calculateTimeWindow } from "../venue-booking/booking-calculator";
import { getBookingConfig } from "../venue-booking/venue-booking.service";
import type { SlotConflict, VerifySlotInput, VerifySlotResult } from "./reschedule.types";

/** Two "HH:MM:SS" windows overlap iff startA < endB && startB < endA. Fixed-width
 *  zero-padded strings compare lexicographically the same as their clock order. */
function windowsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function verifySlot(input: VerifySlotInput): Promise<VerifySlotResult> {
  const conflicts: SlotConflict[] = [];

  const [match] = await db
    .select({
      id: matches.id,
      homeTeamApiId: matches.homeTeamApiId,
      guestTeamApiId: matches.guestTeamApiId,
      leagueId: matches.leagueId,
      matchDay: matches.matchDay,
    })
    .from(matches)
    .where(eq(matches.id, input.matchId))
    .limit(1);

  if (!match) {
    return { ok: false, conflicts: [{ type: "match-not-found", detail: `No match with id ${input.matchId}`, severity: "blocking" }] };
  }

  const [venue] = await db.select({ id: venues.id }).from(venues).where(eq(venues.id, input.venueId)).limit(1);
  if (!venue) {
    conflicts.push({ type: "venue-not-found", detail: `No venue with id ${input.venueId}`, severity: "blocking" });
  }

  // --- 1. Venue free (interval overlap against existing bookings, excluding this match) ---
  if (venue) {
    const config = await getBookingConfig();
    // Window size uses the home team's estimated duration (null => config default).
    const [homeTeam] = await db
      .select({ duration: teams.estimatedGameDuration })
      .from(teams)
      .where(eq(teams.apiTeamPermanentId, match.homeTeamApiId))
      .limit(1);
    const proposed = calculateTimeWindow(
      [{ kickoffTime: input.time, teamGameDuration: homeTeam?.duration ?? null }],
      config,
    );
    if (proposed) {
      const bookingsThatDay = await db
        .select({
          id: venueBookings.id,
          calcStart: venueBookings.calculatedStartTime,
          calcEnd: venueBookings.calculatedEndTime,
          ovrStart: venueBookings.overrideStartTime,
          ovrEnd: venueBookings.overrideEndTime,
        })
        .from(venueBookings)
        .where(and(eq(venueBookings.venueId, input.venueId), eq(venueBookings.date, input.date)));

      for (const b of bookingsThatDay) {
        const linked = await db
          .select({ matchId: venueBookingMatches.matchId })
          .from(venueBookingMatches)
          .where(eq(venueBookingMatches.venueBookingId, b.id));
        const onlyThisMatch = linked.length > 0 && linked.every((l) => l.matchId === input.matchId);
        if (onlyThisMatch) continue; // the match being moved — not a conflict

        const bStart = b.ovrStart ?? b.calcStart;
        const bEnd = b.ovrEnd ?? b.calcEnd;
        if (bStart && bEnd && windowsOverlap(proposed.calculatedStartTime, proposed.calculatedEndTime, bStart, bEnd)) {
          conflicts.push({
            type: "venue-busy",
            detail: `Venue already booked ${bStart}-${bEnd} on ${input.date}; proposed ${proposed.calculatedStartTime}-${proposed.calculatedEndTime}`,
            severity: "blocking",
          });
          break;
        }
      }
    }
  }

  // --- 2. No own-team double-book that day ---
  const teamApiIds = [match.homeTeamApiId, match.guestTeamApiId];
  const sameDay = await db
    .select({ id: matches.id, isCancelled: matches.isCancelled, isForfeited: matches.isForfeited })
    .from(matches)
    .where(
      and(
        eq(matches.kickoffDate, input.date),
        ne(matches.id, input.matchId),
        or(inArray(matches.homeTeamApiId, teamApiIds), inArray(matches.guestTeamApiId, teamApiIds)),
      ),
    );
  const activeClash = sameDay.find((m) => m.isCancelled !== true && m.isForfeited !== true);
  if (activeClash) {
    conflicts.push({
      type: "team-double-book",
      detail: `One of the teams already has match ${activeClash.id} on ${input.date}`,
      severity: "blocking",
    });
  }

  // --- 3. Inside the round/matchday window (derived from locally-synced matches) ---
  if (match.leagueId == null) {
    conflicts.push({ type: "round-window-unknown", detail: "Match has no league; round window cannot be derived", severity: "warning" });
  } else {
    const roundMatches = await db
      .select({ date: matches.kickoffDate })
      .from(matches)
      .where(and(eq(matches.leagueId, match.leagueId), eq(matches.matchDay, match.matchDay)));
    const dates = roundMatches.map((r) => r.date).filter((d): d is string => !!d);
    if (dates.length === 0) {
      conflicts.push({ type: "round-window-unknown", detail: "No synced matches for this league + matchday", severity: "warning" });
    } else {
      const min = dates.reduce((a, b) => (a < b ? a : b));
      const max = dates.reduce((a, b) => (a > b ? a : b));
      if (input.date < min || input.date > max) {
        conflicts.push({
          type: "outside-round-window",
          detail: `Date ${input.date} is outside the matchday window ${min}..${max}`,
          severity: "blocking",
        });
      }
    }
  }

  return { ok: conflicts.every((c) => c.severity !== "blocking"), conflicts };
}
```

> **If a column name differs** (e.g. `venueBookings.overrideStartTime`), check `packages/db/src/schema/venue-bookings.ts` — the recon noted these columns exist (`calculatedStartTime/EndTime`, `overrideStartTime/EndTime`, `status`, `needsReconfirmation`). Confirm exact casing before running.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test verify-slot.service`
Expected: PASS (7 tests). If "column does not exist", a schema field name is off — grep the schema file and fix the select.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/services/reschedule/verify-slot.service.ts apps/api/src/services/reschedule/verify-slot.service.test.ts
git commit -m "feat(api): verify_slot deterministic correctness floor"
```

---

### Task 6: Read helpers (`reschedule-context.service.ts`)

**Files:**
- Create: `apps/api/src/services/reschedule/reschedule-context.service.ts`
- Test: `apps/api/src/services/reschedule/reschedule-context.service.test.ts`

Six read functions the AI calls. Each is a thin, compact projection over existing data.

- [ ] **Step 1: Write the failing tests (PGlite)**

Use the same harness header as Task 5 (hoisted `dbHolder`, `vi.mock("../../config/database")`, `setupTestDb`/`resetTestDb`/`closeTestDb`, the same `seed*` helpers). Then:
```ts
import {
  getMatchForReschedule, listClubMatches, listVenueBookings,
  listClubVenues, getRoundWindow, getRefereeContext,
} from "./reschedule-context.service";

describe("reschedule-context", () => {
  it("getMatchForReschedule returns a compact match or null", async () => {
    await seedOwnTeam(100, "Dragons"); await seedOwnTeam(200, "Lions"); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const m = await getMatchForReschedule(1);
    expect(m).toMatchObject({ matchId: 1, apiMatchId: 11, homeTeamName: "Dragons", guestTeamName: "Lions", venueId: 1, matchDay: 5 });
    expect(await getMatchForReschedule(999)).toBeNull();
  });

  it("listClubMatches returns own-club matches in the date range", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 100, guest: 200, date: "2026-03-20", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 6 });
    const rows = await listClubMatches({ from: "2026-02-01", to: "2026-02-28" });
    expect(rows.map((r) => r.matchId)).toEqual([1]);
  });

  it("listVenueBookings filters by range and venue", async () => {
    await seedVenue(1);
    await ctx.db.insert(venueBookings).values({ venueId: 1, date: "2026-02-16", calculatedStartTime: "17:00:00", calculatedEndTime: "19:00:00", status: "confirmed" });
    const rows = await listVenueBookings({ from: "2026-02-01", to: "2026-02-28", venueId: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ venueId: 1, date: "2026-02-16", status: "confirmed" });
  });

  it("listClubVenues lists venues", async () => {
    await seedVenue(1); await seedVenue(2);
    const v = await listClubVenues();
    expect(v.map((x) => x.venueId).sort()).toEqual([1, 2]);
  });

  it("getRoundWindow returns min/max for a league+matchDay, or null when none", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: null, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-21", time: "18:00:00", venueId: null, leagueId: 1, matchDay: 5 });
    expect(await getRoundWindow({ leagueId: 1, matchDay: 5 })).toEqual({ from: "2026-02-14", to: "2026-02-21" });
    expect(await getRoundWindow({ leagueId: 1, matchDay: 99 })).toBeNull();
  });

  it("getRefereeContext returns current SRs or an empty note when no referee-game row", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const r = await getRefereeContext(1);
    expect(r.slots).toEqual([]); // no referee_games row seeded
    expect(r.note).toContain("availability");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test reschedule-context`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `reschedule-context.service.ts`**

```ts
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../config/database";
import { matches, venues, venueBookings } from "@dragons/db/schema";
import { queryMatchWithJoins } from "../admin/match-query.service";
import { getOwnClubMatches } from "../admin/match-admin.service";
import { getVisibleRefereeGameByMatchId } from "../referee/referee-game-visibility.service";
import type { z } from "zod";
import type { dateRangeSchema, listVenueBookingsSchema, roundWindowSchema } from "./reschedule.types";

export interface RescheduleMatch {
  matchId: number; apiMatchId: number; matchDay: number; leagueId: number | null; leagueName: string | null;
  date: string; time: string;
  homeTeamApiId: number; homeTeamName: string; guestTeamApiId: number; guestTeamName: string;
  venueId: number | null; venueName: string | null; isCancelled: boolean; isForfeited: boolean;
}

export async function getMatchForReschedule(matchId: number): Promise<RescheduleMatch | null> {
  const [row] = await queryMatchWithJoins().where(eq(matches.id, matchId)).limit(1);
  if (!row) return null;
  return {
    matchId: row.id, apiMatchId: row.apiMatchId, matchDay: row.matchDay,
    leagueId: row.leagueId, leagueName: row.leagueName,
    date: row.kickoffDate, time: row.kickoffTime,
    homeTeamApiId: row.homeTeamApiId, homeTeamName: row.homeTeamName,
    guestTeamApiId: row.guestTeamApiId, guestTeamName: row.guestTeamName,
    venueId: row.venueId, venueName: row.venueName,
    isCancelled: row.isCancelled ?? false, isForfeited: row.isForfeited ?? false,
  };
}

export async function listClubMatches(range: z.infer<typeof dateRangeSchema>) {
  const { items } = await getOwnClubMatches({
    limit: 200, offset: 0, dateFrom: range.from, dateTo: range.to, excludeInactive: true, sort: "asc",
  });
  return items.map((m) => ({
    matchId: m.id, apiMatchId: m.apiMatchId, date: m.kickoffDate, time: m.kickoffTime,
    homeTeamName: m.homeTeamName, guestTeamName: m.guestTeamName, venueId: m.venueId ?? null, venueName: m.venueName ?? null,
  }));
}

export async function listVenueBookings(params: z.infer<typeof listVenueBookingsSchema>) {
  const where = [gte(venueBookings.date, params.from), lte(venueBookings.date, params.to)];
  if (params.venueId != null) where.push(eq(venueBookings.venueId, params.venueId));
  const rows = await db
    .select({
      venueId: venueBookings.venueId, date: venueBookings.date,
      calculatedStartTime: venueBookings.calculatedStartTime, calculatedEndTime: venueBookings.calculatedEndTime,
      overrideStartTime: venueBookings.overrideStartTime, overrideEndTime: venueBookings.overrideEndTime,
      status: venueBookings.status, needsReconfirmation: venueBookings.needsReconfirmation,
    })
    .from(venueBookings)
    .where(and(...where))
    .orderBy(asc(venueBookings.date));
  return rows;
}

export async function listClubVenues() {
  const rows = await db.select({ venueId: venues.id, name: venues.name, city: venues.city }).from(venues).orderBy(asc(venues.name));
  return rows;
}

export async function getRoundWindow(params: z.infer<typeof roundWindowSchema>): Promise<{ from: string; to: string } | null> {
  const rows = await db
    .select({ date: matches.kickoffDate })
    .from(matches)
    .where(and(eq(matches.leagueId, params.leagueId), eq(matches.matchDay, params.matchDay)));
  const dates = rows.map((r) => r.date).filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  return { from: dates.reduce((a, b) => (a < b ? a : b)), to: dates.reduce((a, b) => (a > b ? a : b)) };
}

export interface RefereeContext {
  slots: Array<{ slot: 1 | 2; name: string | null; status: string; ourClub: boolean }>;
  note: string;
}

export async function getRefereeContext(matchId: number): Promise<RefereeContext> {
  const game = await getVisibleRefereeGameByMatchId(null, matchId); // admin view
  const note = "Referee availability for a NEW date is a heuristic; confirm after the portal move.";
  if (!game) return { slots: [], note };
  return {
    slots: [
      { slot: 1, name: game.sr1Name, status: game.sr1Status, ourClub: game.sr1OurClub },
      { slot: 2, name: game.sr2Name, status: game.sr2Status, ourClub: game.sr2OurClub },
    ],
    note,
  };
}
```

> **Check before running:** confirm `getOwnClubMatches` list items expose `venueId`/`venueName` (the recon's `MatchListItem` via `rowToListItem` includes venue fields). If `venueName` is absent on the list item, drop it from the `listClubMatches` projection (it's not load-bearing).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test reschedule-context`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/services/reschedule/reschedule-context.service.ts apps/api/src/services/reschedule/reschedule-context.service.test.ts
git commit -m "feat(api): reschedule read helpers (match/matches/bookings/venues/round-window/referees)"
```

---

### Task 7: Provider-neutral tool registry

**Files:**
- Create: `apps/api/src/ai/tool-registry.ts`
- Test: `apps/api/src/ai/tool-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({
  getMatchForReschedule: vi.fn(), listClubMatches: vi.fn(), listVenueBookings: vi.fn(),
  listClubVenues: vi.fn(), getRoundWindow: vi.fn(), getRefereeContext: vi.fn(), verifySlot: vi.fn(),
}));
vi.mock("../services/reschedule/reschedule-context.service", () => ({
  getMatchForReschedule: ctx.getMatchForReschedule, listClubMatches: ctx.listClubMatches,
  listVenueBookings: ctx.listVenueBookings, listClubVenues: ctx.listClubVenues,
  getRoundWindow: ctx.getRoundWindow, getRefereeContext: ctx.getRefereeContext,
}));
vi.mock("../services/reschedule/verify-slot.service", () => ({ verifySlot: ctx.verifySlot }));

// --- Imports (after mocks) ---
import { reschedTools } from "./tool-registry";

describe("reschedTools", () => {
  it("exposes exactly the v1 read tools plus verify_slot, all read-only", () => {
    expect(reschedTools.map((t) => t.name).sort()).toEqual(
      ["get_match", "get_referee_context", "get_round_window", "list_club_matches", "list_club_venues", "list_venue_bookings", "verify_slot"].sort(),
    );
  });

  it("verify_slot.execute delegates to verifySlot with validated input", async () => {
    ctx.verifySlot.mockResolvedValue({ ok: true, conflicts: [] });
    const tool = reschedTools.find((t) => t.name === "verify_slot")!;
    const out = await tool.execute({ matchId: 1, date: "2026-02-16", time: "18:00", venueId: 1 });
    expect(ctx.verifySlot).toHaveBeenCalledWith({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(out).toEqual({ ok: true, conflicts: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test tool-registry`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `tool-registry.ts`**

```ts
import { z } from "zod";
import {
  getMatchForReschedule, listClubMatches, listVenueBookings,
  listClubVenues, getRoundWindow, getRefereeContext,
} from "../services/reschedule/reschedule-context.service";
import { verifySlot } from "../services/reschedule/verify-slot.service";
import {
  verifySlotInputSchema, dateRangeSchema, listVenueBookingsSchema, matchIdSchema, roundWindowSchema,
} from "../services/reschedule/reschedule.types";

/** A tool defined once and consumed by both the AI SDK adapter and the MCP adapter.
 *  inputSchema is a z.object so the AI SDK gets the object and MCP gets `.shape`. */
export interface ReschedTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<unknown>;
}

function tool<S extends z.ZodObject<z.ZodRawShape>>(
  name: string, description: string, inputSchema: S, run: (i: z.infer<S>) => Promise<unknown>,
): ReschedTool {
  return { name, description, inputSchema, execute: (raw) => run(inputSchema.parse(raw)) };
}

export const reschedTools: ReschedTool[] = [
  tool("get_match", "Load the game being rescheduled: teams, current date/time/venue, league and matchday.", matchIdSchema,
    (i) => getMatchForReschedule(i.matchId)),
  tool("list_club_matches", "List own-club games (active only) between two dates (YYYY-MM-DD) to spot clashes.", dateRangeSchema,
    (i) => listClubMatches(i)),
  tool("list_venue_bookings", "List hall bookings between two dates, optionally for one venue, with their time windows and status.", listVenueBookingsSchema,
    (i) => listVenueBookings(i)),
  tool("list_club_venues", "List the club's venues (halls) the game could be moved to.", z.object({}),
    () => listClubVenues()),
  tool("get_round_window", "The allowed date range (min/max kickoff) for a league + matchday, from synced matches; the federation will reject dates outside it.", roundWindowSchema,
    (i) => getRoundWindow(i)),
  tool("get_referee_context", "Current referees assigned to a game and a caveat that availability for a new date must be confirmed after the portal move.", matchIdSchema,
    (i) => getRefereeContext(i.matchId)),
  tool("verify_slot", "Deterministically check a proposed (date, time, venue) for physical conflicts: venue busy, team double-booked, outside the round window. Returns { ok, conflicts }. ALWAYS call this before presenting a slot; never present a slot whose result is not ok.", verifySlotInputSchema,
    (i) => verifySlot(i)),
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dragons/api test tool-registry`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/ai/tool-registry.ts apps/api/src/ai/tool-registry.test.ts
git commit -m "feat(api): provider-neutral reschedule tool registry"
```

---

# Phase 2 — In-app AI chat (Gemini via AI SDK)

### Task 8: System prompt

**Files:**
- Create: `apps/api/src/ai/system-prompt.ts`
- Test: `apps/api/src/ai/system-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildRescheduleSystemPrompt } from "./system-prompt";

describe("buildRescheduleSystemPrompt", () => {
  it("encodes the three disciplines and seeds the match when provided", () => {
    const p = buildRescheduleSystemPrompt({ matchId: 1, apiMatchId: 11, homeTeamName: "Dragons", guestTeamName: "Lions", date: "2026-02-14", time: "18:00:00", venueName: "Hall 1", matchDay: 5, leagueId: 1, leagueName: "L1", homeTeamApiId: 100, guestTeamApiId: 200, venueId: 1, isCancelled: false, isForfeited: false });
    expect(p).toMatch(/verify_slot/);
    expect(p).toMatch(/basketball-bund/i);
    expect(p).toMatch(/Dragons/);
  });
  it("works with no seeded match", () => {
    expect(buildRescheduleSystemPrompt(null)).toMatch(/verify_slot/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → `pnpm --filter @dragons/api test system-prompt` → FAIL.

- [ ] **Step 3: Implement `system-prompt.ts`**

```ts
import type { RescheduleMatch } from "../services/reschedule/reschedule-context.service";

export function buildRescheduleSystemPrompt(match: RescheduleMatch | null): string {
  const seed = match
    ? `\nThe game to reschedule:\n- #${match.apiMatchId} ${match.homeTeamName} vs ${match.guestTeamName}\n- currently ${match.date} ${match.time} at ${match.venueName ?? "unknown venue"}\n- league ${match.leagueName ?? "?"} (id ${match.leagueId ?? "?"}), matchday ${match.matchDay}\n- internal matchId ${match.matchId}, venueId ${match.venueId ?? "none"}\n`
    : "\nNo game seeded yet; ask the user which game to move.\n";

  return `You are a scheduling assistant for a German basketball club. You help an admin find alternative dates, times, and venues for a game that must move.
${seed}
How you work:
- Read the data with the tools (the game, other club games, venue bookings, venues, the round window, current referees). Apply the user's rules and preferences from their messages.
- You may propose a slot ONLY after calling verify_slot for it and getting ok:true. Never present a slot whose verify_slot result is not ok. Briefly state why each proposal is good.
- The federation (basketball-bund.net) is read-only here: you cannot move the game yourself. For the chosen slot, tell the admin to enter it on the basketball-bund.net portal; the next sync will pick it up.
- Referee availability for a NEW date is only a heuristic from local rules — say so, and that it must be confirmed after the portal move.
- Dates are YYYY-MM-DD, times are HH:MM. Be concise. Rank proposals best-first.`;
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/ai/system-prompt.ts apps/api/src/ai/system-prompt.test.ts
git commit -m "feat(api): reschedule system prompt (3 disciplines + match seed)"
```

---

### Task 9: Chat service (AI SDK adapter)

**Files:**
- Create: `apps/api/src/ai/chat.ts`
- Test: `apps/api/src/ai/chat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  streamText: vi.fn(), tool: vi.fn((d) => d), stepCountIs: vi.fn((n) => ({ stepCountIs: n })),
  convertToModelMessages: vi.fn((x) => x), assistantModel: vi.fn(() => ({ id: "gemini-2.5-flash" })),
  getMatchForReschedule: vi.fn(),
}));
vi.mock("ai", () => ({ streamText: m.streamText, tool: m.tool, stepCountIs: m.stepCountIs, convertToModelMessages: m.convertToModelMessages }));
vi.mock("../config/ai", () => ({ assistantModel: m.assistantModel }));
vi.mock("../services/reschedule/reschedule-context.service", async (orig) => ({
  ...(await orig<Record<string, unknown>>()), getMatchForReschedule: m.getMatchForReschedule,
}));

// --- Imports (after mocks) ---
import { streamRescheduleChat } from "./chat";

describe("streamRescheduleChat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wires the model, tools, system prompt, and a step cap, then returns a UI message stream Response", async () => {
    m.getMatchForReschedule.mockResolvedValue(null);
    const toResponse = vi.fn(() => new Response("ok"));
    m.streamText.mockReturnValue({ toUIMessageStreamResponse: toResponse });

    const res = await streamRescheduleChat([{ role: "user", parts: [{ type: "text", text: "move game" }] }], undefined);

    expect(m.assistantModel).toHaveBeenCalled();
    const args = m.streamText.mock.calls[0]![0];
    expect(Object.keys(args.tools)).toContain("verify_slot");
    expect(args.system).toMatch(/verify_slot/);
    expect(args.stopWhen).toEqual({ stepCountIs: 8 });
    expect(res).toBeInstanceOf(Response);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → `pnpm --filter @dragons/api test src/ai/chat.test` → FAIL.

- [ ] **Step 3: Implement `chat.ts`**

```ts
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { assistantModel } from "../config/ai";
import { reschedTools } from "./tool-registry";
import { buildRescheduleSystemPrompt } from "./system-prompt";
import { getMatchForReschedule } from "../services/reschedule/reschedule-context.service";

function toAiSdkTools() {
  return Object.fromEntries(
    reschedTools.map((t) => [
      t.name,
      tool({ description: t.description, inputSchema: t.inputSchema, execute: (args: unknown) => t.execute(args) }),
    ]),
  );
}

export async function streamRescheduleChat(messages: UIMessage[], matchId: number | undefined): Promise<Response> {
  const match = matchId != null ? await getMatchForReschedule(matchId) : null;
  const result = streamText({
    model: assistantModel(),
    system: buildRescheduleSystemPrompt(match),
    messages: convertToModelMessages(messages),
    tools: toAiSdkTools(),
    stopWhen: stepCountIs(8),
  });
  return result.toUIMessageStreamResponse();
}
```

> **Verify against the installed AI SDK v5 surface:** `streamText` accepts `tools`/`stopWhen`; tools use `inputSchema`; `convertToModelMessages` + `toUIMessageStreamResponse` are the v5 UI-message bridge. If a name differs in the installed version, the Task 1 Step 2 probe and the AI SDK docs are the source of truth — adjust imports, do not guess.

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/ai/chat.ts apps/api/src/ai/chat.test.ts
git commit -m "feat(api): reschedule chat service (gemini via ai sdk, registry-as-tools)"
```

---

### Task 10: Chat route

**Files:**
- Create: `apps/api/src/routes/admin/assistant.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Test: `apps/api/src/routes/admin/assistant.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ streamRescheduleChat: vi.fn(), enabled: true }));
vi.mock("../../middleware/rbac", () => ({ requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()) }));
vi.mock("../../config/logger", () => ({ logger: { error: vi.fn(), child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) } }));
vi.mock("../../config/env", () => ({ env: { get ASSISTANT_ENABLED() { return mocks.enabled; } } }));
vi.mock("../../ai/chat", () => ({ streamRescheduleChat: mocks.streamRescheduleChat }));

// --- Imports (after mocks) ---
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error";
import { assistantRoutes } from "./assistant.routes";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/admin", assistantRoutes);
  return app;
}

describe("POST /admin/assistant/reschedule/chat", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; });

  it("returns 503 when the assistant is disabled", async () => {
    mocks.enabled = false;
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "ASSISTANT_DISABLED" });
  });

  it("delegates to streamRescheduleChat and returns its Response", async () => {
    mocks.streamRescheduleChat.mockResolvedValue(new Response("stream", { headers: { "x-test": "1" } }));
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", parts: [] }], matchId: 7 }),
    });
    expect(res.headers.get("x-test")).toBe("1");
    expect(mocks.streamRescheduleChat).toHaveBeenCalledWith([{ role: "user", parts: [] }], 7);
    res.body?.cancel();
  });
});
```

- [ ] **Step 2: Run to verify it fails** → `pnpm --filter @dragons/api test assistant.routes` → FAIL.

- [ ] **Step 3: Implement the route**

`apps/api/src/routes/admin/assistant.routes.ts`:
```ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { AppEnv } from "../../types";
import { requirePermission } from "../../middleware/rbac";
import { env } from "../../config/env";
import { streamRescheduleChat } from "../../ai/chat";

const bodySchema = z.object({
  messages: z.array(z.unknown()),
  matchId: z.number().int().positive().optional(),
});

const assistantRoutes = new Hono<AppEnv>();

assistantRoutes.post(
  "/assistant/reschedule/chat",
  requirePermission("match", "update"),
  describeRoute({
    description: "Stream the rescheduling copilot chat (AI SDK UI message stream).",
    tags: ["assistant"],
    responses: { 200: { description: "UI message stream" }, 503: { description: "Assistant disabled" } },
  }),
  async (c) => {
    if (!env.ASSISTANT_ENABLED) {
      return c.json({ error: "Assistant is disabled", code: "ASSISTANT_DISABLED" }, 503);
    }
    const body = bodySchema.parse(await c.req.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return streamRescheduleChat(body.messages as any, body.matchId);
  },
);

export { assistantRoutes };
```

In `apps/api/src/routes/index.ts`, import and mount under `/admin` (gets `requireAuth` from `app.ts`):
```ts
import { assistantRoutes } from "./admin/assistant.routes";
// ...
routes.route("/admin", assistantRoutes);
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Update AGENTS.md** — add to the "Admin" endpoint section:
```
| POST | `/admin/assistant/reschedule/chat` | Rescheduling copilot chat (AI SDK UI message stream). 503 when ASSISTANT_ENABLED=false. Permission: match:update |
```

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/routes/admin/assistant.routes.ts apps/api/src/routes/admin/assistant.routes.test.ts apps/api/src/routes/index.ts AGENTS.md
git commit -m "feat(api): /admin/assistant/reschedule/chat route"
```

- [ ] **Step 7: Backend gate — run the full API suite + coverage**

Run: `pnpm --filter @dragons/api test && pnpm --filter @dragons/api coverage`
Expected: all green; coverage ≥ 90 branches / 95 funcs/lines/statements. Add tests for any uncovered branch (e.g. the `verify_slot` `venue-not-found` path) before continuing.

---

# Phase 3 — Web chat panel

### Task 11: Add web dependencies

**Files:** Modify `apps/web/package.json`

- [ ] **Step 1: Install**
```bash
pnpm --filter @dragons/web add ai @ai-sdk/react
```
- [ ] **Step 2: Verify peer match** — confirm installed `@ai-sdk/react` is v2 (peers React 18||19). If pnpm reports a React peer warning, the v1 line was installed — pin v2 explicitly per the AI SDK docs.
- [ ] **Step 3: Commit**
```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add ai sdk + @ai-sdk/react for chat panel"
```

### Task 12: Reschedule chat Sheet + entry point

**Files:**
- Create: `apps/web/src/components/admin/matches/reschedule-chat-sheet.tsx`
- Modify: `apps/web/src/components/admin/matches/match-detail-page.tsx`
- Modify: `apps/web/src/messages/en.json` (and any other locale message files for parity)
- Test: `apps/web/src/components/admin/matches/reschedule-chat-sheet.test.tsx`

- [ ] **Step 1: Add i18n strings**

In `apps/web/src/messages/en.json`, under the matches namespace, add keys (mirror in every other locale file so `i18n:check` passes):
```json
"reschedule": {
  "trigger": "Suggest reschedule",
  "title": "Reschedule assistant",
  "description": "Describe your constraints; I'll suggest valid dates and venues.",
  "placeholder": "e.g. next 3 weeks, prefer Saturday evenings, keep our gym",
  "send": "Send",
  "disabled": "The assistant is currently turned off."
}
```

- [ ] **Step 2: Write the failing test (render + entry)**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: [], sendMessage: vi.fn(), status: "ready" }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

// --- Imports (after mocks) ---
import { RescheduleChatSheet } from "./reschedule-chat-sheet";

describe("RescheduleChatSheet", () => {
  it("renders the panel title when open", () => {
    render(<RescheduleChatSheet matchId={1} open onOpenChange={() => {}} />);
    expect(screen.getByText("title")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Implement the Sheet component**

`reschedule-chat-sheet.tsx` (uses the Sheet primitive, design-system tonal surfaces, `rounded-md`, the AI SDK `useChat` transport pointing at the API origin with credentials):
```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@dragons/ui/components/sheet";
import { Button } from "@dragons/ui/components/button";
import { Textarea } from "@dragons/ui/components/textarea";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function RescheduleChatSheet({
  matchId, open, onOpenChange,
}: { matchId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("matches.reschedule");
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/admin/assistant/reschedule/chat`,
      credentials: "include",
      body: { matchId },
    }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 bg-popover shadow-lg ring-1 ring-foreground/10 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className="rounded-md bg-surface-low px-3 py-2 text-sm">
              {msg.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
            </div>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (input.trim()) { sendMessage({ text: input }); setInput(""); } }}
        >
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("placeholder")} className="rounded-md" rows={2} />
          <Button type="submit" disabled={status !== "ready"}>{t("send")}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

> **Two integration points to verify at build time (don't assume):** (1) the exact `@ai-sdk/react` v2 `useChat` surface (`messages`/`sendMessage`/`status` and `DefaultChatTransport` options `api`/`credentials`/`body`) against the installed version's docs; (2) `reactCompiler: true` in `next.config.ts` — if `useChat` misbehaves, this is the suspect. Run `pnpm --filter @dragons/web build` after wiring.

- [ ] **Step 4: Wire the entry point**

In `match-detail-page.tsx`, add `const [rescheduleOpen, setRescheduleOpen] = useState(false);`, and inside the existing `<Can resource="match" action="update">` header block (next to the edit button) add:
```tsx
<Button variant="outline" onClick={() => setRescheduleOpen(true)}>{t("reschedule.trigger")}</Button>
<RescheduleChatSheet matchId={matchId} open={rescheduleOpen} onOpenChange={setRescheduleOpen} />
```
Import `RescheduleChatSheet` at the top.

- [ ] **Step 5: Run web tests + build**

Run: `pnpm --filter @dragons/web test reschedule-chat-sheet && pnpm --filter @dragons/web build`
Expected: test passes; build succeeds (confirms React 19 / next-intl / reactCompiler compatibility).

- [ ] **Step 6: Verify i18n parity**

Run: `pnpm --filter @dragons/web i18n:check` (or the repo's i18n check script).
Expected: no missing keys.

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/components/admin/matches/reschedule-chat-sheet.tsx apps/web/src/components/admin/matches/match-detail-page.tsx apps/web/src/messages apps/web/src/components/admin/matches/reschedule-chat-sheet.test.tsx
git commit -m "feat(web): rescheduling copilot chat panel + entry point"
```

---

# Phase 4 — MCP server adapter (external hosts)

### Task 13: MCP server builder

**Files:**
- Create: `apps/api/src/ai/mcp-server.ts`
- Test: `apps/api/src/ai/mcp-server.test.ts`

- [ ] **Step 1: Write the failing test (in-memory transport round-trip)**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/reschedule/verify-slot.service", () => ({
  verifySlot: vi.fn(async () => ({ ok: true, conflicts: [] })),
}));
vi.mock("../services/reschedule/reschedule-context.service", () => ({
  getMatchForReschedule: vi.fn(), listClubMatches: vi.fn(), listVenueBookings: vi.fn(),
  listClubVenues: vi.fn(async () => [{ venueId: 1, name: "Hall 1", city: "Town" }]),
  getRoundWindow: vi.fn(), getRefereeContext: vi.fn(),
}));

// --- Imports (after mocks) ---
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./mcp-server";

describe("buildMcpServer", () => {
  it("lists all registry tools and executes one over an in-memory transport", async () => {
    const server = buildMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("verify_slot");

    const res = await client.callTool({ name: "list_club_venues", arguments: {} });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(JSON.parse(text)).toEqual([{ venueId: 1, name: "Hall 1", city: "Town" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → `pnpm --filter @dragons/api test mcp-server` → FAIL.

- [ ] **Step 3: Implement `mcp-server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { reschedTools } from "./tool-registry";

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "dragons-reschedule", version: "1.0.0" });
  for (const t of reschedTools) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.inputSchema.shape },
      async (args: unknown) => {
        const result = await t.execute(args ?? {});
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    );
  }
  return server;
}
```

> **Verify against the installed `@modelcontextprotocol/sdk`:** `registerTool(name, { description, inputSchema: ZodRawShape }, handler)` is the high-level API; `inputSchema` takes a raw shape (hence `.shape`). Import paths use the `.js` subpath exports. If the installed SDK version differs, consult its README — the registry shape (name/description/zod-object/execute) is stable regardless.

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/ai/mcp-server.ts apps/api/src/ai/mcp-server.test.ts
git commit -m "feat(api): mcp server adapter over the reschedule tool registry"
```

---

### Task 14: MCP HTTP route (token-auth)

**Files:**
- Create: `apps/api/src/routes/mcp.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/mcp.routes.test.ts`

The MCP `StreamableHTTPServerTransport` writes to a Node `ServerResponse`. `@hono/node-server` exposes the underlying Node `incoming`/`outgoing` on `c.env`, and `RESPONSE_ALREADY_SENT` signals Hono that the response was written directly.

- [ ] **Step 1: Write the failing test (auth gating)**

```ts
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../config/env", () => ({ env: { MCP_TOKEN: "x".repeat(32) } }));
vi.mock("../ai/mcp-server", () => ({ buildMcpServer: vi.fn(() => ({ connect: vi.fn() })) }));

// --- Imports (after mocks) ---
import { mcpRoutes } from "./mcp.routes";

describe("POST /mcp auth", () => {
  it("rejects a missing/invalid bearer token with 401", async () => {
    const app = new Hono().route("/", mcpRoutes);
    const res = await app.request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
```
> Note: a full happy-path test needs Node `incoming`/`outgoing`, which `app.request()` does not provide — so unit-test the **auth gate** here (the branch that matters for security and coverage) and verify the happy path manually in Step 5. This keeps coverage green without faking Node internals.

- [ ] **Step 2: Run to verify it fails** → `pnpm --filter @dragons/api test mcp.routes` → FAIL.

- [ ] **Step 3: Implement `mcp.routes.ts`**

```ts
import { Hono } from "hono";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppEnv } from "../types";
import { env } from "../config/env";
import { buildMcpServer } from "../ai/mcp-server";

const mcpRoutes = new Hono<AppEnv>();

mcpRoutes.post("/mcp", async (c) => {
  const auth = c.req.header("authorization");
  if (!env.MCP_TOKEN || auth !== `Bearer ${env.MCP_TOKEN}`) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  const body = await c.req.json().catch(() => undefined);
  const { incoming, outgoing } = c.env as unknown as { incoming: IncomingMessage; outgoing: ServerResponse };

  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  outgoing.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(incoming, outgoing, body);
  return RESPONSE_ALREADY_SENT;
});

export { mcpRoutes };
```

In `apps/api/src/app.ts`, mount it OUTSIDE the `/admin/*` auth gate (it uses token auth, not a session) — e.g. alongside the other top-level mounts:
```ts
import { mcpRoutes } from "./routes/mcp.routes";
// ... after app.use("/admin/*", requireAuth) and existing mounts:
app.route("/", mcpRoutes);
```

- [ ] **Step 4: Run to verify it passes** → `pnpm --filter @dragons/api test mcp.routes` → PASS (401 gate).

- [ ] **Step 5: Manual happy-path check**

With `MCP_TOKEN` set and the API running locally:
```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
Expected: a JSON-RPC result listing the 7 tools. If it hangs or 500s, the `incoming`/`outgoing` bridge is the suspect — confirm `@hono/node-server` exposes them on `c.env` for this version (it is the repo's server per `package.json`); otherwise consult the node-server + MCP Streamable-HTTP docs for the exact bridge.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/routes/mcp.routes.ts apps/api/src/routes/mcp.routes.test.ts apps/api/src/app.ts
git commit -m "feat(api): token-authed /mcp streamable-http endpoint"
```

---

### Task 15: Docs — attach an external MCP host

**Files:** Modify `AGENTS.md`, `CLAUDE.md`

- [ ] **Step 1: Document the endpoint + client config**

In `AGENTS.md`, add a short "MCP server" subsection: the `/mcp` endpoint (Streamable HTTP, `Authorization: Bearer $MCP_TOKEN`, read-only reschedule tools), and a Claude Desktop / Cursor MCP client config snippet:
```json
{
  "mcpServers": {
    "dragons-reschedule": {
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```
Confirm `MCP_TOKEN` is already documented in the `CLAUDE.md` env section (Task 2). No AI-slop phrases.

- [ ] **Step 2: Commit**
```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: document /mcp endpoint + external host config"
```

---

## Final verification

- [ ] `pnpm --filter @dragons/api lint && pnpm --filter @dragons/api typecheck`
- [ ] `pnpm --filter @dragons/api test && pnpm --filter @dragons/api coverage` (≥ 90/95)
- [ ] `pnpm --filter @dragons/web build` (React 19 + reactCompiler + useChat)
- [ ] `pnpm check:ai-slop` (the new `.md` files must pass)
- [ ] Manual smoke: set `ASSISTANT_ENABLED=true` + `GOOGLE_GENERATIVE_AI_API_KEY`, open a match detail page, click "Suggest reschedule", type "next 3 weeks, prefer Saturday evenings, keep our gym", confirm it proposes verified slots and tells you to enter the chosen one on the portal.

---

## Self-review (author ran this against the spec)

- **Spec coverage:** model strategy → Tasks 1–3; shared registry → Task 7; verify_slot floor → Task 5; read tools (get_match, list_club_matches, list_venue_bookings, list_club_venues, get_round_window, get_referee_context) → Task 6; AI-driven reasoning loop + 3 disciplines → Tasks 8–9; chat route + ASSISTANT_ENABLED gate + match:update auth → Task 10; web panel + entry point + Can-gate → Task 12; MCP adapter + token auth → Tasks 13–14; external-host docs → Task 15; out-of-scope items (write-back, standing rules, travel scoring, native, digest, token budget) are absent by design. Covered.
- **Round-window source:** plan derives it from the local synced `matches` table (Task 5 check 3, Task 6 `getRoundWindow`) — matches the updated spec, no SDK dependency in the hot path.
- **Type consistency:** `verifySlotInputSchema` normalizes `HH:MM`→`HH:MM:SS` once (Task 4) and is reused by `verify_slot` (Task 5) and the registry (Task 7); `RescheduleMatch` defined in Task 6 is consumed by `system-prompt.ts` (Task 8) and `chat.ts` (Task 9); `reschedTools` shape (name/description/`z.object` inputSchema/execute) defined in Task 7 is consumed unchanged by both adapters (Tasks 9, 13).
- **Integration-risk flags (not placeholders — explicit verify steps):** AI SDK v5 surface (Task 1 Step 2 probe + Task 9 note), `@ai-sdk/react` v2 `useChat` (Task 12 note + build), MCP SDK `registerTool` shape (Task 13 note), MCP-over-Hono Node bridge (Task 14 Step 5 manual check). Each has a concrete verification command.
- **No new DB tables** → `setup-test-db.ts` untouched (confirmed in conventions).
