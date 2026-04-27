# Venue Booking Phase A — Calculation & Deadline Foundations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-27-venue-booking-overhaul-design.md`

**Goal:** Establish the new booking schema (status enum decoupled from submission state), wire the dead `dueDaysBefore` setting end-to-end, detect scheduling-overlap policy warnings, surface deadlines and warnings in the admin UI.

**Architecture:** Destructive migration replaces `venue_bookings`/`venue_booking_matches` (existing data is unused). Calculator becomes a structured-result function returning a window plus a list of policy warnings. Booking service records warnings on rows and emits events on transitions. Admin routes return `dueDate`, `daysUntilDue`, and warning data. Web UI shows due column, sortable default, warning indicators.

**Tech Stack:** Drizzle ORM 0.45, Hono 4.12, Zod 4.3, Vitest 4, Next.js 16 App Router, Tailwind, Radix UI via `@dragons/ui`.

**Out of scope (Phases B + C):** batch model and submissions, kanban Hallen board, dashboard widget, watch-rules schema for booking events, bulk-select on bookings list.

---

## Working assumptions (verify on the worktree before starting)

- Working directory: a fresh git worktree branched from `main`. Do not run on the main checkout.
- Local DB is the dev Postgres (`docker/docker-compose.dev.yml` brings it up).
- `pnpm install` has been run at repo root.

---

## Task 1: Update shared status enum

**Files:**
- Modify: `packages/shared/src/constants.ts` (replace `BOOKING_STATUSES` array)

The status enum changes from `pending|requested|confirmed|cancelled` to `unconfirmed|confirmed|rejected|cancelled`. This is a breaking change consumed by validation, schemas, and UI — those will be fixed in subsequent tasks. After this task, typecheck across the monorepo will fail in known places (intentional — used as a checklist for the rest of Phase A).

- [ ] **Step 1: Replace the enum**

In `packages/shared/src/constants.ts`, replace the existing `BOOKING_STATUSES` block with:

```ts
export const BOOKING_STATUSES = [
  "unconfirmed",
  "confirmed",
  "rejected",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
```

- [ ] **Step 2: Run shared package build to verify the file compiles**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS (this file alone has no consumers within the package).

- [ ] **Step 3: Run repo-wide typecheck and capture the failure list**

Run: `pnpm typecheck 2>&1 | tee /tmp/phase-a-typecheck.log`
Expected: FAIL with errors in:
- `packages/shared/src/validation.ts` (Zod enum)
- `apps/api/src/services/admin/booking-admin.service.ts` (string literal `"pending"`)
- `apps/api/src/services/venue-booking/venue-booking.service.ts` (string literals)
- `apps/api/src/services/notifications/templates/booking.ts` (likely uses old labels)
- web components consuming `BookingStatus`

Keep the log; later tasks reduce the failure count.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts
git commit -m "refactor(shared): switch booking status enum to unconfirmed/confirmed/rejected/cancelled"
```

---

## Task 2: Add policy warning type and extended booking interfaces

**Files:**
- Modify: `packages/shared/src/bookings.ts` (add types, extend `BookingListItem` and `BookingDetail`)
- Modify: `packages/shared/src/index.ts` (re-export new types if not already wildcard-exported)

- [ ] **Step 1: Verify the index re-exports are wildcard**

Run: `grep -n "from \"./bookings\"" packages/shared/src/index.ts`
Expected output (or similar): `export * from "./bookings"` — if so, no edit needed for re-exports.

If it lists individual symbols instead, add the new ones explicitly.

- [ ] **Step 2: Add `PolicyWarning` type and extend interfaces**

At the top of `packages/shared/src/bookings.ts`, after the `import type` line, add:

```ts
export type PolicyWarning =
  | {
      kind: "overlap";
      priorMatchId: number;
      nextMatchId: number;
      overlapMinutes: number;
    }
  | {
      kind: "end_clamped";
      originalEndTime: string;
      clampedToTime: string;
    };
```

In `BookingListItem`, after the existing `matchCount` field, add:

```ts
  dueDate: string;          // YYYY-MM-DD, computed: date − dueDaysBefore
  daysUntilDue: number;     // negative when overdue
  hasPolicyWarning: boolean;
```

In `BookingDetail`, after the existing `matches` field, add:

```ts
  dueDate: string;
  daysUntilDue: number;
  hasPolicyWarning: boolean;
  policyWarnings: PolicyWarning[];
```

- [ ] **Step 3: Run typecheck for the shared package**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/bookings.ts
git commit -m "feat(shared): add PolicyWarning and extend booking types with due/warning fields"
```

---

## Task 3: Add new domain event types and payloads

**Files:**
- Modify: `packages/shared/src/domain-events.ts`

- [ ] **Step 1: Add event type constants**

In `packages/shared/src/domain-events.ts`, inside the `EVENT_TYPES` object's `// Booking events` block, replace the existing three lines with:

```ts
  // Booking events
  BOOKING_CREATED: "booking.created",
  BOOKING_STATUS_CHANGED: "booking.status.changed",
  BOOKING_NEEDS_RECONFIRMATION: "booking.needs_reconfirmation",
  BOOKING_CONFIRMED: "booking.confirmed",
  BOOKING_REJECTED: "booking.rejected",
  BOOKING_POLICY_WARNING: "booking.policy_warning",
```

- [ ] **Step 2: Add payload interfaces**

After the existing `BookingNeedsReconfirmationPayload` interface, add:

```ts
export interface BookingConfirmedPayload {
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  confirmedBy: string | null;
}

export interface BookingRejectedPayload {
  venueName: string;
  date: string;
  reason: string | null;
}

export interface BookingPolicyWarningPayload {
  venueName: string;
  date: string;
  warnings: Array<
    | {
        kind: "overlap";
        priorMatchId: number;
        nextMatchId: number;
        overlapMinutes: number;
      }
    | {
        kind: "end_clamped";
        originalEndTime: string;
        clampedToTime: string;
      }
  >;
}
```

- [ ] **Step 3: Add to the union**

In the `DomainEventPayload` union, add the three new payload types alongside the existing `BookingNeedsReconfirmationPayload`:

```ts
  | BookingNeedsReconfirmationPayload
  | BookingConfirmedPayload
  | BookingRejectedPayload
  | BookingPolicyWarningPayload
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain-events.ts
git commit -m "feat(shared): add booking confirmed/rejected/policy-warning event types"
```

---

## Task 4: Update Zod validation for booking status

**Files:**
- Modify: `packages/shared/src/validation.ts`

`bookingStatusSchema` is already `z.enum(BOOKING_STATUSES)` — it picks up the new constants automatically. This task verifies that and adds explicit reusable schemas needed downstream.

- [ ] **Step 1: Confirm bookingStatusSchema picks up new enum**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: PASS — the existing `bookingStatusSchema` line stays valid.

No code change needed here. Single explicit verification step.

- [ ] **Step 2: No commit (verification only)**

Skip — Task 5 will commit alongside the booking-admin service fix that depends on the new enum.

---

## Task 5: Replace venue_bookings + venue_booking_matches schema

**Files:**
- Modify: `packages/db/src/schema/venue-bookings.ts` (replace contents)
- Modify: `packages/db/src/schema/venue-booking-matches.ts` (no shape change; verify FK still resolves)

The existing tables are dropped and recreated by the migration in Task 6. Drizzle schema files describe the *target* shape so `db:generate` produces the right migration.

- [ ] **Step 1: Rewrite `venue-bookings.ts`**

Replace the entire file `packages/db/src/schema/venue-bookings.ts` with:

