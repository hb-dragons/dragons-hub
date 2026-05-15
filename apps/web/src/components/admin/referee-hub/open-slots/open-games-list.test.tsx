// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { OpenGamesList } from "./open-games-list";

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: {
      items: [
        {
          id: 1, apiMatchId: 4287, matchId: 1, matchNo: 1001,
          kickoffDate: "2026-05-28", kickoffTime: "16:30",
          homeTeamName: "Eagles", guestTeamName: "Dragons H1",
          leagueName: "Bundesliga", leagueShort: "BL",
          venueName: null, venueCity: null, homeTeamId: 10,
          sr1OurClub: true, sr2OurClub: true,
          sr1Name: null, sr2Name: null,
          sr1RefereeApiId: null, sr2RefereeApiId: null,
          sr1Status: "open", sr2Status: "open",
          isCancelled: false, isForfeited: false, isTrackedLeague: true,
          isHomeGame: false, isGuestGame: true, lastSyncedAt: null,
          mySlot: null, claimableSlots: [],
        },
        {
          id: 2, apiMatchId: 4288, matchId: 2, matchNo: 1002,
          kickoffDate: "2026-05-28", kickoffTime: "14:00",
          homeTeamName: "Dragons H1", guestTeamName: "Hawks",
          leagueName: "Oberliga", leagueShort: "OL",
          venueName: null, venueCity: null, homeTeamId: 11,
          sr1OurClub: true, sr2OurClub: true,
          sr1Name: null, sr2Name: "Müller, A.",
          sr1RefereeApiId: null, sr2RefereeApiId: 100,
          sr1Status: "open", sr2Status: "assigned",
          isCancelled: false, isForfeited: false, isTrackedLeague: true,
          isHomeGame: true, isGuestGame: false, lastSyncedAt: null,
          mySlot: null, claimableSlots: [],
        },
      ],
    },
  })),
}));

const messages = { refereeHub: { openSlots: { searchPlaceholder: "Search game…" } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => cleanup());

describe("OpenGamesList", () => {
  it("renders rows for games with at least one open slot", () => {
    render(wrap(<OpenGamesList selectedGameId={null} onSelect={vi.fn()} />));
    expect(screen.getByText("Eagles vs Dragons H1")).toBeInTheDocument();
    expect(screen.getByText("Dragons H1 vs Hawks")).toBeInTheDocument();
  });

  it("invokes onSelect with the game id on click", () => {
    const onSelect = vi.fn();
    render(wrap(<OpenGamesList selectedGameId={null} onSelect={onSelect} />));
    screen.getByText("Eagles vs Dragons H1").click();
    expect(onSelect).toHaveBeenCalledWith(4287);
  });

  it("highlights the selected row", () => {
    render(wrap(<OpenGamesList selectedGameId={4287} onSelect={vi.fn()} />));
    expect(screen.getByText("Eagles vs Dragons H1").closest("[data-selected='true']")).not.toBeNull();
  });
});
