/**
 * State machine for the home-page live board island.
 *
 * Reads `GET /public/broadcast/state` once and, whenever the broadcast is
 * anything but idle, subscribes to the `/public/broadcast/stream` SSE feed —
 * the same state the OBS overlay consumes, so the island can show the bound
 * match (teams, crests, colors, kickoff) instead of a bare Heim/Gast score.
 *
 * "Showing" is decided by the server-computed phase, and only a running game
 * shows: `idle` and `pregame` render nothing, `live` renders the score.
 * `stale` marks a live broadcast whose panel stopped posting frames (June's
 * final score in August must never render), and hides the board too. A
 * client-side watchdog covers the gap the server cannot: when frames stop, no
 * SSE event announces it, so the island re-asks /state after LIVE_STALE_MS of
 * silence. A low-frequency /state poll brings the board back while hidden —
 * an idle visitor never holds one of the API's capped SSE slots.
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
 * How long the live board survives without a new frame before the island
 * re-asks /state. Matches the API's broadcast staleness threshold
 * (BROADCAST_STALE_THRESHOLD_MS) — generous enough to ride out ingest
 * hiccups, short enough that a dead panel degrades the board promptly.
 */
export const LIVE_STALE_MS = 30_000;

/** How often a hidden island re-asks /state whether a broadcast started. */
export const IDLE_RECHECK_MS = 60_000;

/** Reconnect backoff bounds: first retry after 1s, doubling up to 30s. */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** The scoreboard fields the island renders, plus freshness metadata. */
export interface LiveSnapshot {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockRunning: boolean;
  /** Whole ms remaining on the game clock; anchors local interpolation. */
  clockMs: number | null;
  shotClock: number | null;
  shotClockText: string;
  timeoutActive: boolean;
  lastFrameAt: string;
  /** Server-computed frame age; informational on the broadcast state. */
  secondsSinceLastFrame: number | null;
}

/** One side of the bound match, as the island renders it. */
export interface BroadcastTeamView {
  name: string;
  abbr: string;
  color: string;
  clubId: number;
}

/** The bound match, narrowed to the rendered fields. */
export interface BroadcastMatchView {
  kickoffTime: string;
  leagueName: string | null;
  home: BroadcastTeamView;
  guest: BroadcastTeamView;
}

type BroadcastPhase = "idle" | "pregame" | "live";

/** The slice of GET /public/broadcast/state the island decides and renders by. */
export interface SiteBroadcastState {
  phase: BroadcastPhase;
  stale: boolean;
  match: BroadcastMatchView | null;
  scoreboard: LiveSnapshot | null;
}

/** What the island renders: a running game's board, or nothing at all. */
export interface LiveBoardView {
  match: BroadcastMatchView | null;
  scoreboard: LiveSnapshot;
}

/**
 * Narrows a wire scoreboard row to the rendered fields. Zod-free on purpose —
 * this runs in the browser island bundle (see api-base.ts).
 */
export function parseSnapshot(data: unknown): LiveSnapshot | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  const {
    scoreHome,
    scoreGuest,
    foulsHome,
    foulsGuest,
    timeoutsHome,
    timeoutsGuest,
    period,
    clockText,
    clockRunning,
    shotClockText,
    timeoutActive,
    lastFrameAt,
  } = row;
  if (
    typeof scoreHome !== "number" ||
    typeof scoreGuest !== "number" ||
    typeof foulsHome !== "number" ||
    typeof foulsGuest !== "number" ||
    typeof timeoutsHome !== "number" ||
    typeof timeoutsGuest !== "number" ||
    typeof period !== "number" ||
    typeof clockText !== "string" ||
    typeof clockRunning !== "boolean" ||
    typeof shotClockText !== "string" ||
    typeof timeoutActive !== "boolean" ||
    typeof lastFrameAt !== "string"
  ) {
    return null;
  }
  const seconds = row.secondsSinceLastFrame;
  return {
    scoreHome,
    scoreGuest,
    foulsHome,
    foulsGuest,
    timeoutsHome,
    timeoutsGuest,
    period,
    clockText,
    clockRunning,
    clockMs: typeof row.clockMs === "number" ? row.clockMs : null,
    shotClock: typeof row.shotClock === "number" ? row.shotClock : null,
    shotClockText,
    timeoutActive,
    lastFrameAt,
    secondsSinceLastFrame: typeof seconds === "number" ? seconds : null,
  };
}

function parseTeam(data: unknown): BroadcastTeamView | null {
  if (typeof data !== "object" || data === null) return null;
  const { name, abbr, color, clubId } = data as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    typeof abbr !== "string" ||
    typeof color !== "string" ||
    typeof clubId !== "number"
  ) {
    return null;
  }
  return { name, abbr, color, clubId };
}

function parseMatch(data: unknown): BroadcastMatchView | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.kickoffTime !== "string") return null;
  let leagueName: string | null = null;
  if (row.league != null) {
    const league = row.league as Record<string, unknown>;
    if (typeof league !== "object" || typeof league.name !== "string") return null;
    leagueName = league.name;
  }
  const home = parseTeam(row.home);
  const guest = parseTeam(row.guest);
  if (home === null || guest === null) return null;
  return { kickoffTime: row.kickoffTime, leagueName, home, guest };
}