```ts
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  date,
  time,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { BookingStatus } from "@dragons/shared";
import type { PolicyWarning } from "@dragons/shared";
import { venues } from "./venues";

export const venueBookings = pgTable(
  "venue_bookings",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id),
    date: date("date").notNull(),
    calculatedStartTime: time("calculated_start_time").notNull(),
    calculatedEndTime: time("calculated_end_time").notNull(),
    overrideStartTime: time("override_start_time"),
    overrideEndTime: time("override_end_time"),
    overrideReason: text("override_reason"),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("unconfirmed")
      .$type<BookingStatus>(),
    needsReconfirmation: boolean("needs_reconfirmation")
      .notNull()
      .default(false),
    hasPolicyWarning: boolean("has_policy_warning")
      .notNull()
      .default(false),
    policyWarnings: jsonb("policy_warnings").$type<PolicyWarning[]>(),
    notes: text("notes"),
    confirmedBy: text("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    venueDateUniq: uniqueIndex("venue_bookings_venue_date_uniq").on(
      table.venueId,
      table.date,
    ),
    dateIdx: index("venue_bookings_date_idx").on(table.date),
    statusIdx: index("venue_bookings_status_idx").on(table.status),
    policyWarningIdx: index("venue_bookings_policy_warning_idx").on(
      table.hasPolicyWarning,
    ),
  }),
);

export type VenueBooking = typeof venueBookings.$inferSelect;
export type NewVenueBooking = typeof venueBookings.$inferInsert;
```

- [ ] **Step 2: Verify `venue-booking-matches.ts` still compiles**

Run: `pnpm --filter @dragons/db typecheck`
Expected: PASS — `venue-booking-matches.ts` references `venueBookings.id`, which still exists.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/venue-bookings.ts
git commit -m "feat(db): redefine venue_bookings with policy warnings and new status enum"
```

---

## Task 6: Generate destructive migration and seed default setting

**Files:**
- Create: `packages/db/drizzle/0032_venue_booking_overhaul.sql` (manually written; replaces auto-generated migration)
- Create: `packages/db/drizzle/meta/0032_snapshot.json` (regenerated via `db:generate`)
- Modify: `packages/db/drizzle/meta/_journal.json` (regenerated via `db:generate`)

Drizzle-kit will produce an auto-generated migration. We rename it for clarity and append the `app_settings` upsert manually.

- [ ] **Step 1: Generate the auto migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: `packages/db/drizzle/0032_<random_name>.sql` is created. Note its name.

- [ ] **Step 2: Inspect the generated SQL**

Run: `cat packages/db/drizzle/0032_*.sql`
Expected: contains `ALTER TABLE` statements adjusting the `venue_bookings` shape (adding `has_policy_warning`, `policy_warnings`, changing `status` default).

This is wrong for our case — we want a destructive recreate, not in-place ALTER. Replace it.

- [ ] **Step 3: Replace the migration body**

Delete the generated SQL and write:

```sql
-- Drop existing venue booking data (unused in production per spec)
DROP TABLE IF EXISTS "venue_booking_matches" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "venue_bookings" CASCADE;--> statement-breakpoint

-- Recreate venue_bookings with new shape
CREATE TABLE "venue_bookings" (
  "id" serial PRIMARY KEY NOT NULL,
  "venue_id" integer NOT NULL,
  "date" date NOT NULL,
  "calculated_start_time" time NOT NULL,
  "calculated_end_time" time NOT NULL,
  "override_start_time" time,
  "override_end_time" time,
  "override_reason" text,
  "status" varchar(20) DEFAULT 'unconfirmed' NOT NULL,
  "needs_reconfirmation" boolean DEFAULT false NOT NULL,
  "has_policy_warning" boolean DEFAULT false NOT NULL,
  "policy_warnings" jsonb,
  "notes" text,
  "confirmed_by" text,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "venue_bookings"
  ADD CONSTRAINT "venue_bookings_venue_id_venues_id_fk"
  FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_bookings_venue_date_uniq"
  ON "venue_bookings" ("venue_id","date");--> statement-breakpoint
CREATE INDEX "venue_bookings_date_idx" ON "venue_bookings" ("date");--> statement-breakpoint
CREATE INDEX "venue_bookings_status_idx" ON "venue_bookings" ("status");--> statement-breakpoint
CREATE INDEX "venue_bookings_policy_warning_idx"
  ON "venue_bookings" ("has_policy_warning");--> statement-breakpoint

-- Recreate venue_booking_matches with FK to new venue_bookings
CREATE TABLE "venue_booking_matches" (
  "venue_booking_id" integer NOT NULL,
  "match_id" integer NOT NULL,
  CONSTRAINT "venue_booking_matches_pk"
    PRIMARY KEY("venue_booking_id","match_id")
);--> statement-breakpoint
ALTER TABLE "venue_booking_matches"
  ADD CONSTRAINT "venue_booking_matches_venue_booking_id_venue_bookings_id_fk"
  FOREIGN KEY ("venue_booking_id") REFERENCES "public"."venue_bookings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_booking_matches"
  ADD CONSTRAINT "venue_booking_matches_match_id_matches_id_fk"
  FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_booking_matches_match_id_idx"
  ON "venue_booking_matches" ("match_id");--> statement-breakpoint

-- Seed default city-deadline setting (28 days)
INSERT INTO "app_settings" ("key", "value")
VALUES ('venue_booking_due_days_before', '28')
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
```

Verify the existing primary-key/index naming conventions match what the schema's auto-generated names would produce by comparing to other migrations: open `packages/db/drizzle/0030_*.sql` and `0029_*.sql` for reference. If your project uses different naming, adjust constraint/index names to match — Drizzle's idempotency check compares by name.

- [ ] **Step 4: Rename the SQL file for clarity**

Run: `mv packages/db/drizzle/0032_*.sql packages/db/drizzle/0032_venue_booking_overhaul.sql`

Then update the corresponding entry in `packages/db/drizzle/meta/_journal.json` so `tag` matches `0032_venue_booking_overhaul`.

- [ ] **Step 5: Apply the migration**

Make sure the dev DB is running:
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

Then:
```bash
pnpm --filter @dragons/db db:migrate
```
Expected: migration applied, `0032_venue_booking_overhaul` shown in output.

- [ ] **Step 6: Smoke-check the schema**

Run:
```bash
docker compose -f docker/docker-compose.dev.yml exec -T postgres \
  psql -U dragons -d dragons -c "\d venue_bookings" | head -30
```
Expected: see `has_policy_warning` and `policy_warnings` columns; `status` default `'unconfirmed'`.

```bash
docker compose -f docker/docker-compose.dev.yml exec -T postgres \
  psql -U dragons -d dragons -c "SELECT key,value FROM app_settings WHERE key='venue_booking_due_days_before'"
```
Expected: one row, value `28`.

- [ ] **Step 7: Commit**

```bash
git add packages/db/drizzle/0032_venue_booking_overhaul.sql \
        packages/db/drizzle/meta/0032_snapshot.json \
        packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): destructive migration for venue booking overhaul (Phase A)"
```

---

## Task 7: Extend calculator with overlap detection

**Files:**
- Modify: `apps/api/src/services/venue-booking/booking-calculator.ts`
- Modify: `apps/api/src/services/venue-booking/booking-calculator.test.ts`

Calculator becomes a structured-result function. Existing call sites adapt in Task 9.

- [ ] **Step 1: Write failing tests for new return shape and overlap warning**

Append to `apps/api/src/services/venue-booking/booking-calculator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculateTimeWindow } from "./booking-calculator";

