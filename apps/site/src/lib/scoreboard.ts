/**
 * State machine for the home-page live scoreboard island (plan Task C6).
 *
 * Reads `GET /public/scoreboard/latest` once, and only when that snapshot is
 * fresh (a game is actually running) subscribes to the
 * `/public/scoreboard/stream` SSE feed. The panel keeps posting frames for as
 * long as it is powered, so "live game" is defined as frame freshness: the
 * stale `live_scoreboards` row that survives between games (June's final score
 * in August) must never render. A watchdog hides the board again once frames
 * stop, and a low-frequency `/latest` poll brings it back when the next game
 * starts — an idle visitor never holds one of the API's capped SSE slots.
 *
 * Kept `.tsx`-free and dependency-injected (fetch/EventSource/timers) so the
 * whole seam is unit-testable; the island supplies the browser built-ins.
 */

/**
 * The production panel id (`Panel2Net.id`). The API allowlists exactly one id
 * (its `SCOREBOARD_DEVICE_ID` env, no default) and 404s every other one on
 * /stream — verified 2026-08-02: prod answers this id with a snapshot stream.
 * `PUBLIC_SCOREBOARD_DEVICE_ID` overrides it if the panel is ever renamed.
 */
export const DEFAULT_SCOREBOARD_DEVICE_ID = "dragons-1";

/**
 * Frames older than this mean no live game. Matches the API's broadcast
 * staleness threshold (BROADCAST_STALE_THRESHOLD_MS) — generous enough to ride
 * out ingest hiccups, short enough that the board disappears promptly after
 * the panel is switched off.
 */
export const LIVE_STALE_MS = 30_000;

/** How often a hidden island re-asks /latest whether a game has started. */
export const IDLE_RECHECK_MS = 60_000;

/** Reconnect backoff bounds: first retry after 1s, doubling up to 30s. */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** The fields the island renders, plus the freshness metadata it decides by. */
export interface LiveSnapshot {
  scoreHome: number;
  scoreGuest: number;
  period: number;
  clockText: string;
  clockRunning: boolean;
  lastFrameAt: string;
  /** Server-computed frame age — present on /latest, absent on SSE events. */
  secondsSinceLastFrame: number | null;
}

/**
 * Narrows a wire payload (either endpoint) to the rendered fields. Zod-free on
 * purpose — this runs in the browser island bundle (see api-base.ts).
 */
export function parseSnapshot(data: unknown): LiveSnapshot | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  const { scoreHome, scoreGuest, period, clockText, clockRunning, lastFrameAt } = row;
  if (
    typeof scoreHome !== "number" ||
    typeof scoreGuest !== "number" ||
    typeof period !== "number" ||
    typeof clockText !== "string" ||
    typeof clockRunning !== "boolean" ||
    typeof lastFrameAt !== "string"
  ) {
    return null;
  }
  const seconds = row.secondsSinceLastFrame;
  return {
    scoreHome,
    scoreGuest,
    period,
    clockText,
    clockRunning,
    lastFrameAt,
    secondsSinceLastFrame: typeof seconds === "number" ? seconds : null,
  };
}

/**
 * Whether a /latest snapshot proves a live game. Prefers the server-computed
 * age (immune to client clock skew); falls back to comparing `lastFrameAt`
 * against the caller's clock when the age is missing.
 */
export function isLatestSnapshotLive(snapshot: LiveSnapshot, nowMs: number): boolean {
  if (snapshot.secondsSinceLastFrame != null) {
    return snapshot.secondsSinceLastFrame * 1000 <= LIVE_STALE_MS;
  }
  const frameMs = Date.parse(snapshot.lastFrameAt);
  if (Number.isNaN(frameMs)) return false;
  return nowMs - frameMs <= LIVE_STALE_MS;
}

/** Reconnect delay for the given attempt (1-based): 1s, 2s, 4s, … capped. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

export function latestUrl(baseUrl: string, deviceId: string): string {
  return `${baseUrl}/public/scoreboard/latest?deviceId=${encodeURIComponent(deviceId)}`;
}

export function streamUrl(baseUrl: string, deviceId: string): string {
  return `${baseUrl}/public/scoreboard/stream?deviceId=${encodeURIComponent(deviceId)}`;
}

/** The slice of EventSource the client uses (and tests fake). */
export interface ScoreboardEventSource {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
}

