import { describe, expect, it, vi } from "vitest";

describe("chatbotModel", () => {
  it("creates the google provider and returns the configured CHATBOT_MODEL", async () => {
    vi.resetModules();
    const createGoogleGenerativeAI = vi.fn();
    vi.doMock("@ai-sdk/google", () => ({ createGoogleGenerativeAI }));
    vi.doMock("./env", () => ({
      env: { GOOGLE_GENERATIVE_AI_API_KEY: "test-key", CHATBOT_MODEL: "gemini-2.5-flash" },
    }));
    const { chatbotModel } = await import("./ai");
    const modelFactory = vi.fn().mockReturnValue({ id: "gemini-2.5-flash" });
    createGoogleGenerativeAI.mockReturnValue(modelFactory);
    const model = chatbotModel();
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(modelFactory).toHaveBeenCalledWith("gemini-2.5-flash");
    expect(model).toEqual({ id: "gemini-2.5-flash" });
    vi.resetModules();
  });

  it("throws when GOOGLE_GENERATIVE_AI_API_KEY is not set", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({
      env: { GOOGLE_GENERATIVE_AI_API_KEY: undefined, CHATBOT_MODEL: "gemini-2.5-flash" },
    }));
    vi.doMock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: vi.fn() }));
    const { chatbotModel: freshChatbotModel } = await import("./ai");
    expect(() => freshChatbotModel()).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    vi.resetModules();
  });
});
