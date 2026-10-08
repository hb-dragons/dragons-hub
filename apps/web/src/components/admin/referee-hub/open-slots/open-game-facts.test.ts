import { describe, expect, it } from "vitest";
import type { RefereeGameListItem } from "@dragons/shared";
import { openSlotCount, ourSlots, ownSide } from "./open-game-facts";

function game(over: Partial<RefereeGameListItem>): RefereeGameListItem {
  return {
    homeTeamName: "Hanover Dragons",
    guestTeamName: "TuS Bothfeld",
    homeTeamCustomName: null,
    guestTeamCustomName: null,
    isHomeGame: true,
    isGuestGame: false,
    sr1OurClub: true,
    sr2OurClub: true,
    sr1Status: "open",
    sr2Status: "open",
    sr1Name: null,
    sr2Name: null,
    ...over,
  } as RefereeGameListItem;
}

describe("ownSide", () => {
  it("puts our team first and the opponent second for a home game", () => {
    expect(ownSide(game({}))).toEqual({ own: "Hanover Dragons", opponent: "TuS Bothfeld", home: true });
  });

  it("flips the sides for an away game", () => {
    expect(ownSide(game({ isHomeGame: false, isGuestGame: true }))).toEqual({
      own: "TuS Bothfeld",
      opponent: "Hanover Dragons",
      home: false,
    });
  });

  it("prefers the club-facing name of our team when there is one", () => {
    expect(ownSide(game({ homeTeamCustomName: "Herren 1" })).own).toBe("Herren 1");
  });
});

describe("ourSlots", () => {
  it("lists only the slots our club fills", () => {
    const slots = ourSlots(game({ sr2OurClub: false, sr1Status: "assigned", sr1Name: "Lena Bauer" }));
    expect(slots).toEqual([{ n: 1, status: "assigned", name: "Lena Bauer" }]);
  });
});

describe("openSlotCount", () => {
  it("counts our slots nobody holds yet, offered ones included", () => {
    expect(openSlotCount(game({ sr1Status: "offered", sr2Status: "open" }))).toBe(2);
    expect(openSlotCount(game({ sr1Status: "assigned", sr2Status: "open" }))).toBe(1);
    expect(openSlotCount(game({ sr1Status: "open", sr2OurClub: false }))).toBe(1);
  });
});
