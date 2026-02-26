import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../../workers/queues", () => ({
  updateSyncSchedule: vi.fn(),
}));

// --- Imports (after mocks) ---

import {
  getSyncStatus,
  getSyncLogs,
  getSyncRun,
  getSyncRunEntries,
  getSchedule,
  upsertSchedule,
  getMatchChangesForEntry,
} from "./sync-admin.service";
import { updateSyncSchedule } from "../../workers/queues";

// --- PgLite setup ---

const CREATE_TABLES = `
  CREATE TABLE sync_runs (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    triggered_by VARCHAR(50) NOT NULL,
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_message TEXT,
    error_stack TEXT,
    summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX sync_runs_started_at_idx ON sync_runs(started_at);

  CREATE TABLE sync_run_entries (
    id SERIAL PRIMARY KEY,
    sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    entity_type VARCHAR(20) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    entity_name VARCHAR(255),
    action VARCHAR(20) NOT NULL,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX sync_run_entries_run_entity_idx ON sync_run_entries(sync_run_id, entity_type);
  CREATE INDEX sync_run_entries_run_action_idx ON sync_run_entries(sync_run_id, action);

  CREATE TABLE sync_schedule (
    id SERIAL PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cron_expression VARCHAR(100) NOT NULL DEFAULT '0 4 * * *',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/Berlin',
    last_updated_at TIMESTAMPTZ,
    last_updated_by VARCHAR(255)
  );

  CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    api_match_id INTEGER NOT NULL UNIQUE,
    match_no INTEGER,
    match_day INTEGER,
    kickoff_date DATE,
    kickoff_time TIME,
    current_remote_version INTEGER DEFAULT 0,
    current_local_version INTEGER DEFAULT 0,
    remote_data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE match_remote_versions (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    sync_run_id INTEGER,
    snapshot JSONB NOT NULL,
    data_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, version_number)
  );

  CREATE TABLE match_changes (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    track VARCHAR(10) NOT NULL,
    version_number INTEGER NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM match_changes");
  await client.exec("DELETE FROM match_remote_versions");
  await client.exec("DELETE FROM matches");
  await client.exec("DELETE FROM sync_run_entries");
  await client.exec("DELETE FROM sync_runs");
  await client.exec("DELETE FROM sync_schedule");
  // Reset serial sequences so IDs are predictable
  await client.exec("ALTER SEQUENCE sync_runs_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE sync_run_entries_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE sync_schedule_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE matches_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE match_remote_versions_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE match_changes_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function insertSyncRun(overrides: Record<string, unknown> = {}) {
  const defaults = {
    sync_type: "full",
    status: "completed",
    triggered_by: "manual",
    started_at: "2025-01-01T10:00:00Z",
    completed_at: "2025-01-01T10:05:00Z",
    duration_ms: 300000,
    records_processed: 100,
    records_created: 50,
    records_updated: 30,
    records_failed: 0,
    records_skipped: 20,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO sync_runs (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertEntry(syncRunId: number, overrides: Record<string, unknown> = {}) {
  const defaults = {
    sync_run_id: syncRunId,
    entity_type: "league",
    entity_id: "1",
    entity_name: "Test League",
    action: "created",
    message: "Created league",
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(`INSERT INTO sync_run_entries (${cols.join(", ")}) VALUES (${placeholders})`, vals);
}

// --- Tests ---

describe("getSyncStatus", () => {
  it("returns null lastSync when no runs exist", async () => {
    const result = await getSyncStatus();

    expect(result).toEqual({ lastSync: null, isRunning: false });
  });

  it("returns the most recent sync run", async () => {
    await insertSyncRun({ started_at: "2025-01-01T08:00:00Z" });
    await insertSyncRun({ started_at: "2025-01-01T12:00:00Z" });

    const result = await getSyncStatus();

    expect(result.lastSync).not.toBeNull();
    expect(result.lastSync!.id).toBe(2);
    expect(result.isRunning).toBe(false);
  });

  it("detects a running sync", async () => {
    await insertSyncRun({ status: "running", completed_at: null });

    const result = await getSyncStatus();

    expect(result.isRunning).toBe(true);
    expect(result.lastSync).not.toBeNull();
  });
});

describe("getSyncLogs", () => {
  it("returns empty list when no runs", async () => {
    const result = await getSyncLogs({ limit: 20, offset: 0 });

    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0, hasMore: false });
  });

  it("returns paginated results", async () => {
    for (let i = 0; i < 5; i++) {
      await insertSyncRun({ started_at: `2025-01-0${i + 1}T10:00:00Z` });
    }

    const result = await getSyncLogs({ limit: 2, offset: 0 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(true);
  });

  it("handles offset correctly", async () => {
    for (let i = 0; i < 3; i++) {
      await insertSyncRun({ started_at: `2025-01-0${i + 1}T10:00:00Z` });
    }

    const result = await getSyncLogs({ limit: 20, offset: 2 });

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it("filters by status", async () => {
    await insertSyncRun({ status: "completed" });
    await insertSyncRun({ status: "failed" });
    await insertSyncRun({ status: "completed" });

    const result = await getSyncLogs({ limit: 20, offset: 0, status: "failed" });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0]!.status).toBe("failed");
  });

  it("returns all when no status filter", async () => {
    await insertSyncRun({ status: "completed" });
    await insertSyncRun({ status: "failed" });

    const result = await getSyncLogs({ limit: 20, offset: 0 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

describe("getSyncRun", () => {
  it("returns null for non-existent run", async () => {
    const result = await getSyncRun(999);

    expect(result).toBeNull();
  });

  it("returns the sync run by id", async () => {
    const id = await insertSyncRun();

    const result = await getSyncRun(id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);
    expect(result!.syncType).toBe("full");
    expect(result!.triggeredBy).toBe("manual");
  });
});

describe("getSyncRunEntries", () => {
  it("returns entries with summary counts", async () => {
    const runId = await insertSyncRun();
    await insertEntry(runId, { action: "created", entity_type: "league" });
    await insertEntry(runId, { action: "created", entity_type: "team" });
    await insertEntry(runId, { action: "updated", entity_type: "match" });
    await insertEntry(runId, { action: "skipped", entity_type: "venue" });

    const result = await getSyncRunEntries(runId, { limit: 20, offset: 0 });

    expect(result.items).toHaveLength(4);
    expect(result.total).toBe(4);
    expect(result.summary).toEqual({ created: 2, updated: 1, skipped: 1, failed: 0 });
  });

  it("filters by entityType", async () => {
    const runId = await insertSyncRun();
    await insertEntry(runId, { entity_type: "league" });
    await insertEntry(runId, { entity_type: "team" });

    const result = await getSyncRunEntries(runId, { limit: 20, offset: 0, entityType: "league" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.entityType).toBe("league");
  });

  it("filters by action", async () => {
    const runId = await insertSyncRun();
    await insertEntry(runId, { action: "created" });
    await insertEntry(runId, { action: "updated" });
    await insertEntry(runId, { action: "failed" });

    const result = await getSyncRunEntries(runId, { limit: 20, offset: 0, action: "failed" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.action).toBe("failed");
  });

  it("filters by both entityType and action", async () => {
    const runId = await insertSyncRun();
    await insertEntry(runId, { entity_type: "league", action: "created" });
    await insertEntry(runId, { entity_type: "league", action: "updated" });
    await insertEntry(runId, { entity_type: "team", action: "created" });

    const result = await getSyncRunEntries(runId, {
      limit: 20,
      offset: 0,
      entityType: "league",
      action: "created",
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("paginates entries", async () => {
    const runId = await insertSyncRun();
    for (let i = 0; i < 5; i++) {
      await insertEntry(runId, { entity_id: String(i) });
    }

    const result = await getSyncRunEntries(runId, { limit: 2, offset: 0 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(true);
  });
});

describe("getSchedule", () => {
  it("returns defaults when no schedule exists", async () => {
    const result = await getSchedule();

    expect(result).toEqual({
      id: null,
      enabled: true,
      cronExpression: "0 4 * * *",
      timezone: "Europe/Berlin",
      lastUpdatedAt: null,
      lastUpdatedBy: null,
    });
  });

  it("returns existing schedule", async () => {
    await client.exec(`
      INSERT INTO sync_schedule (enabled, cron_expression, timezone, last_updated_by)
      VALUES (false, '0 6 * * *', 'UTC', 'admin')
    `);

    const result = await getSchedule();

    expect(result.enabled).toBe(false);
    expect(result.cronExpression).toBe("0 6 * * *");
    expect(result.timezone).toBe("UTC");
  });
});

describe("upsertSchedule", () => {
  it("inserts a new schedule with defaults", async () => {
    const result = await upsertSchedule({});

    expect(result).toBeDefined();
    expect(result!.enabled).toBe(true);
    expect(result!.cronExpression).toBe("0 4 * * *");
    expect(result!.timezone).toBe("Europe/Berlin");
    expect(result!.lastUpdatedAt).toBeInstanceOf(Date);
    expect(updateSyncSchedule).toHaveBeenCalledWith(true, "0 4 * * *", "Europe/Berlin");
  });

  it("inserts with provided values", async () => {
    const result = await upsertSchedule({
      enabled: false,
      cronExpression: "*/30 * * * *",
      timezone: "UTC",
      updatedBy: "admin",
    });

    expect(result!.enabled).toBe(false);
    expect(result!.cronExpression).toBe("*/30 * * * *");
    expect(result!.timezone).toBe("UTC");
    expect(result!.lastUpdatedBy).toBe("admin");
  });

  it("updates an existing schedule", async () => {
    // First insert
    await upsertSchedule({ enabled: true, cronExpression: "0 4 * * *" });
    vi.clearAllMocks();

    // Then update
    const result = await upsertSchedule({ cronExpression: "0 6 * * *", updatedBy: "someone" });

    expect(result!.cronExpression).toBe("0 6 * * *");
    expect(result!.enabled).toBe(true); // Preserved from original
    expect(result!.lastUpdatedBy).toBe("someone");
    expect(updateSyncSchedule).toHaveBeenCalledWith(true, "0 6 * * *", "Europe/Berlin");
  });

  it("preserves unmodified fields on update", async () => {
    await upsertSchedule({ enabled: false, cronExpression: "*/5 * * * *", timezone: "UTC" });
    vi.clearAllMocks();

    const result = await upsertSchedule({ timezone: "America/New_York" });

    expect(result!.enabled).toBe(false);
    expect(result!.cronExpression).toBe("*/5 * * * *");
    expect(result!.timezone).toBe("America/New_York");
  });
});

// --- Match changes helpers ---

async function insertMatch(apiMatchId: number) {
  const result = await client.query(
    "INSERT INTO matches (api_match_id) VALUES ($1) RETURNING id",
    [apiMatchId],
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertRemoteVersion(matchId: number, versionNumber: number, syncRunId: number) {
  await client.query(
    `INSERT INTO match_remote_versions (match_id, version_number, sync_run_id, snapshot, data_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [matchId, versionNumber, syncRunId, JSON.stringify({}), "hash123"],
  );
}

