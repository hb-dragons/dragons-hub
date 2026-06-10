import { describe, expect, it, vi } from "vitest";

vi.mock("../services/reschedule/verify-slot.service", () => ({
  verifySlot: vi.fn(async () => ({ ok: true, conflicts: [] })),
}));
vi.mock("../services/reschedule/reschedule-context.service", () => ({
  getMatchForReschedule: vi.fn(),
  listClubMatches: vi.fn(),
  listVenueBookings: vi.fn(),
  listClubVenues: vi.fn(async () => [{ venueId: 1, name: "Hall 1", city: "Town" }]),
  getRoundWindow: vi.fn(),
  getRefereeContext: vi.fn(),
}));

// --- Imports (after mocks) ---
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./mcp-server";

describe("buildMcpServer", () => {
  it("lists all registry tools and executes one over an in-memory transport", async () => {
    const server = buildMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("verify_slot");

    const res = await client.callTool({ name: "list_club_venues", arguments: {} });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(JSON.parse(text)).toEqual([{ venueId: 1, name: "Hall 1", city: "Town" }]);
  });
});
