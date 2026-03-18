# PGlite Test Infrastructure Design

**Date:** 2026-03-18
**Status:** Approved

## Problem

The test suite has two issues:

1. **11 PGlite test files duplicate ~800+ lines of boilerplate** — each hand-writes CREATE TABLE SQL that can drift from the real Drizzle schema, duplicates PGlite init/teardown, and manually resets sequences.
2. **~76 test files use pure mocks** (`vi.fn()` for `db.insert`, `db.select`, etc.) that verify functions call the right methods but never validate that actual SQL queries work against a real database.
3. **No realistic test data** — all test data is manually constructed inline, making it hard to test queries against production-like volumes and relationships.

## Solution

A shared PGlite test infrastructure with three components:

1. **Shared test helpers** — centralized PGlite setup using real Drizzle migrations
2. **Opt-in seed data** — a JSON fixture extracted from the real database
3. **Seed extraction script** — a CLI tool to refresh the fixture

## Architecture

### Component 1: `apps/api/src/test/setup-test-db.ts`

Core helper that replaces all duplicated PGlite boilerplate.

**Exports:**

```ts
interface TestDbContext {
  client: PGlite;
  db: PgliteDatabase<typeof schema>;
}

async function setupTestDb(): Promise<TestDbContext>
async function resetTestDb(ctx: TestDbContext): Promise<void>
async function closeTestDb(ctx: TestDbContext): Promise<void>
```

**Behavior:**

- `setupTestDb()`: Creates a new in-memory PGlite instance, wraps it with `drizzle-orm/pglite` (passing the full `schema` for relational queries), and runs all migrations from `packages/db/drizzle/` using `drizzle-orm/pglite/migrator`.
- `resetTestDb()`: Truncates all tables and restarts all sequences in a single SQL statement. Uses `TRUNCATE ... CASCADE` for efficiency rather than individual DELETE statements.
- `closeTestDb()`: Calls `client.close()`.

**Migration path resolution:** Uses `import.meta.resolve("@dragons/db/drizzle-migrations")` or falls back to `path.resolve(import.meta.dirname, "../../../../packages/db/drizzle")` to locate the migration folder. The Drizzle migrator reads `meta/_journal.json` inside the migrations folder to determine migration order and which SQL files to run.

### Component 2: `apps/api/src/test/seed-test-db.ts`

Optional seed loader for tests that want realistic data.

**Exports:**

```ts
async function seedTestDb(ctx: TestDbContext): Promise<void>
```

**Behavior:**

- Reads `apps/api/src/test/fixtures/seed.json`
- Inserts data in FK-safe order: leagues → teams → referees → referee_roles → venues → standings → matches → match_overrides → match_remote_versions → match_local_versions → match_changes → match_referees → referee_assignment_intents → referee_assignment_rules → app_settings
- Uses Drizzle ORM `db.insert().values()` for type-safe inserts
- After inserting, advances all sequences past the highest inserted ID to prevent conflicts with test-created rows

### Component 3: `scripts/extract-test-seed.ts`

CLI script to extract seed data from the live database.

**Usage:** `pnpm seed:extract`

**Behavior:**

- Loads `DATABASE_URL` from `.env`
- Connects via `pg` Pool
- Queries the following tables in FK-safe order:
  1. `leagues`
  2. `teams`
  3. `referees`
  4. `referee_roles`
  5. `venues`
  6. `standings`
  7. `matches`
  8. `match_overrides`
  9. `match_remote_versions`
  10. `match_local_versions`
  11. `match_changes`
  12. `match_referees`
  13. `referee_assignment_intents`
  14. `referee_assignment_rules`
  15. `app_settings`
- Writes `apps/api/src/test/fixtures/seed.json` with structure:

```json
{
  "extractedAt": "2026-03-18T10:00:00Z",
  "tables": {
    "leagues": [...],
    "teams": [...],
    ...
  }
}
```

**Excluded tables (and why):**

