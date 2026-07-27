import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Hono } from "hono";
import type * as ConfigEnv from "../../config/env";
import type * as ScoreboardPubsub from "../../services/scoreboard/pubsub";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  closeSub: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("../../config/redis", () => ({
  getRedis: () => ({
    incr: (...a: unknown[]) => mocks.incr(...a),
    expire: (...a: unknown[]) => mocks.expire(...a),
  }),
}));

vi.mock("../../config/env", async () => {
  const actual = await vi.importActual<typeof ConfigEnv>("../../config/env");
  return {
    env: new Proxy(actual.env, {
      get(target, prop) {
        if (prop === "SCOREBOARD_DEVICE_ID") return "d1";
        return Reflect.get(target, prop);
      },
    }),
  };
});

vi.mock("../../config/database", () => ({
  getDb: () => (new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  )),
}));

vi.mock("../../services/scoreboard/pubsub", async () => {
  const actual = await vi.importActual<typeof ScoreboardPubsub>(
    "../../services/scoreboard/pubsub",
  );
  return {
    ...actual,
    subscribeBroadcast: (...a: unknown[]) => mocks.subscribe(...a),
  };
});

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import { broadcastConfigs } from "@dragons/db/schema";
import { publicBroadcastRoutes } from "./broadcast.routes";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.subscribe.mockReset();
  mocks.subscribe.mockResolvedValue(async () => mocks.closeSub());
  mocks.incr.mockReset();
  mocks.incr.mockResolvedValue(1);
  mocks.expire.mockReset();
  mocks.expire.mockResolvedValue(1);
});
afterAll(async () => {
  await closeTestDb(ctx);
});

function makeApp() {
  return new Hono().route("/public/broadcast", publicBroadcastRoutes);
}

describe("GET /public/broadcast/state", () => {
  it("returns 400 without deviceId", async () => {
    const res = await makeApp().request("/public/broadcast/state");
    expect(res.status).toBe(400);
  });

  it("returns idle state when no config exists", async () => {
    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=d1",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { phase: string; isLive: boolean };
    expect(body.phase).toBe("idle");
    expect(body.isLive).toBe(false);
  });

  it("reflects isLive=true when config is live", async () => {
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      isLive: true,
    });
    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=d1",
    );
    const body = (await res.json()) as { isLive: boolean };
    expect(body.isLive).toBe(true);
  });

  // `/stream` has always enforced this; `/state` returned broadcast state for
  // any id an anonymous caller asked about.
  it("returns 404 for a deviceId that is not the configured panel", async () => {
    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=other",
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "UNKNOWN_DEVICE" });
  });

  it("does not touch the database for a non-allowlisted deviceId", async () => {
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "someone-elses-panel",
      isLive: true,
    });

    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=someone-elses-panel",
    );

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("isLive");
  });

  it("returns 429 once the anonymous window budget is spent", async () => {
    mocks.incr.mockResolvedValue(601);

    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=d1",
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("serves a request inside the budget", async () => {
    mocks.incr.mockResolvedValue(600);

    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=d1",
    );

    expect(res.status).toBe(200);
  });

  it("fails open when Redis is unreachable", async () => {
    mocks.incr.mockRejectedValue(new Error("redis down"));

    const res = await makeApp().request(
      "/public/broadcast/state?deviceId=d1",
    );

    expect(res.status).toBe(200);
  });
});

describe("GET /public/broadcast/stream", () => {
  it("returns text/event-stream", async () => {
    const res = await makeApp().request(
      "/public/broadcast/stream?deviceId=d1",
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    await res.body?.cancel();
  });

  it("returns 400 without deviceId", async () => {
    const res = await makeApp().request("/public/broadcast/stream");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown deviceId", async () => {
    const res = await makeApp().request(
      "/public/broadcast/stream?deviceId=other",
    );
    expect(res.status).toBe(404);
  });
});
