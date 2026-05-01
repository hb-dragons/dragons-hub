// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { OverlayClient } from "./overlay-client";

vi.mock("./pregame-card", () => ({
  PregameCard: () => <div data-testid="pregame">PRE</div>,
}));
vi.mock("./score-bug", () => ({
  ScoreBug: () => <div data-testid="bug">BUG</div>,
}));

class MockEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

describe("OverlayClient", () => {
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
});
