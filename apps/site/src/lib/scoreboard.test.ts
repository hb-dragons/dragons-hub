import { describe, expect, it } from "vitest";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DEFAULT_SCOREBOARD_DEVICE_ID,
  IDLE_RECHECK_MS,
  LIVE_STALE_MS,
  backoffDelay,
  parseBroadcastState,
  parseSnapshot,
  startLiveBoardClient,
  stateUrl,
  streamUrl,
  viewFromState,
  type LiveBoardClientOptions,
  type LiveBoardView,
  type LiveSnapshot,
  type ScoreboardEventSource,
  type SiteBroadcastState,
} from "./scoreboard";

const BASE = "https://api.example";
const DEVICE = "d1";
const FRAME_AT = "2026-08-02T12:00:00.000Z";
const NEXT_FRAME_AT = "2026-08-02T12:00:01.000Z";

/** The scoreboard slice of a wire state, as the API serializes it. */
function wireSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    secondsSinceLastFrame: 2,
    clockMs: 451_000,
    ...overrides,
  };
}

function wireMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    kickoffDate: "2026-08-02",
    kickoffTime: "19:30:00",
    league: { id: 3, name: "Bezirksliga Herren" },
    home: { name: "Dragons 1", abbr: "DRA", color: "#0f9d58", clubId: 512 },
    guest: { name: "TK Hannover", abbr: "TKH", color: "#c53929", clubId: 1026 },
    ...overrides,
  };
}

/** A full wire state as GET /public/broadcast/state returns it. */
function wireState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deviceId: DEVICE,
    isLive: true,
    phase: "live",
    match: wireMatch(),
    scoreboard: wireSnapshot(),
    stale: false,
    startedAt: FRAME_AT,
    endedAt: null,
    updatedAt: FRAME_AT,
    ...overrides,
  };
}

const PARSED_SNAPSHOT: LiveSnapshot = {
  scoreHome: 12,
  scoreGuest: 8,
  foulsHome: 1,
  foulsGuest: 2,
  timeoutsHome: 0,
  timeoutsGuest: 1,
  period: 2,
  clockText: "07:31",
  clockRunning: true,
  clockMs: 451_000,
  shotClock: 14,
  shotClockText: "14",
  timeoutActive: false,
  lastFrameAt: FRAME_AT,
  secondsSinceLastFrame: 2,
};

const PARSED_MATCH = {
  kickoffTime: "19:30:00",
  leagueName: "Bezirksliga Herren",
  home: { name: "Dragons 1", abbr: "DRA", color: "#0f9d58", clubId: 512 },
  guest: { name: "TK Hannover", abbr: "TKH", color: "#c53929", clubId: 1026 },
};

const PARSED_STATE: SiteBroadcastState = {
  phase: "live",
  stale: false,
  match: PARSED_MATCH,
  scoreboard: PARSED_SNAPSHOT,
};

describe("parseSnapshot", () => {
  it("keeps exactly the rendered fields of a wire row", () => {
    expect(parseSnapshot(wireSnapshot())).toEqual(PARSED_SNAPSHOT);
  });

  it("normalizes a missing secondsSinceLastFrame to null", () => {
    const row = wireSnapshot();
    delete row.secondsSinceLastFrame;
    expect(parseSnapshot(row)).toEqual({ ...PARSED_SNAPSHOT, secondsSinceLastFrame: null });
  });

  it("normalizes non-numeric shot clock and clockMs to null", () => {
    expect(parseSnapshot(wireSnapshot({ shotClock: null, clockMs: undefined }))).toEqual({
      ...PARSED_SNAPSHOT,
      shotClock: null,
      clockMs: null,
    });
  });

  it.each([
    ["null", null],
    ["a string", "snapshot"],
    ["an empty object", {}],
    ["a non-numeric scoreHome", wireSnapshot({ scoreHome: "12" })],
    ["a non-numeric foulsHome", wireSnapshot({ foulsHome: "1" })],
    ["a non-numeric timeoutsGuest", wireSnapshot({ timeoutsGuest: null })],
    ["a non-boolean clockRunning", wireSnapshot({ clockRunning: "yes" })],
    ["a non-boolean timeoutActive", wireSnapshot({ timeoutActive: "no" })],
    ["a non-string shotClockText", wireSnapshot({ shotClockText: 14 })],
    ["a non-string lastFrameAt", wireSnapshot({ lastFrameAt: 1754000000 })],
  ])("rejects %s", (_label, data) => {
    expect(parseSnapshot(data)).toBeNull();
  });
});

