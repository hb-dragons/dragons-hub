// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  AlternativeDateCandidate,
  AlternativeDatesResponse,
  ClubWeekendDay,
} from "@dragons/shared";

const mocks = vi.hoisted(() => ({
  alternativeDates: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { matches: { alternativeDates: mocks.alternativeDates } },
}));

import { AlternativeDatesPanel } from "./alternative-dates-panel";

const messages = {
  common: { back: "Back", loading: "Loading" },
  bookings: {
    status: {
      pending: "Pending",
      requested: "Requested",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
    },
  },
  errors: {
    title: "Something went wrong",
    description: "An unexpected error occurred.",
    tryAgain: "Try again",
  },
  matchDetail: {
    alternativeDates: {
      trigger: "Find alternative dates",
      title: "Alternative dates",
      back: "Back to the game",
      caveats: {
        opponentGamesOutsideTrackedLeagues:
          "Games of the opponent outside the leagues we track are unknown.",
      },
      from: "From",
      to: "To",
      homeGame: "Home game",
      awayGame: "Away game",
      groups: {
        booked: "With a hall booking",
        unbooked: "Without a hall booking",
        away: "Away",
      },
      noBooking: "no booking",
      awayVenue: "Hall: opponent",
      needsReconfirmation: "Needs re-confirmation",
      suggestedKickoff: "Suggested tip-off: {time}",
      loading: "Searching for dates…",
      empty: "No free weekend day in this range.",
      error: "The alternative dates could not be loaded.",
    },
  },
};

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

function unbooked(date: string, weekday: ClubWeekendDay): AlternativeDateCandidate {
  return { date, weekday, group: "unbooked", bookings: [], suggestedKickoffTime: null };
}

function booked(
  date: string,
  weekday: ClubWeekendDay,
  over: Partial<AlternativeDateCandidate> = {},
): AlternativeDateCandidate {
  return {
    date,
    weekday,
    group: "booked",
    bookings: [
      {
        id: 1,
        effectiveStartTime: "10:30:00",
        effectiveEndTime: "16:30:00",
        status: "confirmed",
        needsReconfirmation: false,
      },
    ],
    suggestedKickoffTime: "17:00:00",
    ...over,
  };
}

function response(over: Partial<AlternativeDatesResponse> = {}): AlternativeDatesResponse {
  return {
    isHomeGame: true,
    caveats: ["opponentGamesOutsideTrackedLeagues"],
    range: { from: "2026-03-01", to: "2026-03-28" },
    candidates: [unbooked("2026-03-14", "saturday"), unbooked("2026-03-15", "sunday")],
    ...over,
  };
}