describe("calculateTimeWindow — policy warnings", () => {
  const config = {
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 60,
    defaultGameDurationMinutes: 90,
  };

  it("returns no warnings for a single match", () => {
    const result = calculateTimeWindow(
      [{ matchId: 1, kickoffTime: "14:00:00", teamGameDuration: 90 }],
      config,
    );
    expect(result?.warnings).toEqual([]);
  });

  it("returns no warnings for two non-overlapping matches", () => {
    const result = calculateTimeWindow(
      [
        { matchId: 1, kickoffTime: "12:00:00", teamGameDuration: 90 },
        { matchId: 2, kickoffTime: "14:00:00", teamGameDuration: 90 },
      ],
      config,
    );
    expect(result?.warnings).toEqual([]);
  });

  it("returns overlap warning when next kickoff is before prior end", () => {
    const result = calculateTimeWindow(
      [
        { matchId: 1, kickoffTime: "12:00:00", teamGameDuration: 90 },
        { matchId: 2, kickoffTime: "13:00:00", teamGameDuration: 90 },
      ],
      config,
    );
    expect(result?.warnings).toEqual([
      {
        kind: "overlap",
        priorMatchId: 1,
        nextMatchId: 2,
        overlapMinutes: 30,
      },
    ]);
  });

  it("uses default duration when match-level duration is null", () => {
    const result = calculateTimeWindow(
      [
        { matchId: 1, kickoffTime: "12:00:00", teamGameDuration: null },
        { matchId: 2, kickoffTime: "13:00:00", teamGameDuration: null },
      ],
      config,
    );
    expect(result?.warnings).toEqual([
      {
        kind: "overlap",
        priorMatchId: 1,
        nextMatchId: 2,
        overlapMinutes: 30,
      },
    ]);
  });

  it("detects overlap among three matches with one tight pair", () => {
    const result = calculateTimeWindow(
      [
        { matchId: 1, kickoffTime: "10:00:00", teamGameDuration: 90 },
        { matchId: 2, kickoffTime: "12:00:00", teamGameDuration: 90 },
        { matchId: 3, kickoffTime: "13:00:00", teamGameDuration: 90 },
      ],
      config,
    );
    expect(result?.warnings).toEqual([
      {
        kind: "overlap",
        priorMatchId: 2,
        nextMatchId: 3,
        overlapMinutes: 30,
      },
    ]);
  });
});
```

The existing test cases continue to call the old `(matches, config)` signature but expect a window-only return. They will fail after Step 3 — Step 4 updates them.

- [ ] **Step 2: Run new tests to confirm failure**

Run: `pnpm --filter @dragons/api test -- booking-calculator`
Expected: new tests fail (TypeError: result?.warnings undefined, or signature mismatch).

- [ ] **Step 3: Update calculator implementation**

Replace `apps/api/src/services/venue-booking/booking-calculator.ts` with:

```ts
import type { PolicyWarning } from "@dragons/shared";

export interface BookingMatchInput {
  matchId: number;
  kickoffTime: string; // "HH:mm:ss"
  teamGameDuration: number | null; // minutes, null = use default
}

export interface BookingConfig {
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  defaultGameDurationMinutes: number;
}

export interface CalculatorResult {
  window: {
    calculatedStartTime: string;
    calculatedEndTime: string;
  };
  warnings: PolicyWarning[];
}

const MAX_MINUTES_IN_DAY = 23 * 60 + 59;

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, MAX_MINUTES_IN_DAY));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export function calculateTimeWindow(
  matches: BookingMatchInput[],
  config: BookingConfig,
): CalculatorResult | null {
  if (matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) =>
    a.kickoffTime.localeCompare(b.kickoffTime),
  );

  const kickoffMinutes = sorted.map((m) => parseTimeToMinutes(m.kickoffTime));
  const durations = sorted.map((m) =>
    m.teamGameDuration !== null
      ? m.teamGameDuration
      : config.defaultGameDurationMinutes,
  );
  const matchEndMinutes = kickoffMinutes.map((k, i) => k + durations[i]!);

  const earliestKickoff = Math.min(...kickoffMinutes);
  const startMinutes = earliestKickoff - config.bufferBeforeMinutes;

  const latestMatchEnd = Math.max(...matchEndMinutes);
  const endMinutes = latestMatchEnd + config.bufferAfterMinutes;

  const warnings: PolicyWarning[] = [];

  // Overlap check (sorted by kickoff)
  for (let i = 0; i < sorted.length - 1; i++) {
    const priorEnd = matchEndMinutes[i]!;
    const nextKickoff = kickoffMinutes[i + 1]!;
    if (nextKickoff < priorEnd) {
      warnings.push({
        kind: "overlap",
        priorMatchId: sorted[i]!.matchId,
        nextMatchId: sorted[i + 1]!.matchId,
        overlapMinutes: priorEnd - nextKickoff,
      });
    }
  }

  // End-clamp warning
  let calculatedEndTime: string;
  if (endMinutes > MAX_MINUTES_IN_DAY) {
    const originalEndTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}:00`;
    calculatedEndTime = "23:59:59";
    warnings.push({
      kind: "end_clamped",
      originalEndTime,
      clampedToTime: calculatedEndTime,
    });
  } else {
    calculatedEndTime = minutesToTime(endMinutes);
  }

  return {
    window: {
      calculatedStartTime: minutesToTime(startMinutes),
      calculatedEndTime,
    },
    warnings,
  };
}
```

- [ ] **Step 4: Update existing test cases to use the new return shape**

Open `apps/api/src/services/venue-booking/booking-calculator.test.ts`. For every existing test that asserts on the result, change `result.calculatedStartTime` / `result.calculatedEndTime` to `result.window.calculatedStartTime` / `result.window.calculatedEndTime`. Add `matchId: <n>` to each `BookingMatchInput` literal (use the index or any unique number).

- [ ] **Step 5: Run all calculator tests**

Run: `pnpm --filter @dragons/api test -- booking-calculator`
Expected: PASS for both old and new tests.

- [ ] **Step 6: Add end-clamp warning test**

Append to the test file:

```ts
describe("calculateTimeWindow — end-of-day clamp", () => {
  it("clamps end to 23:59:59 and emits warning when buffer overflows", () => {
    const result = calculateTimeWindow(
      [{ matchId: 1, kickoffTime: "22:00:00", teamGameDuration: 90 }],
      {
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 60,
        defaultGameDurationMinutes: 90,
      },
    );
    expect(result?.window.calculatedEndTime).toBe("23:59:59");
    expect(result?.warnings).toEqual([
      {
        kind: "end_clamped",
        originalEndTime: "00:30:00",
        clampedToTime: "23:59:59",
      },
    ]);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @dragons/api test -- booking-calculator`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/venue-booking/booking-calculator.ts \
        apps/api/src/services/venue-booking/booking-calculator.test.ts
git commit -m "feat(api): calculator returns policy warnings for overlaps and end-clamp"
```

---

## Task 8: Wire `dueDaysBefore` into BookingConfig

**Files:**
- Modify: `apps/api/src/services/venue-booking/booking-calculator.ts` (extend `BookingConfig` type)
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.ts` (load setting)
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.test.ts` (or new file if non-existent)

- [ ] **Step 1: Extend the `BookingConfig` type**

In `booking-calculator.ts`, change `BookingConfig`:

```ts
export interface BookingConfig {
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  defaultGameDurationMinutes: number;
  dueDaysBefore: number;
}
```

The calculator itself does not consume `dueDaysBefore`; the service does. But the type lives here for cohesion.

- [ ] **Step 2: Write failing test for `getBookingConfig`**

In `venue-booking.service.test.ts`, find the existing `describe("getBookingConfig")` block (or add one if missing) and append:

```ts
it("loads dueDaysBefore from settings and falls back to 28", async () => {
  // Use the test DB helper pattern present in this file. If the helper sets up
  // a clean DB per test, no setup is needed beyond inserting the row.
  await db.insert(appSettings).values({
    key: "venue_booking_due_days_before",
    value: "21",
  }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: "21" },
  });

  const config = await getBookingConfig();
  expect(config.dueDaysBefore).toBe(21);
});

