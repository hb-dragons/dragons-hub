import { describe, expect, it } from "vitest";
import type { RefereeGameListItem } from "@dragons/shared";
import {
  einsatzView,
  refereeGameRoute,
  spielinfoRoute,
} from "@/lib/referee/einsatz";
import { resolveDeepLink } from "@/lib/nav/href";

function game(overrides: Partial<RefereeGameListItem> = {}): RefereeGameListItem {
  return {
    id: 7,
    apiMatchId: 12345,
    matchId: null,
    matchNo: 42,
    kickoffDate: "2999-01-01",
    kickoffTime: "18:00",
    homeTeamName: "Dragons",
    guestTeamName: "Gäste",
    leagueName: "Bezirksliga",
    leagueShort: "BL",
    venueName: "Sporthalle",
    venueCity: "Herzogenrath",
    homeTeamId: 1,
    sr1OurClub: true,
    sr2OurClub: false,
    sr1Name: null,
    sr2Name: null,
    sr1RefereeApiId: null,
    sr2RefereeApiId: null,
    sr1Status: "open",
    sr2Status: "open",
    isCancelled: false,
    isForfeited: false,
    isTrackedLeague: true,
    isHomeGame: true,
    isGuestGame: false,
    lastSyncedAt: null,
    mySlot: null,
    claimableSlots: [],
    ...overrides,
  };
}

describe("refereeGameRoute", () => {
  it("sends an unlinked referee game to the Einsatz screen", () => {
    expect(refereeGameRoute(game({ id: 7, matchId: null }))).toBe("/referee-game/7");
  });

  // The own-club branch into the fan screen is gone (#307): a referee opening
  // one of their games gets the Einsatz screen whether or not a match is linked.
  it("sends a linked own-club game to the Einsatz screen too", () => {
    expect(
      refereeGameRoute(game({ id: 7, matchId: 99, isHomeGame: true })),
    ).toBe("/referee-game/7");
  });

  it("produces a route the deep-link resolver accepts, linked or not", () => {
    for (const g of [game({ matchId: null }), game({ matchId: 99 })]) {
      const route = refereeGameRoute(g);
      expect(resolveDeepLink(route)).toBe(route);
    }
  });
});

describe("spielinfoRoute", () => {
  it("points at the fan match screen when a match is linked", () => {
    expect(spielinfoRoute(game({ matchId: 99 }))).toBe("/game/99");
  });

  it("is null when the referee game has no linked match", () => {
    expect(spielinfoRoute(game({ matchId: null }))).toBeNull();
  });

  it("produces a route the deep-link resolver accepts", () => {
    const route = spielinfoRoute(game({ matchId: 99 }));
    expect(route).not.toBeNull();
    expect(resolveDeepLink(route!)).toBe(route);
  });
});

describe("einsatzView", () => {
  it("titles the screen with both teams", () => {
    expect(einsatzView(game()).title).toBe("Dragons – Gäste");
  });

  it("lists both slots in order with their federation status", () => {
    const view = einsatzView(
      game({
        sr1Name: "Alex Ref",
        sr1Status: "assigned",
        sr2Name: null,
        sr2Status: "offered",
      }),
    );
    expect(view.slots.map((s) => s.slot)).toEqual([1, 2]);
    expect(view.slots[0]).toMatchObject({
      labelKey: "refereeGame.sr1",
      name: "Alex Ref",
      status: "assigned",
      isMine: false,
    });
    expect(view.slots[1]).toMatchObject({
      labelKey: "refereeGame.sr2",
      name: null,
      status: "offered",
      isMine: false,
    });
  });

  it("marks the slot the current referee holds", () => {
    const view = einsatzView(game({ mySlot: 2, sr2Name: "Ich Selbst" }));
    expect(view.slots[0]!.isMine).toBe(false);
    expect(view.slots[1]!.isMine).toBe(true);
  });

  it("carries the Spielinfo link only for a linked match", () => {
    expect(einsatzView(game({ matchId: 99 })).spielinfoRoute).toBe("/game/99");
    expect(einsatzView(game({ matchId: null })).spielinfoRoute).toBeNull();
  });

  it("lists venue, city and Spielnummer as detail rows", () => {
    expect(einsatzView(game()).details).toEqual([
      { key: "venue", labelKey: "gameDetail.venue", value: "Sporthalle" },
      { key: "address", labelKey: "gameDetail.address", value: "Herzogenrath" },
      { key: "matchNo", labelKey: "refereeGame.matchNo", value: "42" },
    ]);
  });

  it("drops detail rows the referee game has no data for", () => {
    const view = einsatzView(game({ venueName: null, venueCity: null }));
    expect(view.details.map((d) => d.key)).toEqual(["matchNo"]);
  });

  it("reports the status badges the game carries", () => {
    expect(einsatzView(game()).badges).toEqual([]);
    expect(einsatzView(game({ isCancelled: true })).badges).toEqual(["cancelled"]);
    expect(einsatzView(game({ isForfeited: true })).badges).toEqual(["forfeited"]);
    expect(
      einsatzView(game({ isCancelled: true, isForfeited: true })).badges,
    ).toEqual(["cancelled", "forfeited"]);
  });
});
