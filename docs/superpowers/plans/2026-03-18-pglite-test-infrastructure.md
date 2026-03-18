# PGlite Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated PGlite boilerplate and hand-written CREATE TABLE SQL across 11 test files with a shared test helper that uses real Drizzle migrations, and add an opt-in seed data system extracted from the live database.

**Architecture:** Three components — (1) `setup-test-db.ts` creates PGlite, runs migrations, provides reset/close; (2) `seed-test-db.ts` loads a JSON fixture into the DB; (3) `scripts/extract-test-seed.ts` extracts seed data from the live database. The `vi.mock` + Proxy pattern stays in each test file (Vitest hoisting requirement), but all lifecycle logic is centralized.

**Tech Stack:** PGlite 0.3.15, drizzle-orm 0.45.1 (pglite adapter + migrator), Vitest 4, pg 8.19 (for extraction script)

**Spec:** `docs/superpowers/specs/2026-03-18-pglite-test-infrastructure-design.md`

---

### Task 1: Create `setup-test-db.ts` — shared PGlite helper

**Files:**
- Create: `apps/api/src/test/setup-test-db.ts`

- [ ] **Step 1: Create the setup-test-db module**

```ts
// apps/api/src/test/setup-test-db.ts
import type { PGlite } from "@electric-sql/pglite";
import * as path from "node:path";
import * as schema from "@dragons/db/schema";

type PgliteDatabase = import("drizzle-orm/pglite").PgliteDatabase<typeof schema>;

export interface TestDbContext {
  client: PGlite;
  db: PgliteDatabase;
}

export async function setupTestDb(): Promise<TestDbContext> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  const migrationsFolder = path.resolve(
    import.meta.dirname,
    "../../../../packages/db/drizzle",
  );
  await migrate(db, { migrationsFolder });

  return { client, db };
}

export async function resetTestDb(ctx: TestDbContext): Promise<void> {
  await ctx.client.exec(`
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
    CASCADE
  `);

  // Reset all sequences to 1
  const seqs = await ctx.client.query<{ sequencename: string }>(`
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  `);
  for (const row of seqs.rows) {
    await ctx.client.exec(
      `ALTER SEQUENCE "${row.sequencename}" RESTART WITH 1`,
    );
  }
}

export async function closeTestDb(ctx: TestDbContext): Promise<void> {
  await ctx.client.close();
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS (no type errors in new file)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/setup-test-db.ts
git commit -m "feat(test): add shared PGlite test helper with migration support"
```

---

### Task 2: Test the shared helper

**Files:**
- Create: `apps/api/src/test/setup-test-db.test.ts`

- [ ] **Step 1: Write tests for setup-test-db**

```ts
// apps/api/src/test/setup-test-db.test.ts
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "./setup-test-db";
import { leagues, teams, matches } from "@dragons/db/schema";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

describe("setupTestDb", () => {
  it("creates all expected tables", async () => {
    const result = await ctx.client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tableNames = result.rows.map((r) => r.table_name);

    expect(tableNames).toContain("leagues");
    expect(tableNames).toContain("teams");
    expect(tableNames).toContain("matches");
    expect(tableNames).toContain("venues");
    expect(tableNames).toContain("referees");
    expect(tableNames).toContain("domain_events");
    expect(tableNames).toContain("boards");
  });

  it("supports Drizzle ORM insert and select", async () => {
    const [league] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 58001,
        ligaNr: 4102,
        name: "Regionalliga West",
        seasonId: 100,
        seasonName: "2025/26",
      })
      .returning();

    expect(league.id).toBe(1);
    expect(league.name).toBe("Regionalliga West");
  });
});

describe("resetTestDb", () => {
  beforeEach(async () => {
    await resetTestDb(ctx);
  });

  it("truncates all data", async () => {
    await ctx.db.insert(leagues).values({
      apiLigaId: 99999,
      ligaNr: 1,
      name: "Test",
      seasonId: 1,
      seasonName: "Test",
    });

    await resetTestDb(ctx);

    const result = await ctx.db.select().from(leagues);
    expect(result).toEqual([]);
  });

  it("resets sequences to 1", async () => {
    const [first] = await ctx.db
      .insert(leagues)
      .values({
        apiLigaId: 1,
        ligaNr: 1,
        name: "First",
        seasonId: 1,
        seasonName: "Test",
      })
      .returning();

    expect(first.id).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @dragons/api exec vitest run src/test/setup-test-db.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/setup-test-db.test.ts
git commit -m "test: add tests for shared PGlite helper"
```

