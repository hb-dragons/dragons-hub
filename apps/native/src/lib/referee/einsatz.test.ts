import { describe, expect, it } from "vitest";
import type { RefereeGameDetail, RefereeTeamContact } from "@dragons/shared";
import {
  einsatzView,
  mailtoUrl,
  mapsUrl,
  refereeGameRoute,
  refereeGameTeamNames,
  spielinfoRoute,
  telUrl,
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
    homeClubId: 1000,
    guestClubId: 2000,
    homeTeamCustomName: null,
    guestTeamCustomName: null,
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

describe("refereeGameTeamNames", () => {
  it("prefers the club's own names and falls back to the federation's per side", () => {
    expect(
      refereeGameTeamNames(
        game({ homeTeamName: "Hanover Basketball Dragons I", homeTeamCustomName: "Herren 1" }),
      ),
    ).toEqual({ home: "Herren 1", guest: "Gäste" });
    expect(refereeGameTeamNames(game())).toEqual({ home: "Dragons", guest: "Gäste" });
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

  it("prefers the club's own team names in the title and header", () => {
    const view = einsatzView(
      game({ homeTeamName: "Hanover Basketball Dragons I", homeTeamCustomName: "Herren 1" }),
      "ios",
    );
    expect(view.title).toBe("Herren 1 – Gäste");
    expect(view.teams.home.name).toBe("Herren 1");
    expect(view.teams.guest.name).toBe("Gäste");
  });

  it("hands the header both crests and marks the Dragons side", () => {
    expect(einsatzView(game(), "ios").teams).toEqual({
      home: { name: "Dragons", clubId: 1000, isOwnClub: true },
      guest: { name: "Gäste", clubId: 2000, isOwnClub: false },
    });
  });

  it("marks the guest side on an away game and neither on a foreign one", () => {
    const away = einsatzView(
      game({ isHomeGame: false, isGuestGame: true }),
      "ios",
    ).teams;
    expect([away.home.isOwnClub, away.guest.isOwnClub]).toEqual([false, true]);

    const foreign = einsatzView(
      game({ isHomeGame: false, isGuestGame: false }),
      "ios",
    ).teams;
    expect([foreign.home.isOwnClub, foreign.guest.isOwnClub]).toEqual([false, false]);
  });

  it("passes a missing crest through as null rather than a placeholder id", () => {
    const { teams } = einsatzView(game({ homeClubId: null, guestClubId: null }), "ios");
    expect([teams.home.clubId, teams.guest.clubId]).toEqual([null, null]);
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

// ---------------------------------------------------------------------------
// Kampfgericht and team contacts (#313)
// ---------------------------------------------------------------------------

describe("telUrl / mailtoUrl", () => {
  it("strips the spelling out of a phone number but keeps it in the label", () => {
    expect(telUrl("+49 2406 / 123 45")).toBe("tel:+49240612345");
    expect(telUrl("0170-1234567")).toBe("tel:01701234567");
  });

  it("hands an address straight to mailto:", () => {
    expect(mailtoUrl("ana@example.de")).toBe("mailto:ana@example.de");
  });
});

describe("einsatzView — Kampfgericht and contacts", () => {
  const ANA: RefereeTeamContact = {
    firstName: "Ana",
    lastName: "Berger",
    role: "trainer",
    phone: "+49 2406 123",
    email: "ana@example.de",
  };
  const KIM: RefereeTeamContact = {
    firstName: "Kim",
    lastName: "Draak",
    role: "co_trainer",
    phone: null,
    email: null,
  };

  // A referee looking at an open game they do not hold: the API sends neither
  // key, and both blocks are simply empty rather than undefined.
  it("shows neither block when the API withheld both keys", () => {
    const view = einsatzView(game(), "ios");

    expect(view.kampfgericht).toEqual([]);
    expect(view.contacts).toEqual([]);
  });

  it("turns each contact into a callable and mailable row", () => {
    const view = einsatzView(
      game({
        contacts: [{ teamEntryId: 3, teamName: "Dragons 1", contacts: [ANA] }],
      }),
      "ios",
    );

    expect(view.contacts).toEqual([
      {
        key: "3",
        teamName: "Dragons 1",
        contacts: [
          {
            key: "0:Berger:trainer",
            name: "Ana Berger",
            roleKey: "teamStaff.role.trainer",
            phone: { label: "+49 2406 123", url: "tel:+492406123" },
            email: { label: "ana@example.de", url: "mailto:ana@example.de" },
          },
        ],
      },
    ]);
  });

  it("leaves out the action a contact has no value for", () => {
    const view = einsatzView(
      game({ contacts: [{ teamEntryId: 3, teamName: "Dragons 1", contacts: [KIM] }] }),
      "ios",
    );

    expect(view.contacts[0]?.contacts[0]).toMatchObject({ phone: null, email: null });
  });

  it("lists both teams of a derby", () => {
    const view = einsatzView(
      game({
        contacts: [
          { teamEntryId: 3, teamName: "Dragons 1", contacts: [ANA] },
          { teamEntryId: 4, teamName: "Dragons 2", contacts: [KIM] },
        ],
      }),
      "ios",
    );

    expect(view.contacts.map((g) => g.teamName)).toEqual(["Dragons 1", "Dragons 2"]);
    expect(view.contacts.map((g) => g.key)).toEqual(["3", "4"]);
  });

  it("renders one collapsed Kampfgericht line when one team runs all three roles", () => {
    const view = einsatzView(
      game({
        kampfgericht: [
          {
            roles: ["anschreiber", "zeitnehmer", "shotclock"],
            teamName: "Dragons 2",
            contacts: [KIM],
          },
        ],
      }),
      "ios",
    );

    expect(view.kampfgericht).toEqual([
      {
        key: "0:Dragons 2",
        teamName: "Dragons 2",
        roleKeys: [
          "refereeGame.kampfgerichtRole.anschreiber",
          "refereeGame.kampfgerichtRole.zeitnehmer",
          "refereeGame.kampfgerichtRole.shotclock",
        ],
        contacts: [
          expect.objectContaining({ name: "Kim Draak", phone: null, email: null }),
        ],
      },
    ]);
  });

  it("renders one line per team when the roles are split", () => {
    const view = einsatzView(
      game({
        kampfgericht: [
          { roles: ["anschreiber", "zeitnehmer"], teamName: "Dragons 2", contacts: [] },
          { roles: ["shotclock"], teamName: "Dragons 3", contacts: [] },
        ],
      }),
      "ios",
    );

    expect(view.kampfgericht.map((line) => [line.key, line.roleKeys.length])).toEqual([
      ["0:Dragons 2", 2],
      ["1:Dragons 3", 1],
    ]);
  });

  // The API deduped: the Kampfgericht team is the team playing, so its people
  // are under `contacts` and the Kampfgericht line names the team only.
  it("shows a deduped Kampfgericht line without repeating the contact", () => {
    const view = einsatzView(
      game({
        contacts: [{ teamEntryId: 3, teamName: "Dragons 1", contacts: [ANA] }],
        kampfgericht: [
          {
            roles: ["anschreiber", "zeitnehmer", "shotclock"],
            teamName: "Dragons 1",
            contacts: [],
          },
        ],
      }),
      "ios",
    );

    expect(view.kampfgericht[0]?.contacts).toEqual([]);
    expect(view.contacts[0]?.contacts).toHaveLength(1);
  });
});
