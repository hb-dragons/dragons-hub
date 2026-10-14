import { describe, expect, test } from "vitest";
import {
  calendarFeedSquadIds,
  calendarFeedUrl,
  dragonsTeamName,
  fetchFullPlan,
  filterGames,
  isDragonsAwayGame,
  isDragonsHomeGame,
  teamFilterOptions,
  type SpielplanGame,
} from "./spielplan";

function game(overrides: Partial<SpielplanGame> = {}): SpielplanGame {
  return {
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
    ...overrides,
  };
}

const awayGame = (overrides: Partial<SpielplanGame> = {}) =>
  game({
    homeTeamName: "SG Weende",
    guestTeamName: "HB Dragons",
    homeTeamCustomName: null,
    guestTeamCustomName: "Damen 1",
    homeIsOwnClub: false,
    guestIsOwnClub: true,
    homeBadgeColor: null,
    guestBadgeColor: "rose",
    ...overrides,
  });

describe("dragonsTeamName", () => {
  test("uses the home side's custom name for home games", () => {
    expect(dragonsTeamName(game())).toBe("Herren 1");
  });

  test("uses the guest side's custom name for away games", () => {
    expect(dragonsTeamName(awayGame())).toBe("Damen 1");
  });

  test("falls back to the federation team name without a custom name", () => {
    expect(dragonsTeamName(game({ homeTeamCustomName: null }))).toBe("HB Dragons");
    expect(dragonsTeamName(awayGame({ guestTeamCustomName: null }))).toBe(
      "HB Dragons",
    );
  });

  test("returns empty when neither side is the own club", () => {
    expect(dragonsTeamName(game({ homeIsOwnClub: false }))).toBe("");
  });
});

describe("home/away detection", () => {
  test("flags games by which side is the own club", () => {
    expect(isDragonsHomeGame(game())).toBe(true);
    expect(isDragonsAwayGame(game())).toBe(false);
    expect(isDragonsHomeGame(awayGame())).toBe(false);
    expect(isDragonsAwayGame(awayGame())).toBe(true);
  });
});

describe("filterGames", () => {
  const games = [
    game(),
    awayGame(),
    game({ homeTeamCustomName: "U18", homeBadgeColor: "cyan" }),
  ];

  test("keeps only games of the selected teams", () => {
    expect(filterGames(games, new Set(["Damen 1"]), "all")).toEqual([awayGame()]);
  });

  test("narrows to home games", () => {
    expect(filterGames(games, new Set(["Herren 1", "Damen 1"]), "home")).toEqual([
      game(),
    ]);
  });

  test("narrows to away games", () => {
    expect(filterGames(games, new Set(["Herren 1", "Damen 1"]), "away")).toEqual([
      awayGame(),
    ]);
  });

  test("empty selection removes everything", () => {
    expect(filterGames(games, new Set(), "all")).toEqual([]);
  });
});

describe("teamFilterOptions", () => {
  test("derives distinct dragons teams in the legacy filter order", () => {
    const games = [
      game({ homeTeamCustomName: "U12", homeBadgeColor: "violet" }),
      game({ homeTeamCustomName: "U18", homeBadgeColor: "cyan" }),
      game(),
      awayGame(),
      game(), // duplicate Herren 1 — must not repeat
      game({ homeTeamCustomName: "Damen 2", homeBadgeColor: "orange" }),
    ];
    expect(teamFilterOptions(games)).toEqual([
      { name: "Damen 1", badgeColor: "rose" },
      { name: "Damen 2", badgeColor: "orange" },
      { name: "Herren 1", badgeColor: "teal" },
      { name: "U18", badgeColor: "cyan" },
      { name: "U12", badgeColor: "violet" },
    ]);
  });

  test("skips games without a resolvable dragons side", () => {
    expect(teamFilterOptions([game({ homeIsOwnClub: false })])).toEqual([]);
  });

  test("keeps the first badge color seen for a team", () => {
    const games = [game(), game({ homeBadgeColor: "blue" })];
    expect(teamFilterOptions(games)).toEqual([
      { name: "Herren 1", badgeColor: "teal" },
    ]);
  });
});

describe("calendarFeedSquadIds", () => {
  const withIds = (g: SpielplanGame, home: number, guest: number) => ({
    ...g,
    homeTeamApiId: home,
    guestTeamApiId: guest,
  });
  const games = [
    withIds(game(), 160402, 900001), // Herren 1 at home
    withIds(awayGame(), 900002, 320674), // Damen 1 away
    withIds(game({ homeTeamCustomName: "U18" }), 159888, 900003),
    withIds(game(), 160402, 900004), // Herren 1 again
  ];

  test("no explicit choice means the club-wide feed", () => {
    expect(calendarFeedSquadIds(games, null)).toEqual([]);
  });

  test("every team selected is the club-wide feed too", () => {
    expect(calendarFeedSquadIds(games, new Set(["Herren 1", "Damen 1", "U18"]))).toEqual([]);
  });

  test("a partial selection yields each squad once, in the filter order", () => {
    expect(calendarFeedSquadIds(games, new Set(["U18", "Herren 1"]))).toEqual([160402, 159888]);
  });

  test("the own side's id is used whether the team plays home or away", () => {
    expect(calendarFeedSquadIds(games, new Set(["Damen 1"]))).toEqual([320674]);
  });

  test("an empty selection falls back to the club-wide feed", () => {
    expect(calendarFeedSquadIds(games, new Set())).toEqual([]);
  });
});

describe("calendarFeedUrl", () => {
  test("is the bare feed without squads", () => {
    expect(calendarFeedUrl("https://api.example", [])).toBe(
      "https://api.example/public/schedule.ics",
    );
  });

  test("repeats teamApiId once per squad", () => {
    expect(calendarFeedUrl("https://api.example", [160402, 320674])).toBe(
      "https://api.example/public/schedule.ics?teamApiId=160402&teamApiId=320674",
    );
  });
});

describe("fetchFullPlan", () => {
  test("follows hasMore across pages and concatenates the items", async () => {
    const pages = [
      { items: [game()], total: 3, limit: 1, offset: 0, hasMore: true },
      { items: [awayGame()], total: 3, limit: 1, offset: 1, hasMore: true },
      {
        items: [game({ homeTeamCustomName: "U18" })],
        total: 3,
        limit: 1,
        offset: 2,
        hasMore: false,
      },
    ];
    const requested: number[] = [];
    const result = await fetchFullPlan(async ({ offset }) => {
      requested.push(offset);
      return pages[requested.length - 1]!;
    });
    expect(requested).toEqual([0, 1, 2]);
    expect(result).toEqual([...pages[0]!.items, ...pages[1]!.items, ...pages[2]!.items]);
  });

  test("stops on an empty page even if the server claims more", async () => {
    let calls = 0;
    const result = await fetchFullPlan(async () => {
      calls += 1;
      return { items: [], total: 0, limit: 500, offset: 0, hasMore: true };
    });
    expect(result).toEqual([]);
    expect(calls).toBe(1);
  });
});
