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
import { resolveDeepLink } from "@/lib/nav/href";

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
      game({ sr1OurClub: true, sr1Status: "open", isForfeited: true }),
    ]);
    expect(
      refereeProvider.useItems(user).find((i) => i.id === "open-slots"),
    ).toBeUndefined();
  });

  it("counts offered slots even when neither slot is our-club", () => {
    setData([
      game({ sr1OurClub: false, sr2OurClub: false, sr1Status: "offered" }),
    ]);
    const items = refereeProvider.useItems(user);
    const openSlots = items.find((i) => i.id === "open-slots");
    expect(openSlots).toBeDefined();
    expect(openSlots?.title).toContain('"count":1');
  });

  it("emits the earliest assigned game as the next assignment", () => {
    setData([
      game({ id: 5, mySlot: 1, kickoffDate: "2999-05-05", matchId: 99 }),
      game({ id: 6, mySlot: 1, kickoffDate: "2999-02-02", matchId: null }),
    ]);
    const next = refereeProvider
      .useItems(user)
      .find((i) => i.id.startsWith("assignment-"));
    expect(next?.id).toBe("assignment-6");
    expect(next?.route).toBe("/referee-game/6");
    expect(next?.urgency).toBe(80);
  });

  // The own-club branch into `/game/:matchId` is gone (#307): a linked match
  // is a "Spielinfo" link on the Einsatz screen, not a different destination.
  it("routes a linked assignment at the Einsatz screen, not the fan screen", () => {
    setData([game({ id: 6, mySlot: 1, kickoffDate: "2999-02-02", matchId: 99 })]);
    const next = refereeProvider
      .useItems(user)
      .find((i) => i.id.startsWith("assignment-"));
    expect(next?.route).toBe("/referee-game/6");
  });

  // A Today item is pressable, so its route has to be a screen. The field is a
  // typed href, but the id comes from the API at runtime — this catches a
  // provider building a path shape no route matches.
  it("routes every item it emits at a real screen", () => {
    setData([
      game({ sr1OurClub: true, sr1Status: "open" }),
      game({ id: 6, mySlot: 1, kickoffDate: "2999-02-02", matchId: 42 }),
    ]);
    const items = refereeProvider.useItems(user);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(resolveDeepLink(item.route), item.id).toBe(item.route);
    }
  });
});
