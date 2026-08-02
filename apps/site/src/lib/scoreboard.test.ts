import { describe, expect, it } from "vitest";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DEFAULT_SCOREBOARD_DEVICE_ID,
  IDLE_RECHECK_MS,
  LIVE_STALE_MS,
  backoffDelay,
  isLatestSnapshotLive,
  latestUrl,
  parseSnapshot,
  startScoreboardClient,
  streamUrl,
  type LiveSnapshot,
  type ScoreboardClientOptions,
  type ScoreboardEventSource,
} from "./scoreboard";

const BASE = "https://api.example";
const DEVICE = "d1";
const FRAME_AT = "2026-08-02T12:00:00.000Z";
const NEXT_FRAME_AT = "2026-08-02T12:00:01.000Z";

/** A full wire row as GET /public/scoreboard/latest returns it. */
function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deviceId: DEVICE,
    scoreHome: 12,
    scoreGuest: 8,
    foulsHome: 1,
    foulsGuest: 2,
    timeoutsHome: 0,
    timeoutsGuest: 1,
    period: 2,
    clockText: "07:31",
    clockSeconds: 451,
    clockRunning: true,
    shotClock: 14,
    shotClockText: "14",
    shotClockRunning: true,
    timeoutActive: false,
    timeoutDuration: "",
    panelName: DEVICE,
    lastFrameAt: FRAME_AT,
    updatedAt: FRAME_AT,
    secondsSinceLastFrame: 2,
    ...overrides,
  };
}

const PARSED: LiveSnapshot = {
  scoreHome: 12,
  scoreGuest: 8,
  period: 2,
  clockText: "07:31",
  clockRunning: true,
  lastFrameAt: FRAME_AT,
  secondsSinceLastFrame: 2,
};

describe("parseSnapshot", () => {
  it("keeps exactly the rendered fields of a wire row", () => {
    expect(parseSnapshot(wire())).toEqual(PARSED);
  });

  it("normalizes a missing secondsSinceLastFrame to null", () => {
    const row = wire();
    delete row.secondsSinceLastFrame;
    expect(parseSnapshot(row)).toEqual({ ...PARSED, secondsSinceLastFrame: null });
  });

  it("normalizes a non-numeric secondsSinceLastFrame to null", () => {
    expect(parseSnapshot(wire({ secondsSinceLastFrame: "2" }))).toEqual({
      ...PARSED,
      secondsSinceLastFrame: null,
    });
  });

  it.each([
    ["null", null],
    ["a string", "snapshot"],
    ["a number", 42],
    ["an empty object", {}],
    ["a non-numeric scoreHome", wire({ scoreHome: "12" })],
    ["a non-numeric scoreGuest", wire({ scoreGuest: null })],
    ["a non-numeric period", wire({ period: "2" })],
    ["a non-string clockText", wire({ clockText: 731 })],
    ["a non-boolean clockRunning", wire({ clockRunning: "yes" })],
    ["a non-string lastFrameAt", wire({ lastFrameAt: 1754000000 })],
  ])("rejects %s", (_label, data) => {
    expect(parseSnapshot(data)).toBeNull();
  });
});

describe("isLatestSnapshotLive", () => {
  const at = (seconds: number | null) => ({ ...PARSED, secondsSinceLastFrame: seconds });
  const nowMs = Date.parse(FRAME_AT);

  it("is live when the server-computed frame age is within the threshold", () => {
    expect(isLatestSnapshotLive(at(2), nowMs)).toBe(true);
  });

  it("is live exactly at the threshold", () => {
    expect(isLatestSnapshotLive(at(LIVE_STALE_MS / 1000), nowMs)).toBe(true);
  });

  it("is not live when the server-computed frame age exceeds the threshold", () => {
    expect(isLatestSnapshotLive(at(LIVE_STALE_MS / 1000 + 1), nowMs)).toBe(false);
  });

  it("falls back to lastFrameAt when the server age is absent: fresh", () => {
    expect(isLatestSnapshotLive(at(null), nowMs + LIVE_STALE_MS)).toBe(true);
  });

  it("falls back to lastFrameAt when the server age is absent: stale", () => {
    expect(isLatestSnapshotLive(at(null), nowMs + LIVE_STALE_MS + 1)).toBe(false);
  });

  it("is not live when the server age is absent and lastFrameAt is unparseable", () => {
    expect(isLatestSnapshotLive({ ...at(null), lastFrameAt: "not a date" }, nowMs)).toBe(false);
  });
});

