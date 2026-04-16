import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChannelSendParams } from "./types";

// Mock env BEFORE importing the adapter
vi.mock("../../../config/env", () => ({
  env: {
    WAHA_BASE_URL: "http://waha:3000",
    WAHA_SESSION: "default",
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock logger
vi.mock("../../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Import AFTER mocks are set up
const { WhatsAppGroupAdapter } = await import("./whatsapp-group");
import { env } from "../../../config/env";

describe("WhatsAppGroupAdapter", () => {
  const adapter = new WhatsAppGroupAdapter();

  const baseParams: ChannelSendParams = {
    eventId: "test-event-1",
    watchRuleId: null,
    channelConfigId: 1,
    recipientId: null,
    title: "Test Title",
    body: "Test body message",
    locale: "de",
  };

  const groupId = "120363171744447809@g.us";

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends text message to WAHA API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "msg-1" }),
    });

    const result = await adapter.send(baseParams, groupId);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://waha:3000/api/sendText",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: "default",
          chatId: "120363171744447809@g.us",
          text: "Test body message",
        }),
      }),
    );
  });

  it("returns error when WAHA responds with non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const result = await adapter.send(baseParams, groupId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await adapter.send(baseParams, groupId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection refused");
  });

  it("returns error when WAHA_BASE_URL is not configured", async () => {
    const originalUrl = env.WAHA_BASE_URL;
    (env as Record<string, unknown>).WAHA_BASE_URL = "";

    const result = await adapter.send(baseParams, groupId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("WAHA not configured");
    expect(mockFetch).not.toHaveBeenCalled();

    (env as Record<string, unknown>).WAHA_BASE_URL = originalUrl;
  });
});
