// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import type { LiveBoardView } from "../../lib/scoreboard";

const startLiveBoardClient = vi.hoisted(() =>
  vi.fn((_options: { onChange: (view: LiveBoardView | null) => void }) => vi.fn()),
);

vi.mock("../../lib/scoreboard", async (importOriginal) => ({
  ...(await importOriginal()),
  startLiveBoardClient,
}));

import ScoreboardIsland from "./ScoreboardIsland";

afterEach(() => {
  cleanup();
  startLiveBoardClient.mockClear();
});

const MATCH = {
  kickoffTime: "19:30:00",
  leagueName: "Bezirksliga Herren",
  home: { name: "Dragons 1", abbr: "DRA", color: "#0f9d58", clubId: 512 },
  guest: { name: "TK Hannover", abbr: "TKH", color: "#c53929", clubId: 1026 },
};

const SNAPSHOT = {
  scoreHome: 63,
  scoreGuest: 58,
  foulsHome: 2,
  foulsGuest: 4,
  timeoutsHome: 1,
  timeoutsGuest: 0,
  period: 3,
  clockText: "04:12",
  clockRunning: true,
  clockMs: 252_000,
  shotClock: 14,
  shotClockText: "14",
  timeoutActive: false,
  lastFrameAt: "2026-08-02T12:00:00.000Z",
  secondsSinceLastFrame: 1,
};

function mount() {
  render(<ScoreboardIsland />);
  const options = startLiveBoardClient.mock.calls[0]![0];
  return {
    push: (view: LiveBoardView | null) => act(() => options.onChange(view)),
  };
}

function twitchLink() {
  return screen.getByRole("link", { name: /Twitch/ });
}

describe("ScoreboardIsland", () => {
  it("renders nothing until a view arrives", () => {
    mount();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("renders the live bug with teams, crests, score and clock", () => {
    const { push } = mount();
    push({ match: MATCH, scoreboard: SNAPSHOT });

    expect(screen.getByText("63")).toBeInTheDocument();
    expect(screen.getByText("58")).toBeInTheDocument();
    expect(screen.getByText("DRA")).toBeInTheDocument();
    expect(screen.getByText("TKH")).toBeInTheDocument();
    expect(screen.getByText("04:12")).toBeInTheDocument();
    // Broadcast ordinal period notation, same as the OBS overlay.
    expect(screen.getByText("RD")).toBeInTheDocument();
    expect(screen.getByAltText("TK Hannover")).toHaveAttribute(
      "src",
      expect.stringContaining("/public/assets/clubs/1026.webp"),
    );
  });

  it("marks the running game with a live badge and the league name", () => {
    const { push } = mount();
    push({ match: MATCH, scoreboard: SNAPSHOT });

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Bezirksliga Herren")).toBeInTheDocument();
  });

  it("renders the shot clock", () => {
    const { push } = mount();
    push({ match: MATCH, scoreboard: SNAPSHOT });
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("shows the timeout cap instead of the shot clock during a timeout", () => {
    const { push } = mount();
    push({
      match: MATCH,
      scoreboard: { ...SNAPSHOT, timeoutActive: true, clockRunning: false },
    });
    expect(screen.getByText("TO")).toBeInTheDocument();
    expect(screen.queryByText("14")).not.toBeInTheDocument();
  });

  it("ticks the clocks locally between events while the clock runs", async () => {
    vi.useFakeTimers();
    try {
      const { push } = mount();
      push({ match: MATCH, scoreboard: SNAPSHOT });
      expect(screen.getByText("04:12")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(screen.getByText("04:10")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not tick while the clock is stopped", async () => {
    vi.useFakeTimers();
    try {
      const { push } = mount();
      push({
        match: MATCH,
        scoreboard: { ...SNAPSHOT, clockRunning: false },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(screen.getByText("04:12")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("links to the Twitch stream from the live bug", () => {
    const { push } = mount();
    push({ match: MATCH, scoreboard: SNAPSHOT });

    expect(twitchLink()).toHaveAttribute("href", "https://twitch.tv/hb_dragons");
    expect(twitchLink()).toHaveAttribute("target", "_blank");
  });

  it("falls back to Heim/Gast labels when the match did not resolve", () => {
    const { push } = mount();
    push({ match: null, scoreboard: SNAPSHOT });

    expect(screen.getByText("Heim")).toBeInTheDocument();
    expect(screen.getByText("Gast")).toBeInTheDocument();
    expect(screen.getByText("63")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("omits the league line when the match has none", () => {
    const { push } = mount();
    push({ match: { ...MATCH, leagueName: null }, scoreboard: SNAPSHOT });

    expect(screen.getByText("DRA")).toBeInTheDocument();
    expect(screen.queryByText("Bezirksliga Herren")).not.toBeInTheDocument();
  });

  it("hides again when the view goes null", () => {
    const { push } = mount();
    push({ match: MATCH, scoreboard: SNAPSHOT });
    push(null);
    expect(screen.queryByText("DRA")).not.toBeInTheDocument();
  });

  it("stops the client on unmount", () => {
    const stop = vi.fn();
    startLiveBoardClient.mockReturnValueOnce(stop);
    const { unmount } = render(<ScoreboardIsland />);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
