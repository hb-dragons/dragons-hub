import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked. The previous
// version of this file asserted `expect(eq).toHaveBeenCalledWith("de.type", …)`
// against identity stubs, so the filters were only checked for having been
// *constructed* — swapping `gte` for `lte`, or filtering the failed-notification
// list on "sent" instead of "failed", left every test green. Everything below
// runs the real SQL against an in-process PGlite Postgres.
//
// Only BullMQ is stubbed (network/Redis boundary); `buildDomainEvent`,
// `insertDomainEvent` and `enqueueDomainEvent` all run for real, so
// triggerManualEvent is verified by the row it leaves in `domain_events`.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({ queueAdd: vi.fn() }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../workers/queues", () => ({
  domainEventsQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// --- Imports (after mocks) ---

import {
  listDomainEvents,
  triggerManualEvent,
  listFailedNotifications,
} from "./event-admin.service";
import { channelConfigs, domainEvents, notificationLog } from "@dragons/db/schema";
import type { ChannelConfig, EventUrgency } from "@dragons/shared";
import { eq } from "drizzle-orm";
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
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

interface EventSeed {
  id: string;
  type?: string;
  source?: string;
  urgency?: EventUrgency;
  occurredAt?: string;
  entityType?: string;
  entityName?: string;
  entityId?: number;
  actor?: string | null;
  enqueuedAt?: Date | null;
  payload?: Record<string, unknown>;
}

async function seedEvent(seed: EventSeed): Promise<string> {
  await ctx.db.insert(domainEvents).values({
    id: seed.id,
    type: seed.type ?? "match.created",
    source: seed.source ?? "sync",
    urgency: seed.urgency ?? "routine",
    occurredAt: new Date(seed.occurredAt ?? "2025-06-01T12:00:00.000Z"),
    actor: seed.actor ?? "system",
    syncRunId: null,
    entityType: seed.entityType ?? "match",
    entityId: seed.entityId ?? 1,
    entityName: seed.entityName ?? "Team A vs Team B",
    deepLinkPath: "/matches/1",
    enqueuedAt: seed.enqueuedAt ?? null,
    payload: seed.payload ?? { matchNo: 100 },
  });
  return seed.id;
}

async function seedChannelConfig(): Promise<number> {
  const [row] = await ctx.db
    .insert(channelConfigs)
    .values({
      name: "Test channel",
      type: "in_app",
      config: { locale: "de" } as ChannelConfig,
    })
    .returning({ id: channelConfigs.id });
  return row!.id;
}

