import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";
import type { FilterCondition, ChannelTarget } from "@dragons/shared";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked. The previous
// version of this file asserted on the arguments passed to a fake chain, so
// `where(eq(watchRules.id, id))` could have addressed any id and the canned
// row still came back. Everything below runs against a real (in-process
// PGlite) Postgres, including the jsonb round-trip of `filters`/`channels`.

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
  listWatchRules,
  getWatchRule,
  createWatchRule,
  updateWatchRule,
  deleteWatchRule,
} from "./watch-rule-admin.service";
import { watchRules } from "@dragons/db/schema";
import type { FilterConditionRow, ChannelTargetRow } from "@dragons/db/schema";
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

const DEFAULT_FILTERS: FilterConditionRow[] = [
  { field: "teamId", operator: "eq", value: "42" },
];
const DEFAULT_CHANNELS: ChannelTargetRow[] = [{ channel: "in_app", targetId: "1" }];

async function seedRule(
  opts: {
    name?: string;
    enabled?: boolean;
    createdBy?: string;
    eventTypes?: string[];
    filters?: FilterConditionRow[];
    channels?: ChannelTargetRow[];
    urgencyOverride?: string | null;
    templateOverride?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  } = {},
): Promise<number> {
  const [row] = await ctx.db
    .insert(watchRules)
    .values({
      name: opts.name ?? "Match alerts",
      enabled: opts.enabled ?? true,
      createdBy: opts.createdBy ?? "user-1",
      eventTypes: opts.eventTypes ?? ["match.schedule.changed"],
      filters: opts.filters ?? DEFAULT_FILTERS,
      channels: opts.channels ?? DEFAULT_CHANNELS,
      urgencyOverride: opts.urgencyOverride ?? null,
      templateOverride: opts.templateOverride ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
    })
    .returning({ id: watchRules.id });
  return row!.id;
}

// --- Tests ---

