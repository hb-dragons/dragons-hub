import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// The booking events were retired with the stored venue bookings (ADR-0012).
// Rows already in `domain_events` and watch rules already aimed at them stay
// readable; nobody can publish one again.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));

import { eventRoutes } from "./event.routes";
import { watchRuleRoutes } from "./watch-rule.routes";
import { errorHandler } from "../../middleware/error";
import { domainEvents, watchRules } from "@dragons/db/schema";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.use("/*", async (c, next) => {
  c.set("user", { id: "user-1" } as AppEnv["Variables"]["user"]);
  await next();
});
app.onError(errorHandler);
app.route("/", eventRoutes);
app.route("/", watchRuleRoutes);

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

async function seedBookingEvent() {
  await ctx.db.insert(domainEvents).values({
    id: "01JRETIREDBOOKING00000000A",
    type: "booking.created",
    source: "sync",
    urgency: "routine",
    occurredAt: new Date("2026-03-01T10:00:00Z"),
    entityType: "booking",
    entityId: 7,
    entityName: "Sporthalle Am Park, 01.03.2026",
    deepLinkPath: "/admin/bookings/7",
    payload: { venueName: "Sporthalle Am Park", date: "2026-03-01" },
  });
}

describe("retired booking events in the event listing", () => {
  it("lists a stored booking.created row", async () => {
    await seedBookingEvent();

    const res = await app.request("/events");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { type: string; entityType: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.events[0]).toMatchObject({ type: "booking.created", entityType: "booking" });
  });

  it("filters by a retired type", async () => {
    await seedBookingEvent();

    const res = await app.request("/events?type=booking.created");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { type: string }[] };
    expect(body.events.map((e) => e.type)).toEqual(["booking.created"]);
  });

  it("filters by the retired entity type", async () => {
    await seedBookingEvent();

    const res = await app.request("/events?entityType=booking");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(1);
  });
});

describe("manual trigger refuses retired types", () => {
  it.each(["booking.created", "booking.status.changed", "booking.needs_reconfirmation", "booking.hall_time.missing"])(
    "rejects %s with 400",
    async (type) => {
      const res = await app.request("/events/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          entityType: "match",
          entityId: 1,
          entityName: "x",
          deepLinkPath: "/admin/matches/1",
        }),
      });

      expect(res.status).toBe(400);
      expect(await ctx.db.select().from(domainEvents)).toEqual([]);
    },
  );

  it("rejects the retired booking entity type with 400", async () => {
    const res = await app.request("/events/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "match.created",
        entityType: "booking",
        entityId: 1,
        entityName: "x",
        deepLinkPath: "/admin/matches/1",
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("watch rules that still name a retired type", () => {
  async function seedRule() {
    const [rule] = await ctx.db
      .insert(watchRules)
      .values({
        name: "Booking alerts",
        createdBy: "user-1",
        eventTypes: ["booking.created"],
        channels: [{ channel: "in_app", targetId: "1" }],
      })
      .returning({ id: watchRules.id });
    return rule!.id;
  }

  it("are returned by the list route", async () => {
    await seedRule();

    const res = await app.request("/watch-rules");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { rules: { eventTypes: string[] }[] };
    expect(body.rules[0]!.eventTypes).toEqual(["booking.created"]);
  });

  it("can be renamed without touching the stored types", async () => {
    const id = await seedRule();

    const res = await app.request(`/watch-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    expect(res.status).toBe(200);
    const [row] = await ctx.db.select().from(watchRules);
    expect(row).toMatchObject({ name: "Renamed", eventTypes: ["booking.created"] });
  });

  it("cannot be saved with a retired type in the submitted list", async () => {
    const id = await seedRule();

    const res = await app.request(`/watch-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventTypes: ["booking.created", "match.created"] }),
    });

    expect(res.status).toBe(400);
  });
});