describe("backoffDelay", () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [3, 4_000],
    [4, 8_000],
    [5, 16_000],
    [6, 30_000],
    [7, 30_000],
    [40, 30_000],
  ])("attempt %i waits %i ms", (attempt, expected) => {
    expect(backoffDelay(attempt)).toBe(expected);
  });

  it("starts at the base delay and caps at the maximum", () => {
    expect(backoffDelay(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelay(1000)).toBe(BACKOFF_MAX_MS);
  });
});

describe("endpoint URLs", () => {
  it("builds the latest URL with the device id", () => {
    expect(latestUrl(BASE, DEVICE)).toBe(
      "https://api.example/public/scoreboard/latest?deviceId=d1",
    );
  });

  it("builds the stream URL with the device id", () => {
    expect(streamUrl(BASE, DEVICE)).toBe(
      "https://api.example/public/scoreboard/stream?deviceId=d1",
    );
  });

  it("URL-encodes the device id", () => {
    expect(latestUrl(BASE, "a b/c")).toBe(
      "https://api.example/public/scoreboard/latest?deviceId=a%20b%2Fc",
    );
  });

  it("defaults to the production panel id", () => {
    expect(DEFAULT_SCOREBOARD_DEVICE_ID).toBe("dragons-1");
  });
});

interface Scheduled {
  id: number;
  fn: () => void;
  ms: number;
}

/** Deterministic stand-in for setTimeout/clearTimeout. */
function makeScheduler() {
  const tasks: Scheduled[] = [];
  const log: number[] = [];
  let nextId = 1;
  return {
    schedule(fn: () => void, ms: number): unknown {
      const task = { id: nextId++, fn, ms };
      tasks.push(task);
      log.push(ms);
      return task.id;
    },
    cancel(handle: unknown): void {
      const index = tasks.findIndex((task) => task.id === handle);
      if (index >= 0) tasks.splice(index, 1);
    },
    /** Delays of the tasks currently pending. */
    pending(): number[] {
      return tasks.map((task) => task.ms);
    },
    /** Every delay ever scheduled, in order. */
    scheduledLog(): number[] {
      return log;
    },
    /** Runs (and removes) the first pending task with the given delay. */
    fire(ms: number): void {
      const index = tasks.findIndex((task) => task.ms === ms);
      if (index < 0) throw new Error(`no pending ${ms}ms task`);
      const [task] = tasks.splice(index, 1);
      task!.fn();
    },
  };
}

