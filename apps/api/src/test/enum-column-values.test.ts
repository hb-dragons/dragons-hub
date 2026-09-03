import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as shared from "@dragons/shared";
import { setupTestDb, closeTestDb, type TestDbContext } from "./setup-test-db";

/**
 * SQL→TS drift guard for enum-like columns.
 *
 * Several text/varchar columns are "enums by convention": the type they are read
 * as in TypeScript comes from a const array in `@dragons/shared`, but Postgres
 * accepts any string. Nothing type-checks a literal inside a `.sql` migration,
 * which is how `0030` seeded `channel_configs.digest_mode = 'immediate'` — a
 * member of `EVENT_URGENCIES`, not of `DigestMode`. Every database built from
 * migrations then carried a row contradicting the type it is read as (#125).
 *
 * `#97` closed the TS→TS half of this (schemas restating literals instead of
 * deriving them). This closes the SQL→TS half: the database under test is built
 * by the real migration chain, so a seed, default or backfill that writes a
 * value outside the shared array fails here.
 *
 * `packages/db` has no test runner, so — as with the `db:push` and migration
 * index guards (#103) — it lives in `apps/api`.
 */
let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

/** How a column stores the value(s) governed by the shared array. */
type Storage =
  /** One value per row. */
  | { kind: "scalar" }
  /** A `text[]` column; every element is governed. */
  | { kind: "array" }
  /** Several values packed into one string (better-auth's `user.role`). */
  | { kind: "separated"; separator: string };

interface EnumColumn {
  table: string;
  column: string;
  /**
   * Name of the governing export in `@dragons/shared`. A name rather than the
   * array itself so the completeness check below can tell which shared arrays
   * are already accounted for.
   */
  constant: string;
  storage?: Storage;
  /** Why this column is governed by that array, when the pairing isn't obvious. */
  note?: string;
}

/**
 * Every column whose values are governed by a shared const array.
 *
 * Adding a row here is what puts a column under the guard. The completeness
 * test below forces the reverse direction: a new shared array must either be
 * mapped to its column(s) here or be listed in `NOT_PERSISTED`.
 */
const ENUM_COLUMNS: readonly EnumColumn[] = [
  { table: "channel_configs", column: "type", constant: "CHANNEL_TYPES" },
  { table: "channel_configs", column: "digest_mode", constant: "DIGEST_MODES" },
  { table: "sync_runs", column: "status", constant: "SYNC_STATUSES" },
  { table: "seasons", column: "status", constant: "SEASON_STATUSES" },
  { table: "team_staff", column: "role", constant: "TEAM_STAFF_ROLES" },
  { table: "sync_run_entries", column: "entity_type", constant: "ENTITY_TYPES" },
  { table: "sync_run_entries", column: "action", constant: "ENTRY_ACTIONS" },
  { table: "tasks", column: "priority", constant: "TASK_PRIORITIES" },
  { table: "venue_bookings", column: "status", constant: "BOOKING_STATUSES" },
  {
    table: "domain_events",
    column: "type",
    constant: "STORED_EVENT_TYPE_VALUES",
    note: "the stored vocabulary, wider than the publishable EVENT_TYPE_VALUES: publishSystemEvent writes admin.test_push (#154)",
  },
  { table: "domain_events", column: "urgency", constant: "EVENT_URGENCIES" },
  {
    table: "domain_events",
    column: "entity_type",
    constant: "STORED_EVENT_ENTITY_TYPES",
    note: "likewise wider than EVENT_ENTITY_TYPES: a system event is about an account, so it stores 'user'",
  },
  {
    table: "domain_events",
    column: "source",
    constant: "EVENT_SOURCES",
    note: "only guardable since #155 gave EventSource a const array; it was a bare type union before",
  },
  {
    table: "watch_rules",
    column: "urgency_override",
    constant: "EVENT_URGENCIES",
    note: "nullable — NULL means 'keep the event's own urgency'",
  },
  {
    table: "watch_rules",
    column: "event_types",
    constant: "EVENT_TYPE_VALUES",
    storage: { kind: "array" },
    note: "a rule listing an unknown event type never fires",
  },
  {
    table: "user_notification_preferences",
    column: "muted_event_types",
    constant: "USER_TOGGLEABLE_EVENT_TYPES",
    storage: { kind: "array" },
    // Was registered against EVENT_TYPE_VALUES (issue #156), which is seven
    // times wider than what this column accepts: muting is only offered for
    // the four task events addressed to a person.
    note: "muting an unknown type silences nothing",
  },
  {
    table: "user",
    column: "role",
    constant: "ROLE_NAMES",
    storage: { kind: "separated", separator: "," },
    note: "better-auth packs multiple roles into one column; parseRoles() drops unknown ones, so a bad value is silently ignored rather than rejected — migration 0028 cleaned two of them out",
  },
];

/**
 * Shared string arrays that are deliberately not persisted as a column. Each
 * needs a reason, so the completeness check reads as a decision rather than a
 * skip list.
 */
