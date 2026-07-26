// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import type { MatchListItem } from "@dragons/shared";
import type { PublicTeam } from "./types";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 7) }),
  useTranslations: () => (k: string) => k,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// MatchCard pulls in the locale-aware Link, which reaches into next-intl's
// navigation module; the day-detail list is not what these tests exercise.
vi.mock("./match-card", () => ({
  MatchCard: ({ match }: { match: { id: number } }) => <div>{match.id}</div>,
}));

const getMatches = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { public: { getMatches: (...args: unknown[]) => getMatches(...args) } },
}));

// react-day-picker is not under test. Render the view's own DayButton for one
// fixed date instead, so the number of ring segments reveals exactly which
// response ended up in state.
type DayButtonProps = { day: { date: Date }; modifiers: Record<string, boolean> };
vi.mock("@dragons/ui/components/calendar", () => ({
  Calendar: ({
    components,
  }: {
    components: { DayButton: React.ComponentType<DayButtonProps> };
  }) => {
    const DayButton = components.DayButton;
    return (
      <div data-testid="calendar">
        <DayButton day={{ date: new Date(2026, 2, 14, 12) }} modifiers={{}} />
      </div>
    );
  },
}));

import { CalendarView } from "./calendar-view";

const translations = {
  vs: "vs",
  matchCancelled: "cancelled",
  matchForfeited: "forfeited",
  noMatchesOnDay: "no matches on day",
};

const TEAMS: PublicTeam[] = [
  {
    id: 1,
    apiTeamPermanentId: 1,
    seasonTeamId: 1,
    name: "Dragons",
    nameShort: "DRG",
    customName: null,
    clubId: 1,
    isOwnClub: true,
    badgeColor: null,
  },
];

function match(id: number): MatchListItem {
  return {
    id,
    kickoffDate: "2026-03-14",
    homeTeamApiId: 1,
    guestTeamApiId: 2,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeScore: null,
    guestScore: null,
  } as MatchListItem;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** One ring segment per own-club match on the rendered day. */
function ringSegments(): number {
  return document.querySelectorAll('[data-testid="calendar"] svg circle').length;
}

function renderView() {
  return render(
    <CalendarView
      teams={TEAMS}
      initialMatches={[match(1)]}
      initialMonth="2026-03-01"
      translations={translations}
    />,
  );
}

/** The month header renders [previous, next] as the first two buttons. */
function nextMonth() {
  fireEvent.click(screen.getAllByRole("button")[1]!);
}

describe("<CalendarView> stale-response handling", () => {
  beforeEach(() => {
    getMatches.mockReset();
  });
  afterEach(cleanup);

  it("ignores an earlier response that resolves after a later one", async () => {
    const first = deferred<{ items: MatchListItem[] }>();
    const second = deferred<{ items: MatchListItem[] }>();
    getMatches.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    renderView();
    expect(ringSegments()).toBe(1);

    nextMonth();
    nextMonth();
    expect(getMatches).toHaveBeenCalledTimes(2);

    second.resolve({ items: [match(20), match(21)] });
    await waitFor(() => expect(ringSegments()).toBe(2));

    first.resolve({ items: [match(10)] });
    await flush();
    expect(ringSegments()).toBe(2);
  });

  it("aborts the in-flight request when the user pages again", () => {
    getMatches.mockReturnValue(deferred<{ items: MatchListItem[] }>().promise);
    renderView();

    nextMonth();
    const firstSignal = (getMatches.mock.calls[0]![1] as { signal: AbortSignal }).signal;
    expect(firstSignal.aborted).toBe(false);

    nextMonth();
    expect(firstSignal.aborted).toBe(true);
  });

  it("renders an error state with retry instead of an empty month", async () => {
    getMatches.mockRejectedValueOnce(new Error("server down"));
    renderView();
    nextMonth();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByTestId("calendar")).not.toBeInTheDocument();

    getMatches.mockResolvedValueOnce({ items: [match(5)] });
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/i }));
    await waitFor(() => expect(screen.getByTestId("calendar")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
