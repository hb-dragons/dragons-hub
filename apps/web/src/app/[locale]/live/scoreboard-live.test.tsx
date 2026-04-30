// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ScoreboardLive } from "./scoreboard-live";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;
  listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(name: string, fn: (ev: MessageEvent) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name)!.push(fn);
  }
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }
  dispatch(name: string, data: unknown) {
    const ev = new MessageEvent(name, { data: JSON.stringify(data) });
    this.listeners.get(name)?.forEach((l) => l(ev));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  // @ts-expect-error - assign to globalThis for the component to use
  globalThis.EventSource = MockEventSource;
});

afterEach(() => {
  MockEventSource.instances.forEach((i) => i.close());
  cleanup();
});

const messages = {
  scoreboard: {
    live: {
      title: "Live",
      period: "Q",
      shotClock: "SC",
      fouls: "F",
      timeouts: "TO",
      online: "Live",
      connecting: "Connecting…",
      offline: "Waiting for data…",
    },
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const initial = {
  deviceId: "d1",
  scoreHome: 0,
  scoreGuest: 0,
  foulsHome: 0,
  foulsGuest: 0,
  timeoutsHome: 0,
  timeoutsGuest: 0,
  period: 1,
  clockText: "10:00",
  clockSeconds: 600,
  clockRunning: false,
  shotClock: 24,
  timeoutActive: false,
  timeoutDuration: "",
  panelName: null,
  lastFrameAt: new Date().toISOString(),
  secondsSinceLastFrame: 0,
};

describe("ScoreboardLive", () => {
  it("renders the initial snapshot prop", () => {
    render(wrap(<ScoreboardLive deviceId="d1" initialSnapshot={initial} />));
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("updates state on snapshot SSE event", async () => {
    render(wrap(<ScoreboardLive deviceId="d1" initialSnapshot={initial} />));
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    await act(async () => {
      es!.dispatch("snapshot", { ...initial, scoreHome: 7 });
    });
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("falls back to a placeholder when initialSnapshot is null", () => {
    render(wrap(<ScoreboardLive deviceId="d1" initialSnapshot={null} />));
    expect(screen.getByText(/offline|warten|kein|waiting/i)).toBeInTheDocument();
  });
});
