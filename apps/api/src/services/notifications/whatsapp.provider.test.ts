import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    })),
  },
}));

import { sendWhatsApp } from "./whatsapp.provider";

describe("sendWhatsApp", () => {
  it("returns success false with error message", async () => {
    const result = await sendWhatsApp("+49123456789", "Hello");

    expect(result.success).toBe(false);
    expect(result.error).toBe("WhatsApp provider not configured");
  });

  it("accepts any phone number and message", async () => {
    const result = await sendWhatsApp("", "");

    expect(result.success).toBe(false);
    expect(result.error).toBe("WhatsApp provider not configured");
  });

  it("returns a promise", () => {
    const result = sendWhatsApp("+49123456789", "Test");

    expect(result).toBeInstanceOf(Promise);
  });
});