| Table | Reason |
|-------|--------|
| sync_runs, sync_run_entries, sync_schedule | Sync logging — transient, tests create their own |
| domain_events | Outbox — transient by nature |
| notifications, notification_log, digest_buffer | Generated output |
| watch_rules, channel_configs | User config — varies per test scenario |
| boards, board_columns, tasks, task_checklist_items, task_comments | Task management — tests create their own |
| venue_bookings, venue_booking_matches | Booking tests create their own scenarios |
| user, session, account, verification | Auth — contains credentials |
| push_devices | Device tokens — sensitive |
| player_photos, social_backgrounds | Peripheral media references |
| user_notification_preferences | User preferences — varies per test |

### Test File Pattern

The `vi.mock` + Proxy pattern must remain in each test file due to Vitest's hoisting rules. Everything else is centralized.

**Standard pattern (empty DB):**

```ts
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  db: new Proxy({}, {
    get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p],
  }),
}));

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(() => resetTestDb(ctx));
afterAll(() => closeTestDb(ctx));
```

**With seed data:**

Seeded tests load data once in `beforeAll` and do NOT call `resetTestDb` in `beforeEach`. Instead, each test must be written to be additive/idempotent against the seed data, or clean up its own rows. This avoids re-seeding on every test (slow) while keeping the realistic dataset intact across the file's tests.

```ts
import { seedTestDb } from "../../test/seed-test-db";

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
  await seedTestDb(ctx);
});
// No beforeEach resetTestDb — seed data persists across tests in this file
afterAll(() => closeTestDb(ctx));
```

If a specific seeded test file needs isolation between tests, it can re-seed in `beforeEach`:

```ts
beforeEach(async () => {
  await resetTestDb(ctx);
  await seedTestDb(ctx);
});
```

## Migration Strategy

### Phase 1: Build shared infrastructure

- Create `apps/api/src/test/setup-test-db.ts`
- Create `apps/api/src/test/seed-test-db.ts`
- Create `scripts/extract-test-seed.ts`
- Add `pnpm seed:extract` script to root `package.json`
- Run extraction, commit `seed.json` fixture
- Add tests for the helpers themselves

### Phase 2: Migrate existing PGlite tests

Migrate the 11 existing PGlite tests to use the shared helper. This removes ~800+ lines of duplicated CREATE TABLE SQL and ensures all tests use the real migration schema.

Files:
- `services/admin/sync-admin.service.test.ts`
- `services/admin/match-admin.service.test.ts`
- `services/admin/task.service.test.ts`
- `services/admin/board.service.test.ts`
- `services/admin/team-admin.service.test.ts`
- `services/admin/standings-admin.service.test.ts`
- `services/admin/venue-admin.service.test.ts`
- `services/admin/notification-admin.service.test.ts`
- `services/venue-booking/venue-booking.service.test.ts`
- `services/notifications/notification.service.test.ts`
- `services/notifications/channels/in-app.test.ts`

### Phase 3: Migrate high-value pure-mock tests to PGlite

Priority: sync services and workers that contain real query logic currently hidden behind mocks.

Files (highest value first):
- `services/sync/matches.sync.test.ts` — complex upserts, versioning, change tracking
- `services/sync/teams.sync.test.ts` — upserts with hash comparison
- `services/sync/venues.sync.test.ts` — upserts with conditional WHERE
- `services/sync/standings.sync.test.ts` — composite unique upserts
- `services/sync/referees.sync.test.ts` — multi-table upserts, intent tracking
- `services/sync/leagues.sync.test.ts` — basic upserts
- `services/events/outbox-poller.test.ts` — FOR UPDATE SKIP LOCKED
- `services/events/event-publisher.test.ts` — domain event inserts
- `services/referee/referee-match.service.test.ts` — complex EXISTS/NOT EXISTS queries
- `services/referee/referee-rules.service.test.ts` — transaction with cascading operations
- `services/admin/match-query.service.test.ts` — joins, aliases, pagination
- `services/admin/referee-admin.service.test.ts` — aggregates, DISTINCT ON, ILIKE
- `services/admin/booking-admin.service.test.ts` — subqueries, COALESCE
- `services/admin/event-admin.service.test.ts` — event queries
- `services/admin/channel-config-admin.service.test.ts` — config upserts
- `services/admin/watch-rule-admin.service.test.ts` — JSONB queries
- `services/admin/settings.service.test.ts` — settings upserts
- `services/admin/league-discovery.service.test.ts` — league lookups
- `services/social/match-social.service.test.ts` — joins with aliases
- `services/social/player-photo.service.test.ts` — upserts
- `services/social/background.service.test.ts` — transactions

