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

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  closeSub: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../../services/scoreboard/pubsub", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/scoreboard/pubsub")
  >("../../services/scoreboard/pubsub");
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
});

describe("GET /public/broadcast/stream", () => {
  it("returns text/event-stream", async () => {
    const res = await makeApp().request(
      "/public/broadcast/stream?deviceId=d1",
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    res.body?.cancel();
  });

  it("returns 400 without deviceId", async () => {
    const res = await makeApp().request("/public/broadcast/stream");
    expect(res.status).toBe(400);
  });
});
