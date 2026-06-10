import { describe, expect, it, vi } from "vitest";

describe("assistantModel", () => {
  it("creates the google provider with the configured key and returns the configured model", async () => {
    vi.resetModules();
    const createGoogleGenerativeAI = vi.fn();
    vi.doMock("@ai-sdk/google", () => ({ createGoogleGenerativeAI }));
    vi.doMock("./env", () => ({
      env: { GOOGLE_GENERATIVE_AI_API_KEY: "test-key", ASSISTANT_MODEL: "gemini-2.5-flash" },
    }));
    const { assistantModel } = await import("./ai");
    const modelFactory = vi.fn().mockReturnValue({ id: "gemini-2.5-flash" });
    createGoogleGenerativeAI.mockReturnValue(modelFactory);
    const model = assistantModel();
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(modelFactory).toHaveBeenCalledWith("gemini-2.5-flash");
    expect(model).toEqual({ id: "gemini-2.5-flash" });
    vi.resetModules();
  });

  it("throws when GOOGLE_GENERATIVE_AI_API_KEY is not set", async () => {
    vi.resetModules();
    vi.doMock("./env", () => ({ env: { GOOGLE_GENERATIVE_AI_API_KEY: undefined, ASSISTANT_MODEL: "gemini-2.5-flash" } }));
    vi.doMock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: vi.fn() }));
    const { assistantModel: freshAssistantModel } = await import("./ai");
    expect(() => freshAssistantModel()).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    vi.resetModules();
  });
});