### Phase 4: Optional — route & worker tests

Route tests that mock the service layer (not DB) stay as-is. Route tests that mock `db` directly can optionally migrate:

- `routes/admin/referee-rules.routes.test.ts`
- `routes/referee/match.routes.test.ts`
- `routes/device.routes.test.ts`
- `routes/public/team.routes.test.ts`
- `routes/admin/user.routes.test.ts`

Worker tests that only verify queue dispatch stay as mocks:
- `workers/sync.worker.test.ts`
- `workers/queues.test.ts`
- `workers/index.test.ts`
- `workers/event.worker.test.ts`
- `workers/digest.worker.test.ts`

### What stays as mocks (permanently)

- **Route tests mocking services** — testing HTTP contract, not queries
- **External service mocks** — SDK API calls, Redis/BullMQ queues
- **Logger mocks** — `vi.mock("../../config/logger")`
- **Worker tests verifying dispatch** — no DB queries involved

## `resetTestDb` Implementation Detail

Uses a single TRUNCATE statement for all tables rather than individual DELETEs:

```sql
TRUNCATE
  match_changes, match_remote_versions, match_local_versions,
  match_overrides, match_referees, referee_assignment_intents,
  referee_assignment_rules, referee_roles,
  referees, standings, matches, teams, venues, leagues,
  sync_run_entries, sync_runs, sync_schedule,
  domain_events, notifications, notification_log,
  digest_buffer, watch_rules, channel_configs,
  user_notification_preferences,
  venue_booking_matches, venue_bookings,
  board_columns, tasks, task_checklist_items,
  task_comments, boards,
  push_devices, player_photos, social_backgrounds,
  app_settings,
  "user", session, account, verification
CASCADE;
```

Auth tables (`"user"`, `session`, `account`, `verification`) are included in TRUNCATE even though they are excluded from seed data — any test that creates auth rows must have them cleared between runs.

Followed by sequence resets for all serial columns. The helper queries `pg_sequences` to auto-discover sequence names and reset them, avoiding a hard-coded list that drifts when tables are added.

## Seed Fixture Format

`apps/api/src/test/fixtures/seed.json`:

```json
{
  "extractedAt": "2026-03-18T10:00:00.000Z",
  "tables": {
    "leagues": [
      { "id": 1, "apiLigaId": 58001, "ligaNr": 4102, "name": "Regionalliga West", ... },
      ...
    ],
    "teams": [...],
    "venues": [...],
    "standings": [...],
    "matches": [...],
    "matchOverrides": [...],
    "matchRemoteVersions": [...],
    "matchLocalVersions": [...],
    "matchChanges": [...],
    "referees": [...],
    "refereeRoles": [...],
    "matchReferees": [...],
    "refereeAssignmentIntents": [...],
    "refereeAssignmentRules": [...],
    "appSettings": [...]
  }
}
```

Keys use camelCase (matching Drizzle table export names) for direct use with `db.insert(schema.leagues).values(seed.tables.leagues)`.

## Performance

- PGlite instance creation + migration: ~1.5s (measured)
- Seed loading (hundreds of rows): estimated <500ms
- Table truncate + sequence reset: <50ms
- Each test file gets its own PGlite instance (no shared state between files)
- Vitest runs test files in parallel by default — each gets independent PGlite

## File Structure

```
apps/api/
  src/test/
    setup-test-db.ts          # PGlite init, migrate, reset, close
    seed-test-db.ts            # Optional seed loader
    fixtures/
      seed.json                # Extracted realistic data
scripts/
  extract-test-seed.ts         # Seed extraction script
```