---

### Task 3: Create `seed-test-db.ts` — seed data loader

**Files:**
- Create: `apps/api/src/test/seed-test-db.ts`

- [ ] **Step 1: Create the seed loader module**

```ts
// apps/api/src/test/seed-test-db.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "@dragons/db/schema";
import type { TestDbContext } from "./setup-test-db";

interface SeedData {
  extractedAt: string;
  tables: {
    leagues?: Record<string, unknown>[];
    teams?: Record<string, unknown>[];
    referees?: Record<string, unknown>[];
    refereeRoles?: Record<string, unknown>[];
    venues?: Record<string, unknown>[];
    standings?: Record<string, unknown>[];
    matches?: Record<string, unknown>[];
    matchOverrides?: Record<string, unknown>[];
    matchRemoteVersions?: Record<string, unknown>[];
    matchLocalVersions?: Record<string, unknown>[];
    matchChanges?: Record<string, unknown>[];
    matchReferees?: Record<string, unknown>[];
    refereeAssignmentIntents?: Record<string, unknown>[];
    refereeAssignmentRules?: Record<string, unknown>[];
    appSettings?: Record<string, unknown>[];
  };
}

// FK-safe insertion order: each entry is [seedKey, drizzleTable]
const INSERTION_ORDER: [keyof SeedData["tables"], unknown][] = [
  ["leagues", schema.leagues],
  ["teams", schema.teams],
  ["referees", schema.referees],
  ["refereeRoles", schema.refereeRoles],
  ["venues", schema.venues],
  ["standings", schema.standings],
  ["matches", schema.matches],
  ["matchOverrides", schema.matchOverrides],
  ["matchRemoteVersions", schema.matchRemoteVersions],
  ["matchLocalVersions", schema.matchLocalVersions],
  ["matchChanges", schema.matchChanges],
  ["matchReferees", schema.matchReferees],
  ["refereeAssignmentIntents", schema.refereeAssignmentIntents],
  ["refereeAssignmentRules", schema.refereeAssignmentRules],
  ["appSettings", schema.appSettings],
];

export async function seedTestDb(ctx: TestDbContext): Promise<void> {
  const fixturePath = path.resolve(
    import.meta.dirname,
    "fixtures/seed.json",
  );
  const raw = fs.readFileSync(fixturePath, "utf-8");
  const seed: SeedData = JSON.parse(raw);

  for (const [key, table] of INSERTION_ORDER) {
    const rows = seed.tables[key];
    if (rows && rows.length > 0) {
      // Insert in batches of 100 to avoid parameter limits
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (ctx.db.insert(table as any).values(batch as any) as any);
      }
    }
  }

  // Advance sequences past the highest inserted IDs to prevent conflicts
  // when tests insert additional rows after seeding.
  // pg_get_serial_sequence returns the sequence owning a column, or null.
  const serialTables = await ctx.client.query<{
    table_name: string;
    seq_name: string;
  }>(`
    SELECT t.table_name, pg_get_serial_sequence(t.table_name, 'id') AS seq_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND pg_get_serial_sequence(t.table_name, 'id') IS NOT NULL
  `);
  for (const { table_name, seq_name } of serialTables.rows) {
    await ctx.client.exec(
      `SELECT setval('${seq_name}', COALESCE((SELECT MAX(id) FROM "${table_name}"), 1))`,
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/seed-test-db.ts
git commit -m "feat(test): add opt-in seed data loader for PGlite tests"
```

---

### Task 4: Create `extract-test-seed.ts` — seed extraction script

**Files:**
- Create: `scripts/extract-test-seed.ts`
- Modify: `package.json` (root) — add `seed:extract` script

- [ ] **Step 1: Create the extraction script**

