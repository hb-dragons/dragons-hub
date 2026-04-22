import { describe, expect, it } from "vitest";
import { toCsv, gamesToCsvRows, leaderboardToCsvRows } from "./referee-history.csv";
import type { HistoryGameItem, HistoryLeaderboardEntry } from "@dragons/shared";

describe("toCsv", () => {
  it("joins header + rows with CRLF", () => {
    const csv = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv(["h"], [['a,b'], ['a"b'], ["a\nb"]]);
    expect(csv).toBe('h\r\n"a,b"\r\n"a""b"\r\n"a\nb"\r\n');
  });

  it("empty rows produce header-only CSV", () => {
    const csv = toCsv(["h1", "h2"], []);
    expect(csv).toBe("h1,h2\r\n");
  });

  it("throws when row length does not match header length", () => {
    expect(() => toCsv(["a", "b"], [["1"]])).toThrow(/row length/);
  });
});

describe("gamesToCsvRows", () => {
  it("flattens booleans and nulls", () => {
    const item: HistoryGameItem = {
      id: 1, matchId: null, matchNo: 7,
      kickoffDate: "2025-09-01", kickoffTime: "18:00:00",
      homeTeamName: "Dragons", guestTeamName: "Bears",
      leagueName: "Oberliga", leagueShort: "OL",
      venueName: null, venueCity: null,
      sr1OurClub: true, sr2OurClub: false,
      sr1Name: "Mueller", sr2Name: null,
      sr1Status: "filled", sr2Status: "open",
      isCancelled: false, isForfeited: false, isHomeGame: true,
    };
    const [row] = gamesToCsvRows([item]);
    expect(row!).toContain("true");
    expect(row!).toContain("false");
    // null → empty
    expect(row!.some((v) => v === "")).toBe(true);
  });
});

describe("leaderboardToCsvRows", () => {
  it("produces rank-indexed rows", () => {
    const entries: HistoryLeaderboardEntry[] = [
      { refereeApiId: 100, refereeId: 1, displayName: "Mueller",
        isOwnClub: true, sr1Count: 3, sr2Count: 2, total: 5,
        lastRefereedDate: "2025-09-30" },
      { refereeApiId: null, refereeId: null, displayName: "Guest",
        isOwnClub: false, sr1Count: 1, sr2Count: 0, total: 1,
        lastRefereedDate: null },
    ];
    const rows = leaderboardToCsvRows(entries);
    expect(rows[0]![0]).toBe("1");
    expect(rows[1]![0]).toBe("2");
    expect(rows[1]![rows[1]!.length - 1]).toBe("");
  });
});