const NOT_PERSISTED: Readonly<Record<string, string>> = {
  SURFACE_GROUP_ORDER: "navigation shell ordering; never written to the database",
  COLOR_PRESET_KEYS: "team colour presets are stored as the resolved hex values, not the key",
  EVENT_ENTITY_TYPES:
    "the *publishable* entity types, which triggerEventSchema validates against; domain_events.entity_type is governed by the wider STORED_EVENT_ENTITY_TYPES above",
  SYSTEM_EVENT_TYPES:
    "a component of STORED_EVENT_TYPE_VALUES, which is what guards the column; kept separate so the manual trigger and watch rules cannot name admin.test_push",
  SYSTEM_EVENT_ENTITY_TYPES:
    "likewise a component of STORED_EVENT_ENTITY_TYPES rather than a column's governing array in its own right",
};

/** Every export of `@dragons/shared` that is an array of strings. */
function sharedStringArrays(): Map<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const [name, value] of Object.entries(shared)) {
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      found.set(name, value as readonly string[]);
    }
  }
  return found;
}

const SHARED_ARRAYS = sharedStringArrays();

function allowedValues(constant: string): readonly string[] {
  const values = SHARED_ARRAYS.get(constant);
  if (!values) {
    throw new Error(
      `@dragons/shared exports no string array named ${constant} — the registry in this test is stale`,
    );
  }
  return values;
}

/** SQL that yields one row per governed value stored in the column. */
function valueExpression(spec: EnumColumn): string {
  const column = `"${spec.column}"`;
  const storage: Storage = spec.storage ?? { kind: "scalar" };
  switch (storage.kind) {
    case "array":
      return `unnest(${column})`;
    case "separated":
      return `trim(unnest(string_to_array(${column}, '${storage.separator}')))`;
    case "scalar":
      return column;
  }
}

/** Distinct stored values that are not members of the governing shared array. */
async function offendingValues(spec: EnumColumn): Promise<string[]> {
  const allowed = allowedValues(spec.constant);
  const result = await ctx.client.query<{ value: string | null }>(
    `SELECT DISTINCT ${valueExpression(spec)} AS value
       FROM "${spec.table}" WHERE "${spec.column}" IS NOT NULL`,
  );
  return result.rows
    .map((r) => r.value)
    .filter((v): v is string => v !== null && v !== "")
    .filter((v) => !allowed.includes(v))
    .sort();
}

/** The literal in a column DEFAULT, or undefined when there is none. */
async function defaultLiteral(spec: EnumColumn): Promise<string | undefined> {
  const result = await ctx.client.query<{ column_default: string | null }>(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [spec.table, spec.column],
  );
  const raw = result.rows[0]?.column_default;
  if (!raw) return undefined;
  // Postgres renders these as `'per_sync'::character varying` / `'{}'::text[]`.
  return /^'(.*)'::/.exec(raw)?.[1];
}

const label = (spec: EnumColumn) => `${spec.table}.${spec.column} (${spec.constant})`;

describe("enum-like columns hold only values from their shared const array", () => {
  it.each(ENUM_COLUMNS.map((spec) => [label(spec), spec] as const))(
    "%s",
    async (_name, spec) => {
      expect(await offendingValues(spec)).toEqual([]);
    },
  );

  /**
   * A seeded column with no rows yet still carries a default, and a drifted
   * default writes a bad value into the first row anyone inserts.
   */
  it.each(ENUM_COLUMNS.map((spec) => [label(spec), spec] as const))(
    "%s has a default inside the array, if it has one",
    async (_name, spec) => {
      const value = await defaultLiteral(spec);
      // Array columns default to '{}', which contains nothing to check.
      if (value === undefined || value === "{}") return;
      expect(allowedValues(spec.constant)).toContain(value);
    },
  );

  it.each(ENUM_COLUMNS.map((spec) => [label(spec), spec] as const))(
    "%s exists in the migration-built schema",
    async (_name, spec) => {
      const result = await ctx.client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [spec.table, spec.column],
      );
      expect(result.rows[0]?.count).toBe("1");
    },
  );
});

describe("the guard itself", () => {
  it("reports a value written outside the shared array", async () => {
    const spec = ENUM_COLUMNS.find((s) => s.column === "digest_mode")!;
    await ctx.client.query(
      `INSERT INTO "channel_configs" ("name", "type", "enabled", "config", "digest_mode")
       VALUES ('drift probe', 'push', false, '{"provider":"expo"}'::jsonb, 'immediate')`,
    );
    try {
      // Exactly the failure #125 describes: migration 0030 wrote this literal.
      expect(await offendingValues(spec)).toEqual(["immediate"]);
    } finally {
      await ctx.client.query(`DELETE FROM "channel_configs" WHERE "name" = 'drift probe'`);
    }
    expect(await offendingValues(spec)).toEqual([]);
  });
});

describe("registry completeness", () => {
  it("accounts for every string-array export of @dragons/shared", () => {
    const registered = new Set(ENUM_COLUMNS.map((spec) => spec.constant));
    const unaccounted = [...SHARED_ARRAYS.keys()]
      .filter((name) => !registered.has(name) && !(name in NOT_PERSISTED))
      .sort();
    expect(unaccounted, "map each to its column in ENUM_COLUMNS, or record why it is not persisted in NOT_PERSISTED").toEqual([]);
  });

  it("keeps NOT_PERSISTED free of arrays that no longer exist", () => {
    const stale = Object.keys(NOT_PERSISTED).filter((name) => !SHARED_ARRAYS.has(name));
    expect(stale).toEqual([]);
  });
});
