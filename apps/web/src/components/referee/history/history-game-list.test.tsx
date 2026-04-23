// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HistoryGameList } from "./history-game-list";
import en from "@/messages/en.json";
import type { HistoryGameItem } from "@dragons/shared";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

const game = (o: Partial<HistoryGameItem> = {}): HistoryGameItem => ({
  id: 1, matchId: null, matchNo: 1,
  kickoffDate: "2026-04-12", kickoffTime: "18:00:00",
  homeTeamName: "Dragons", guestTeamName: "Bears",
  leagueName: "Oberliga", leagueShort: "OL",
  venueName: null, venueCity: null,
  sr1OurClub: true, sr2OurClub: true,
  sr1Name: "Mueller", sr2Name: "Schulz",
  sr1Status: "filled", sr2Status: "filled",
  isCancelled: false, isForfeited: false, isHomeGame: true,
  ...o,
});

describe("HistoryGameList", () => {
  it("shows OPEN pill when obligated slot is open", () => {
    render(wrap(<HistoryGameList
      items={[game({ sr1OurClub: true, sr1Status: "open", sr1Name: null })]}
      total={1} limit={50} offset={0} onPage={() => {}} onLimit={() => {}}
    />));
    expect(screen.getByTestId("open-pill")).toBeInTheDocument();
  });

  it("shows HOME pill on home game, AWAY on away", () => {
    render(wrap(<HistoryGameList
      items={[game({ isHomeGame: true }), game({ id: 2, isHomeGame: false })]}
      total={2} limit={50} offset={0} onPage={() => {}} onLimit={() => {}}
    />));
    expect(screen.getAllByTestId("home-pill").length).toBe(1);
    expect(screen.getAllByTestId("away-pill").length).toBe(1);
  });

  it("dims cancelled rows with line-through", () => {
    render(wrap(<HistoryGameList
      items={[game({ isCancelled: true })]}
      total={1} limit={50} offset={0} onPage={() => {}} onLimit={() => {}}
    />));
    expect(screen.getByTestId("game-row")).toHaveClass("opacity-45");
  });
});
