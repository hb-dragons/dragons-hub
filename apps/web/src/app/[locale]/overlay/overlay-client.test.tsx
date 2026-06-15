// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { OverlayClient } from "./overlay-client";

vi.mock("./pregame-card", () => ({
  PregameCard: () => <div data-testid="pregame">PRE</div>,
}));
let lastClockText = "";
vi.mock("./score-bug", () => ({
  ScoreBug: ({ scoreboard }: { scoreboard: { clockText: string } }) => {
    lastClockText = scoreboard.clockText;
    return <div data-testid="bug">{scoreboard.clockText}</div>;
  },
}));

class MockEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

function liveState(clockRunning: boolean) {
  return {
    deviceId: "d1",
    isLive: true,
    phase: "live" as const,
    match: {
      id: 1,
      kickoffDate: "2026-05-02",
      kickoffTime: "19:30:00",
      league: { id: 1, name: "Liga" },
      home: { name: "D", abbr: "DRA", color: "#000", clubId: 1 },
      guest: { name: "V", abbr: "VIS", color: "#fff", clubId: 2 },
    },
    scoreboard: {
      deviceId: "d1",
      scoreHome: 0,
      scoreGuest: 0,
      foulsHome: 0,
      foulsGuest: 0,
      timeoutsHome: 0,
      timeoutsGuest: 0,
      period: 1,
      clockText: "05:00",
      clockMs: 300_000,
      clockSeconds: 300,
      clockRunning,
      shotClock: 18,
      shotClockText: "18",
      shotClockRunning: false,
      timeoutActive: false,
      timeoutDuration: "",
      panelName: "d1",
      lastFrameAt: new Date().toISOString(),
      secondsSinceLastFrame: 0,
    },
    stale: false,
    startedAt: null,
    endedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

describe("OverlayClient", () => {
  // Guard against a mid-test failure leaking fake timers / the performance.now
  // spy into sibling tests.
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing when phase=idle", () => {
    const { container } = render(
      <OverlayClient
        deviceId="d1"
        initial={{
          deviceId: "d1",
          isLive: false,
          phase: "idle",
          match: null,
          scoreboard: null,
          stale: false,
          startedAt: null,
          endedAt: null,
          updatedAt: new Date().toISOString(),
        }}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders pregame card when phase=pregame", () => {
    const { getByTestId } = render(
      <OverlayClient
        deviceId="d1"
        initial={{
          deviceId: "d1",
          isLive: true,
          phase: "pregame",
          match: {
            id: 1,
            kickoffDate: "2026-05-02",
            kickoffTime: "19:30:00",
            league: { id: 1, name: "Liga" },
            home: { name: "Dragons", abbr: "DRA", color: "#000", clubId: 42 },
            guest: { name: "Visitors", abbr: "VIS", color: "#fff", clubId: 99 },
          },
          scoreboard: null,
          stale: false,
          startedAt: null,
          endedAt: null,
          updatedAt: new Date().toISOString(),
        }}
      />,
    );
    expect(getByTestId("pregame")).toBeTruthy();
  });

  it("interpolates the game clock between events", async () => {
    vi.useFakeTimers();
    const nowRef = { v: 0 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.v);
    render(<OverlayClient deviceId="d1" initial={liveState(true)} />);
    // Advance wall-clock and the interpolation interval together so that
    // performance.now() (mocked) tracks the fake timer clock.
    for (let i = 0; i < 21; i++) {
      nowRef.v += 100;
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(lastClockText).toBe("04:58");
  });
});
