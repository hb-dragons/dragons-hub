import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ streamRescheduleChat: vi.fn(), enabled: true }));
vi.mock("../../middleware/rbac", () => ({ requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()) }));
vi.mock("../../config/logger", () => ({ logger: { error: vi.fn(), child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) } }));
vi.mock("../../config/env", () => ({ env: { get ASSISTANT_ENABLED() { return mocks.enabled; } } }));
vi.mock("../../ai/chat", () => ({ streamRescheduleChat: mocks.streamRescheduleChat }));

// --- Imports (after mocks) ---
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error";
import { assistantRoutes } from "./assistant.routes";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/admin", assistantRoutes);
  return app;
}

describe("POST /admin/assistant/reschedule/chat", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; });

  it("returns 503 when the assistant is disabled", async () => {
    mocks.enabled = false;
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "ASSISTANT_DISABLED" });
  });

  it("delegates to streamRescheduleChat and returns its Response", async () => {
    mocks.streamRescheduleChat.mockResolvedValue(new Response("stream", { headers: { "x-test": "1" } }));
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", parts: [] }], matchId: 7 }),
    });
    expect(res.headers.get("x-test")).toBe("1");
    expect(mocks.streamRescheduleChat).toHaveBeenCalledWith([{ role: "user", parts: [] }], 7);
    res.body?.cancel();
  });

  it("rejects an invalid body with a validation error", async () => {
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: "nope" }),
    });
    expect(res.status).toBe(400);
  });
});