const PHASES: readonly BroadcastPhase[] = ["idle", "pregame", "live"];

/**
 * Narrows a wire broadcast state (either endpoint) to the decided/rendered
 * slice. A present-but-malformed match or scoreboard rejects the whole state —
 * silent degradation would hide API drift.
 */
export function parseBroadcastState(data: unknown): SiteBroadcastState | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  const phase = row.phase;
  if (typeof phase !== "string" || !PHASES.includes(phase as BroadcastPhase)) return null;
  if (typeof row.stale !== "boolean") return null;
  let match: BroadcastMatchView | null = null;
  if (row.match != null) {
    match = parseMatch(row.match);
    if (match === null) return null;
  }
  let scoreboard: LiveSnapshot | null = null;
  if (row.scoreboard != null) {
    scoreboard = parseSnapshot(row.scoreboard);
    if (scoreboard === null) return null;
  }
  return { phase: phase as BroadcastPhase, stale: row.stale, match, scoreboard };
}

/**
 * What to render for a broadcast state: the board exists only for a running
 * game (deliberate product call — no pregame banner). `idle` and `pregame`
 * render nothing, and so does a `live` phase whose frames are stale or
 * missing — a frozen months-old score must never render as live. A live game
 * whose bound match no longer resolves still shows its score, with generic
 * labels (`match: null`).
 */
export function viewFromState(state: SiteBroadcastState): LiveBoardView | null {
  if (state.phase !== "live") return null;
  if (state.stale || state.scoreboard === null) return null;
  return { match: state.match, scoreboard: state.scoreboard };
}

/** Reconnect delay for the given attempt (1-based): 1s, 2s, 4s, … capped. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

export function stateUrl(baseUrl: string, deviceId: string): string {
  return `${baseUrl}/public/broadcast/state?deviceId=${encodeURIComponent(deviceId)}`;
}

export function streamUrl(baseUrl: string, deviceId: string): string {
  return `${baseUrl}/public/broadcast/stream?deviceId=${encodeURIComponent(deviceId)}`;
}

/** The slice of EventSource the client uses (and tests fake). */
export interface ScoreboardEventSource {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
}

export interface LiveBoardClientOptions {
  baseUrl: string;
  deviceId: string;
  /** Receives the view to render, or null to hide the island entirely. */
  onChange: (view: LiveBoardView | null) => void;
  fetchImpl: (url: string) => Promise<Pick<Response, "ok" | "json">>;
  createEventSource: (url: string) => ScoreboardEventSource;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

/**
 * Starts the fetch-state → stream → watchdog loop. Returns a stop function
 * for unmount: it closes the stream, cancels every timer and mutes any
 * in-flight callback.
 */
export function startLiveBoardClient(options: LiveBoardClientOptions): () => void {
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

  const disarmWatchdog = () => {
    if (staleHandle != null) {
      options.cancel(staleHandle);
      staleHandle = null;
    }
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
    disarmWatchdog();
  };

  const goIdle = () => {
    options.onChange(null);
    recheckHandle = options.schedule(() => void checkState(), IDLE_RECHECK_MS);
  };

  // Frames stopped without any SSE event saying so (a dead panel emits
  // nothing). The server is the staleness authority: re-ask it, and either
  // render its answer (a stale live game degrades to the matchup card) or —
  // when it is unreachable too — hide and fall back to the idle poll.
  const onStale = () => {
    staleHandle = null;
    teardownStream();
    void checkState();
  };

  /** Renders a view and keeps the watchdog aligned with frame freshness. */
  const show = (view: LiveBoardView) => {
    // Only a NEW frame proves the panel is still transmitting: the stream
    // replays the current state on connect, and that replay must not re-arm
    // the watchdog.
    if (view.scoreboard.lastFrameAt !== lastFrameAt) {
      lastFrameAt = view.scoreboard.lastFrameAt;
      armWatchdog();
    }
    options.onChange(view);
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
    const state = parseBroadcastState(body);
    if (state === null) return;
    // Data flowing again is what proves the stream recovered — an `open` that
    // dies before delivering anything must not reset the backoff.
    attempt = 0;
    const view = viewFromState(state);
    if (view === null) {
      // The broadcast ended (or unbound) server-side: hide and go back to the
      // low-frequency poll.
      teardownStream();
      goIdle();
      return;
    }
    show(view);
  };

  const onError = () => {
    if (stopped) return;
    // A second error while a reconnect is already pending must not schedule
    // another one — that would fork the backoff into parallel streams.
    if (source === null) return;
    // Take over from EventSource's fixed-interval auto-reconnect: close and
    // come back with exponential backoff. The watchdog keeps running, so a
    // dead API degrades the board within LIVE_STALE_MS instead of hammering it.
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

  const checkState = async () => {
    recheckHandle = null;
    let view: LiveBoardView | null = null;
    try {
      const response = await options.fetchImpl(stateUrl(baseUrl, deviceId));
      if (response.ok) {
        const body: unknown = await response.json();
        const state = parseBroadcastState(body);
        if (state !== null) view = viewFromState(state);
      }
    } catch {
      view = null;
    }
    if (stopped) return;
    if (view === null) {
      goIdle();
      return;
    }
    show(view);
    if (source === null) connect();
  };

  void checkState();

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