async function insertMatchChange(
  matchId: number,
  versionNumber: number,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
) {
  await client.query(
    `INSERT INTO match_changes (match_id, track, version_number, field_name, old_value, new_value)
     VALUES ($1, 'remote', $2, $3, $4, $5)`,
    [matchId, versionNumber, fieldName, oldValue, newValue],
  );
}

describe("getMatchChangesForEntry", () => {
  it("returns changes for a valid match and sync run", async () => {
    const syncRunId = await insertSyncRun();
    const matchId = await insertMatch(5001);
    await insertRemoteVersion(matchId, 2, syncRunId);
    await insertMatchChange(matchId, 2, "homeScore", "0", "85");
    await insertMatchChange(matchId, 2, "guestScore", "0", "72");

    const result = await getMatchChangesForEntry(syncRunId, 5001);

    expect(result).not.toBeNull();
    expect(result!.changes).toHaveLength(2);
    expect(result!.changes).toEqual(
      expect.arrayContaining([
        { fieldName: "homeScore", oldValue: "0", newValue: "85" },
        { fieldName: "guestScore", oldValue: "0", newValue: "72" },
      ]),
    );
  });

  it("returns null when match does not exist", async () => {
    const syncRunId = await insertSyncRun();

    const result = await getMatchChangesForEntry(syncRunId, 9999);

    expect(result).toBeNull();
  });

  it("returns null when no version exists for the sync run", async () => {
    const syncRunId = await insertSyncRun();
    const otherSyncRunId = await insertSyncRun();
    const matchId = await insertMatch(5002);
    await insertRemoteVersion(matchId, 1, otherSyncRunId);

    const result = await getMatchChangesForEntry(syncRunId, 5002);

    expect(result).toBeNull();
  });

  it("returns empty changes when version exists but no changes recorded", async () => {
    const syncRunId = await insertSyncRun();
    const matchId = await insertMatch(5003);
    await insertRemoteVersion(matchId, 1, syncRunId);

    const result = await getMatchChangesForEntry(syncRunId, 5003);

    expect(result).not.toBeNull();
    expect(result!.changes).toHaveLength(0);
  });

  it("only returns remote track changes, not local", async () => {
    const syncRunId = await insertSyncRun();
    const matchId = await insertMatch(5004);
    await insertRemoteVersion(matchId, 1, syncRunId);
    await insertMatchChange(matchId, 1, "homeScore", "0", "90");
    // Insert a local track change that should be excluded
    await client.query(
      `INSERT INTO match_changes (match_id, track, version_number, field_name, old_value, new_value)
       VALUES ($1, 'local', $2, $3, $4, $5)`,
      [matchId, 1, "notes", null, "edited"],
    );

    const result = await getMatchChangesForEntry(syncRunId, 5004);

    expect(result!.changes).toHaveLength(1);
    expect(result!.changes[0]).toEqual({ fieldName: "homeScore", oldValue: "0", newValue: "90" });
  });
});
