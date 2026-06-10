import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  streamText: vi.fn(), tool: vi.fn((d) => d), stepCountIs: vi.fn((n) => ({ stepCountIs: n })),
  convertToModelMessages: vi.fn((x) => x), assistantModel: vi.fn(() => ({ id: "gemini-2.5-flash" })),
  getMatchForReschedule: vi.fn(),
  stubExecute: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("ai", () => ({ streamText: m.streamText, tool: m.tool, stepCountIs: m.stepCountIs, convertToModelMessages: m.convertToModelMessages }));
vi.mock("../config/ai", () => ({ assistantModel: m.assistantModel }));
vi.mock("../services/reschedule/reschedule-context.service", async (orig) => ({
  ...(await orig<Record<string, unknown>>()), getMatchForReschedule: m.getMatchForReschedule,
}));
vi.mock("./tool-registry", async () => {
  const { z } = await import("zod");
  return {
    reschedTools: [
      { name: "verify_slot", description: "verify a slot", inputSchema: z.object({ date: z.string() }), execute: m.stubExecute },
    ],
  };
});

// --- Imports (after mocks) ---
import { streamRescheduleChat } from "./chat";

describe("streamRescheduleChat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wires the model, tools, system prompt, and a step cap, then returns a Response", async () => {
    m.getMatchForReschedule.mockResolvedValue(null);
    const toResponse = vi.fn(() => new Response("ok"));
    m.streamText.mockReturnValue({ toUIMessageStreamResponse: toResponse });

    const res = await streamRescheduleChat([{ id: "m1", role: "user", parts: [{ type: "text", text: "move game" }] }], undefined);

    expect(m.assistantModel).toHaveBeenCalled();
    const args = m.streamText.mock.calls[0]![0];
    expect(Object.keys(args.tools)).toContain("verify_slot");
    expect(args.system).toMatch(/verify_slot/);
    expect(args.stopWhen).toEqual({ stepCountIs: 8 });
    expect(res).toBeInstanceOf(Response);

    // Exercise the execute delegate so the arrow function wrapper is covered
    const toolDef = args.tools["verify_slot"] as { execute: (a: unknown) => unknown };
    await toolDef.execute({ date: "2026-03-01" });
    expect(m.stubExecute).toHaveBeenCalledWith({ date: "2026-03-01" });
  });

  it("seeds the match when matchId is provided", async () => {
    m.getMatchForReschedule.mockResolvedValue({ matchId: 5, apiMatchId: 55, homeTeamName: "A", guestTeamName: "B", date: "2026-02-14", time: "18:00:00", venueName: "Hall", matchDay: 3, leagueId: 1, leagueName: "L", homeTeamApiId: 1, guestTeamApiId: 2, venueId: 1, isCancelled: false, isForfeited: false });
    const toResponse = vi.fn(() => new Response("ok"));
    m.streamText.mockReturnValue({ toUIMessageStreamResponse: toResponse });
    await streamRescheduleChat([], 5);
    expect(m.getMatchForReschedule).toHaveBeenCalledWith(5);
    const args = m.streamText.mock.calls[0]![0];
    expect(args.system).toMatch(/55/); // apiMatchId seeded into the prompt
  });
});