function renderPanel(onBack = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={messages} formats={formats}>
      <AlternativeDatesPanel matchId={7} onBack={onBack} />
    </NextIntlClientProvider>,
  );
  return { onBack };
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Non-Berlin runtime zone on purpose: the rendered day must be the club day.
  vi.stubEnv("TZ", "Pacific/Honolulu");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("AlternativeDatesPanel", () => {
  it("asks the API without a range on first load and lists what comes back", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();

    expect(mocks.alternativeDates).toHaveBeenCalledWith(7, undefined);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("03/14/2026");
    expect(items[1]).toHaveTextContent("03/15/2026");
  });

  it("shows the effective range the server returned in the pickers", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();

    expect(screen.getByRole("button", { name: "From" })).toHaveTextContent("01.03.2026");
    expect(screen.getByRole("button", { name: "To" })).toHaveTextContent("28.03.2026");
  });

  it("names the limit of the check", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();

    expect(
      screen.getByText("Games of the opponent outside the leagues we track are unknown."),
    ).toBeInTheDocument();
  });

  it("shows no caveat line when the answer carries none", async () => {
    mocks.alternativeDates.mockResolvedValue(response({ caveats: [] }));

    renderPanel();
    await settle();

    expect(
      screen.queryByText("Games of the opponent outside the leagues we track are unknown."),
    ).not.toBeInTheDocument();
  });

  it("says whether the game is a home game", async () => {
    mocks.alternativeDates.mockResolvedValue(response());
    renderPanel();
    await settle();
    expect(screen.getByText("Home game")).toBeInTheDocument();

    cleanup();
    mocks.alternativeDates.mockResolvedValue(response({ isHomeGame: false }));
    renderPanel();
    await settle();
    expect(screen.getByText("Away game")).toBeInTheDocument();
  });

  it("shows a loading state while the request is in flight", async () => {
    mocks.alternativeDates.mockReturnValue(new Promise(() => {}));

    renderPanel();

    expect(screen.getByRole("status", { name: "Searching for dates…" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    // No range to narrow yet — an inert picker beats one that silently drops
    // the pick.
    expect(screen.getByRole("button", { name: "From" })).toBeDisabled();
  });

  it("says so plainly when the range yields nothing", async () => {
    mocks.alternativeDates.mockResolvedValue(response({ candidates: [] }));

    renderPanel();
    await settle();

    expect(screen.getByText("No free weekend day in this range.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("offers a retry after a failed request", async () => {
    mocks.alternativeDates.mockRejectedValueOnce(new Error("boom"));

    renderPanel();
    await settle();

    expect(screen.getByText("The alternative dates could not be loaded.")).toBeInTheDocument();

    mocks.alternativeDates.mockResolvedValue(response());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await settle();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("goes back to the match on the back arrow", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    const { onBack } = renderPanel();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Back to the game" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("heads each group and shows the booking window, status and kickoff", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        candidates: [booked("2026-03-14", "saturday"), unbooked("2026-03-15", "sunday")],
      }),
    );

    renderPanel();
    await settle();

    const headings = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(["With a hall booking", "Without a hall booking"]);

    const items = screen.getAllByRole("listitem");
    // 12-hour clock: the panel renders in the viewer's locale, and this one is
    // English.
    expect(items[0]).toHaveTextContent("10:30 AM – 04:30 PM");
    expect(items[0]).toHaveTextContent("Confirmed");
    expect(items[0]).toHaveTextContent("Suggested tip-off: 05:00 PM");
    expect(items[0]).not.toHaveTextContent("Needs re-confirmation");
  });

  it("marks a booking that has to be reconfirmed", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        candidates: [
          booked("2026-03-14", "saturday", {
            bookings: [
              {
                id: 1,
                effectiveStartTime: "10:30:00",
                effectiveEndTime: "16:30:00",
                status: "confirmed",
                needsReconfirmation: true,
              },
            ],
          }),
        ],
      }),
    );

    renderPanel();
    await settle();

    expect(screen.getByText("Needs re-confirmation")).toBeInTheDocument();
  });

  it("says a day has no booking and suggests no kickoff for it", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();

    expect(screen.getAllByText("no booking")).toHaveLength(2);
    expect(screen.queryByText(/Suggested tip-off/)).not.toBeInTheDocument();
  });

  it("leaves the hall to the other club on an away game", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        isHomeGame: false,
        candidates: [
          {
            date: "2026-03-14",
            weekday: "saturday",
            group: "away",
            bookings: [],
            suggestedKickoffTime: null,
          },
        ],
      }),
    );

    renderPanel();
    await settle();

    expect(screen.getByRole("heading", { level: 4, name: "Away" })).toBeInTheDocument();
    expect(screen.getByText("Hall: opponent")).toBeInTheDocument();
    expect(screen.queryByText("no booking")).not.toBeInTheDocument();
  });

  it("re-queries with the range the staff member picked", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "From" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Samstag, 21. März 2026" }));
    });
    await settle();

    expect(mocks.alternativeDates).toHaveBeenLastCalledWith(7, {
      from: "2026-03-21",
      to: "2026-03-28",
    });
  });
});
