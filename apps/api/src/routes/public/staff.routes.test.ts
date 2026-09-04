import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getPublicStaffPortrait: vi.fn(),
}));

vi.mock("../../services/public/staff-portrait.service", () => ({
  getPublicStaffPortrait: mocks.getPublicStaffPortrait,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { publicStaffRoutes } from "./staff.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware — the route has none by design.
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", publicStaffRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /staff/:id/photo (public)", () => {
  it("serves the stored bytes with a public, immutable cache header", async () => {
    mocks.getPublicStaffPortrait.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
    });

    const res = await app.request("/staff/12/photo");

    expect(res.status).toBe(200);
    expect(mocks.getPublicStaffPortrait).toHaveBeenCalledWith(12);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns 404 when the member has no portrait", async () => {
    mocks.getPublicStaffPortrait.mockResolvedValue(null);

    const res = await app.request("/staff/12/photo");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Portrait not found", code: "NOT_FOUND" });
  });

  it("rejects a non-numeric staff id", async () => {
    const res = await app.request("/staff/abc/photo");

    expect(res.status).toBe(400);
    expect(mocks.getPublicStaffPortrait).not.toHaveBeenCalled();
  });
});