describe("parseBroadcastState", () => {
  it("keeps phase, staleness and the rendered match/scoreboard fields", () => {
    expect(parseBroadcastState(wireState())).toEqual(PARSED_STATE);
  });

  it("carries a null match through (nothing bound in the admin)", () => {
    expect(parseBroadcastState(wireState({ match: null }))).toEqual({
      ...PARSED_STATE,
      match: null,
    });
  });

  it("carries a null scoreboard through (no frames yet)", () => {
    expect(parseBroadcastState(wireState({ scoreboard: null }))).toEqual({
      ...PARSED_STATE,
      scoreboard: null,
    });
  });

  it("normalizes a null league to a null league name", () => {
    expect(parseBroadcastState(wireState({ match: wireMatch({ league: null }) }))).toEqual({
      ...PARSED_STATE,
      match: { ...PARSED_MATCH, leagueName: null },
    });
  });

  it.each([
    ["null", null],
    ["a string", "state"],
    ["an empty object", {}],
    ["an unknown phase", wireState({ phase: "halftime" })],
    ["a non-boolean stale", wireState({ stale: "no" })],
    ["a malformed match", wireState({ match: { home: null } })],
    ["a match with a non-string abbr", wireState({ match: wireMatch({ home: { name: "Dragons 1", abbr: 7, color: "#fff", clubId: 512 } }) })],
    ["a match with a non-numeric clubId", wireState({ match: wireMatch({ guest: { name: "TKH", abbr: "TKH", color: "#fff", clubId: "1026" } }) })],
    ["a league without a name", wireState({ match: wireMatch({ league: { id: 3 } }) })],
    ["a malformed scoreboard", wireState({ scoreboard: { scoreHome: "12" } })],
  ])("rejects %s", (_label, data) => {
    expect(parseBroadcastState(data)).toBeNull();
  });
});

describe("viewFromState", () => {
  const state = (overrides: Partial<SiteBroadcastState>): SiteBroadcastState => ({
    ...PARSED_STATE,
    ...overrides,
  });

  it("hides on idle even when a stale scoreboard row survives", () => {
    expect(viewFromState(state({ phase: "idle" }))).toBeNull();
  });

  it("hides in pregame — the board exists only for a running game", () => {
    expect(viewFromState(state({ phase: "pregame" }))).toBeNull();
  });

  it("shows the live board with the match while frames are fresh", () => {
    expect(viewFromState(state({}))).toEqual({
      match: PARSED_MATCH,
      scoreboard: PARSED_SNAPSHOT,
    });
  });

  it("keeps the live board without a match (bound match no longer resolves)", () => {
    expect(viewFromState(state({ match: null }))).toEqual({
      match: null,
      scoreboard: PARSED_SNAPSHOT,
    });
  });

  it("hides a live game whose frames went stale", () => {
    expect(viewFromState(state({ stale: true }))).toBeNull();
  });

  it("hides a live phase without scoreboard data", () => {
    expect(viewFromState(state({ scoreboard: null }))).toBeNull();
  });
});