```ts
// scripts/extract-test-seed.ts
import { config } from "dotenv";
config();

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env exists.");
  process.exit(1);
}

// Tables to extract in FK-safe order.
// Key = camelCase name used in seed.json (matches Drizzle schema export names).
// Value = actual PostgreSQL table name.
const TABLES: [string, string][] = [
  ["leagues", "leagues"],
  ["teams", "teams"],
  ["referees", "referees"],
  ["refereeRoles", "referee_roles"],
  ["venues", "venues"],
  ["standings", "standings"],
  ["matches", "matches"],
  ["matchOverrides", "match_overrides"],
  ["matchRemoteVersions", "match_remote_versions"],
  ["matchLocalVersions", "match_local_versions"],
  ["matchChanges", "match_changes"],
  ["matchReferees", "match_referees"],
  ["refereeAssignmentIntents", "referee_assignment_intents"],
  ["refereeAssignmentRules", "referee_assignment_rules"],
  ["appSettings", "app_settings"],
];

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const tables: Record<string, unknown[]> = {};

    for (const [key, tableName] of TABLES) {
      const result = await pool.query(`SELECT * FROM "${tableName}" ORDER BY id`);
      tables[key] = result.rows;
      console.log(`  ${tableName}: ${result.rows.length} rows`);
    }

    const seed = {
      extractedAt: new Date().toISOString(),
      tables,
    };

    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");

    const outDir = resolve(
      import.meta.dirname,
      "../apps/api/src/test/fixtures",
    );
    mkdirSync(outDir, { recursive: true });

    const outPath = resolve(outDir, "seed.json");
    writeFileSync(outPath, JSON.stringify(seed, null, 2) + "\n");
    console.log(`\nSeed data written to ${outPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Extraction failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `seed:extract` script to root `package.json`**

In `/Users/jn/git/dragons-all/package.json`, add to the `"scripts"` section:

```json
"seed:extract": "tsx scripts/extract-test-seed.ts"
```

The script also needs `pg` and `dotenv` at runtime, and `tsx` to execute. These are already available through the api workspace. Run it via: `pnpm --filter @dragons/api exec tsx ../../scripts/extract-test-seed.ts`. The `seed:extract` root script should use this approach:

```json
"seed:extract": "pnpm --filter @dragons/api exec tsx ../../scripts/extract-test-seed.ts"
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsx --help` (confirm tsx is available)
Expected: Prints tsx usage

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-test-seed.ts package.json
git commit -m "feat(test): add seed extraction script for PGlite test data"
```

---

### Task 5: Run seed extraction and commit fixture

**Files:**
- Create: `apps/api/src/test/fixtures/seed.json`
- Modify: `apps/api/vitest.config.ts` — exclude `src/test/` from coverage

**Prerequisites:** A running PostgreSQL database with data (the dev database).

- [ ] **Step 1: Start the database if not running**

Run: `docker compose -f docker/docker-compose.dev.yml up -d`

- [ ] **Step 2: Run the extraction**

Run: `pnpm seed:extract`
Expected: Output listing row counts per table, then "Seed data written to ..."

- [ ] **Step 3: Verify the fixture file was created**

Run: `ls -la apps/api/src/test/fixtures/seed.json`
Expected: File exists, size in the range of 100KB-5MB

- [ ] **Step 4: Exclude test helpers from coverage**

In `apps/api/vitest.config.ts`, add `"src/test/**"` to the coverage exclude list:

```ts
exclude: [
  "src/**/*.test.ts",
  "src/index.ts",
  "src/services/test.ts",
  "src/services/social/templates/**/*.tsx",
  "src/test/**",  // <-- add this line
],
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/test/fixtures/seed.json apps/api/vitest.config.ts
git commit -m "feat(test): add extracted seed data fixture and exclude test helpers from coverage"
```

---

### Task 6: Migrate `board.service.test.ts` — first PGlite test migration

This is the template migration. All subsequent PGlite test migrations follow the same pattern.

**Files:**
- Modify: `apps/api/src/services/admin/board.service.test.ts`

- [ ] **Step 1: Replace the boilerplate**

Remove the following from `board.service.test.ts`:
- The `import type { PGlite }` line (line 2)
- The entire `CREATE_TABLES` string (lines 33-72)
- The `let client: PGlite;` declaration (line 74)
- The `beforeAll` block that creates PGlite, drizzle, and runs CREATE_TABLES (lines 76-84)
- The entire `beforeEach` block with manual DELETE and ALTER SEQUENCE statements (lines 86-94)
- The `afterAll` block (lines 96-98)

Add in their place:

```ts
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

// ... after the vi.mock block and service imports ...

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});
```

Also update any `client.exec(...)` or `client.query(...)` calls in the test body to use `ctx.client.exec(...)` or `ctx.client.query(...)`.

- [ ] **Step 2: Run the test file**

Run: `pnpm --filter @dragons/api exec vitest run src/services/admin/board.service.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/admin/board.service.test.ts
git commit -m "refactor(test): migrate board.service.test.ts to shared PGlite helper"
```

---

### Task 7: Migrate remaining 10 PGlite test files

Each file follows the same pattern as Task 6. For each file:
1. Remove `import type { PGlite }`, `CREATE_TABLES` string, manual `beforeAll`/`beforeEach`/`afterAll`
2. Add import of shared helper, replace with `setupTestDb`/`resetTestDb`/`closeTestDb`
3. Replace `client.` with `ctx.client.`
4. Run the individual test file to confirm it passes

**Files to migrate (all under `apps/api/src/`):**

- [ ] **Step 1: Migrate `services/admin/venue-admin.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/admin/venue-admin.service.test.ts`

- [ ] **Step 2: Migrate `services/admin/team-admin.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/admin/team-admin.service.test.ts`

- [ ] **Step 3: Migrate `services/admin/standings-admin.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/admin/standings-admin.service.test.ts`

- [ ] **Step 4: Migrate `services/admin/sync-admin.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/admin/sync-admin.service.test.ts`

- [ ] **Step 5: Migrate `services/admin/match-admin.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/admin/match-admin.service.test.ts`

- [ ] **Step 6: Migrate `services/admin/task.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/admin/task.service.test.ts`

- [ ] **Step 7: Migrate `services/admin/notification-admin.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/admin/notification-admin.service.test.ts`

- [ ] **Step 8: Migrate `services/venue-booking/venue-booking.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/venue-booking/venue-booking.service.test.ts`

- [ ] **Step 9: Migrate `services/notifications/notification.service.test.ts`**

Run after: `pnpm --filter @dragons/api exec vitest run src/services/notifications/notification.service.test.ts`

- [ ] **Step 10: Migrate `services/notifications/channels/in-app.test.ts`**

**Special handling:** This file inserts prerequisite FK rows (`domain_events`, `channel_configs`) in `beforeAll` and only cleans `notification_log` in `beforeEach`. Since `resetTestDb` truncates ALL tables, these prerequisite rows would be lost. Fix: move the prerequisite inserts into a helper function and call it in `beforeEach` after `resetTestDb`:

```ts
async function insertPrerequisites() {
  await ctx.client.exec(`
    INSERT INTO domain_events (id, type, source, urgency, entity_type, entity_id, entity_name, deep_link_path, payload)
    VALUES ('evt-001', 'match.cancelled', 'sync', 'immediate', 'match', 1, 'Test Match', '/matches/1', '{}');
  `);
  await ctx.client.exec(`INSERT INTO channel_configs (id) VALUES (1);`);
}

