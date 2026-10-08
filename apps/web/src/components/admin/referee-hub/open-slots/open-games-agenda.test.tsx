// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RefereeGameListItem } from "@dragons/shared";
import en from "@/messages/en.json";
import { OpenGamesAgenda } from "./open-games-agenda";

// Wednesday 2026-10-07, 22:30 UTC: already Thursday the 8th in Berlin, so a
// date computed from the machine's own zone would be a day off.
const NOW = new Date("2026-10-07T22:30:00Z");
const ZONES = ["America/Los_Angeles", "Pacific/Kiritimati"] as const;

function game(over: Partial<RefereeGameListItem>): RefereeGameListItem {
  return {
    apiMatchId: 1,
    kickoffDate: "2026-10-10",
    kickoffTime: "12:30:00",
    homeTeamName: "Hanover Dragons U16",
    guestTeamName: "BC Hannover 3",
    homeTeamCustomName: null,
    guestTeamCustomName: null,
    leagueName: "Region Kreisliga U12 mixed",
    leagueShort: "RKu12mo",
    isHomeGame: true,
    isGuestGame: false,
    sr1OurClub: true,
    sr2OurClub: true,
    sr1Status: "assigned",
    sr2Status: "open",
    sr1Name: "Jonas Krüger",
    sr2Name: null,
    ...over,
  } as RefereeGameListItem;
}

const noop = () => {};

function renderAgenda(props: Partial<Parameters<typeof OpenGamesAgenda>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Berlin">
      <OpenGamesAgenda
        games={[]}
        error={undefined}
        isLoading={false}
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={noop}
        onRetry={noop}
        selectedGameId={null}
        onSelect={noop}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

let observed: IntersectionObserverCallback | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  observed = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) { observed = cb; }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenGamesAgenda", () => {
  it.each(ZONES)("groups games under one heading per Berlin day (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    renderAgenda({
      games: [
        game({ apiMatchId: 1, kickoffDate: "2026-10-08" }),
        game({ apiMatchId: 2, kickoffDate: "2026-10-10", sr1Status: "open", sr1Name: null }),
        game({ apiMatchId: 3, kickoffDate: "2026-10-10", sr1Status: "assigned", sr2Status: "assigned", sr2Name: "Mia Schulz" }),
        game({ apiMatchId: 4, kickoffDate: "2026-10-20" }),
      ],
    });

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      expect.stringMatching(/^Thursday, October 8.*today.*1 open slot$/),
      expect.stringMatching(/^Saturday, October 10.*in 2 days.*2 open slots$/),
      expect.stringMatching(/^Tuesday, October 20.*in 12 days.*1 open slot$/),
    ]);
  });

  it("marks match days within a week as urgent, later ones not", () => {
    renderAgenda({ games: [game({ apiMatchId: 1, kickoffDate: "2026-10-10" }), game({ apiMatchId: 2, kickoffDate: "2026-10-20" })] });
    const [soon, later] = screen.getAllByRole("heading", { level: 3 });
    expect(soon).toHaveClass("text-heat");
    expect(later).not.toHaveClass("text-heat");
  });

  it("names past days by how long ago they were", () => {
    renderAgenda({ games: [game({ kickoffDate: "2026-10-05" })] });
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("3 days ago");
  });

  it("leads each row with our team and says where it plays", () => {
    renderAgenda({
      games: [
        game({ apiMatchId: 1 }),
        game({ apiMatchId: 2, isHomeGame: false, isGuestGame: true, homeTeamName: "TSV Burgdorf", guestTeamName: "Hanover Dragons Herren" }),
      ],
    });
    const [home, away] = screen.getAllByRole("button");
    expect(home).toHaveTextContent("Hanover Dragons U16");
    expect(home).toHaveTextContent("vs BC Hannover 3");
    expect(home).toHaveTextContent("Home");
    expect(away).toHaveTextContent("Hanover Dragons Herren");
    expect(away).toHaveTextContent("at TSV Burgdorf");
    expect(away).toHaveTextContent("Away");
  });

  it("shows who holds each of our slots and how many are still open", () => {
    renderAgenda({
      games: [
        game({ apiMatchId: 1, sr1Status: "assigned", sr2Status: "offered" }),
        game({ apiMatchId: 2, sr1Status: "assigned", sr2Status: "assigned", sr2Name: "Mia Schulz" }),
      ],
    });
    const [partly, full] = screen.getAllByRole("button");
    expect(partly).toHaveTextContent("SR1Jonas Krüger");
    expect(partly).toHaveTextContent("SR2offered");
    expect(within(partly).getByText("1 open")).toBeInTheDocument();
    expect(within(full).getByText("staffed")).toBeInTheDocument();
  });

  it("selects a game and marks the selected one", () => {
    const onSelect = vi.fn();
    renderAgenda({ games: [game({ apiMatchId: 1 }), game({ apiMatchId: 2 })], selectedGameId: 2, onSelect });
    const [first, second] = screen.getAllByRole("button");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
    fireEvent.click(first!);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("asks for the next page as the end of the list comes into view", () => {
    const onLoadMore = vi.fn();
    renderAgenda({ games: [game({})], hasMore: true, onLoadMore });
    observed!([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(onLoadMore).not.toHaveBeenCalled();
    observed!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("says when more games are loading, and has no sentinel once all are in", () => {
    const { rerender } = renderAgenda({ games: [game({})], hasMore: true, isLoadingMore: true });
    expect(screen.getByText("Loading more games…")).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Berlin">
        <OpenGamesAgenda games={[game({})]} error={undefined} isLoading={false} hasMore={false} isLoadingMore={false}
          onLoadMore={noop} onRetry={noop} selectedGameId={null} onSelect={noop} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("load-more-sentinel")).not.toBeInTheDocument();
  });

  it("shows loading, empty and failed states", () => {
    const onRetry = vi.fn();
    const { unmount } = renderAgenda({ isLoading: true });
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    renderAgenda({ games: [] });
    expect(screen.getByText(en.refereeHub.openSlots.empty)).toBeInTheDocument();
    cleanup();

    renderAgenda({ error: new Error("down"), onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent(en.refereeHub.openSlots.loadError);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
