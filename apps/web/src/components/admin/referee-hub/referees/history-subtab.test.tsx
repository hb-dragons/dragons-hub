// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HistorySubtab } from "./history-subtab";

const ref = { id: 1, apiId: 100, firstName: "A", lastName: "Müller", licenseNumber: 0, matchCount: 0, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

const item = (n: number, sr1ApiId: number | null, sr2ApiId: number | null) => ({
  id: n, matchId: n, matchNo: 1000 + n, kickoffDate: "2026-04-01", kickoffTime: "18:00",
  homeTeamName: "H", guestTeamName: "G", leagueName: "OL", leagueShort: "OL",
  venueName: null, venueCity: null, sr1OurClub: false, sr2OurClub: false,
  sr1Name: "Foo Müller", sr2Name: "Bar Müller",
  sr1Status: "assigned", sr2Status: "assigned",
  sr1RefereeApiId: sr1ApiId, sr2RefereeApiId: sr2ApiId,
  isCancelled: false, isForfeited: false, isHomeGame: true,
});

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: { items: [item(1, 100, 999), item(2, 999, 100)], total: 4, limit: 2, offset: 0, hasMore: true },
  })),
  mutate: vi.fn(),
}));

const messages = { refereeHub: { referees: { history: {
  total: "{n} games",
  exportCsv: "Export",
  loadMore: "Load more",
  statusPlayed: "played", statusCancelled: "cancelled", statusForfeited: "forfeited",
  empty: "No games",
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => cleanup());

describe("HistorySubtab", () => {
  it("derives SR1/SR2 from apiId match, not name substring", () => {
    render(wrap(<HistorySubtab referee={ref} />));
    const rows = screen.getAllByText(/H vs G/);
    expect(rows[0].parentElement?.textContent).toMatch(/SR1/);
    expect(rows[1].parentElement?.textContent).toMatch(/SR2/);
  });

  it("renders Load more when hasMore is true", () => {
    render(wrap(<HistorySubtab referee={ref} />));
    expect(screen.getByRole("button", { name: /load more/i })).toBeEnabled();
  });
});