beforeEach(async () => {
  await resetTestDb(ctx);
  await insertPrerequisites();
  vi.clearAllMocks();
});
```

Run after: `pnpm --filter @dragons/api exec vitest run src/services/notifications/channels/in-app.test.ts`

- [ ] **Step 11: Run full test suite**

Run: `pnpm --filter @dragons/api test`
Expected: All tests PASS. No regressions.

- [ ] **Step 12: Commit all migrations**

```bash
git add -A apps/api/src/services/
git commit -m "refactor(test): migrate all 10 remaining PGlite tests to shared helper"
```

---

### Task 8: Verify full suite and coverage

- [ ] **Step 1: Run full test suite with coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: All tests pass. Coverage thresholds met (90% branches, 95% functions/lines/statements).

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: No type errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No lint errors.

- [ ] **Step 4: Commit any fixups if needed**

---

## Reference: Migration pattern for each PGlite test file

For every file being migrated, apply these changes:

**Remove:**
```ts
import type { PGlite } from "@electric-sql/pglite";
```
```ts
const CREATE_TABLES = `...`;  // the entire multi-line SQL string
```
```ts
let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");
  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);
  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM ...");
  // ... all the DELETE and ALTER SEQUENCE lines
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});
```

**Add:**
```ts
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
```
(adjust relative path based on file depth — for `services/notifications/channels/in-app.test.ts` it would be `../../../test/setup-test-db`)

```ts
let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});
```

**Replace in test body:**
- `client.exec(...)` → `ctx.client.exec(...)`
- `client.query(...)` → `ctx.client.query(...)`
- `client.close()` → already handled by `closeTestDb`

**Keep unchanged:**
- The `vi.hoisted` + `vi.mock("../../config/database", ...)` block — this MUST stay in each file
- All other `vi.mock(...)` calls (logger, queues, etc.)
- All test cases and assertions
- All helper functions in the test file (they just need `client` → `ctx.client`)
