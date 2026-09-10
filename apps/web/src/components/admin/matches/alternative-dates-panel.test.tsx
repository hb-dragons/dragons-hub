// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AlternativeDatesResponse } from "@dragons/shared";
import enMessages from "@/messages/en.json";
import deMessages from "@/messages/de.json";

const mocks = vi.hoisted(() => ({
  alternativeDates: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { matches: { alternativeDates: mocks.alternativeDates } },
}));

import { AlternativeDatesPanel } from "./alternative-dates-panel";

const messages = {
  common: { back: "Back", loading: "Loading" },
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
      loading: "Searching for dates…",
      flags: {
        outsideRoundWindow: "Outside the match day",
        coachCollision: "Coach collision: {team}",
      },
      empty: "No free weekend day in this range.",
      error: "The alternative dates could not be loaded.",
    },
  },
};

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" },
  },
} as const;

function response(over: Partial<AlternativeDatesResponse> = {}): AlternativeDatesResponse {
  return {
    isHomeGame: true,
    caveats: ["opponentGamesOutsideTrackedLeagues"],
    range: { from: "2026-03-01", to: "2026-03-28" },
    candidates: [
      { date: "2026-03-14", weekday: "saturday", flags: [] },
      { date: "2026-03-15", weekday: "sunday", flags: [] },
    ],
    ...over,
  };
}

/** The two flags on two days, for the locale checks below. */
const flagged = response({
  candidates: [
    { date: "2026-03-14", weekday: "saturday", flags: [{ type: "outsideRoundWindow" }] },
    {
      date: "2026-03-15",
      weekday: "sunday",
      flags: [{ type: "coachCollision", teamEntryName: "Damen 1" }],
    },
  ],
});

/** Renders against the real catalog, so a missing key fails the test. */
function renderWithCatalog(locale: "en" | "de") {
  render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Berlin"
      messages={locale === "en" ? enMessages : deMessages}
      formats={formats}
    >
      <AlternativeDatesPanel matchId={7} onBack={vi.fn()} />
    </NextIntlClientProvider>,
  );
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

  it("badges a day the federation may question and a day a coach is taken", async () => {
    mocks.alternativeDates.mockResolvedValue(flagged);

    renderPanel();
    await settle();

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Outside the match day");
    expect(items[1]).toHaveTextContent("Coach collision: Damen 1");
  });

  it("shows no badge on a day with nothing to say about it", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();

    expect(screen.queryByText("Outside the match day")).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Outside the match day", "Coach collision: Damen 1"],
    ["de", "Außerhalb des Spieltags", "Trainer-Kollision: Damen 1"],
  ] as const)("names both flags in %s", async (locale, round, collision) => {
    mocks.alternativeDates.mockResolvedValue(flagged);

    renderWithCatalog(locale);
    await settle();

    expect(screen.getByText(round)).toBeInTheDocument();
    expect(screen.getByText(collision)).toBeInTheDocument();
  });

  it("goes back to the match on the back arrow", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    const { onBack } = renderPanel();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Back to the game" }));

    expect(onBack).toHaveBeenCalledTimes(1);
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