class FakeEventSource implements ScoreboardEventSource {
  readonly url: string;
  closed = false;
  private listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function okResponse(body: unknown): Pick<Response, "ok" | "json"> {
  return { ok: true, json: () => Promise.resolve(body) } as Pick<Response, "ok" | "json">;
}

function errorResponse(): Pick<Response, "ok" | "json"> {
  return {
    ok: false,
    json: () => Promise.resolve({ error: "No data", code: "NO_DATA" }),
  } as Pick<Response, "ok" | "json">;
}

/** Lets the fetch microtasks settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(responses: Array<Pick<Response, "ok" | "json"> | Error>) {
  const scheduler = makeScheduler();
  const sources: FakeEventSource[] = [];
  const changes: Array<LiveSnapshot | null> = [];
  const requested: string[] = [];
  let nowMs = Date.parse(FRAME_AT);
  const fetchImpl: ScoreboardClientOptions["fetchImpl"] = (url) => {
    requested.push(url);
    const next = responses.shift() ?? errorResponse();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next as Response);
  };
  const stop = startScoreboardClient({
    baseUrl: BASE,
    deviceId: DEVICE,
    onChange: (snapshot) => changes.push(snapshot),
    fetchImpl,
    createEventSource: (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
    now: () => nowMs,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  return {
    scheduler,
    sources,
    changes,
    requested,
    stop,
    setNow: (value: number) => {
      nowMs = value;
    },
  };
}

describe("startScoreboardClient", () => {
  it("requests /latest for the device on start", async () => {
    const harness = setup([errorResponse()]);
    await flush();
    expect(harness.requested).toEqual([latestUrl(BASE, DEVICE)]);
    harness.stop();
  });

  it("shows the board and opens the stream when the latest snapshot is fresh", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    expect(harness.changes).toEqual([PARSED]);
    expect(harness.sources.map((source) => source.url)).toEqual([streamUrl(BASE, DEVICE)]);
    harness.stop();
  });

  it("stays hidden and schedules a recheck when /latest has no data", async () => {
    const harness = setup([errorResponse()]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.sources).toEqual([]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("stays hidden when the fetch rejects", async () => {
    const harness = setup([new Error("cors")]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("stays hidden when the body cannot be read as JSON", async () => {
    const harness = setup([
      {
        ok: true,
        json: () => Promise.reject(new Error("bad json")),
      } as Pick<Response, "ok" | "json">,
    ]);
    await flush();
    expect(harness.changes).toEqual([null]);
    harness.stop();
  });

  it("stays hidden when the body is not a snapshot", async () => {
    const harness = setup([okResponse({ error: "nope" })]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.sources).toEqual([]);
    harness.stop();
  });

  it("stays hidden when the latest snapshot is stale", async () => {
    const harness = setup([okResponse(wire({ secondsSinceLastFrame: 4_270_551 }))]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.sources).toEqual([]);
    harness.stop();
  });

  it("goes live from the idle recheck once a game starts", async () => {
    const harness = setup([errorResponse(), okResponse(wire())]);
    await flush();
    harness.scheduler.fire(IDLE_RECHECK_MS);
    await flush();
    expect(harness.changes).toEqual([null, PARSED]);
    expect(harness.sources).toHaveLength(1);
    harness.stop();
  });

  it("renders each streamed snapshot", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    const updated = wire({ scoreHome: 14, lastFrameAt: NEXT_FRAME_AT });
    delete updated.secondsSinceLastFrame;
    harness.sources[0]!.emit("snapshot", JSON.stringify(updated));
    expect(harness.changes.at(-1)).toEqual({
      ...PARSED,
      scoreHome: 14,
      lastFrameAt: NEXT_FRAME_AT,
      secondsSinceLastFrame: null,
    });
    harness.stop();
  });

  it("ignores malformed stream events", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    const source = harness.sources[0]!;
    source.emit("snapshot");
    source.emit("snapshot", "not json");
    source.emit("snapshot", JSON.stringify({ error: "nope" }));
    expect(harness.changes).toEqual([PARSED]);
    harness.stop();
  });

  it("hides and returns to polling when frames stop arriving", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.scheduler.fire(LIVE_STALE_MS);
    expect(harness.sources[0]!.closed).toBe(true);
    expect(harness.changes).toEqual([PARSED, null]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("a fresh frame re-arms the staleness watchdog", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.sources[0]!.emit(
      "snapshot",
      JSON.stringify(wire({ lastFrameAt: NEXT_FRAME_AT })),
    );
    const staleArms = harness.scheduler
      .scheduledLog()
      .filter((ms) => ms === LIVE_STALE_MS);
    expect(staleArms).toHaveLength(2);
    expect(harness.scheduler.pending()).toEqual([LIVE_STALE_MS]);
    harness.stop();
  });

  it("a replayed frame with an unchanged timestamp does not extend liveness", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.sources[0]!.emit("snapshot", JSON.stringify(wire()));
    const staleArms = harness.scheduler
      .scheduledLog()
      .filter((ms) => ms === LIVE_STALE_MS);
    expect(staleArms).toHaveLength(1);
    harness.stop();
  });

  it("reconnects with exponential backoff and resets it once the stream reopens", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();

    harness.sources[0]!.emit("error");
    expect(harness.sources[0]!.closed).toBe(true);
    expect(harness.scheduler.pending()).toContain(backoffDelay(1));

    harness.scheduler.fire(backoffDelay(1));
    expect(harness.sources).toHaveLength(2);
    harness.sources[1]!.emit("error");
    expect(harness.scheduler.pending()).toContain(backoffDelay(2));

    harness.scheduler.fire(backoffDelay(2));
    expect(harness.sources).toHaveLength(3);
    harness.sources[2]!.emit("snapshot", JSON.stringify(wire({ lastFrameAt: NEXT_FRAME_AT })));
    harness.sources[2]!.emit("error");
    expect(harness.scheduler.pending()).toContain(backoffDelay(1));
    harness.stop();
  });

  it("an open that never delivers data does not reset the backoff", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.sources[0]!.emit("error");
    harness.scheduler.fire(backoffDelay(1));
    harness.sources[1]!.emit("open");
    harness.sources[1]!.emit("error");
    expect(harness.scheduler.pending()).toContain(backoffDelay(2));
    harness.stop();
  });

  it("a duplicate error event does not schedule a second reconnect", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.sources[0]!.emit("error");
    harness.sources[0]!.emit("error");
    expect(harness.scheduler.pending().filter((ms) => ms === backoffDelay(1))).toHaveLength(1);
    expect(harness.scheduler.pending().filter((ms) => ms === backoffDelay(2))).toHaveLength(0);
    harness.stop();
  });

  it("keeps the last score visible through a transient disconnect", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.sources[0]!.emit("error");
    expect(harness.changes).toEqual([PARSED]);
    harness.stop();
  });

  it("hides even while disconnected once the watchdog fires", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.sources[0]!.emit("error");
    harness.scheduler.fire(LIVE_STALE_MS);
    expect(harness.changes).toEqual([PARSED, null]);
    // The pending reconnect was cancelled; only the idle recheck remains.
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("stop() closes the stream, cancels timers and mutes late events", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.stop();
    expect(harness.sources[0]!.closed).toBe(true);
    expect(harness.scheduler.pending()).toEqual([]);
    const source = harness.sources[0]!;
    source.emit("snapshot", JSON.stringify(wire({ lastFrameAt: NEXT_FRAME_AT })));
    source.emit("error");
    source.emit("open");
    expect(harness.changes).toEqual([PARSED]);
    expect(harness.scheduler.pending()).toEqual([]);
  });

  it("stop() during the initial fetch ignores the late response", async () => {
    let resolveFetch: ((value: Pick<Response, "ok" | "json">) => void) | undefined;
    const scheduler = makeScheduler();
    const sources: FakeEventSource[] = [];
    const changes: Array<LiveSnapshot | null> = [];
    const stop = startScoreboardClient({
      baseUrl: BASE,
      deviceId: DEVICE,
      onChange: (snapshot) => changes.push(snapshot),
      fetchImpl: () =>
        new Promise((resolve) => {
          resolveFetch = resolve as (value: Pick<Response, "ok" | "json">) => void;
        }) as Promise<Response>,
      createEventSource: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      now: () => Date.parse(FRAME_AT),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    stop();
    resolveFetch!(okResponse(wire()));
    await flush();
    expect(changes).toEqual([]);
    expect(sources).toEqual([]);
    expect(scheduler.pending()).toEqual([]);
  });

  it("stop() while hidden cancels the recheck poll", async () => {
    const harness = setup([errorResponse()]);
    await flush();
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
    expect(harness.scheduler.pending()).toEqual([]);
  });

  it("stop() is idempotent", async () => {
    const harness = setup([okResponse(wire())]);
    await flush();
    harness.stop();
    expect(() => harness.stop()).not.toThrow();
  });
});
