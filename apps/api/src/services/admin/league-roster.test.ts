import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sync/sdk-client", () => ({
  sdkClient: { getTabelle: vi.fn(), getSpielplan: vi.fn() },
}));

import { sdkClient } from "../sync/sdk-client";
import { fetchLeagueRoster } from "./league-roster";

const ref = (teamPermanentId: number, teamname = `T${teamPermanentId}`) => ({
  teamPermanentId, teamname, teamnameSmall: teamname, seasonTeamId: 1,
  teamCompetitionId: 1, clubId: 100, verzicht: false,
});

beforeEach(() => vi.clearAllMocks());

describe("fetchLeagueRoster", () => {
  it("reads the table when it has entries", async () => {
    vi.mocked(sdkClient.getTabelle).mockResolvedValue([{ team: ref(1) }, { team: ref(2) }] as never);
    const roster = await fetchLeagueRoster(42);
    expect(roster.map((r) => r.teamPermanentId)).toEqual([1, 2]);
    expect(sdkClient.getSpielplan).not.toHaveBeenCalled();
  });

  it("falls back to the schedule when the table is empty, deduping both slots", async () => {
    vi.mocked(sdkClient.getTabelle).mockResolvedValue([] as never);
    vi.mocked(sdkClient.getSpielplan).mockResolvedValue([
      { homeTeam: ref(1), guestTeam: ref(2) },
      { homeTeam: ref(2), guestTeam: null },
    ] as never);
    const roster = await fetchLeagueRoster(42);
    expect(roster.map((r) => r.teamPermanentId)).toEqual([1, 2]);
  });
});
