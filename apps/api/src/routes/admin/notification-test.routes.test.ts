import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbTransaction: vi.fn(),
  sendBatch: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.dbTransaction(fn),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  pushDevices: {
    userId: "user_id",
    token: "token",
    platform: "platform",
    locale: "locale",
  },
  notificationLog: {
    id: "id",
    eventId: "event_id",
    createdAt: "created_at",
  },
  channelConfigs: { id: "id", type: "type" },
  domainEvents: { id: "id", type: "type" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: unknown[]) => ({ eq: a })),
  and: vi.fn((...a: unknown[]) => ({ and: a })),
  like: vi.fn((...a: unknown[]) => ({ like: a })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../../services/notifications/expo-push.client", () => ({
  ExpoPushClient: class {
    sendBatch(messages: unknown[]) {
      return mocks.sendBatch(messages);
    }
  },
}));

// RBAC middleware pass-through for tests -- we simulate the user via c.set("user", ...)
vi.mock("../../middleware/rbac", () => ({
  requirePermission:
    () =>
    async (
      c: { get: (k: string) => unknown },
      next: () => Promise<void>,
    ) => {
      const user = c.get("user");
      if (!user)
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        });
      if ((user as { role?: string }).role !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }
      await next();
    },
}));

import {
  notificationTestRoutes,
  __resetTestPushRateLimitForTests,
} from "./notification-test.routes";

function makeApp(user: { id: string; role: string } | null) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    if (user) c.set("user", user as unknown as AppEnv["Variables"]["user"]);
    await next();
  });
  app.route("/", notificationTestRoutes);
  return app;
}

function mockSelectSimple(rows: unknown[]) {
  mocks.dbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function mockInsertCapture() {
  const domainEventsValues = vi.fn();
  const logValues = vi.fn();
  let call = 0;
  mocks.dbInsert.mockImplementation(() => ({
    values: vi.fn().mockImplementation((v) => {
      // First insert in the transaction is domain_events, second is notification_log
      if (call === 0) domainEventsValues(v);
      else logValues(v);
      call++;
      return Promise.resolve(undefined);
    }),
  }));
  return { domainEventsValues, logValues };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbSelect.mockReset();
  mocks.dbInsert.mockReset();
  mocks.dbTransaction.mockReset();
  mocks.sendBatch.mockReset();
  __resetTestPushRateLimitForTests();

  // Default: transaction simulator that delegates tx.insert -> mocks.dbInsert
  mocks.dbTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (...a: unknown[]) => mocks.dbInsert(...a),
      };
      return fn(tx);
    },
  );
});

describe("POST /notifications/test-push", () => {
  it("returns 401 when no session", async () => {
    const app = makeApp(null);
    const res = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const app = makeApp({ id: "u_regular", role: "user" });
    const res = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin has no devices", async () => {
    const app = makeApp({ id: "u_admin", role: "admin" });
    mockSelectSimple([]); // devices query: empty
    const res = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no_devices");
  });

  it("sends a test push and logs rows", async () => {
    const app = makeApp({ id: "u_admin", role: "admin" });
    mockSelectSimple([
      {
        id: 1,
        userId: "u_admin",
        token: "ExponentPushToken[x1]",
        platform: "ios",
        locale: "de-DE",
      },
    ]);
    mockSelectSimple([{ id: 7, type: "push" }]); // push channel lookup
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);
    const { domainEventsValues, logValues } = mockInsertCapture();

    const res = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deviceCount).toBe(1);
    expect(body.tickets).toHaveLength(1);
    expect(body.tickets[0].status).toBe("sent_ticket");

    // Synthetic domain_events row inserted first
    expect(domainEventsValues).toHaveBeenCalled();
    const eventRow = domainEventsValues.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(eventRow.id).toMatch(/^admin_test:u_admin:/);
    expect(eventRow.type).toBe("admin.test_push");

    // notification_log rows referencing that event
    expect(logValues).toHaveBeenCalled();
    const rows = logValues.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows[0]!.eventId).toMatch(/^admin_test:u_admin:/);
    expect(rows[0]!.providerTicketId).toBe("tkt_1");
    expect(rows[0]!.status).toBe("sent_ticket");
  });

  it("records per-ticket failure when Expo rejects", async () => {
    const app = makeApp({ id: "u_admin", role: "admin" });
    mockSelectSimple([
      {
        id: 1,
        userId: "u_admin",
        token: "ExponentPushToken[bad]",
        platform: "ios",
        locale: "de-DE",
      },
    ]);
    mockSelectSimple([{ id: 7, type: "push" }]);
    mocks.sendBatch.mockResolvedValueOnce([
      { status: "error", message: "oops", details: { error: "SomeError" } },
    ]);
    mockInsertCapture();

    const res = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets[0].status).toBe("failed");
    expect(body.tickets[0].error).toContain("SomeError");
  });

  it("handles Expo network error -- returns 200 with all-failed tickets", async () => {
    const app = makeApp({ id: "u_admin", role: "admin" });
    mockSelectSimple([
      {
        id: 1,
        userId: "u_admin",
        token: "ExponentPushToken[a]",
        platform: "ios",
      },
    ]);
    mockSelectSimple([{ id: 7, type: "push" }]);
    mocks.sendBatch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    mockInsertCapture();

    const res = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets[0].status).toBe("failed");
    expect(body.tickets[0].error).toMatch(/ECONNREFUSED|unknown/);
  });

  it("rate-limits rapid consecutive test pushes from the same user", async () => {
    const app = makeApp({ id: "u_admin", role: "admin" });

    // First call succeeds — queue up all its mocks
    mockSelectSimple([
      {
        id: 1,
        userId: "u_admin",
        token: "ExponentPushToken[a]",
        platform: "ios",
        locale: "de-DE",
      },
    ]);
    mockSelectSimple([{ id: 7, type: "push" }]);
    mocks.sendBatch.mockResolvedValueOnce([{ status: "ok", id: "tkt_1" }]);
    mockInsertCapture();

    const first = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(first.status).toBe(200);

    // Second call within the 10s window should be rejected before any DB work.
    // No additional mocks queued on purpose — if the handler reaches the DB we'll fail loud.
    const second = await app.request("/notifications/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(second.status).toBe(429);
    const body = await second.json();
    expect(body.error).toBe("rate_limited");
    expect(typeof body.retryAfter).toBe("number");
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("GET /notifications/test-push/recent", () => {
  it("returns 401 without session", async () => {
    const app = makeApp(null);
    const res = await app.request("/notifications/test-push/recent");
    expect(res.status).toBe(401);
  });

  it("returns caller's test rows with masked token", async () => {
    const app = makeApp({ id: "u_admin", role: "admin" });
    mocks.dbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 1,
                sentAt: new Date("2026-04-23T10:00:00Z"),
                createdAt: new Date("2026-04-23T10:00:00Z"),
                recipientToken: "ExponentPushToken[abcdef123456]",
                status: "delivered",
                providerTicketId: "tkt_1",
                errorMessage: null,
              },
            ]),
          }),
        }),
      }),
    });

    const res = await app.request("/notifications/test-push/recent");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    const tok = body.results[0].recipientToken as string;
    expect(tok.startsWith("...")).toBe(true);
    expect(tok.length).toBeLessThanOrEqual(9); // "..." + 6
  });
});
