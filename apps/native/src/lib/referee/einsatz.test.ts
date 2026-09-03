import { describe, expect, it } from "vitest";
import type { RefereeGameDetail } from "@dragons/shared";
import {
  einsatzView,
  mapsUrl,
  refereeGameRoute,
  spielinfoRoute,
} from "@/lib/referee/einsatz";
import { resolveDeepLink } from "@/lib/nav/href";

function brief(
  overrides: Partial<RefereeGameDetail["brief"]> = {},
): RefereeGameDetail["brief"] {
  return {
    venueStreet: "Hauptstr. 1",
    venuePostalCode: "52134",
    sr1Tentative: false,
    sr2Tentative: false,
    venueChanged: false,
    timeChanged: false,
    federationUrl: "https://www.basketball-bund.net/static/#/spiel/12345",
    ...overrides,
  };
}

function game(overrides: Partial<RefereeGameDetail> = {}): RefereeGameDetail {
  return {
    brief: brief(),
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

/** A row synced before #309: no street, no postal code, no flags. */
function legacy(overrides: Partial<RefereeGameDetail> = {}): RefereeGameDetail {
  return game({
    brief: brief({ venueStreet: null, venuePostalCode: null }),
    ...overrides,
  });
}

describe("einsatzView", () => {
  it("titles the screen with both teams", () => {
    expect(einsatzView(game(), "ios").title).toBe("Dragons – Gäste");
  });

  it("lists both slots in order with their federation status", () => {
    const view = einsatzView(
      game({
        sr1Name: "Alex Ref",
        sr1Status: "assigned",
        sr2Name: null,
        sr2Status: "offered",
      }),
      "ios",
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
    const view = einsatzView(game({ mySlot: 2, sr2Name: "Ich Selbst" }), "ios");
    expect(view.slots[0]!.isMine).toBe(false);
    expect(view.slots[1]!.isMine).toBe(true);
  });

  it("carries the Spielinfo link only for a linked match", () => {
    expect(einsatzView(game({ matchId: 99 }), "ios").spielinfoRoute).toBe("/game/99");
    expect(einsatzView(game({ matchId: null }), "ios").spielinfoRoute).toBeNull();
  });

  it("lists venue, city and Spielnummer as detail rows", () => {
    expect(einsatzView(legacy(), "ios").details).toEqual([
      { key: "venue", labelKey: "gameDetail.venue", value: "Sporthalle" },
      { key: "address", labelKey: "gameDetail.address", value: "Herzogenrath" },
      { key: "matchNo", labelKey: "refereeGame.matchNo", value: "42" },
    ]);
  });

  it("drops detail rows the referee game has no data for", () => {
    const view = einsatzView(legacy({ venueName: null, venueCity: null }), "ios");
    expect(view.details.map((d) => d.key)).toEqual(["matchNo"]);
  });

  it("reports the status badges the game carries", () => {
    expect(einsatzView(game(), "ios").badges).toEqual([]);
    expect(einsatzView(game({ isCancelled: true }), "ios").badges).toEqual(["cancelled"]);
    expect(einsatzView(game({ isForfeited: true }), "ios").badges).toEqual(["forfeited"]);
    expect(
      einsatzView(game({ isCancelled: true, isForfeited: true }), "ios").badges,
    ).toEqual(["cancelled", "forfeited"]);
  });
});

describe("mapsUrl", () => {
  it("opens Apple Maps on iOS", () => {
    expect(mapsUrl("Sporthalle, Hauptstr. 1", "ios")).toBe(
      "maps://?q=Sporthalle%2C%20Hauptstr.%201",
    );
  });

  it("opens the platform maps app through a geo: intent on Android", () => {
    expect(mapsUrl("Sporthalle, Hauptstr. 1", "android")).toBe(
      "geo:0,0?q=Sporthalle%2C%20Hauptstr.%201",
    );
  });
});

describe("einsatzView — brief (#309)", () => {
  it("builds the full address with a maps link", () => {
    const view = einsatzView(game({ venueName: "Sporthalle" }), "ios");

    expect(view.address).toEqual({
      street: "Hauptstr. 1",
      cityLine: "52134 Herzogenrath",
      mapsUrl: mapsUrl("Sporthalle, Hauptstr. 1, 52134 Herzogenrath", "ios"),
    });
  });

  // Older syncs stored no street. The screen shows no address block rather
  // than one with blanks in it; the city stays available as a detail row.
  it("has no address block for a row synced before the columns existed", () => {
    const view = einsatzView(legacy(), "ios");

    expect(view.address).toBeNull();
    expect(view.details.map((d) => d.key)).toContain("address");
  });

  it("drops the venue detail rows once the address block carries them", () => {
    const view = einsatzView(game({ venueName: "Sporthalle" }), "ios");
    expect(view.details.map((d) => d.key)).toEqual(["matchNo"]);
  });

  it("omits the postal code from the city line when only the city is known", () => {
    const view = einsatzView(game({ brief: brief({ venuePostalCode: null }) }), "ios");
    expect(view.address?.cityLine).toBe("Herzogenrath");
  });

  it("marks a slot the federation still calls vorläufig", () => {
    const view = einsatzView(
      game({ brief: brief({ sr1Tentative: true, sr2Tentative: false }) }),
      "ios",
    );
    expect(view.slots[0]!.tentative).toBe(true);
    expect(view.slots[1]!.tentative).toBe(false);
  });

  it("reports the federation's change flags as callouts", () => {
    expect(einsatzView(game(), "ios").changes).toEqual([]);
    expect(
      einsatzView(game({ brief: brief({ venueChanged: true }) }), "ios").changes,
    ).toEqual(["venueChanged"]);
    expect(
      einsatzView(
        game({ brief: brief({ venueChanged: true, timeChanged: true }) }),
        "ios",
      ).changes,
    ).toEqual(["venueChanged", "timeChanged"]);
  });

  it("carries the federation deep link", () => {
    expect(einsatzView(game(), "ios").federationUrl).toBe(
      "https://www.basketball-bund.net/static/#/spiel/12345",
    );
  });
});