it("uses default 28 for dueDaysBefore when setting missing", async () => {
  await db.delete(appSettings).where(eq(appSettings.key, "venue_booking_due_days_before"));
  const config = await getBookingConfig();
  expect(config.dueDaysBefore).toBe(28);
});
```

If imports for `appSettings`, `db`, `eq` are missing at the top of the file, add them:
```ts
import { db } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
```

- [ ] **Step 3: Run tests to confirm failure**

Run: `pnpm --filter @dragons/api test -- venue-booking.service`
Expected: FAIL — `config.dueDaysBefore` is undefined.

- [ ] **Step 4: Update `getBookingConfig`**

In `venue-booking.service.ts`, find the `DEFAULTS` const and change to:

```ts
const DEFAULTS = {
  bufferBefore: 60,
  bufferAfter: 60,
  gameDuration: 90,
  dueDaysBefore: 28,
} as const;
```

In `getBookingConfig`, change the `inArray` argument list to include `dueDaysBefore`:

```ts
inArray(appSettings.key, [
  SETTING_KEYS.bufferBefore,
  SETTING_KEYS.bufferAfter,
  SETTING_KEYS.gameDuration,
  SETTING_KEYS.dueDaysBefore,
]),
```

And extend the return:

```ts
return {
  bufferBeforeMinutes: parse(SETTING_KEYS.bufferBefore, DEFAULTS.bufferBefore),
  bufferAfterMinutes: parse(SETTING_KEYS.bufferAfter, DEFAULTS.bufferAfter),
  defaultGameDurationMinutes: parse(SETTING_KEYS.gameDuration, DEFAULTS.gameDuration),
  dueDaysBefore: parse(SETTING_KEYS.dueDaysBefore, DEFAULTS.dueDaysBefore),
};
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api test -- venue-booking.service`
Expected: the two new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/venue-booking/booking-calculator.ts \
        apps/api/src/services/venue-booking/venue-booking.service.ts \
        apps/api/src/services/venue-booking/venue-booking.service.test.ts
git commit -m "feat(api): wire venue_booking_due_days_before with default 28"
```

---

## Task 9: Persist policy warnings during reconciliation

**Files:**
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.ts`
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.test.ts`

The service updates `venue_bookings.has_policy_warning` and `venue_bookings.policy_warnings`. Adapt to the new calculator return shape (`result.window` instead of direct fields).

- [ ] **Step 1: Write failing test**

Add to `venue-booking.service.test.ts`:

```ts
describe("reconcileBookingsForMatches — policy warnings", () => {
  it("flags hasPolicyWarning and stores warnings when matches overlap", async () => {
    // Two own-club home matches at same venue, same date, overlapping times.
    // Use the test seed helper or set up two matches with kickoffs 12:00 and 13:00,
    // duration 90 each, same venue, same date, isOwnClub=true, not forfeited/cancelled.
    const matchIds = await seedTwoOverlappingHomeMatches({
      venueId: testVenue.id,
      date: "2026-09-15",
      kickoffs: ["12:00:00", "13:00:00"],
      duration: 90,
    });

    await reconcileBookingsForMatches(matchIds);

    const [booking] = await db
      .select()
      .from(venueBookings)
      .where(eq(venueBookings.venueId, testVenue.id));

    expect(booking?.hasPolicyWarning).toBe(true);
    expect(booking?.policyWarnings).toEqual([
      expect.objectContaining({ kind: "overlap", overlapMinutes: 30 }),
    ]);
  });

  it("clears hasPolicyWarning when overlap is removed", async () => {
    // Pre-create a booking with hasPolicyWarning=true, then reconcile with non-overlapping matches.
    // Verify hasPolicyWarning becomes false and policyWarnings becomes empty array (or null).
    // Implementation: seed two non-overlapping matches and pre-populate the booking row with warnings.
    // After reconcile: assert flag false, warnings null/empty.
  });
});
```

The `seedTwoOverlappingHomeMatches` helper does not exist yet. Either add it to the existing test setup file (search for similar helpers like `seedHomeMatches` already used in this test file) or inline the SQL inserts. Use the patterns already present in `venue-booking.service.test.ts` for seeding matches/teams/venues.

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @dragons/api test -- venue-booking.service`
Expected: FAIL on the warning assertion (warnings empty or columns missing).

- [ ] **Step 3: Update `previewReconciliation` and `reconcileBookingsForMatches`**

In `venue-booking.service.ts`:

In every place that calls `calculateTimeWindow(matchInputs, config)!`, change to:

```ts
const calc = calculateTimeWindow(matchInputs, config)!;
const window = calc.window;
const warnings = calc.warnings;
```

Pass `matchId: g.matchId` into each `matchInputs` element:

```ts
const matchInputs = activeGames.map((g) => ({
  matchId: g.matchId,
  kickoffTime: g.kickoffTime,
  teamGameDuration: g.estimatedGameDuration,
}));
```

In the booking insert in `reconcileBookingsForMatches`, add the warning fields:

```ts
.values({
  venueId,
  date: kickoffDate,
  calculatedStartTime: window.calculatedStartTime,
  calculatedEndTime: window.calculatedEndTime,
  status: "unconfirmed",
  needsReconfirmation: false,
  hasPolicyWarning: warnings.length > 0,
  policyWarnings: warnings.length > 0 ? warnings : null,
})
```

In the booking update branch (where `windowChanged` is true), extend `updateData`:

```ts
const warningsChanged =
  (existing.hasPolicyWarning ?? false) !== (warnings.length > 0) ||
  JSON.stringify(existing.policyWarnings ?? []) !== JSON.stringify(warnings);

if (windowChanged || warningsChanged) {
  // ... existing windowChanged path
  updateData.hasPolicyWarning = warnings.length > 0;
  updateData.policyWarnings = warnings.length > 0 ? warnings : null;
}
```

When fetching `existing` rows, include the new fields (Drizzle `select()` without args returns all columns; verify the row has them). If the existing select uses an explicit projection list, add `hasPolicyWarning: venueBookings.hasPolicyWarning` and `policyWarnings: venueBookings.policyWarnings`.

In `previewReconciliation`, the preview rows do not currently expose warnings — extend `ReconcilePreviewCreate` and `ReconcilePreviewUpdate` types in `packages/shared/src/bookings.ts` to include `policyWarnings: PolicyWarning[]`, and populate them in the preview builder.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- venue-booking.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/bookings.ts \
        apps/api/src/services/venue-booking/venue-booking.service.ts \
        apps/api/src/services/venue-booking/venue-booking.service.test.ts
git commit -m "feat(api): persist booking policy warnings during reconciliation"
```

---

## Task 10: Emit BOOKING_POLICY_WARNING on flip false→true

**Files:**
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.ts`
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.test.ts`

- [ ] **Step 1: Write failing test**

Add to `venue-booking.service.test.ts`:

```ts
it("emits BOOKING_POLICY_WARNING only when flag flips false→true", async () => {
  // Seed two non-overlapping matches, reconcile (no warnings emitted).
  // Then update one kickoff to overlap, run reconcile again — expect one event.
  // Run reconcile a second time with the same overlapping data — expect no new event.
  const events = await getEmittedEventsBetween(async () => {
    // First reconcile: non-overlapping
    const matchIds = await seedHomeMatches({ ... });
    await reconcileBookingsForMatches(matchIds);
  });
  expect(events.filter((e) => e.type === EVENT_TYPES.BOOKING_POLICY_WARNING)).toHaveLength(0);

  const eventsAfterOverlap = await getEmittedEventsBetween(async () => {
    // Move one match to create overlap
    await db.update(matches).set({ kickoffTime: "13:00:00" }).where(eq(matches.id, secondMatchId));
    await reconcileBookingsForMatches([firstMatchId, secondMatchId]);
  });
  expect(eventsAfterOverlap.filter((e) => e.type === EVENT_TYPES.BOOKING_POLICY_WARNING)).toHaveLength(1);

  const eventsOnRerun = await getEmittedEventsBetween(async () => {
    await reconcileBookingsForMatches([firstMatchId, secondMatchId]);
  });
  expect(eventsOnRerun.filter((e) => e.type === EVENT_TYPES.BOOKING_POLICY_WARNING)).toHaveLength(0);
});
```

`getEmittedEventsBetween` is a hypothetical helper. Use the existing pattern in `venue-booking.service.test.ts` for asserting domain events (search for `publishDomainEvent` usage in the file). If no helper exists, query `domain_events` table before/after (filter on `type` and `entityType: "booking"`).

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @dragons/api test -- venue-booking.service`
Expected: FAIL — no BOOKING_POLICY_WARNING events emitted.

- [ ] **Step 3: Emit event on flip in `reconcileBookingsForMatches`**

In the create branch, after the booking is inserted:

```ts
if (warnings.length > 0) {
  try {
    const venueName = venueNames.get(venueId) ?? "Unknown";
    await publishDomainEvent({
      type: EVENT_TYPES.BOOKING_POLICY_WARNING,
      source: "reconciliation",
      entityType: "booking",
      entityId: created!.id,
      entityName: `${venueName} - ${kickoffDate}`,
      deepLinkPath: `/admin/bookings/${created!.id}`,
      payload: {
        venueName,
        date: kickoffDate,
        warnings,
      },
    });
  } catch (error) {
    log.warn({ err: error, bookingId: created!.id }, "Failed to emit booking.policy_warning event");
  }
}
```

In the update branch, after the warningsChanged update is committed:

```ts
const flipped = !existing.hasPolicyWarning && warnings.length > 0;
if (flipped) {
  try {
    const venueName = venueNames.get(venueId) ?? "Unknown";
    await publishDomainEvent({
      type: EVENT_TYPES.BOOKING_POLICY_WARNING,
      source: "reconciliation",
      entityType: "booking",
      entityId: existing.id,
      entityName: `${venueName} - ${kickoffDate}`,
      deepLinkPath: `/admin/bookings/${existing.id}`,
      payload: {
        venueName,
        date: kickoffDate,
        warnings,
      },
    });
  } catch (error) {
    log.warn({ err: error, bookingId: existing.id }, "Failed to emit booking.policy_warning event");
  }
}
```

`venueNames` is a Map populated near the top of the function. If it's not yet populated when this branch runs, fetch the name explicitly (see how `BOOKING_NEEDS_RECONFIRMATION` already does this in the same function for a working pattern).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- venue-booking.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/venue-booking/venue-booking.service.ts \
        apps/api/src/services/venue-booking/venue-booking.service.test.ts
git commit -m "feat(api): emit BOOKING_POLICY_WARNING on flag flip false→true"
```

---

## Task 11: Emit BOOKING_CONFIRMED / BOOKING_REJECTED on status change

**Files:**
- Modify: `apps/api/src/services/admin/booking-admin.service.ts` (`updateBookingStatus`)
- Modify: `apps/api/src/services/admin/booking-admin.service.test.ts`

The current `updateBookingStatus` only emits `BOOKING_STATUS_CHANGED` for the `cancelled` transition. Extend to also emit `BOOKING_CONFIRMED` for `confirmed` and `BOOKING_REJECTED` for `rejected`. Replace the `pending` literal with `unconfirmed`.

- [ ] **Step 1: Write failing tests**

Open `apps/api/src/services/admin/booking-admin.service.test.ts`. Find the existing block of `updateBookingStatus` tests. Add:

```ts
it("emits BOOKING_CONFIRMED when status flips to confirmed", async () => {
  const before = await listEmittedEventsForBooking(testBooking.id);
  await updateBookingStatus(testBooking.id, "confirmed");
  const after = await listEmittedEventsForBooking(testBooking.id);
  const newEvents = after.slice(before.length);
  expect(newEvents.some((e) => e.type === EVENT_TYPES.BOOKING_CONFIRMED)).toBe(true);
});

it("emits BOOKING_REJECTED when status flips to rejected", async () => {
  const before = await listEmittedEventsForBooking(testBooking.id);
  await updateBookingStatus(testBooking.id, "rejected");
  const after = await listEmittedEventsForBooking(testBooking.id);
  const newEvents = after.slice(before.length);
  expect(newEvents.some((e) => e.type === EVENT_TYPES.BOOKING_REJECTED)).toBe(true);
});
```

`listEmittedEventsForBooking` should query `domain_events` filtered by `entityType="booking"` and `entityId=<id>`, ordered by createdAt. Reuse any existing helper in this test file or add one inline.

- [ ] **Step 2: Run tests, expect failure**

Run: `pnpm --filter @dragons/api test -- booking-admin.service`
Expected: FAIL.

- [ ] **Step 3: Update `updateBookingStatus`**

In `booking-admin.service.ts`, locate the existing `if (status === "cancelled") { try { await publishDomainEvent ... }` block. Add two more branches before or after it:

```ts
if (status === "confirmed") {
  try {
    await publishDomainEvent({
      type: EVENT_TYPES.BOOKING_CONFIRMED,
      source: "manual",
      entityType: "booking",
      entityId: id,
      entityName: `${venue!.name} - ${updated.date}`,
      deepLinkPath: `/admin/bookings/${id}`,
      payload: {
        venueName: venue!.name,
        date: updated.date,
        startTime: updated.overrideStartTime ?? updated.calculatedStartTime,
        endTime: updated.overrideEndTime ?? updated.calculatedEndTime,
        confirmedBy: null,
      },
    });
  } catch (error) {
    log.warn({ err: error, bookingId: id }, "Failed to emit booking.confirmed event");
  }
}

if (status === "rejected") {
  try {
    await publishDomainEvent({
      type: EVENT_TYPES.BOOKING_REJECTED,
      source: "manual",
      entityType: "booking",
      entityId: id,
      entityName: `${venue!.name} - ${updated.date}`,
      deepLinkPath: `/admin/bookings/${id}`,
      payload: {
        venueName: venue!.name,
        date: updated.date,
        reason: null,
      },
    });
  } catch (error) {
    log.warn({ err: error, bookingId: id }, "Failed to emit booking.rejected event");
  }
}
```