export interface ScoreboardClientOptions {
  baseUrl: string;
  deviceId: string;
  /** Receives the snapshot to render, or null to hide the island entirely. */
  onChange: (snapshot: LiveSnapshot | null) => void;
  fetchImpl: (url: string) => Promise<Pick<Response, "ok" | "json">>;
  createEventSource: (url: string) => ScoreboardEventSource;
  now: () => number;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

/**
 * Starts the fetch-latest → stream → watchdog loop. Returns a stop function
 * for unmount: it closes the stream, cancels every timer and mutes any
 * in-flight callback.
 */
export function startScoreboardClient(options: ScoreboardClientOptions): () => void {
  const { baseUrl, deviceId } = options;
  let stopped = false;
  let source: ScoreboardEventSource | null = null;
  let staleHandle: unknown = null;
  let reconnectHandle: unknown = null;
  let recheckHandle: unknown = null;
  let attempt = 0;
  let lastFrameAt = "";

  const armWatchdog = () => {
    if (staleHandle != null) options.cancel(staleHandle);
    staleHandle = options.schedule(onStale, LIVE_STALE_MS);
  };

  const teardownStream = () => {
    if (source !== null) {
      source.close();
      source = null;
    }
    if (reconnectHandle != null) {
      options.cancel(reconnectHandle);
      reconnectHandle = null;
    }
    if (staleHandle != null) {
      options.cancel(staleHandle);
      staleHandle = null;
    }
  };

  const goIdle = () => {
    options.onChange(null);
    recheckHandle = options.schedule(() => void checkLatest(), IDLE_RECHECK_MS);
  };

  const onStale = () => {
    staleHandle = null;
    teardownStream();
    goIdle();
  };

  const onSnapshot = (event: { data?: unknown }) => {
    if (stopped) return;
    if (typeof event.data !== "string") return;
    let body: unknown;
    try {
      body = JSON.parse(event.data);
    } catch {
      return;
    }
    const snapshot = parseSnapshot(body);
    if (snapshot === null) return;
    // Data flowing again is what proves the stream recovered — an `open` that
    // dies before delivering anything must not reset the backoff.
    attempt = 0;
    // Only a NEW frame proves the panel is still transmitting: the stream
    // replays the (possibly months-old) live row on connect, and that replay
    // must not re-arm the watchdog.
    if (snapshot.lastFrameAt !== lastFrameAt) {
      lastFrameAt = snapshot.lastFrameAt;
      armWatchdog();
    }
    options.onChange(snapshot);
  };

  const onError = () => {
    if (stopped) return;
    // A second error while a reconnect is already pending must not schedule
    // another one — that would fork the backoff into parallel streams.
    if (source === null) return;
    // Take over from EventSource's fixed-interval auto-reconnect: close and
    // come back with exponential backoff. The watchdog keeps running, so a
    // dead API hides the board within LIVE_STALE_MS instead of hammering it.
    source.close();
    source = null;
    attempt += 1;
    reconnectHandle = options.schedule(connect, backoffDelay(attempt));
  };

  const connect = () => {
    reconnectHandle = null;
    source = options.createEventSource(streamUrl(baseUrl, deviceId));
    source.addEventListener("snapshot", onSnapshot);
    source.addEventListener("error", onError);
  };

  const goLive = (snapshot: LiveSnapshot) => {
    lastFrameAt = snapshot.lastFrameAt;
    armWatchdog();
    options.onChange(snapshot);
    connect();
  };

  const checkLatest = async () => {
    recheckHandle = null;
    let live: LiveSnapshot | null = null;
    try {
      const response = await options.fetchImpl(latestUrl(baseUrl, deviceId));
      if (response.ok) {
        const body: unknown = await response.json();
        const snapshot = parseSnapshot(body);
        if (snapshot !== null && isLatestSnapshotLive(snapshot, options.now())) live = snapshot;
      }
    } catch {
      live = null;
    }
    if (stopped) return;
    if (live !== null) goLive(live);
    else goIdle();
  };

  void checkLatest();

  return () => {
    if (stopped) return;
    stopped = true;
    teardownStream();
    if (recheckHandle != null) {
      options.cancel(recheckHandle);
      recheckHandle = null;
    }
  };
}
