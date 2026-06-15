import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ streamClubQaChat: vi.fn(), enabled: true }));
vi.mock("../middleware/rbac", () => ({ requireAuth: async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../middleware/rate-limit", () => ({ rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../config/env", () => ({ env: { get CHATBOT_ENABLED() { return mocks.enabled; } } }));
vi.mock("../ai/qa/qa-chat", () => ({ streamClubQaChat: mocks.streamClubQaChat }));
vi.mock("../config/logger", () => ({ logger: { error: vi.fn() } }));

// --- Imports (after mocks) ---
import type { AppEnv } from "../types";
import { errorHandler } from "../middleware/error";
import { qaRoutes } from "./qa.routes";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/qa", qaRoutes);
  return app;
}

function post(body: unknown) {
  return makeApp().request("/qa/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /qa/chat", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; });

  it("returns 503 when the chatbot is disabled", async () => {
    mocks.enabled = false;
    const res = await post({ messages: [{ id: "1" }] });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "CHATBOT_DISABLED" });
  });

  it("delegates to streamClubQaChat and returns its Response", async () => {
    mocks.streamClubQaChat.mockResolvedValue(new Response("stream", { headers: { "x-test": "1" } }));
    const res = await post({ messages: [{ id: "1", role: "user", parts: [] }], locale: "de" });
    expect(res.headers.get("x-test")).toBe("1");
    expect(mocks.streamClubQaChat).toHaveBeenCalledWith({ messages: [{ id: "1", role: "user", parts: [] }], locale: "de" });
    await res.body?.cancel();
  });

  it("rejects an empty messages array with a 400", async () => {
    const res = await post({ messages: [] });
    expect(res.status).toBe(400);
  });
});
