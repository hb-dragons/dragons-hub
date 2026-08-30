import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchListItem } from "@dragons/shared";
import {
  buildSpielplanExportRows,
  isDerbyGame,
  spielplanRowClass,
  withDerbyPrefix,
} from "./utils";

function makeMatch(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: 1,
    apiMatchId: 100,
    matchNo: 42,
    matchDay: 3,
    kickoffDate: "2026-09-06",
    kickoffTime: "15:30:00",
    homeTeamApiId: 10,
    homeTeamName: "TSV Musterstadt",
    homeTeamNameShort: null,
    homeTeamCustomName: null,
    homeClubId: 500,
    guestTeamApiId: 20,
    guestTeamName: "HB Dragons Hannover",
    guestTeamNameShort: null,
    guestTeamCustomName: "Herren 2",
    guestClubId: 4121,
    homeIsOwnClub: false,
    guestIsOwnClub: true,
    homeBadgeColor: null,
    guestBadgeColor: "#00ff00",
    homeScore: null,
    guestScore: null,
    leagueId: 7,
    leagueName: "Bezirksliga",
    venueId: 9,
    venueName: "Sporthalle Musterstadt",
    venueStreet: null,
    venuePostalCode: null,
    venueCity: null,
    venueNameOverride: null,
    isConfirmed: true,
    isForfeited: false,
    isCancelled: false,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    publicComment: null,
    hasLocalChanges: false,
    overriddenFields: [],
    booking: null,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("isDerbyGame", () => {
  it("flags games against a derby club on either side", () => {
    expect(isDerbyGame(makeMatch({ homeTeamName: "TuS Ahlem" }))).toBe(true);
    expect(isDerbyGame(makeMatch({ guestTeamName: "Linden Dudes II" }))).toBe(true);
  });

  it("is false for a regular opponent", () => {
    expect(isDerbyGame(makeMatch())).toBe(false);
  });
});

describe("withDerbyPrefix", () => {
  it("prefixes an existing comment on a derby game", () => {
    expect(withDerbyPrefix("Kuchenverkauf", true)).toBe("Derby | Kuchenverkauf");
  });

  it("is just 'Derby' when the derby game has no comment", () => {
    expect(withDerbyPrefix(null, true)).toBe("Derby");
  });

  it("passes the comment through unchanged otherwise", () => {
    expect(withDerbyPrefix("Kuchenverkauf", false)).toBe("Kuchenverkauf");
    expect(withDerbyPrefix(null, false)).toBe("");
  });
});

describe("spielplanRowClass", () => {
  it("tints a Dragons home game", () => {
    const cls = spielplanRowClass(makeMatch({ homeIsOwnClub: true, guestIsOwnClub: false }));
    expect(cls).toContain("border-l-primary/50");
    expect(cls).toContain("bg-primary/5");
  });

  it("highlights a derby game", () => {
    expect(spielplanRowClass(makeMatch({ homeTeamName: "TuS Ahlem" }))).toContain("bg-heat/10");
  });

  it("mutes a game whose comment says it was moved (verlegt)", () => {
    expect(spielplanRowClass(makeMatch({ publicComment: "wird verlegt" }))).toContain(
      "text-muted-foreground",
    );
  });

  it("strikes through cancelled and forfeited games", () => {
    expect(spielplanRowClass(makeMatch({ isCancelled: true }))).toContain("line-through");
    expect(spielplanRowClass(makeMatch({ isForfeited: true }))).toContain("line-through");
  });

  it("leaves a plain away game unstyled", () => {
    expect(spielplanRowClass(makeMatch())).toBe("");
  });
});

describe("buildSpielplanExportRows", () => {
  it("maps a game to the legacy column set, pinned to the club timezone", () => {
    // Berlin is the one zone where a UTC-based day slice happens to look right,
    // so run the assertion from a zone far away from it.
    vi.stubEnv("TZ", "Pacific/Kiritimati");

    const rows = buildSpielplanExportRows([
      makeMatch({
        homeScore: 78,
        guestScore: 65,
        anschreiber: "Damen 1",
        zeitnehmer: "U18",
        shotclock: "Herren 1",
        publicComment: "Kuchenverkauf",
      }),
    ]);

    expect(rows).toEqual([
      {
        "Nr.": 42,
        Datum: "So., 06.09.26",
        Uhrzeit: "15:30",
        Team: "Herren 2",
        Liga: "Bezirksliga",
        Heim: "TSV Musterstadt",
        Gast: "Dragons",
        Halle: "Sporthalle Musterstadt",
        Ergebnis: "78:65",
        Anschreiber: "Damen 1",
        Zeitnehmer: "U18",
        Shotclock: "Herren 1",
        Kommentar: "Kuchenverkauf",
      },
    ]);
  });

  it("prefers the venue override, shows Dragons on the home side, and blanks missing values", () => {
    const [row] = buildSpielplanExportRows([
      makeMatch({
        homeIsOwnClub: true,
        guestIsOwnClub: false,
        homeTeamCustomName: "Herren 2",
        guestTeamCustomName: null,
        homeTeamName: "HB Dragons Hannover",
        guestTeamName: "TSV Musterstadt",
        venueNameOverride: "Ausweichhalle",
      }),
    ]);

    expect(row).toMatchObject({
      Team: "Herren 2",
      Heim: "Dragons",
      Gast: "TSV Musterstadt",
      Halle: "Ausweichhalle",
      Ergebnis: "—",
      Anschreiber: "",
      Kommentar: "",
    });
  });

  it("marks a derby in the exported comment", () => {
    const [row] = buildSpielplanExportRows([makeMatch({ homeTeamName: "TuS Ahlem" })]);
    expect(row?.Kommentar).toBe("Derby");
  });
});