async function seedNotification(opts: {
  eventId: string;
  channelConfigId: number;
  status: string;
  title?: string;
  createdAt?: Date;
  retryCount?: number;
  errorMessage?: string | null;
  recipientId?: string | null;
}): Promise<number> {
  const [row] = await ctx.db
    .insert(notificationLog)
    .values({
      eventId: opts.eventId,
      channelConfigId: opts.channelConfigId,
      recipientId: opts.recipientId ?? "user:1",
      title: opts.title ?? "Match cancelled",
      body: "Your match was cancelled",
      locale: "de",
      status: opts.status,
      errorMessage: opts.errorMessage ?? null,
      retryCount: opts.retryCount ?? 0,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning({ id: notificationLog.id });
  return row!.id;
}

// --- Tests ---

describe("listDomainEvents", () => {
  it("returns an empty list when there is nothing stored", async () => {
    expect(await listDomainEvents({})).toEqual({ events: [], total: 0 });
  });

  it("filters by type", async () => {
    await seedEvent({ id: "evt-a", type: "match.created" });
    await seedEvent({ id: "evt-b", type: "match.cancelled" });

    const result = await listDomainEvents({ type: "match.created" });

    expect(result.total).toBe(1);
    expect(result.events.map((e) => e.id)).toEqual(["evt-a"]);
  });

  it("filters by entityType", async () => {
    await seedEvent({ id: "evt-a", entityType: "match" });
    await seedEvent({ id: "evt-b", entityType: "booking" });

    const result = await listDomainEvents({ entityType: "booking" });

    expect(result.events.map((e) => e.id)).toEqual(["evt-b"]);
  });

  it("filters by source", async () => {
    await seedEvent({ id: "evt-a", source: "sync" });
    await seedEvent({ id: "evt-b", source: "manual" });

    const result = await listDomainEvents({ source: "manual" });

    expect(result.events.map((e) => e.id)).toEqual(["evt-b"]);
  });

  it("keeps only events at or after `from`", async () => {
    await seedEvent({ id: "evt-old", occurredAt: "2025-01-01T00:00:00.000Z" });
    await seedEvent({ id: "evt-mid", occurredAt: "2025-06-01T00:00:00.000Z" });
    await seedEvent({ id: "evt-new", occurredAt: "2025-12-01T00:00:00.000Z" });

    const result = await listDomainEvents({ from: "2025-06-01T00:00:00Z" });

    expect(result.events.map((e) => e.id).sort()).toEqual(["evt-mid", "evt-new"]);
  });

  it("keeps only events at or before `to`", async () => {
    await seedEvent({ id: "evt-old", occurredAt: "2025-01-01T00:00:00.000Z" });
    await seedEvent({ id: "evt-mid", occurredAt: "2025-06-01T00:00:00.000Z" });
    await seedEvent({ id: "evt-new", occurredAt: "2025-12-01T00:00:00.000Z" });

    const result = await listDomainEvents({ to: "2025-06-01T00:00:00Z" });

    expect(result.events.map((e) => e.id).sort()).toEqual(["evt-mid", "evt-old"]);
  });

  it("intersects `from` and `to` into a closed range", async () => {
    await seedEvent({ id: "evt-old", occurredAt: "2025-01-01T00:00:00.000Z" });
    await seedEvent({ id: "evt-mid", occurredAt: "2025-06-01T00:00:00.000Z" });
    await seedEvent({ id: "evt-new", occurredAt: "2025-12-01T00:00:00.000Z" });

    const result = await listDomainEvents({
      from: "2025-05-01T00:00:00Z",
      to: "2025-07-01T00:00:00Z",
    });

    expect(result.events.map((e) => e.id)).toEqual(["evt-mid"]);
  });

  it("searches entityName case-insensitively", async () => {
    await seedEvent({ id: "evt-a", entityName: "Dragons vs Tigers" });
    await seedEvent({ id: "evt-b", entityName: "Eagles vs Bears" });

    const result = await listDomainEvents({ search: "dragons" });

    expect(result.events.map((e) => e.id)).toEqual(["evt-a"]);
  });

  it("treats % in the search term as a literal, not a wildcard", async () => {
    await seedEvent({ id: "evt-literal", entityName: "Halle 100% belegt" });
    await seedEvent({ id: "evt-other", entityName: "Halle frei" });

    const result = await listDomainEvents({ search: "100%" });

    expect(result.events.map((e) => e.id)).toEqual(["evt-literal"]);
  });

  it("treats _ in the search term as a literal, not a single-char wildcard", async () => {
    await seedEvent({ id: "evt-literal", entityName: "team_a" });
    await seedEvent({ id: "evt-decoy", entityName: "teamXa" });

    const result = await listDomainEvents({ search: "team_a" });

    expect(result.events.map((e) => e.id)).toEqual(["evt-literal"]);
  });

  it("treats a backslash in the search term as a literal", async () => {
    await seedEvent({ id: "evt-literal", entityName: "a\\b" });
    await seedEvent({ id: "evt-decoy", entityName: "ab" });

    const result = await listDomainEvents({ search: "a\\b" });

    expect(result.events.map((e) => e.id)).toEqual(["evt-literal"]);
  });

  it("orders newest-first and pages with (page - 1) * limit", async () => {
    for (let i = 1; i <= 5; i++) {
      await seedEvent({ id: `evt-${i}`, occurredAt: `2025-06-0${i}T00:00:00.000Z` });
    }

    const page1 = await listDomainEvents({ page: 1, limit: 2 });
    expect(page1.events.map((e) => e.id)).toEqual(["evt-5", "evt-4"]);
    expect(page1.total).toBe(5);

    const page3 = await listDomainEvents({ page: 3, limit: 2 });
    expect(page3.events.map((e) => e.id)).toEqual(["evt-1"]);
    expect(page3.total).toBe(5);
  });

  it("counts all matching rows, not just the page", async () => {
    for (let i = 1; i <= 5; i++) {
      await seedEvent({ id: `evt-${i}`, type: i <= 3 ? "match.created" : "match.cancelled" });
    }

    const result = await listDomainEvents({ type: "match.created", limit: 1 });

    expect(result.events).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("maps a stored row into the API shape", async () => {
    await seedEvent({
      id: "evt-1",
      type: "match.created",
      source: "sync",
      urgency: "routine",
      occurredAt: "2025-06-01T12:00:00.000Z",
      entityType: "match",
      entityId: 1,
      entityName: "Team A vs Team B",
      enqueuedAt: new Date("2025-06-01T12:00:01.000Z"),
      payload: { matchNo: 100 },
    });

    const [event] = (await listDomainEvents({})).events;

    expect(event).toMatchObject({
      id: "evt-1",
      type: "match.created",
      source: "sync",
      urgency: "routine",
      occurredAt: "2025-06-01T12:00:00.000Z",
      actor: "system",
      syncRunId: null,
      entityType: "match",
      entityId: 1,
      entityName: "Team A vs Team B",
      deepLinkPath: "/matches/1",
      enqueuedAt: "2025-06-01T12:00:01.000Z",
      payload: { matchNo: 100 },
    });
    expect(typeof event!.createdAt).toBe("string");
  });

  it("reports a null enqueuedAt as null", async () => {
    await seedEvent({ id: "evt-1", enqueuedAt: null });

    expect((await listDomainEvents({})).events[0]!.enqueuedAt).toBeNull();
  });

  it("ANDs all filters together", async () => {
    await seedEvent({
      id: "evt-hit",
      type: "match.created",
      entityType: "match",
      source: "sync",
      entityName: "Dragons vs Tigers",
      occurredAt: "2025-06-01T00:00:00.000Z",
    });
    // Each of these differs from the hit in exactly one filtered dimension.
    await seedEvent({ id: "evt-type", type: "match.cancelled", entityName: "Dragons vs Tigers" });
    await seedEvent({ id: "evt-entity", entityType: "booking", entityName: "Dragons vs Tigers" });
    await seedEvent({ id: "evt-source", source: "manual", entityName: "Dragons vs Tigers" });
    await seedEvent({ id: "evt-name", entityName: "Eagles vs Bears" });
    await seedEvent({
      id: "evt-date",
      entityName: "Dragons vs Tigers",
      occurredAt: "2024-01-01T00:00:00.000Z",
    });

    const result = await listDomainEvents({
      type: "match.created",
      entityType: "match",
      source: "sync",
      from: "2025-01-01T00:00:00Z",
      to: "2025-12-31T23:59:59Z",
      search: "Dragons",
    });

    expect(result.events.map((e) => e.id)).toEqual(["evt-hit"]);
    expect(result.total).toBe(1);
  });
});

describe("triggerManualEvent", () => {
  it("persists the event with source=manual and enqueues it", async () => {
    const result = await triggerManualEvent({
      type: "match.cancelled",
      entityType: "match",
      entityId: 1,
      entityName: "Dragons vs Tigers",
      deepLinkPath: "/matches/1",
      payload: { matchNo: 100 },
      actor: "admin",
    });

    const [row] = await ctx.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, result.eventId));

    expect(row).toMatchObject({
      type: "match.cancelled",
      source: "manual",
      entityType: "match",
      entityId: 1,
      entityName: "Dragons vs Tigers",
      deepLinkPath: "/matches/1",
      actor: "admin",
      payload: { matchNo: 100 },
    });
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
  });

  it("stores the overridden urgency, not the classified one", async () => {
    const result = await triggerManualEvent({
      type: "match.cancelled",
      entityType: "match",
      entityId: 1,
      entityName: "Test",
      deepLinkPath: "/test",
      payload: {},
      urgencyOverride: "routine",
      actor: "admin",
    });

    const [row] = await ctx.db
      .select({ urgency: domainEvents.urgency })
      .from(domainEvents)
      .where(eq(domainEvents.id, result.eventId));

    expect(result.urgency).toBe("routine");
    expect(row!.urgency).toBe("routine");
  });

  it("keeps the classified urgency when no override is given", async () => {
    const withOverride = await triggerManualEvent({
      type: "match.cancelled",
      entityType: "match",
      entityId: 1,
      entityName: "Test",
      deepLinkPath: "/test",
      payload: {},
      urgencyOverride: "routine",
      actor: "admin",
    });
    const withoutOverride = await triggerManualEvent({
      type: "match.cancelled",
      entityType: "match",
      entityId: 2,
      entityName: "Test",
      deepLinkPath: "/test",
      payload: {},
      actor: "admin",
    });

    // match.cancelled classifies as immediate; the override forced it down.
    expect(withoutOverride.urgency).toBe("immediate");
    expect(withOverride.urgency).toBe("routine");
  });
});

describe("listFailedNotifications", () => {
  it("returns an empty list when nothing has failed", async () => {
    expect(await listFailedNotifications({})).toEqual({ notifications: [], total: 0 });
  });

  it("returns only failed rows, ignoring sent and pending ones", async () => {
    const eventId = await seedEvent({ id: "evt-1" });
    const channelConfigId = await seedChannelConfig();
    const failed = await seedNotification({ eventId, channelConfigId, status: "failed" });
    await seedNotification({ eventId, channelConfigId, status: "sent", recipientId: "user:2" });
    await seedNotification({ eventId, channelConfigId, status: "pending", recipientId: "user:3" });

    const result = await listFailedNotifications({});

    expect(result.total).toBe(1);
    expect(result.notifications.map((n) => n.id)).toEqual([failed]);
  });

  it("joins the originating event for context", async () => {
    const eventId = await seedEvent({
      id: "evt-1",
      type: "match.cancelled",
      entityName: "Dragons vs Tigers",
    });
    const channelConfigId = await seedChannelConfig();
    const id = await seedNotification({
      eventId,
      channelConfigId,
      status: "failed",
      errorMessage: "Connection timeout",
      retryCount: 3,
      createdAt: new Date("2025-06-01T12:00:00.000Z"),
    });

    const result = await listFailedNotifications({ page: 1, limit: 10 });

    expect(result.notifications[0]).toEqual({
      id,
      eventId: "evt-1",
      watchRuleId: null,
      channelConfigId,
      recipientId: "user:1",
      title: "Match cancelled",
      body: "Your match was cancelled",
      locale: "de",
      status: "failed",
      errorMessage: "Connection timeout",
      retryCount: 3,
      createdAt: "2025-06-01T12:00:00.000Z",
      eventType: "match.cancelled",
      entityName: "Dragons vs Tigers",
      deepLinkPath: "/matches/1",
    });
  });

  it("orders newest-first and pages with (page - 1) * limit", async () => {
    const eventId = await seedEvent({ id: "evt-1" });
    const channelConfigId = await seedChannelConfig();
    const ids: number[] = [];
    for (let i = 1; i <= 5; i++) {
      ids.push(
        await seedNotification({
          eventId,
          channelConfigId,
          status: "failed",
          recipientId: `user:${i}`,
          createdAt: new Date(`2025-06-0${i}T00:00:00.000Z`),
        }),
      );
    }

    const page1 = await listFailedNotifications({ page: 1, limit: 2 });
    expect(page1.notifications.map((n) => n.id)).toEqual([ids[4], ids[3]]);
    expect(page1.total).toBe(5);

    const page3 = await listFailedNotifications({ page: 3, limit: 2 });
    expect(page3.notifications.map((n) => n.id)).toEqual([ids[0]]);
    expect(page3.total).toBe(5);
  });
});
