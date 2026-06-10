import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { GateUser } from "@dragons/shared";

vi.mock("swr", () => ({ default: vi.fn() }));
vi.mock("@/lib/api", () => ({ publicApi: { getHomeDashboard: vi.fn() } }));
vi.mock("@/lib/i18n", () => ({
  i18n: { t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) },
}));

import useSWR from "swr";
import { clubProvider } from "@/lib/today/providers/club";

const user = { id: "u1" } as unknown as GateUser;

describe("clubProvider.useItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns [] when SWR data is still loading (undefined)", () => {
    (useSWR as unknown as Mock).mockReturnValue({ data: undefined });
    expect(clubProvider.useItems(user)).toEqual([]);
  });

  it("returns [] when there is no next game", () => {
    (useSWR as unknown as Mock).mockReturnValue({ data: { nextGame: null } });
    expect(clubProvider.useItems(user)).toEqual([]);
  });

  it("emits a next-game item routed to the game", () => {
    (useSWR as unknown as Mock).mockReturnValue({
      data: { nextGame: { id: 7, homeTeamName: "A", guestTeamName: "B", kickoffDate: "2999-01-01" } },
    });
    const items = clubProvider.useItems(user);
    expect(items).toHaveLength(1);
    expect(items[0]?.route).toBe("/game/7");
    expect(items[0]?.urgency).toBe(40);
  });
});
