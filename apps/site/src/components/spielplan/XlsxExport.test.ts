import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildSpielplanRows,
  exportSpielplanXlsx,
  type SpielplanExportGame,
} from "./XlsxExport";

const utils = {
  book_new: vi.fn(() => ({ sheets: [] })),
  json_to_sheet: vi.fn(() => ({}) as Record<string, unknown>),
  book_append_sheet: vi.fn(),
};
const writeFile = vi.fn();

vi.mock("xlsx", () => ({ utils, writeFile }));

function game(overrides: Partial<SpielplanExportGame> = {}): SpielplanExportGame {
  return {
    matchNo: 4711,
    kickoffDate: "2026-04-25",
    kickoffTime: "15:00:00",
    homeTeamName: "HB Dragons",
    guestTeamName: "TK Hannover",
    homeTeamCustomName: "Herren 1",
    guestTeamCustomName: null,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeBadgeColor: "teal",
    guestBadgeColor: null,
    leagueName: "Bezirksliga",
    venueName: "IGS Roderbruch",
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
    publicComment: null,
    ...overrides,
  };
}

describe("buildSpielplanRows", () => {
  test("emits the legacy column set in the legacy order", () => {
    expect(Object.keys(buildSpielplanRows([game()])[0]!)).toEqual([
      "Nr.",
      "Datum",
      "Uhrzeit",
      "Team",
      "Liga",
      "Heim",
      "Gast",
      "Halle",
      "Ergebnis",
      "Kommentar",
    ]);
  });

  test("maps a home game like the legacy export", () => {
    expect(buildSpielplanRows([game()])[0]).toEqual({
      "Nr.": 4711,
      Datum: "Sa., 25.04.26",
      Uhrzeit: "15:00",
      Team: "Herren 1",
      Liga: "Bezirksliga",
      Heim: "Dragons",
      Gast: "TK Hannover",
      Halle: "IGS Roderbruch",
      Ergebnis: "-",
      Kommentar: "",
    });
  });

  test("shows Dragons on the guest side for away games", () => {
    const row = buildSpielplanRows([
      game({
        homeTeamName: "SG Weende",
        guestTeamName: "HB Dragons",
        homeTeamCustomName: null,
        guestTeamCustomName: "Damen 1",
        homeIsOwnClub: false,
        guestIsOwnClub: true,
      }),
    ])[0]!;
    expect(row.Heim).toBe("SG Weende");
    expect(row.Gast).toBe("Dragons");
    expect(row.Team).toBe("Damen 1");
  });

  test("renders a played result and keeps a 0:0 as a result", () => {
    const rows = buildSpielplanRows([
      game({ homeScore: 45, guestScore: 38 }),
      game({ homeScore: 0, guestScore: 0 }),
      game({ homeScore: 45, guestScore: null }),
    ]);
    expect(rows.map((r) => r.Ergebnis)).toEqual(["45:38", "0:0", "-"]);
  });

  test("dashes empty team names and blanks a missing league or venue", () => {
    const row = buildSpielplanRows([
      game({ guestTeamName: "", leagueName: null, venueName: null }),
    ])[0]!;
    expect(row.Gast).toBe("-");
    expect(row.Liga).toBe("");
    expect(row.Halle).toBe("");
  });

  test("dashes an empty home team and passes a malformed date through raw", () => {
    const row = buildSpielplanRows([
      game({ homeTeamName: "", homeIsOwnClub: false, kickoffDate: "kein-datum" }),
    ])[0]!;
    expect(row.Heim).toBe("-");
    expect(row.Datum).toBe("kein-datum");
  });

  test("prefers the venue override over the federation venue", () => {
    expect(
      buildSpielplanRows([game({ venueNameOverride: "Ausweichhalle" })])[0]!.Halle,
    ).toBe("Ausweichhalle");
  });

  test("marks derby games, with and without an existing comment", () => {
    const rows = buildSpielplanRows([
      game({ guestTeamName: "TuS Ahlem" }),
      game({ homeTeamName: "Linden Dudes", publicComment: "verlegt" }),
      game({ publicComment: "verlegt" }),
    ]);
    expect(rows.map((r) => r.Kommentar)).toEqual(["Derby", "Derby | verlegt", "verlegt"]);
  });
});

describe("exportSpielplanXlsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does nothing for an empty plan", async () => {
    await exportSpielplanXlsx([], new Date("2026-08-04T22:30:00Z"));
    expect(writeFile).not.toHaveBeenCalled();
  });

  test("writes the mapped rows to a Spielplan sheet named by the club day", async () => {
    const games = [game()];
    // 22:30Z is already 2026-08-05 in Berlin — the filename must follow.
    await exportSpielplanXlsx(games, new Date("2026-08-04T22:30:00Z"));

    expect(utils.json_to_sheet).toHaveBeenCalledWith(buildSpielplanRows(games));
    const sheet = utils.json_to_sheet.mock.results[0]!.value as Record<string, unknown>;
    // Legacy sized one column per ColumnTranslationMapping entry — 11 with
    // the admin-only "actions" column — kept for identical file output.
    expect(sheet["!cols"]).toEqual(Array.from({ length: 11 }, () => ({ width: 15 })));
    expect(utils.book_append_sheet).toHaveBeenCalledWith(
      utils.book_new.mock.results[0]!.value,
      sheet,
      "Spielplan",
    );
    expect(writeFile).toHaveBeenCalledWith(
      utils.book_new.mock.results[0]!.value,
      "spielplan_2026-08-05.xlsx",
    );
  });
});
