import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => ({ stepCountIs: n })),
  convertToModelMessages: vi.fn((x: unknown) => x),
  chatbotModel: vi.fn(() => ({ id: "gemini-2.5-flash" })),
  toAiSdkTools: vi.fn(() => ({ get_dashboard: {}, get_standings: {}, list_matches: {} })),
}));
vi.mock("ai", () => ({ streamText: m.streamText, stepCountIs: m.stepCountIs, convertToModelMessages: m.convertToModelMessages }));
vi.mock("../../config/ai", () => ({ chatbotModel: m.chatbotModel }));
vi.mock("../tool-kit", () => ({ toAiSdkTools: m.toAiSdkTools }));
vi.mock("./qa-tools", () => ({ qaTools: [] }));

// --- Imports (after mocks) ---
import { streamClubQaChat } from "./qa-chat";

describe("streamClubQaChat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wires model, system prompt, tools and a step cap, then returns a Response", async () => {
    const toResponse = vi.fn(() => new Response("ok"));
    m.streamText.mockReturnValue({ toUIMessageStreamResponse: toResponse });

    const res = await streamClubQaChat({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "table?" }] }],
      locale: "de",
    });

    expect(m.chatbotModel).toHaveBeenCalled();
    const args = m.streamText.mock.calls[0]![0];
    expect(Object.keys(args.tools)).toContain("get_standings");
    expect(args.system).toMatch(/Dragons/);
    expect(args.stopWhen).toEqual({ stepCountIs: 5 });
    expect(res).toBeInstanceOf(Response);
  });
});