Also, in the same function, replace the `"pending"` default literal anywhere in this file (search for `"pending"`) with `"unconfirmed"` to keep the file consistent with the new enum.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- booking-admin.service`
Expected: PASS.

- [ ] **Step 5: Run repo-wide typecheck and fix remaining `pending`/`requested` literals**

Run: `pnpm typecheck 2>&1 | grep -E "pending|requested"`

Expected: any remaining string literals that the type system rejects. Replace each:
- `"pending"` → `"unconfirmed"`
- `"requested"` → `"unconfirmed"` (or remove if branch was specific to requested)

Common locations to check:
- `apps/api/src/services/admin/booking-admin.service.ts` createBooking body
- `apps/web/src/components/admin/bookings/booking-list-table.tsx` (status badge map)
- `apps/web/src/components/admin/bookings/booking-detail-sheet.tsx` (status select options)
- `apps/api/src/services/notifications/templates/booking.ts` (template strings)

Defer the UI files to Tasks 16+ — for now, only fix server-side typing.

- [ ] **Step 6: Run typecheck again**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/admin/booking-admin.service.ts \
        apps/api/src/services/admin/booking-admin.service.test.ts
git commit -m "feat(api): emit BOOKING_CONFIRMED and BOOKING_REJECTED on status change"
```

---

## Task 12: Extend booking list/detail responses with due fields and warnings

**Files:**
- Modify: `apps/api/src/services/admin/booking-admin.service.ts` (list + detail projections)
- Modify: `apps/api/src/services/admin/booking-admin.service.test.ts`
- Modify: `packages/shared/src/bookings.ts` (already extended in Task 2 — verify the fields exist)

Add `dueDate`, `daysUntilDue`, `hasPolicyWarning`, `policyWarnings` to the responses. `dueDate` and `daysUntilDue` are computed; the others are columns.

- [ ] **Step 1: Add a helper for due-date computation**

In `booking-admin.service.ts`, near the top, add:

```ts
import { getBookingConfig } from "../venue-booking/venue-booking.service";

function computeDueFields(date: string, dueDaysBefore: number, today: Date): {
  dueDate: string;
  daysUntilDue: number;
} {
  const bookingDate = new Date(`${date}T00:00:00Z`);
  const dueAt = new Date(bookingDate);
  dueAt.setUTCDate(dueAt.getUTCDate() - dueDaysBefore);
  const dueDate = dueAt.toISOString().slice(0, 10);

  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const diffMs = dueAt.getTime() - todayUtc.getTime();
  const daysUntilDue = Math.round(diffMs / (24 * 60 * 60 * 1000));

  return { dueDate, daysUntilDue };
}
```

- [ ] **Step 2: Write failing test**

Append to `booking-admin.service.test.ts`:

```ts
it("listBookings returns dueDate and daysUntilDue based on dueDaysBefore", async () => {
  await db.insert(appSettings).values({
    key: "venue_booking_due_days_before",
    value: "30",
  }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: "30" },
  });

  // Seed a booking dated 60 days from today, no override.
  const dateInFuture = addDaysIso(new Date(), 60);
  await seedBooking({ date: dateInFuture, status: "unconfirmed" });

  const list = await listBookings();
  const item = list.find((b) => b.date === dateInFuture)!;
  expect(item.dueDate).toBe(addDaysIso(new Date(), 30));
  expect(item.daysUntilDue).toBe(30);
});

it("listBookings returns hasPolicyWarning column", async () => {
  await seedBooking({ status: "unconfirmed", hasPolicyWarning: true });
  const list = await listBookings();
  expect(list.some((b) => b.hasPolicyWarning === true)).toBe(true);
});
```

`addDaysIso` and `seedBooking` are helpers — either reuse what's already in the test file (search for similar booking seed helpers) or define inline.

- [ ] **Step 3: Run tests, expect failure**

Run: `pnpm --filter @dragons/api test -- booking-admin.service`
Expected: FAIL.

- [ ] **Step 4: Update `listBookings` projection**

In `booking-admin.service.ts`'s `listBookings`, extend the `select()` projection to include:

```ts
hasPolicyWarning: venueBookings.hasPolicyWarning,
policyWarnings: venueBookings.policyWarnings,
```

After the rows fetch, get `dueDaysBefore` once:

```ts
const config = await getBookingConfig();
const today = new Date();
```

In the `.map((row) => ({...}))` return, add:

```ts
const { dueDate, daysUntilDue } = computeDueFields(row.date, config.dueDaysBefore, today);
return {
  // ...existing fields,
  dueDate,
  daysUntilDue,
  hasPolicyWarning: row.hasPolicyWarning,
};
```

Do the equivalent in `getBookingDetail` (return shape extends `BookingListItem` for these fields plus `policyWarnings`).

In `updateBooking` and `updateBookingStatus`, the returned `BookingListItem` shape needs the same extension. Reuse `computeDueFields` and `getBookingConfig`.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api test -- booking-admin.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/booking-admin.service.ts \
        apps/api/src/services/admin/booking-admin.service.test.ts
git commit -m "feat(api): include dueDate, daysUntilDue, policy warnings in booking responses"
```

---

## Task 13: Add list filters for dueWithinDays and hasPolicyWarning

**Files:**
- Modify: `apps/api/src/routes/admin/booking.schemas.ts`
- Modify: `apps/api/src/services/admin/booking-admin.service.ts`
- Modify: `apps/api/src/services/admin/booking-admin.service.test.ts`

- [ ] **Step 1: Update Zod schema**

In `booking.schemas.ts`, replace `bookingListQuerySchema`:

```ts
export const bookingListQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  dueWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  hasPolicyWarning: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
```

- [ ] **Step 2: Write failing test**

Add to `booking-admin.service.test.ts`:

```ts
it("filters list by dueWithinDays", async () => {
  // Seed three bookings with dates 5d, 20d, 60d in the future. Default dueDaysBefore=28.
  // dueDates: -23d, -8d, +32d from today
  // daysUntilDue: -23, -8, 32
  // dueWithinDays=10 should match only the second.
  await seedBooking({ date: addDaysIso(new Date(), 5) });
  await seedBooking({ date: addDaysIso(new Date(), 20) });
  await seedBooking({ date: addDaysIso(new Date(), 60) });

  const list = await listBookings({ dueWithinDays: 10 });
  expect(list).toHaveLength(2); // overdue + due-soon both within 10d window

  // Define semantics: dueWithinDays=N matches bookings with daysUntilDue <= N.
  // Adjust the test if the implementation uses absolute |daysUntilDue| <= N instead.
});

it("filters list by hasPolicyWarning=true", async () => {
  await seedBooking({ hasPolicyWarning: true });
  await seedBooking({ hasPolicyWarning: false });
  const list = await listBookings({ hasPolicyWarning: true });
  expect(list).toHaveLength(1);
});
```

Decide on the `dueWithinDays` semantics: **`daysUntilDue <= N`** (i.e., overdue is always included, plus everything due within N days). This matches the dashboard widget expectation.

- [ ] **Step 3: Update `listBookings` filters**

In `booking-admin.service.ts`, extend `BookingListFilters`:

```ts
export interface BookingListFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  dueWithinDays?: number;
  hasPolicyWarning?: boolean;
}
```

Add SQL condition for `hasPolicyWarning`:

```ts
if (filters?.hasPolicyWarning !== undefined) {
  conditions.push(eq(venueBookings.hasPolicyWarning, filters.hasPolicyWarning));
}
```

For `dueWithinDays`, since `daysUntilDue` is computed (not a column), filter post-fetch:

```ts
let result = rows.map((row) => ({ ... mapped row ... }));
if (filters?.dueWithinDays !== undefined) {
  const cutoff = filters.dueWithinDays;
  result = result.filter((b) => b.daysUntilDue <= cutoff);
}
return result;
```

- [ ] **Step 4: Verify the route forwards the new fields**

In `booking.routes.ts`, the `listBookings` call already does `listBookings(query)`. Verify it still compiles after the schema change.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dragons/api test -- booking-admin.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/booking.schemas.ts \
        apps/api/src/services/admin/booking-admin.service.ts \
        apps/api/src/services/admin/booking-admin.service.test.ts
git commit -m "feat(api): add dueWithinDays and hasPolicyWarning filters to booking list"
```

