// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: { deviceId: "d1", lastFrameAt: null, secondsSinceLastFrame: null, online: false },
    isLoading: false,
  })),
}));

vi.mock("@/lib/api", () => ({
  fetchAPI: vi.fn(async () => [
    { id: 2, scoreHome: 5, scoreGuest: 4, capturedAt: new Date().toISOString(), rawHex: "f8" },
    { id: 1, scoreHome: 4, scoreGuest: 4, capturedAt: new Date().toISOString(), rawHex: "f8" },
  ]),
}));

class MockEventSource {
  url: string;
  listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(name: string, fn: (ev: MessageEvent) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name)!.push(fn);
  }
  removeEventListener() {}
  close() {}
  dispatch(name: string, data: unknown) {
    const ev = new MessageEvent(name, { data: JSON.stringify(data) });
    this.listeners.get(name)?.forEach((l) => l(ev));
  }
}

beforeEach(() => {
  // @ts-expect-error - assign for component
  globalThis.EventSource = MockEventSource;
});

import { ScoreboardDebug } from "./scoreboard-debug";

describe("ScoreboardDebug", () => {
  it("renders the snapshots table from the initial fetch", async () => {
    await act(async () => {
      render(<ScoreboardDebug deviceId="d1" />);
    });
    expect(await screen.findByText(/^5$/)).toBeInTheDocument();
  });
});
