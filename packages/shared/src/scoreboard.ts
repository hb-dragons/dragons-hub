/**
 * Decoded Stramatel scoreboard snapshot. Source of truth for both the API
 * decoder and the web scoreboard pages.
 */
export interface StramatelSnapshot {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockSeconds: number | null;
  clockRunning: boolean;
  shotClock: number;
  timeoutActive: boolean;
  timeoutDuration: string;
}

/**
 * Snapshot row returned by GET /public/scoreboard/latest. Adds metadata that
 * the bare decoded shape does not carry.
 */
export interface PublicLiveSnapshot extends StramatelSnapshot {
  deviceId: string;
  panelName: string | null;
  lastFrameAt: string;
  secondsSinceLastFrame: number;
}

/**
 * Snapshot history row returned by GET /admin/scoreboard/snapshots.
 * Includes the originating raw hex for debug purposes.
 */
export interface ScoreboardSnapshotRow extends StramatelSnapshot {
  id: number;
  deviceId: string;
  rawHex: string | null;
  capturedAt: string;
}

/**
 * Ingest connection health returned by GET /admin/scoreboard/health.
 * Reports whether the device has sent a frame recently enough to be online.
 */
export interface ScoreboardHealth {
  deviceId: string;
  lastFrameAt: string | null;
  secondsSinceLastFrame: number | null;
  online: boolean;
}
