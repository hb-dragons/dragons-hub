// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  AlternativeDateCandidate,
  AlternativeDateHall,
  AlternativeDatesResponse,
  ClubWeekendDay,
} from "@dragons/shared";
import enMessages from "@/messages/en.json";
import deMessages from "@/messages/de.json";

const mocks = vi.hoisted(() => ({
  alternativeDates: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { matches: { alternativeDates: mocks.alternativeDates } },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { AlternativeDatesPanel } from "./alternative-dates-panel";

const messages = {
  common: { back: "Back", loading: "Loading" },
  errors: {
    title: "Something went wrong",
    description: "An unexpected error occurred.",
    tryAgain: "Try again",
  },
  hallTimes: {
    coverage: {
      covered: "Hall time covered",
      partial: "Hall time partial",
      uncovered: "Outside hall time",
      closed: "Hall closed",
      none: "No hall time",
    },
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
        fits: "Fits a held hall time",
        heldNoFit: "Hall time held, game does not fit",
        notHeld: "No hall time held",
        closed: "Every hall closed",
        away: "Away",
      },
      hallTime: "Hall time {start} – {end}",
      hallClosed: "Hall closed{note, select, none {} other {: {note}}}",
      awayVenue: "Hall: opponent",
      currentVenue: "current hall",
      noHalls: "None of our halls has a hall time.",
      game: "{start} – {end} {home} – {guest}",
      noFit: "Game does not fit",
      suggestedKickoff: "Suggested kickoff: {time}",
      loading: "Searching for dates…",
      flags: {
        outsideRoundWindow: "Outside the round window",
        coachCollision: "Trainer also with {team}",
      },
      empty: "No free weekend day in this range.",
      error: "The alternative dates could not be loaded.",
      copy: "Copy as text",
      copyHeader:
        "Possible alternative dates for {home} – {guest} ({league}, matchday {matchDay}):",
      copied: "Alternative dates copied.",
      copyFailed: "Copying was not possible.",
    },
  },
};

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

/** One of our halls on a day, empty and without a hall time unless told otherwise. */
function hall(over: Partial<AlternativeDateHall> = {}): AlternativeDateHall {
  return {
    venueId: 1,
    venueName: "Drachenhalle",
    isCurrentVenue: true,
    hallTime: null,
    games: [],
    existing: null,
    fits: false,
    suggestedKickoffTime: null,
    ...over,
  };
}

/** A home day with no hall time held at our one hall. */
function notHeld(date: string, weekday: ClubWeekendDay): AlternativeDateCandidate {
  return { date, weekday, group: "notHeld", halls: [hall()], flags: [] };
}

const OPEN_10_TO_18 = { kind: "open", startTime: "10:00", endTime: "18:00", note: null } as const;

/** A home day the game fits into at our hall, after one game already there. */
function fits(
  date: string,
  weekday: ClubWeekendDay,
  over: Partial<AlternativeDateCandidate> = {},
): AlternativeDateCandidate {
  return {
    date,
    weekday,
    group: "fits",
    halls: [
      hall({
        hallTime: OPEN_10_TO_18,
        games: [
          {
            matchId: 11,
            kickoffTime: "11:00:00",
            endTime: "12:40:00",
            homeTeam: "Dragons 2",
            homeTeamCustomName: "Damen 1",
            homeBadgeColor: null,
            guestTeam: "Wolves",
            leagueName: "Kreisliga",
          },
        ],
        existing: { hallTime: OPEN_10_TO_18, coverage: "covered", gapBeforeMinutes: 0, gapAfterMinutes: 0 },
        fits: true,
        suggestedKickoffTime: "13:30:00",
      }),
    ],
    flags: [],
    ...over,
  };
}

function response(over: Partial<AlternativeDatesResponse> = {}): AlternativeDatesResponse {
  return {
    isHomeGame: true,
    caveats: ["opponentGamesOutsideTrackedLeagues"],
    range: { from: "2026-03-01", to: "2026-03-28" },
    candidates: [notHeld("2026-03-14", "saturday"), notHeld("2026-03-15", "sunday")],
    ...over,
  };
}

/** The two flags on two days, for the locale checks below. */
const flagged = response({
  candidates: [
    { ...notHeld("2026-03-14", "saturday"), flags: [{ type: "outsideRoundWindow" }] },
    {
      ...notHeld("2026-03-15", "sunday"),
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
      <AlternativeDatesPanel {...panelProps()} onBack={vi.fn()} onPrefill={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

/** The game the panel names in the copied text; no test here reads it back. */
function panelProps() {
  return {
    matchId: 7,
    homeTeamName: "Dragons",
    guestTeamName: "Bears",
    leagueName: "Oberliga",
    matchDay: 3,
  };
}

function renderPanel(onBack = vi.fn(), onPrefill: PrefillHandler = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" timeZone="Europe/Berlin" messages={messages} formats={formats}>
      <AlternativeDatesPanel {...panelProps()} onBack={onBack} onPrefill={onPrefill} />
    </NextIntlClientProvider>,
  );
  return { onBack, onPrefill };
}

type PrefillHandler = ((date: string, time: string | null) => void) | null;

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
    expect(items[0]).toHaveTextContent("Outside the round window");
    expect(items[1]).toHaveTextContent("Trainer also with Damen 1");
  });

  it("shows no badge on a day with nothing to say about it", async () => {
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();

    expect(screen.queryByText("Outside the round window")).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Outside the round window", "Trainer also with Damen 1"],
    ["de", "Außerhalb des Spieltagsfensters", "Trainer auch bei Damen 1"],
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

  it("heads each home group in the order of the ranking tiers", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        // Arrives in the wrong order on purpose: the headings follow the tiers.
        candidates: [
          { ...notHeld("2026-03-21", "saturday"), group: "closed" },
          notHeld("2026-03-15", "sunday"),
          { ...notHeld("2026-03-22", "sunday"), group: "heldNoFit" },
          fits("2026-03-14", "saturday"),
        ],
      }),
    );

    renderPanel();
    await settle();

    const headings = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Fits a held hall time",
      "Hall time held, game does not fit",
      "No hall time held",
      "Every hall closed",
    ]);
  });

  it("shows each hall with its hall time, its games and the suggested kickoff", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        candidates: [
          fits("2026-03-14", "saturday", {
            halls: [
              ...fits("2026-03-14", "saturday").halls,
              hall({ venueId: 2, venueName: "Arena am Park", isCurrentVenue: false }),
            ],
          }),
        ],
      }),
    );

    renderPanel();
    await settle();

    const halls = screen.getAllByTestId("alternative-date-hall");
    expect(halls).toHaveLength(2);
    // 12-hour clock: the panel renders in the viewer's locale, and this one is
    // English.
    expect(halls[0]).toHaveTextContent("Drachenhalle");
    expect(halls[0]).toHaveTextContent("current hall");
    expect(halls[0]).toHaveTextContent("Hall time 10:00 AM – 06:00 PM");
    expect(halls[0]).toHaveTextContent("11:00 AM – 12:40 PM Damen 1 – Wolves");
    expect(halls[0]).toHaveTextContent("Suggested kickoff: 01:30 PM");
    expect(halls[1]).toHaveTextContent("Arena am Park");
    expect(halls[1]).not.toHaveTextContent("current hall");
    expect(halls[1]).toHaveTextContent("No hall time");
    expect(halls[1]).toHaveTextContent("Game does not fit");
  });

  it("names a hall without a row in German as Keine Hallenzeit", async () => {
    mocks.alternativeDates.mockResolvedValue(response({ candidates: [notHeld("2026-03-14", "saturday")] }));

    renderWithCatalog("de");
    await settle();

    expect(screen.getByTestId("alternative-date-hall")).toHaveTextContent("Keine Hallenzeit");
  });

  it("badges a hall whose games already stick out of its hall time", async () => {
    const tight = { kind: "open", startTime: "10:00", endTime: "12:00", note: null } as const;
    mocks.alternativeDates.mockResolvedValue(
      response({
        candidates: [
          fits("2026-03-14", "saturday", {
            group: "heldNoFit",
            halls: [
              hall({
                ...fits("2026-03-14", "saturday").halls[0],
                hallTime: tight,
                existing: { hallTime: tight, coverage: "partial", gapBeforeMinutes: 0, gapAfterMinutes: 85 },
                fits: false,
                suggestedKickoffTime: null,
              }),
            ],
          }),
        ],
      }),
    );

    renderPanel();
    await settle();

    expect(screen.getByText("Hall time partial")).toBeInTheDocument();
    expect(screen.queryByText(/Suggested kickoff/)).not.toBeInTheDocument();
  });

  it("says so when the club has no hall at all", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({ candidates: [{ ...notHeld("2026-03-14", "saturday"), halls: [] }] }),
    );

    renderPanel();
    await settle();

    expect(screen.getByText("None of our halls has a hall time.")).toBeInTheDocument();
  });

  it("leaves the hall to the other club on an away game", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        isHomeGame: false,
        candidates: [
          { date: "2026-03-14", weekday: "saturday", group: "away", halls: [], flags: [] },
        ],
      }),
    );

    renderPanel();
    await settle();

    expect(screen.getByRole("heading", { level: 4, name: "Away" })).toBeInTheDocument();
    expect(screen.getByText("Hall: opponent")).toBeInTheDocument();
    expect(screen.queryByTestId("alternative-date-hall")).not.toBeInTheDocument();
    expect(screen.queryByText("None of our halls has a hall time.")).not.toBeInTheDocument();
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

  it("hands the picked day and its suggested kickoff to the sheet", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({ candidates: [fits("2026-03-14", "saturday")] }),
    );
    const { onPrefill } = renderPanel();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /14\.03\.2026/ }));
    });

    expect(onPrefill).toHaveBeenCalledWith("2026-03-14", "13:30:00");
  });

  it("hands over the kickoff of the first hall the game fits into", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        candidates: [
          fits("2026-03-14", "saturday", {
            halls: [
              hall(),
              hall({ venueId: 2, isCurrentVenue: false, fits: true, suggestedKickoffTime: "15:00:00" }),
              hall({ venueId: 3, isCurrentVenue: false, fits: true, suggestedKickoffTime: "10:30:00" }),
            ],
          }),
        ],
      }),
    );
    const { onPrefill } = renderPanel();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /14\.03\.2026/ }));
    });

    expect(onPrefill).toHaveBeenCalledWith("2026-03-14", "15:00:00");
  });

  it("hands over a day with no kickoff to suggest as just that day", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({ candidates: [notHeld("2026-03-14", "saturday")] }),
    );
    const { onPrefill } = renderPanel();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /14\.03\.2026/ }));
    });

    expect(onPrefill).toHaveBeenCalledWith("2026-03-14", null);
  });

  it("offers no row to click, and still the list, without prefill", async () => {
    mocks.alternativeDates.mockResolvedValue(response());
    renderPanel(vi.fn(), null);
    await settle();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /14\.03\.2026/ })).not.toBeInTheDocument();
  });

  it("copies the header and the ranked days, and says it did", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    mocks.alternativeDates.mockResolvedValue(
      // Sunday first and in another pile than the Saturday, so a copy that
      // followed the headings on screen would come out the other way round.
      response({
        candidates: [notHeld("2026-03-15", "sunday"), fits("2026-03-14", "saturday")],
      }),
    );

    renderPanel();
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    });
    await settle();

    expect(writeText).toHaveBeenCalledWith(
      [
        "Possible alternative dates for Dragons – Bears (Oberliga, matchday 3):",
        "- Sun, 15.03.2026",
        "- Sat, 14.03.2026",
      ].join("\n"),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Alternative dates copied.");
    vi.unstubAllGlobals();
  });

  it("says so when there is no clipboard to write to", async () => {
    // Outside a secure context `navigator.clipboard` is missing entirely, and
    // the call throws where a rejected promise would be easy to handle.
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    mocks.alternativeDates.mockResolvedValue(response());

    renderPanel();
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    });
    await settle();

    expect(mocks.toastError).toHaveBeenCalledWith("Copying was not possible.");
    vi.unstubAllGlobals();
  });

  it("offers nothing to copy when no day came back", async () => {
    mocks.alternativeDates.mockResolvedValue(response({ candidates: [] }));

    renderPanel();
    await settle();

    expect(screen.queryByRole("button", { name: "Copy as text" })).not.toBeInTheDocument();
  });

  it("lists a closed hall with the city's note", async () => {
    mocks.alternativeDates.mockResolvedValue(
      response({
        candidates: [
          {
            ...notHeld("2026-03-15", "sunday"),
            group: "closed",
            halls: [
              hall({ hallTime: { kind: "closed", startTime: null, endTime: null, note: "Osterferien" } }),
            ],
          },
        ],
      }),
    );
    renderPanel();
    await settle();

    expect(screen.getByText("Hall closed: Osterferien")).toBeInTheDocument();
  });
});
