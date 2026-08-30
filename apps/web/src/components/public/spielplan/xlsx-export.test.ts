import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchListItem } from "@dragons/shared";

vi.mock("xlsx", () => ({
  utils: {
    book_new: vi.fn(() => ({ Sheets: {}, SheetNames: [] })),
    json_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

import * as XLSX from "xlsx";
import { exportSpielplanXlsx } from "./xlsx-export";

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
    guestBadgeColor: null,
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

beforeEach(() => {
  vi.mocked(XLSX.writeFile).mockClear();
  vi.mocked(XLSX.utils.json_to_sheet).mockClear();
});

describe("exportSpielplanXlsx", () => {
  it("does nothing for an empty plan", async () => {
    await exportSpielplanXlsx([]);
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  it("writes the built rows to a file named after the club day", async () => {
    // 23:30 UTC is already the next day in Berlin — the filename must follow
    // the club zone, not UTC.
    await exportSpielplanXlsx([makeMatch()], new Date("2026-09-04T23:30:00Z"));

    const rows = vi.mocked(XLSX.utils.json_to_sheet).mock.calls[0]![0] as Record<
      string,
      unknown
    >[];
    expect(rows[0]).toMatchObject({ Team: "Herren 2", Heim: "TSV Musterstadt" });
    expect(XLSX.writeFile).toHaveBeenCalledWith(
      expect.anything(),
      "spielplan_2026-09-05.xlsx",
    );
  });
});
