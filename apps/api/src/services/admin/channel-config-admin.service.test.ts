import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked. The previous
// version of this file replaced `eq`/`desc`/`count` with identity stubs and
// asserted on the arguments handed to a fake chain, so the `where`, the
// `orderBy` direction and the pagination arithmetic were all unverifiable —
// the row that came back was whatever the mock was told to return. Everything
// below runs against a real (in-process PGlite) Postgres.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  listChannelConfigs,
  getChannelConfig,
  createChannelConfig,
  updateChannelConfig,
  deleteChannelConfig,
} from "./channel-config-admin.service";
import { channelConfigs } from "@dragons/db/schema";
import type { ChannelConfig } from "@dragons/shared";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

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

// --- Helpers ---

interface SeedOptions {
  name?: string;
  type?: string;
  enabled?: boolean;
  config?: ChannelConfig;
  digestMode?: string;
  digestCron?: string | null;
  digestTimezone?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

async function seedConfig(opts: SeedOptions = {}): Promise<number> {
  const [row] = await ctx.db
    .insert(channelConfigs)
    .values({
      name: opts.name ?? "WhatsApp Eltern",
      type: opts.type ?? "whatsapp_group",
      enabled: opts.enabled ?? true,
      config: opts.config ?? ({ groupId: "abc", locale: "de" } as ChannelConfig),
      digestMode: opts.digestMode ?? "per_sync",
      digestCron: opts.digestCron ?? null,
      digestTimezone: opts.digestTimezone ?? "Europe/Berlin",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
    })
    .returning({ id: channelConfigs.id });
  return row!.id;
}

// --- Tests ---

describe("listChannelConfigs", () => {
  it("returns newest-first and pages with (page - 1) * limit", async () => {
    // createdAt ascending: oldest .. newest
    await seedConfig({ name: "oldest", createdAt: new Date("2026-03-01T00:00:00Z") });
    await seedConfig({ name: "middle", createdAt: new Date("2026-03-02T00:00:00Z") });
    await seedConfig({ name: "newest", createdAt: new Date("2026-03-03T00:00:00Z") });

    const page1 = await listChannelConfigs({ page: 1, limit: 2 });
    expect(page1.total).toBe(3);
    expect(page1.configs.map((c) => c.name)).toEqual(["newest", "middle"]);

    const page2 = await listChannelConfigs({ page: 2, limit: 2 });
    expect(page2.total).toBe(3);
    expect(page2.configs.map((c) => c.name)).toEqual(["oldest"]);
  });

  it("counts every row, not just the current page", async () => {
    for (let i = 0; i < 5; i++) {
      await seedConfig({ name: `cfg-${i}`, createdAt: new Date(`2026-03-0${i + 1}T00:00:00Z`) });
    }

    const result = await listChannelConfigs({ page: 1, limit: 2 });

    expect(result.configs).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  it("defaults to page=1, limit=20", async () => {
    for (let i = 0; i < 21; i++) {
      await seedConfig({ name: `cfg-${i}` });
    }

    const result = await listChannelConfigs({});

    expect(result.configs).toHaveLength(20);
    expect(result.total).toBe(21);
  });

  it("returns an empty page when nothing is stored", async () => {
    expect(await listChannelConfigs({})).toEqual({ configs: [], total: 0 });
  });
});

describe("getChannelConfig", () => {
  it("returns the config with the requested id, not just any row", async () => {
    const first = await seedConfig({ name: "first" });
    const second = await seedConfig({ name: "second" });

    expect((await getChannelConfig(first))!.name).toBe("first");
    expect((await getChannelConfig(second))!.name).toBe("second");
  });

  it("returns null when no row matches", async () => {
    await seedConfig();

    expect(await getChannelConfig(999)).toBeNull();
  });

  it("maps the row into the API shape with ISO timestamps", async () => {
    const createdAt = new Date("2026-01-15T12:30:00.000Z");
    const updatedAt = new Date("2026-03-17T09:45:00.000Z");
    const id = await seedConfig({
      name: "Nightly Digest",
      type: "in_app",
      enabled: false,
      config: { audienceRole: "admin", locale: "en" },
      digestMode: "scheduled",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
      createdAt,
      updatedAt,
    });

    expect(await getChannelConfig(id)).toEqual({
      id,
      name: "Nightly Digest",
      type: "in_app",
      enabled: false,
      config: { audienceRole: "admin", locale: "en" },
      digestMode: "scheduled",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
      createdAt: "2026-01-15T12:30:00.000Z",
      updatedAt: "2026-03-17T09:45:00.000Z",
    });
  });

  // `channel_configs.type` is plain text with no DB constraint, and `email` was
  // an offerable type until it turned out to have no adapter. A row left behind
  // by that era must still read back rather than throwing — it is the admin
  // UI's only route to seeing and deleting it.
  it("maps a row whose type is no longer offerable", async () => {
    const id = await seedConfig({
      name: "Legacy Email",
      type: "email",
      // A shape ChannelConfig deliberately no longer has, which is the point.
      config: { locale: "en" } as unknown as ChannelConfig,
    });

    expect(await getChannelConfig(id)).toMatchObject({
      type: "email",
      config: { locale: "en" },
    });
  });
});

describe("createChannelConfig", () => {
  it("persists the row and applies the documented defaults", async () => {
    const created = await createChannelConfig({
      name: "WhatsApp Eltern",
      type: "whatsapp_group",
      config: { groupId: "abc", locale: "de" },
    });

    expect(created.name).toBe("WhatsApp Eltern");
    expect(created.type).toBe("whatsapp_group");
    expect(created.enabled).toBe(true);
    expect(created.digestMode).toBe("per_sync");
    expect(created.digestCron).toBeNull();
    expect(created.digestTimezone).toBe("Europe/Berlin");

    // The row is really in the table with those values.
    expect(await getChannelConfig(created.id)).toEqual(created);
  });

  it("honours explicitly provided non-default values", async () => {
    const created = await createChannelConfig({
      name: "Nightly",
      type: "in_app",
      enabled: false,
      config: { audienceRole: "admin", locale: "en" },
      digestMode: "scheduled",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
    });

    expect(created).toMatchObject({
      enabled: false,
      digestMode: "scheduled",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
    });
  });
});

describe("updateChannelConfig", () => {
  it("changes only the provided field and leaves the rest intact", async () => {
    const id = await seedConfig({ name: "Original", enabled: true, digestMode: "per_sync" });

    const updated = await updateChannelConfig(id, { name: "Renamed" });

    expect(updated!.name).toBe("Renamed");
    expect(updated!.enabled).toBe(true);
    expect(updated!.digestMode).toBe("per_sync");
    // `type` is immutable and must survive an update.
    expect(updated!.type).toBe("whatsapp_group");
  });

  it("updates only the addressed row", async () => {
    const target = await seedConfig({ name: "target" });
    const bystander = await seedConfig({ name: "bystander" });

    await updateChannelConfig(target, { name: "renamed" });

    expect((await getChannelConfig(bystander))!.name).toBe("bystander");
  });

  it("returns null when the id does not exist", async () => {
    await seedConfig();

    expect(await updateChannelConfig(999, { name: "Nope" })).toBeNull();
  });

  it.each([
    ["enabled", { enabled: false }, "enabled", false],
    [
      "config",
      { config: { audienceRole: "admin" as const, locale: "en" as const } },
      "config",
      { audienceRole: "admin", locale: "en" },
    ],
    ["digestMode", { digestMode: "scheduled" as const }, "digestMode", "scheduled"],
    ["digestCron", { digestCron: "0 8 * * *" }, "digestCron", "0 8 * * *"],
    ["digestTimezone", { digestTimezone: "America/New_York" }, "digestTimezone", "America/New_York"],
  ])("persists %s when provided", async (_label, patch, field, expected) => {
    const id = await seedConfig();

    await updateChannelConfig(id, patch);

    const reread = await getChannelConfig(id);
    expect(reread![field as keyof typeof reread]).toEqual(expected);
  });

  it("advances updatedAt", async () => {
    const id = await seedConfig({ updatedAt: new Date("2020-01-01T00:00:00Z") });

    const updated = await updateChannelConfig(id, { name: "Renamed" });

    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThan(
      new Date("2020-01-01T00:00:00Z").getTime(),
    );
  });
});

/**
 * Deletion is a soft delete. A hard `DELETE` raised Postgres 23503 for any
 * config that had ever delivered a notification — `notification_log`'s
 * `channel_config_id` is NOT NULL and references this table — and surfaced as an
 * unhandled 500 on `DELETE /admin/channel-configs/:id`. `ON DELETE SET NULL` is
 * not available on a NOT NULL column, and cascading would delete users' in-app
 * notifications (notification_log *is* the inbox) to retire a delivery route.
 *
 * These cases run the real migrations, so the FK is real: a regression to a hard
 * delete fails here rather than in production.
 */
describe("deleteChannelConfig", () => {
  async function seedDeliveredNotification(channelConfigId: number): Promise<void> {
    await ctx.client.exec(`
      INSERT INTO domain_events
        (id, type, source, urgency, occurred_at, entity_type, entity_id, entity_name, deep_link_path, payload)
      VALUES
        ('evt-001', 'match.cancelled', 'sync', 'immediate', NOW(), 'match', 1, 'Test Match', '/matches/1', '{}');
    `);
    await ctx.client.exec(`
      INSERT INTO notification_log
        (event_id, channel_config_id, recipient_id, title, body, status, sent_at)
      VALUES
        ('evt-001', ${channelConfigId}, 'user:alice', 'Match cancelled', 'body', 'sent', NOW());
    `);
    await ctx.client.exec(`
      INSERT INTO digest_buffer (event_id, channel_config_id) VALUES ('evt-001', ${channelConfigId});
    `);
  }

  async function rows(sql: string): Promise<Record<string, unknown>[]> {
    const result = await ctx.client.query(sql);
    return result.rows as Record<string, unknown>[];
  }

  it("removes only the addressed row from view and reports true", async () => {
    const target = await seedConfig({ name: "target" });
    const bystander = await seedConfig({ name: "bystander" });

    expect(await deleteChannelConfig(target)).toBe(true);
    expect(await getChannelConfig(target)).toBeNull();
    expect(await getChannelConfig(bystander)).not.toBeNull();
  });

  it("reports false and deletes nothing when the id does not exist", async () => {
    await seedConfig();

    expect(await deleteChannelConfig(999)).toBe(false);
    expect((await listChannelConfigs({})).total).toBe(1);
  });

  it("succeeds for a config that has already delivered a notification", async () => {
    const id = await seedConfig();
    await seedDeliveredNotification(id);

    await expect(deleteChannelConfig(id)).resolves.toBe(true);
  });

  it("keeps the delivered notification_log rows", async () => {
    const id = await seedConfig();
    await seedDeliveredNotification(id);

    await deleteChannelConfig(id);

    const logs = await rows("SELECT * FROM notification_log");
    expect(logs).toHaveLength(1);
    expect(logs[0]!["channel_config_id"]).toBe(id);
  });

  it("drops the pending digest_buffer rows, which are work for a retired route", async () => {
    const id = await seedConfig();
    await seedDeliveredNotification(id);

    await deleteChannelConfig(id);

    expect(await rows("SELECT * FROM digest_buffer")).toHaveLength(0);
  });

  it("marks the row deleted and disables it, and hides it from the list", async () => {
    const id = await seedConfig();
    await seedDeliveredNotification(id);

    await deleteChannelConfig(id);

    expect(await listChannelConfigs({})).toEqual({ configs: [], total: 0 });
    const stored = await rows(`SELECT enabled, deleted_at FROM channel_configs WHERE id = ${id}`);
    expect(stored[0]!["enabled"]).toBe(false);
    expect(stored[0]!["deleted_at"]).not.toBeNull();
  });

  it("returns false for a config that was already retired", async () => {
    const id = await seedConfig();

    expect(await deleteChannelConfig(id)).toBe(true);
    expect(await deleteChannelConfig(id)).toBe(false);
  });

  it("cannot be resurrected by an update", async () => {
    const id = await seedConfig();
    await deleteChannelConfig(id);

    expect(await updateChannelConfig(id, { enabled: true })).toBeNull();
    const stored = await rows(`SELECT enabled FROM channel_configs WHERE id = ${id}`);
    expect(stored[0]!["enabled"]).toBe(false);
  });
});