describe("listWatchRules", () => {
  it("returns newest-first and pages with (page - 1) * limit", async () => {
    await seedRule({ name: "oldest", createdAt: new Date("2026-01-01T00:00:00Z") });
    await seedRule({ name: "middle", createdAt: new Date("2026-01-02T00:00:00Z") });
    await seedRule({ name: "newest", createdAt: new Date("2026-01-03T00:00:00Z") });

    const page1 = await listWatchRules({ page: 1, limit: 2 });
    expect(page1.rules.map((r) => r.name)).toEqual(["newest", "middle"]);
    expect(page1.total).toBe(3);

    const page2 = await listWatchRules({ page: 2, limit: 2 });
    expect(page2.rules.map((r) => r.name)).toEqual(["oldest"]);
    expect(page2.total).toBe(3);
  });

  it("defaults to page=1, limit=20", async () => {
    for (let i = 0; i < 21; i++) await seedRule({ name: `rule-${i}` });

    const result = await listWatchRules({});

    expect(result.rules).toHaveLength(20);
    expect(result.total).toBe(21);
  });

  it("returns an empty page when nothing is stored", async () => {
    expect(await listWatchRules({})).toEqual({ rules: [], total: 0 });
  });

  it("maps a stored row into the API shape", async () => {
    const id = await seedRule({
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const [rule] = (await listWatchRules({})).rules;

    expect(rule).toEqual({
      id,
      name: "Match alerts",
      enabled: true,
      createdBy: "user-1",
      eventTypes: ["match.schedule.changed"],
      filters: [{ field: "teamId", operator: "eq", value: "42" }],
      channels: [{ channel: "in_app", targetId: "1" }],
      urgencyOverride: null,
      templateOverride: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});

describe("getWatchRule", () => {
  it("returns the rule with the requested id, not just any row", async () => {
    const first = await seedRule({ name: "first" });
    const second = await seedRule({ name: "second" });

    expect((await getWatchRule(first))!.name).toBe("first");
    expect((await getWatchRule(second))!.name).toBe("second");
  });

  it("returns null when no row matches", async () => {
    await seedRule();

    expect(await getWatchRule(999)).toBeNull();
  });
});

describe("createWatchRule", () => {
  it("persists the rule with the caller's user id as createdBy", async () => {
    const created = await createWatchRule(
      {
        name: "Match alerts",
        eventTypes: ["match.schedule.changed"],
        filters: [{ field: "teamId", operator: "eq", value: "42" }],
        channels: [{ channel: "in_app", targetId: "1" }],
        enabled: true,
        urgencyOverride: null,
        templateOverride: null,
      },
      "admin-42",
    );

    expect(created.createdBy).toBe("admin-42");
    // Round-trips through jsonb unchanged.
    expect(await getWatchRule(created.id)).toEqual(created);
  });

  it("applies defaults for the optional fields", async () => {
    const created = await createWatchRule(
      {
        name: "Minimal rule",
        eventTypes: ["match.cancelled"],
        channels: [{ channel: "in_app", targetId: "1" }],
      },
      "user-7",
    );

    expect(created).toMatchObject({
      enabled: true,
      filters: [],
      urgencyOverride: null,
      templateOverride: null,
    });
    expect((await getWatchRule(created.id))!.filters).toEqual([]);
  });
});

describe("updateWatchRule", () => {
  it("changes only the provided fields and leaves the rest intact", async () => {
    const id = await seedRule({
      name: "Original",
      eventTypes: ["match.schedule.changed"],
      urgencyOverride: "immediate",
    });

    const updated = await updateWatchRule(id, { name: "Renamed", enabled: false });

    expect(updated!.name).toBe("Renamed");
    expect(updated!.enabled).toBe(false);
    expect(updated!.eventTypes).toEqual(["match.schedule.changed"]);
    expect(updated!.filters).toEqual([{ field: "teamId", operator: "eq", value: "42" }]);
    expect(updated!.channels).toEqual([{ channel: "in_app", targetId: "1" }]);
    expect(updated!.urgencyOverride).toBe("immediate");
    expect(updated!.createdBy).toBe("user-1");
  });

  it("updates only the addressed row", async () => {
    const target = await seedRule({ name: "target" });
    const bystander = await seedRule({ name: "bystander" });

    await updateWatchRule(target, { name: "renamed" });

    expect((await getWatchRule(bystander))!.name).toBe("bystander");
  });

  it("returns null when the id does not exist", async () => {
    await seedRule();

    expect(await updateWatchRule(999, { name: "Nope" })).toBeNull();
  });

  it("persists eventTypes when provided", async () => {
    const id = await seedRule();

    await updateWatchRule(id, { eventTypes: ["match.cancelled"] });

    expect((await getWatchRule(id))!.eventTypes).toEqual(["match.cancelled"]);
  });

  it("persists filters when provided", async () => {
    const id = await seedRule();
    const filters: FilterCondition[] = [{ field: "teamId", operator: "eq", value: "99" }];

    await updateWatchRule(id, { filters });

    expect((await getWatchRule(id))!.filters).toEqual(filters);
  });

  it("persists channels when provided", async () => {
    const id = await seedRule();
    const channels: ChannelTarget[] = [{ channel: "push", targetId: "ch-1" }];

    await updateWatchRule(id, { channels });

    expect((await getWatchRule(id))!.channels).toEqual(channels);
  });

  it("persists urgencyOverride when provided", async () => {
    const id = await seedRule();

    await updateWatchRule(id, { urgencyOverride: "immediate" });

    expect((await getWatchRule(id))!.urgencyOverride).toBe("immediate");
  });

  it("persists templateOverride when provided", async () => {
    const id = await seedRule();

    await updateWatchRule(id, { templateOverride: "my-tpl" });

    expect((await getWatchRule(id))!.templateOverride).toBe("my-tpl");
  });

  it("advances updatedAt", async () => {
    const id = await seedRule({ updatedAt: new Date("2020-01-01T00:00:00Z") });

    const updated = await updateWatchRule(id, { name: "Renamed" });

    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThan(
      new Date("2020-01-01T00:00:00Z").getTime(),
    );
  });
});

describe("deleteWatchRule", () => {
  it("removes only the addressed row and reports true", async () => {
    const target = await seedRule({ name: "target" });
    const bystander = await seedRule({ name: "bystander" });

    expect(await deleteWatchRule(target)).toBe(true);
    expect(await getWatchRule(target)).toBeNull();
    expect(await getWatchRule(bystander)).not.toBeNull();
  });

  it("reports false and deletes nothing when the id does not exist", async () => {
    await seedRule();

    expect(await deleteWatchRule(999)).toBe(false);
    expect((await listWatchRules({})).total).toBe(1);
  });
});
