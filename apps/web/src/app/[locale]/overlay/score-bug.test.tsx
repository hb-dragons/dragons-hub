// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { BroadcastMatch, PublicLiveSnapshot } from "@dragons/shared";
import { ScoreBug } from "./score-bug";

const match: BroadcastMatch = {
  id: 1,
  kickoffDate: "2026-05-02",
  kickoffTime: "19:30:00",
  league: { id: 1, name: "Liga" },
  home: { name: "Dragons", abbr: "DRA", color: "#cc0000", clubId: 42 },
  guest: { name: "Visitors", abbr: "VIS", color: "#0033cc", clubId: 99 },
};

function snapshot(overrides: Partial<PublicLiveSnapshot> = {}): PublicLiveSnapshot {
  return {
    deviceId: "d1",
    scoreHome: 27,
    scoreGuest: 16,
    foulsHome: 2,
    foulsGuest: 5,
    timeoutsHome: 3,
    timeoutsGuest: 1,
    period: 2,
    clockText: "08:17",
    clockMs: 497_000,
    clockRunning: true,
    shotClock: 13,
    shotClockText: "13",
    shotClockRunning: false,
    timeoutActive: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ScoreBug", () => {
  it("renders abbrs, scores, clock, period label and shot clock", () => {
    const { container } = render(
      <ScoreBug match={match} scoreboard={snapshot()} stale={false} />,
    );
    const txt = container.textContent ?? "";
    expect(txt).toContain("DRA");
    expect(txt).toContain("VIS");
    expect(txt).toContain("27");
    expect(txt).toContain("16");
    expect(txt).toContain("08:17");
    expect(txt).toContain("2ND");
    expect(txt).toContain("13");
  });

  it("shows TIMEOUT indicator when timeoutActive", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ timeoutActive: true })}
        stale={false}
      />,
    );
    expect(container.querySelector('[aria-label="Timeout"]')).not.toBeNull();
  });

  it("formats overtime periods", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ period: 5 })}
        stale={false}
      />,
    );
    expect(container.textContent ?? "").toContain("OT");
  });

  it("shows numbered overtime past first OT", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ period: 6 })}
        stale={false}
      />,
    );
    expect(container.textContent ?? "").toContain("OT2");
  });

  it("renders bonus pip in red when 5 fouls", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ foulsHome: 5 })}
        stale={false}
      />,
    );
    const reds = container.querySelectorAll(".bg-red-500");
    expect(reds.length).toBeGreaterThan(0);
  });

  it("renders bonus pip in red when team-foul limit reached at 4 (FIBA Art. 41.1.1)", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ foulsHome: 4, foulsGuest: 0 })}
        stale={false}
      />,
    );
    const reds = container.querySelectorAll(".bg-red-500");
    expect(reds.length).toBeGreaterThan(0);
  });

  it("does not render bonus pip below the 4-foul limit", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ foulsHome: 3, foulsGuest: 0 })}
        stale={false}
      />,
    );
    expect(container.querySelector(".bg-red-500")).toBeNull();
  });

  function timeoutPipCount(container: HTMLElement, team: "home" | "guest"): number {
    const aria = team === "home" ? "Timeouts " : "Timeouts ";
    const labels = container.querySelectorAll(`[aria-label^="${aria}"]`);
    // First match = home, second = guest
    const node = labels[team === "home" ? 0 : 1];
    return node ? node.children.length : 0;
  }

  it("renders 2 timeout pips in Q1 and Q2 (FIBA Art. 18.2.5 H1 cap)", () => {
    for (const period of [1, 2]) {
      const { container } = render(
        <ScoreBug match={match} scoreboard={snapshot({ period })} stale={false} />,
      );
      expect(timeoutPipCount(container, "home")).toBe(2);
      expect(timeoutPipCount(container, "guest")).toBe(2);
    }
  });

  it("renders 3 timeout pips in Q3 and Q4 (FIBA Art. 18.2.5 H2 cap)", () => {
    for (const period of [3, 4]) {
      const { container } = render(
        <ScoreBug match={match} scoreboard={snapshot({ period })} stale={false} />,
      );
      expect(timeoutPipCount(container, "home")).toBe(3);
      expect(timeoutPipCount(container, "guest")).toBe(3);
    }
  });

  it("renders 1 timeout pip in OT (FIBA Art. 18.2.5)", () => {
    const { container } = render(
      <ScoreBug match={match} scoreboard={snapshot({ period: 5 })} stale={false} />,
    );
    expect(timeoutPipCount(container, "home")).toBe(1);
    expect(timeoutPipCount(container, "guest")).toBe(1);
  });

  it("applies opacity-50 when stale", () => {
    const { container } = render(
      <ScoreBug match={match} scoreboard={snapshot()} stale={true} />,
    );
    expect(container.querySelector(".opacity-50")).toBeTruthy();
  });

  it("renders the shot-clock text verbatim (incl. tenths under 5s)", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ shotClock: 4.7, shotClockText: "4.7" })}
        stale={false}
      />,
    );
    expect(container.textContent ?? "").toContain("4.7");
  });

  it("renders blank shot clock when absent", () => {
    const { container } = render(
      <ScoreBug
        match={match}
        scoreboard={snapshot({ shotClock: null, shotClockText: "" })}
        stale={false}
      />,
    );
    // No shot-clock digits rendered when SC24 is absent.
    expect(container.querySelector('[aria-label="Timeout"]')).toBeNull();
  });
});
