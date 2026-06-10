import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../config/env", () => ({ env: { MCP_TOKEN: "x".repeat(32) } }));
vi.mock("../ai/mcp-server", () => ({ buildMcpServer: vi.fn(() => ({ connect: vi.fn() })) }));

// --- Imports (after mocks) ---
import { mcpRoutes } from "./mcp.routes";

describe("POST /mcp auth", () => {
  it("rejects a missing/invalid bearer token with 401", async () => {
    const app = new Hono().route("/", mcpRoutes);
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
