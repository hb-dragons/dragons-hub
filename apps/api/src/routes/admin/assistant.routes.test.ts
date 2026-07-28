import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ streamRescheduleChat: vi.fn(), enabled: true }));
vi.mock("../../middleware/rbac", () => ({ requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()) }));
vi.mock("../../middleware/rate-limit", () => ({ rateLimit: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()) }));
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

const message = (text = "Can we move this to Saturday?") => ({
  role: "user" as const,
  parts: [{ type: "text", text }],
});

describe("POST /admin/assistant/reschedule/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
  });

  it("returns 503 with ASSISTANT_DISABLED when the assistant is disabled", async () => {
    mocks.enabled = false;
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [message()] }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "ASSISTANT_DISABLED" });
    expect(mocks.streamRescheduleChat).not.toHaveBeenCalled();
  });

  it("delegates to streamRescheduleChat and returns its Response", async () => {
    mocks.streamRescheduleChat.mockResolvedValue(new Response("stream", { headers: { "x-test": "1" } }));
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [message()], matchId: 7 }),
    });
    expect(res.headers.get("x-test")).toBe("1");
    expect(mocks.streamRescheduleChat).toHaveBeenCalledWith([message()], 7);
    await res.body?.cancel();
  });

  it("returns 400 with VALIDATION_ERROR on malformed JSON instead of 500", async () => {
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.streamRescheduleChat).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with a validation error", async () => {
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: "nope" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a body with more than 60 messages", async () => {
    const messages = Array.from({ length: 61 }, () => message());
    const res = await makeApp().request("/admin/assistant/reschedule/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.streamRescheduleChat).not.toHaveBeenCalled();
  });
});
