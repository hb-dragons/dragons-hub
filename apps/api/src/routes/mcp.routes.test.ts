import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type * as ConfigEnv from "../config/env";

const TOKEN = "x".repeat(32);

// Overrides layered onto the real env object, so modules pulled in transitively
// (config/logger reads LOG_LEVEL, for one) still see a complete environment.
const envOverrides = vi.hoisted(
  () => ({ ref: {} as Record<string, unknown> }),
);
const mocks = vi.hoisted(() => ({
  incrementWithTtl: vi.fn(),
  handleRequest: vi.fn(),
  transportClose: vi.fn(),
  serverClose: vi.fn(),
  outgoingOn: vi.fn(),
}));

vi.mock("../config/env", async () => {
  const actual = await vi.importActual<typeof ConfigEnv>("../config/env");
  return {
    env: new Proxy(actual.env, {
      get(target, prop) {
        if (prop in envOverrides.ref) return envOverrides.ref[prop as string];
        return Reflect.get(target, prop);
      },
    }),
  };
});

vi.mock("../config/redis", () => ({
  incrementWithTtl: (...a: unknown[]) => mocks.incrementWithTtl(...a),
}));

vi.mock("../ai/mcp-server", () => ({
  buildMcpServer: vi.fn(() => ({
    connect: vi.fn(),
    close: (...a: unknown[]) => mocks.serverClose(...a),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: class {
    close = (...a: unknown[]) => mocks.transportClose(...a);
    handleRequest = (...a: unknown[]) => mocks.handleRequest(...a);
  },
}));

// --- Imports (after mocks) ---
import { mcpRoutes } from "./mcp.routes";

function post(
  init: { token?: string; body?: string; headers?: Record<string, string> } = {},
) {
  const app = new Hono().route("/", mcpRoutes);
  return app.request(
    "/mcp",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
      body: init.body ?? "{}",
    },
    // The handler hands the raw node req/res to the MCP transport via `c.env`,
    // which @hono/node-server populates in production. Only `outgoing.on` is
    // ever touched here.
    { incoming: {}, outgoing: { on: mocks.outgoingOn } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  envOverrides.ref = { MCP_TOKEN: TOKEN, ASSISTANT_ENABLED: true };
  mocks.incrementWithTtl.mockResolvedValue(1);
  mocks.handleRequest.mockResolvedValue(undefined);
});

describe("POST /mcp — feature gate", () => {
  it("returns 503 when ASSISTANT_ENABLED is false", async () => {
    envOverrides.ref = { MCP_TOKEN: TOKEN, ASSISTANT_ENABLED: false };

    const res = await post({ token: TOKEN });

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "ASSISTANT_DISABLED" });
  });

  it("does not serve tools with a valid token while the flag is off", async () => {
    envOverrides.ref = { MCP_TOKEN: TOKEN, ASSISTANT_ENABLED: false };

    await post({ token: TOKEN });

    expect(mocks.handleRequest).not.toHaveBeenCalled();
  });
});

describe("POST /mcp — auth", () => {
  it("rejects a missing bearer token with 401", async () => {
    const res = await post();

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a wrong token of the same length with 401", async () => {
    const res = await post({ token: "y".repeat(32) });

    expect(res.status).toBe(401);
  });

  it("rejects a token that is a prefix of the real one", async () => {
    // A `===`-style short-circuit would answer these faster than a full-length
    // miss; the constant-time compare rejects both identically.
    const res = await post({ token: TOKEN.slice(0, 16) });

    expect(res.status).toBe(401);
  });

  it("rejects everything when MCP_TOKEN is unset", async () => {
    envOverrides.ref = { MCP_TOKEN: undefined, ASSISTANT_ENABLED: true };

    const res = await post({ token: "" });

    expect(res.status).toBe(401);
  });

  it("accepts the configured token", async () => {
    const res = await post({ token: TOKEN });

    expect(res.status).not.toBe(401);
    expect(mocks.handleRequest).toHaveBeenCalledTimes(1);
  });

  it("tears down the transport and server when the connection closes", async () => {
    await post({ token: TOKEN });

    const [event, onClose] = mocks.outgoingOn.mock.calls[0] as [
      string,
      () => void,
    ];
    expect(event).toBe("close");
    onClose();

    expect(mocks.transportClose).toHaveBeenCalledTimes(1);
    expect(mocks.serverClose).toHaveBeenCalledTimes(1);
  });
});

describe("POST /mcp — body limit", () => {
  it("rejects a body over the 256 KiB cap with 413", async () => {
    const body = JSON.stringify({ pad: "a".repeat(300 * 1024) });

    const res = await post({ token: TOKEN, body });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "BODY_TOO_LARGE" });
  });

  it("rejects an oversized body before the token is even checked", async () => {
    const body = JSON.stringify({ pad: "a".repeat(300 * 1024) });

    const res = await post({ body });

    expect(res.status).toBe(413);
    expect(mocks.handleRequest).not.toHaveBeenCalled();
  });

  it("accepts a body under the cap", async () => {
    const body = JSON.stringify({ pad: "a".repeat(1024) });

    const res = await post({ token: TOKEN, body });

    expect(res.status).not.toBe(413);
  });
});

describe("POST /mcp — rate limit", () => {
  it("returns 429 once the window budget is spent", async () => {
    mocks.incrementWithTtl.mockResolvedValue(121);

    const res = await post({ token: TOKEN });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(mocks.handleRequest).not.toHaveBeenCalled();
  });

  it("lets a request inside the budget through", async () => {
    mocks.incrementWithTtl.mockResolvedValue(120);

    const res = await post({ token: TOKEN });

    expect(res.status).not.toBe(429);
  });

  it("fails open when Redis is unreachable", async () => {
    mocks.incrementWithTtl.mockRejectedValue(new Error("redis down"));

    const res = await post({ token: TOKEN });

    expect(res.status).not.toBe(429);
    expect(mocks.handleRequest).toHaveBeenCalledTimes(1);
  });
});