describe("backoffDelay", () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [3, 4_000],
    [6, 30_000],
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
  it("builds the state URL with the device id", () => {
    expect(stateUrl(BASE, DEVICE)).toBe("https://api.example/public/broadcast/state?deviceId=d1");
  });

  it("builds the stream URL with the device id", () => {
    expect(streamUrl(BASE, DEVICE)).toBe(
      "https://api.example/public/broadcast/stream?deviceId=d1",
    );
  });

  it("URL-encodes the device id", () => {
    expect(stateUrl(BASE, "a b/c")).toBe(
      "https://api.example/public/broadcast/state?deviceId=a%20b%2Fc",
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
    json: () => Promise.resolve({ error: "Unknown device", code: "UNKNOWN_DEVICE" }),
  } as Pick<Response, "ok" | "json">;
}

/** Lets the fetch microtasks settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const LIVE_VIEW: LiveBoardView = {
  match: PARSED_MATCH,
  scoreboard: PARSED_SNAPSHOT,
};

function setup(responses: Array<Pick<Response, "ok" | "json"> | Error>) {
  const scheduler = makeScheduler();
  const sources: FakeEventSource[] = [];
  const changes: Array<LiveBoardView | null> = [];
  const requested: string[] = [];
  const fetchImpl: LiveBoardClientOptions["fetchImpl"] = (url) => {
    requested.push(url);
    const next = responses.shift() ?? errorResponse();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next as Response);
  };
  const stop = startLiveBoardClient({
    baseUrl: BASE,
    deviceId: DEVICE,
    onChange: (view) => changes.push(view),
    fetchImpl,
    createEventSource: (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  return { scheduler, sources, changes, requested, stop };
}

describe("startLiveBoardClient", () => {
  it("requests /state for the device on start", async () => {
    const harness = setup([errorResponse()]);
    await flush();
    expect(harness.requested).toEqual([stateUrl(BASE, DEVICE)]);
    harness.stop();
  });

  it("shows the live board and opens the stream on a live state", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    expect(harness.changes).toEqual([LIVE_VIEW]);
    expect(harness.sources.map((source) => source.url)).toEqual([streamUrl(BASE, DEVICE)]);
    harness.stop();
  });

  it("stays hidden in pregame and keeps polling instead of streaming", async () => {
    const harness = setup([okResponse(wireState({ phase: "pregame" }))]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.sources).toEqual([]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("stays hidden and schedules a recheck on an idle state", async () => {
    const harness = setup([okResponse(wireState({ phase: "idle", match: null }))]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.sources).toEqual([]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("stays hidden when /state answers an error", async () => {
    const harness = setup([errorResponse()]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("stays hidden when the fetch rejects", async () => {
    const harness = setup([new Error("cors")]);
    await flush();
    expect(harness.changes).toEqual([null]);
    harness.stop();
  });

  it("stays hidden when the body is not a broadcast state", async () => {
    const harness = setup([okResponse({ error: "nope" })]);
    await flush();
    expect(harness.changes).toEqual([null]);
    expect(harness.sources).toEqual([]);
    harness.stop();
  });

  it("goes live from the idle recheck once the broadcast starts", async () => {
    const harness = setup([okResponse(wireState({ phase: "idle" })), okResponse(wireState())]);
    await flush();
    harness.scheduler.fire(IDLE_RECHECK_MS);
    await flush();
    expect(harness.changes).toEqual([null, LIVE_VIEW]);
    expect(harness.sources).toHaveLength(1);
    harness.stop();
  });

  it("renders each streamed state", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit(
      "snapshot",
      JSON.stringify(
        wireState({ scoreboard: wireSnapshot({ scoreHome: 14, lastFrameAt: NEXT_FRAME_AT }) }),
      ),
    );
    expect(harness.changes.at(-1)).toEqual({
      ...LIVE_VIEW,
      scoreboard: { ...PARSED_SNAPSHOT, scoreHome: 14, lastFrameAt: NEXT_FRAME_AT },
    });
    harness.stop();
  });

  it("ignores malformed stream events", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    const source = harness.sources[0]!;
    source.emit("snapshot");
    source.emit("snapshot", "not json");
    source.emit("snapshot", JSON.stringify({ error: "nope" }));
    expect(harness.changes).toEqual([LIVE_VIEW]);
    harness.stop();
  });

  it("hides and returns to polling when a streamed state goes idle", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit("snapshot", JSON.stringify(wireState({ phase: "idle" })));
    expect(harness.changes).toEqual([LIVE_VIEW, null]);
    expect(harness.sources[0]!.closed).toBe(true);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("hides when a streamed state reports stale frames", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit("snapshot", JSON.stringify(wireState({ stale: true })));
    expect(harness.changes).toEqual([LIVE_VIEW, null]);
    expect(harness.sources[0]!.closed).toBe(true);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("re-checks /state when frames stop arriving mid-game", async () => {
    const harness = setup([
      okResponse(wireState()),
      okResponse(wireState({ stale: true })),
    ]);
    await flush();
    harness.scheduler.fire(LIVE_STALE_MS);
    await flush();
    expect(harness.requested).toEqual([stateUrl(BASE, DEVICE), stateUrl(BASE, DEVICE)]);
    expect(harness.changes).toEqual([LIVE_VIEW, null]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("hides when frames stop and the API is unreachable", async () => {
    const harness = setup([okResponse(wireState()), new Error("down")]);
    await flush();
    harness.scheduler.fire(LIVE_STALE_MS);
    await flush();
    expect(harness.changes).toEqual([LIVE_VIEW, null]);
    expect(harness.scheduler.pending()).toEqual([IDLE_RECHECK_MS]);
    harness.stop();
  });

  it("a fresh frame re-arms the staleness watchdog", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit(
      "snapshot",
      JSON.stringify(wireState({ scoreboard: wireSnapshot({ lastFrameAt: NEXT_FRAME_AT }) })),
    );
    const staleArms = harness.scheduler.scheduledLog().filter((ms) => ms === LIVE_STALE_MS);
    expect(staleArms).toHaveLength(2);
    expect(harness.scheduler.pending()).toEqual([LIVE_STALE_MS]);
    harness.stop();
  });

  it("a replayed frame with an unchanged timestamp does not extend liveness", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit("snapshot", JSON.stringify(wireState()));
    const staleArms = harness.scheduler.scheduledLog().filter((ms) => ms === LIVE_STALE_MS);
    expect(staleArms).toHaveLength(1);
    harness.stop();
  });

  it("reconnects with exponential backoff and resets it once the stream reopens", async () => {
    const harness = setup([okResponse(wireState())]);
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
    harness.sources[2]!.emit(
      "snapshot",
      JSON.stringify(wireState({ scoreboard: wireSnapshot({ lastFrameAt: NEXT_FRAME_AT }) })),
    );
    harness.sources[2]!.emit("error");
    expect(harness.scheduler.pending()).toContain(backoffDelay(1));
    harness.stop();
  });

  it("an open that never delivers data does not reset the backoff", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit("error");
    harness.scheduler.fire(backoffDelay(1));
    harness.sources[1]!.emit("open");
    harness.sources[1]!.emit("error");
    expect(harness.scheduler.pending()).toContain(backoffDelay(2));
    harness.stop();
  });

  it("a duplicate error event does not schedule a second reconnect", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit("error");
    harness.sources[0]!.emit("error");
    expect(harness.scheduler.pending().filter((ms) => ms === backoffDelay(1))).toHaveLength(1);
    expect(harness.scheduler.pending().filter((ms) => ms === backoffDelay(2))).toHaveLength(0);
    harness.stop();
  });

  it("keeps the last board visible through a transient disconnect", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.sources[0]!.emit("error");
    expect(harness.changes).toEqual([LIVE_VIEW]);
    harness.stop();
  });

  it("stop() closes the stream, cancels timers and mutes late events", async () => {
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.stop();
    expect(harness.sources[0]!.closed).toBe(true);
    expect(harness.scheduler.pending()).toEqual([]);
    const source = harness.sources[0]!;
    source.emit(
      "snapshot",
      JSON.stringify(wireState({ scoreboard: wireSnapshot({ lastFrameAt: NEXT_FRAME_AT }) })),
    );
    source.emit("error");
    source.emit("open");
    expect(harness.changes).toEqual([LIVE_VIEW]);
    expect(harness.scheduler.pending()).toEqual([]);
  });

  it("stop() during the initial fetch ignores the late response", async () => {
    let resolveFetch: ((value: Pick<Response, "ok" | "json">) => void) | undefined;
    const scheduler = makeScheduler();
    const sources: FakeEventSource[] = [];
    const changes: Array<LiveBoardView | null> = [];
    const stop = startLiveBoardClient({
      baseUrl: BASE,
      deviceId: DEVICE,
      onChange: (view) => changes.push(view),
      fetchImpl: () =>
        new Promise((resolve) => {
          resolveFetch = resolve as (value: Pick<Response, "ok" | "json">) => void;
        }) as Promise<Response>,
      createEventSource: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    stop();
    resolveFetch!(okResponse(wireState()));
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
    const harness = setup([okResponse(wireState())]);
    await flush();
    harness.stop();
    expect(() => harness.stop()).not.toThrow();
  });
});
