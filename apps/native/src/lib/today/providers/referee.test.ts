import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { GateUser } from "@dragons/shared";

vi.mock("swr", () => ({ default: vi.fn() }));
vi.mock("@/lib/api", () => ({
  refereeApi: { getGames: vi.fn() },
}));
vi.mock("@/lib/i18n", () => ({
  i18n: {
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  },
}));

import useSWR from "swr";
import { refereeProvider } from "@/lib/today/providers/referee";

const user = { id: "u1", role: "refereeAdmin" } as unknown as GateUser;

function game(overrides: Record<string, unknown>) {
  return {
    id: 1,
    matchId: null,
    kickoffDate: "2999-01-01",
    homeTeamName: "A",
    guestTeamName: "B",
    mySlot: null,
    isCancelled: false,
    isForfeited: false,
    sr1OurClub: false,
    sr2OurClub: false,
    sr1Status: "open",
    sr2Status: "open",
    ...overrides,
  };
}

function setData(items: unknown[]) {
  (useSWR as unknown as Mock).mockReturnValue({ data: { items } });
}

describe("refereeProvider.useItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns no items when SWR has no data yet", () => {
    (useSWR as unknown as Mock).mockReturnValue({ data: undefined });
    expect(refereeProvider.useItems(user)).toEqual([]);
  });

  it("emits an open-slots item counting our-club unassigned slots", () => {
    setData([
      game({ sr1OurClub: true, sr1Status: "open" }),
      game({ sr2OurClub: true, sr2Status: "open" }),
    ]);
    const items = refereeProvider.useItems(user);
    const openSlots = items.find((i) => i.id === "open-slots");
    expect(openSlots).toBeDefined();
    expect(openSlots?.title).toContain('"count":2');
    expect(openSlots?.urgency).toBe(70);
  });

  it("ignores cancelled, forfeited, and past games for open-slot counting", () => {
    setData([
      game({ sr1OurClub: true, sr1Status: "open", isCancelled: true }),
      game({ sr1OurClub: true, sr1Status: "open", kickoffDate: "2000-01-01" }),
    ]);
    expect(
      refereeProvider.useItems(user).find((i) => i.id === "open-slots"),
    ).toBeUndefined();
  });

  it("emits the earliest assigned game as the next assignment", () => {
    setData([
      game({ id: 5, mySlot: "sr1", kickoffDate: "2999-05-05", matchId: 99 }),
      game({ id: 6, mySlot: "sr1", kickoffDate: "2999-02-02", matchId: null }),
    ]);
    const next = refereeProvider
      .useItems(user)
      .find((i) => i.id.startsWith("assignment-"));
    expect(next?.id).toBe("assignment-6");
    expect(next?.route).toBe("/referee-game/6");
    expect(next?.urgency).toBe(80);
  });
});