---

## Task 14: Notification templates for new booking events

**Files:**
- Modify: `apps/api/src/services/notifications/templates/booking.ts`
- Modify: `apps/api/src/services/notifications/templates/booking.test.ts`

Add render functions for `BOOKING_CONFIRMED`, `BOOKING_REJECTED`, `BOOKING_POLICY_WARNING`. Update existing templates if they reference the old enum labels.

- [ ] **Step 1: Read the existing template file**

Open `apps/api/src/services/notifications/templates/booking.ts` and observe the rendering pattern (typically `(payload, locale) => { title, body }`).

- [ ] **Step 2: Add tests for the three new event types**

Append to `booking.test.ts`:

```ts
describe("renderBookingConfirmed", () => {
  it("renders English title with venue and date", () => {
    const result = renderBookingConfirmed(
      { venueName: "Sporthalle X", date: "2026-09-15", startTime: "14:00:00", endTime: "17:00:00", confirmedBy: null },
      "en",
    );
    expect(result.title).toContain("Sporthalle X");
    expect(result.title.toLowerCase()).toContain("confirmed");
  });

  it("renders German title", () => {
    const result = renderBookingConfirmed(
      { venueName: "Sporthalle X", date: "2026-09-15", startTime: "14:00:00", endTime: "17:00:00", confirmedBy: null },
      "de",
    );
    expect(result.title.toLowerCase()).toContain("bestätigt");
  });
});

describe("renderBookingRejected", () => {
  it("renders rejection title", () => {
    const result = renderBookingRejected(
      { venueName: "Sporthalle X", date: "2026-09-15", reason: null },
      "en",
    );
    expect(result.title.toLowerCase()).toContain("rejected");
  });
});

describe("renderBookingPolicyWarning", () => {
  it("renders warning summarizing overlap", () => {
    const result = renderBookingPolicyWarning(
      {
        venueName: "Sporthalle X",
        date: "2026-09-15",
        warnings: [{ kind: "overlap", priorMatchId: 1, nextMatchId: 2, overlapMinutes: 30 }],
      },
      "en",
    );
    expect(result.body).toMatch(/overlap|conflict/i);
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

Run: `pnpm --filter @dragons/api test -- templates/booking`
Expected: FAIL — functions undefined.

- [ ] **Step 4: Implement the three template functions**

Append to `booking.ts`:

```ts
import type {
  BookingConfirmedPayload,
  BookingRejectedPayload,
  BookingPolicyWarningPayload,
} from "@dragons/shared";

export function renderBookingConfirmed(
  payload: BookingConfirmedPayload,
  locale: "en" | "de",
): { title: string; body: string } {
  if (locale === "de") {
    return {
      title: `Buchung bestätigt: ${payload.venueName}`,
      body: `${payload.venueName} am ${payload.date} (${payload.startTime}-${payload.endTime}) ist bestätigt.`,
    };
  }
  return {
    title: `Booking confirmed: ${payload.venueName}`,
    body: `${payload.venueName} on ${payload.date} (${payload.startTime}-${payload.endTime}) is confirmed.`,
  };
}

export function renderBookingRejected(
  payload: BookingRejectedPayload,
  locale: "en" | "de",
): { title: string; body: string } {
  if (locale === "de") {
    return {
      title: `Buchung abgelehnt: ${payload.venueName}`,
      body: `${payload.venueName} am ${payload.date} wurde abgelehnt.${payload.reason ? ` Grund: ${payload.reason}` : ""}`,
    };
  }
  return {
    title: `Booking rejected: ${payload.venueName}`,
    body: `${payload.venueName} on ${payload.date} was rejected.${payload.reason ? ` Reason: ${payload.reason}` : ""}`,
  };
}

export function renderBookingPolicyWarning(
  payload: BookingPolicyWarningPayload,
  locale: "en" | "de",
): { title: string; body: string } {
  const overlapCount = payload.warnings.filter((w) => w.kind === "overlap").length;
  const clampedCount = payload.warnings.filter((w) => w.kind === "end_clamped").length;
  if (locale === "de") {
    const parts: string[] = [];
    if (overlapCount > 0) parts.push(`${overlapCount} Überschneidung${overlapCount === 1 ? "" : "en"}`);
    if (clampedCount > 0) parts.push("Endzeit über Mitternacht");
    return {
      title: `Buchungswarnung: ${payload.venueName}`,
      body: `${payload.venueName} am ${payload.date}: ${parts.join(", ")}.`,
    };
  }
  const parts: string[] = [];
  if (overlapCount > 0) parts.push(`${overlapCount} game overlap${overlapCount === 1 ? "" : "s"}`);
  if (clampedCount > 0) parts.push("end time past midnight");
  return {
    title: `Booking warning: ${payload.venueName}`,
    body: `${payload.venueName} on ${payload.date}: ${parts.join(", ")}.`,
  };
}
```

- [ ] **Step 5: Wire renderers into the dispatch table**

Find the renderer dispatch table (often `index.ts` of `templates/` or a switch in the dispatcher). Search:

```bash
grep -rn "BOOKING_CREATED" apps/api/src/services/notifications/
```

Add entries for the three new event types pointing to the renderers. Pattern matches existing wiring.

- [ ] **Step 6: Update existing templates if they reference old enum labels**

Open `booking.ts` and search for `pending`, `requested`. Update wording (e.g., "Booking created (pending)" → "Booking created (unconfirmed)").

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @dragons/api test -- templates/booking`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/notifications/templates/booking.ts \
        apps/api/src/services/notifications/templates/booking.test.ts \
        apps/api/src/services/notifications/templates/index.ts
git commit -m "feat(api): notification templates for booking confirmed/rejected/policy-warning"
```

---

## Task 15: Settings UI — expose dueDaysBefore field

**Files:**
- Modify: `apps/web/src/components/admin/settings/booking-config.tsx`

- [ ] **Step 1: Read the existing settings form**

Open the file. Identify how the existing three numeric fields (bufferBefore, bufferAfter, gameDuration) are rendered and saved.

- [ ] **Step 2: Add `dueDaysBefore` field**

Mirror the existing field pattern. The setting key is `venue_booking_due_days_before`. Default 28. Label EN: "City needs booking N days in advance". Label DE: "Stadt braucht Buchung N Tage vorab".

If the form uses i18n, add the translation keys to the locale files used by this component (find the keys for the existing fields and add parallels).

- [ ] **Step 3: Smoke-test**

Run: `pnpm --filter @dragons/web dev`

In a browser, navigate to `/admin/settings`, confirm the new field appears, change the value, save, refresh, confirm persistence.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/settings/booking-config.tsx \
        apps/web/src/messages/en.json \
        apps/web/src/messages/de.json
git commit -m "feat(web): expose dueDaysBefore in booking settings"
```

(Adjust paths if locale files live elsewhere.)

---

## Task 16: Booking list table — due column, default sort, filters, warning icon

**Files:**
- Modify: `apps/web/src/components/admin/bookings/booking-list-table.tsx`
- Modify: `apps/web/src/app/[locale]/admin/bookings/page.tsx` (if it constructs the initial list)

- [ ] **Step 1: Inspect the existing table**

Open the file. Identify columns, status filter dropdown, status badge color map.

- [ ] **Step 2: Update status badge map for new enum**

Replace the status→variant map:

