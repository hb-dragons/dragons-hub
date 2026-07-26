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
      name: "Email Digest",
      type: "email",
      enabled: false,
      config: { locale: "en" } as ChannelConfig,
      digestMode: "scheduled",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
      createdAt,
      updatedAt,
    });

    expect(await getChannelConfig(id)).toEqual({
      id,
      name: "Email Digest",
      type: "email",
      enabled: false,
      config: { locale: "en" },
      digestMode: "scheduled",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
      createdAt: "2026-01-15T12:30:00.000Z",
      updatedAt: "2026-03-17T09:45:00.000Z",
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
      type: "email",
      enabled: false,
      config: { locale: "en" },
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
    ["config", { config: { locale: "en" as const } }, "config", { locale: "en" }],
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

describe("deleteChannelConfig", () => {
  it("removes only the addressed row and reports true", async () => {
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
});
