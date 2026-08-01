import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatTableDate,
  nextGameParams,
  prevGameParams,
  sortGamesByKickoff,
  tableResult,
  tableSideLabel,
  tableVenue,
  teamGameRowClass,
  type TeamTableGame,
} from "./team-games";

function game(overrides: Partial<TeamTableGame> = {}): TeamTableGame {
  return {
    kickoffDate: "2025-09-13",
    kickoffTime: "18:15:00",
    homeTeamName: "HB Dragons LLH",
    guestTeamName: "TSV Neustadt III",
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeScore: null,
    guestScore: null,
    venueName: "Friedrich-Ebert-Schule",
    venueNameOverride: null,
    publicComment: null,
    ...overrides,
  };
}

// Table labels must not depend on the runtime's zone (CLAUDE.md date rule) —
// the whole suite runs under a forced non-Berlin TZ.
beforeEach(() => {
  vi.stubEnv("TZ", "Pacific/Honolulu");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("formatTableDate", () => {
  it("formats a kickoff date as the legacy short table label", () => {
    expect(formatTableDate("2025-09-13")).toBe("Sa., 13.09.25");
  });

  it("returns the raw string when the date is unparseable", () => {
    expect(formatTableDate("kaputt")).toBe("kaputt");
  });
});

describe("tableResult", () => {
  it("joins both scores with a colon", () => {
    expect(tableResult(game({ homeScore: 72, guestScore: 46 }))).toBe("72:46");
  });

  it("renders a bare colon while any score is missing", () => {
    expect(tableResult(game({ homeScore: 72, guestScore: null }))).toBe(":");
    expect(tableResult(game())).toBe(":");
  });

  it("keeps a genuine zero score visible", () => {
    expect(tableResult(game({ homeScore: 0, guestScore: 20 }))).toBe("0:20");
  });
});

describe("tableSideLabel", () => {
  it("collapses the own club side to Dragons", () => {
    expect(tableSideLabel("HB Dragons LLH", true)).toBe("Dragons");
  });

  it("shows the federation name for opponents", () => {
    expect(tableSideLabel("TSV Neustadt III", false)).toBe("TSV Neustadt III");
  });

  it("falls back to a dash when the name is empty", () => {
    expect(tableSideLabel("", false)).toBe("-");
  });
});

describe("tableVenue", () => {
  it("prefers the venue override", () => {
    expect(tableVenue(game({ venueNameOverride: "Halle B" }))).toBe("Halle B");
  });

  it("uses the synced venue name otherwise", () => {
    expect(tableVenue(game())).toBe("Friedrich-Ebert-Schule");
  });

  it("falls back to a dash without any venue", () => {
    expect(tableVenue(game({ venueName: null }))).toBe("-");
  });
});

describe("teamGameRowClass", () => {
  it("tints own home games", () => {
    expect(teamGameRowClass(game())).toBe("dark:bg-green-300/10 bg-green-800/10");
  });

  it("renders the derby gradient over the home tint for home derbies", () => {
    const derby = game({ guestTeamName: "TuS Ahlem" });
    expect(teamGameRowClass(derby)).toBe(
      "bg-gradient-to-r dark:from-red-500/25 to-15% dark:to-green-300/10 from-red-800/20 to-green-800/10",
    );
  });

  it("renders the plain derby gradient for away derbies", () => {
    const derby = game({
      homeTeamName: "Linden Dudes",
      homeIsOwnClub: false,
      guestTeamName: "HB Dragons LLH",
      guestIsOwnClub: true,
    });
    expect(teamGameRowClass(derby)).toBe(
      "bg-gradient-to-r dark:from-red-500/25 from-red-800/20 to-15%",
    );
  });

  it("mutes rescheduled games on top of the tint", () => {
    const verlegt = game({ publicComment: "wird verlegt" });
    expect(teamGameRowClass(verlegt)).toBe(
      "dark:bg-green-300/10 bg-green-800/10 text-muted-foreground",
    );
  });

  it("returns no classes for a plain away game", () => {
    const away = game({
      homeTeamName: "TSV Neustadt III",
      homeIsOwnClub: false,
      guestTeamName: "HB Dragons LLH",
      guestIsOwnClub: true,
    });
    expect(teamGameRowClass(away)).toBe("");
  });
});

describe("sortGamesByKickoff", () => {
  const early = game({ kickoffDate: "2025-09-13", kickoffTime: "12:00:00" });
  const late = game({ kickoffDate: "2025-09-13", kickoffTime: "18:15:00" });
  const nextWeek = game({ kickoffDate: "2025-09-20", kickoffTime: "10:00:00" });

  it("sorts ascending by date, then time", () => {
    expect(sortGamesByKickoff([nextWeek, late, early], "asc")).toEqual([early, late, nextWeek]);
  });

  it("sorts descending by date, then time", () => {
    expect(sortGamesByKickoff([early, late, nextWeek], "desc")).toEqual([nextWeek, late, early]);
  });

  it("does not mutate the input", () => {
    const input = [late, early];
    sortGamesByKickoff(input, "asc");
    expect(input).toEqual([late, early]);
  });
});

describe("nextGameParams", () => {
  it("asks for the first upcoming game of the team", () => {
    expect(nextGameParams(160402, "2026-08-02")).toEqual({
      teamApiId: 160402,
      dateFrom: "2026-08-02",
      sort: "asc",
      limit: 1,
    });
  });
});

describe("prevGameParams", () => {
  it("asks for the latest scored past game of the team", () => {
    expect(prevGameParams(160402, "2026-08-02")).toEqual({
      teamApiId: 160402,
      dateTo: "2026-08-02",
      sort: "desc",
      hasScore: true,
      limit: 1,
    });
  });
});