```ts
const STATUS_VARIANTS: Record<BookingStatus, BadgeVariant> = {
  unconfirmed: "secondary",
  confirmed: "success",
  rejected: "destructive",
  cancelled: "muted",
};
```

(Use the project's existing badge variant naming — check other tables for `success`/`destructive`/`muted` precedents.)

Update locale files for translated status labels:
- EN: Unconfirmed, Confirmed, Rejected, Cancelled
- DE: Unbestätigt, Bestätigt, Abgelehnt, Abgesagt

- [ ] **Step 3: Add Due column**

Insert a column after Date. Render `daysUntilDue`:
- `< 0`: red badge "X days overdue"
- `0..7`: amber badge "due in X days"
- `8..30`: neutral text "in X days"
- `> 30`: dimmed text "in X days"

Tooltip shows the absolute `dueDate`.

- [ ] **Step 4: Add policy warning icon column**

A narrow ⚠ column. Show an icon (use the project's existing icon library — search for `lucide-react` usage in this folder) only when `hasPolicyWarning` is true. Tooltip: "Has scheduling warning".

- [ ] **Step 5: Default sort by dueDate ascending**

If the table uses `useTable` / column sort state, set the default sort to `dueDate` asc. Otherwise apply a `[...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate))` before render.

- [ ] **Step 6: Add filters**

In the filter row, add:
- Due-within select: All / 7 days / 14 days / 30 days. Pass to the API as `dueWithinDays`.
- Has-warning toggle (checkbox). Pass to the API as `hasPolicyWarning=true`.

The list page (or hook) passes these filters into the SWR fetcher.

- [ ] **Step 7: Smoke-test**

Run dev server, browse `/admin/bookings`, exercise filters, confirm sort order, hover the warning icon.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/admin/bookings/booking-list-table.tsx \
        apps/web/src/app/[locale]/admin/bookings/page.tsx \
        apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): booking list shows due, warnings, due-within filter"
```

---

## Task 17: Booking detail sheet — due, warnings, new enum labels

**Files:**
- Modify: `apps/web/src/components/admin/bookings/booking-detail-sheet.tsx`

- [ ] **Step 1: Update status select options**

Replace options to use the new enum (`unconfirmed`, `confirmed`, `rejected`, `cancelled`) with localized labels.

- [ ] **Step 2: Display due date**

Add a labeled field near the date showing `dueDate` and `daysUntilDue` with the same color logic as the list (red/amber/neutral).

- [ ] **Step 3: Render policy warnings**

Add a section "Policy warnings" rendered when `policyWarnings.length > 0`. For each warning:
- `overlap`: "Game #priorMatchId ends N min after Game #nextMatchId starts" (look up team names if available; for Phase A, just match IDs are acceptable since the list view links to matches separately).
- `end_clamped`: "End time clamped to {clampedToTime} (was {originalEndTime})".

- [ ] **Step 4: Smoke-test**

Open a booking with warnings (seed one in dev DB by tweaking match kickoffs to overlap, then triggering reconcile via the existing UI button).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/bookings/booking-detail-sheet.tsx \
        apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): booking detail shows due date and policy warnings"
```

---

## Task 18: Reconcile dialog — warning chips per row

**Files:**
- Modify: `apps/web/src/components/admin/bookings/reconcile-dialog.tsx`

- [ ] **Step 1: Inspect reconcile dialog rendering**

Find the per-row render for create / update sections. Note where a chip or badge could fit.

- [ ] **Step 2: Render warning chip when policyWarnings present**

For each create/update row that has `policyWarnings.length > 0`, render a small ⚠ chip next to the venue name. Tooltip lists the warnings (overlap by N minutes between match X and Y; end clamped).

- [ ] **Step 3: Smoke-test**

With a known overlap in the dev DB, open the reconcile dialog, confirm the chip appears.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/bookings/reconcile-dialog.tsx \
        apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): reconcile dialog shows policy warning chips"
```

---

## Task 19: Match detail — booking card with due + warning indicator

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-detail-page.tsx`
- Modify: `apps/api/src/services/admin/match-query.service.ts` (or wherever the match detail's booking projection is built)

- [ ] **Step 1: Extend the API projection**

In the match-detail booking projection, add `dueDate`, `daysUntilDue`, `hasPolicyWarning` to the response. Reuse `computeDueFields` and `getBookingConfig`.

Add a test in the corresponding `match-query.service.test.ts` (or whichever file already covers this projection) confirming the new fields are present.

- [ ] **Step 2: Run match-query tests**

Run: `pnpm --filter @dragons/api test -- match-query`
Expected: PASS.

- [ ] **Step 3: Update the booking card on the match detail page**

In `match-detail-page.tsx`, the booking card at lines ~240–271 already shows status badge and reconfirmation flag. Add:
- Due date with color logic.
- Warning icon when `hasPolicyWarning` is true.

- [ ] **Step 4: Smoke-test**

Visit a match detail page where the linked booking has a known overlap or due date. Confirm the indicators appear.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/match-query.service.ts \
        apps/api/src/services/admin/match-query.service.test.ts \
        apps/web/src/components/admin/matches/match-detail-page.tsx
git commit -m "feat: match detail shows booking due date and policy warnings"
```

---

## Task 20: Final repo-wide validation

**Files:** none

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Coverage gate**

Run: `pnpm coverage`
Expected: PASS (90% branches, 95% functions/lines/statements).

If coverage drops below threshold, identify uncovered lines via the coverage report, add focused tests for the gaps, and re-run.

- [ ] **Step 5: AI-slop check**

Run: `pnpm check:ai-slop`
Expected: PASS — the spec and plan files use `<!-- ai-slop-ignore-line -->` for any banned phrases (none expected).

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 7: End-to-end smoke**

```bash
docker compose -f docker/docker-compose.dev.yml up -d
pnpm dev
```

Manual checks:
- `/admin/settings` shows the new dueDaysBefore field, defaults to 28, saves correctly.
- `/admin/bookings` shows due column, default sort by due, filters work.
- A booking with overlap shows the warning icon. Click into detail — see the warnings list.
- Status select shows Unconfirmed / Confirmed / Rejected / Cancelled.
- Reconcile preview shows warning chips.
- Match detail page shows due + warning when relevant.

Stop dev server.

- [ ] **Step 8: Final commit (if anything fixed in steps above)**

```bash
git status
# If clean, no commit. Otherwise:
git add ...
git commit -m "chore: final cleanup for venue booking Phase A"
```

---

## Spec coverage check

Before marking Phase A complete, walk through the spec's Phase A row and confirm each bullet has a task that delivers it:

| Spec line | Task |
|---|---|
| Destructive migration of `venue_bookings`/`venue_booking_matches` | 5, 6 |
| Status enum migration (`unconfirmed|confirmed|rejected|cancelled`) | 1, 4, 5, 11 |
| `hasPolicyWarning` + `policyWarnings` columns | 5 |
| Calculator returns warnings | 7 |
| Reconciliation populates warnings | 9 |
| Reconciliation emits `BOOKING_POLICY_WARNING` on flip | 10 |
| Wire `dueDaysBefore` into config; default 28 | 8 |
| Emit `BOOKING_CONFIRMED` / `BOOKING_REJECTED` events | 11 |
| Settings UI exposes `dueDaysBefore` | 15 |
| Bookings list: due column, default sort, due-within filter, policy-warning icon | 13, 16 |
| Booking detail: due date display, policy warnings list | 12, 17 |
| Reconcile dialog: warning chips | 9 (preview type), 18 |
| Match detail booking card: due + warning indicator | 19 |
| Notification templates for new events | 14 |
| Tests | each task |

If any line lacks a task, add a task before starting execution.
