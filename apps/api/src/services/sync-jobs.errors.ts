/**
 * Typed errors raised by the sync-jobs service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `sync-jobs.service.ts` — that would drag BullMQ
 * queue construction (and its Redis client) into every module that touches the
 * error handler.
 */

/**
 * A manual full sync was requested while one is already active, waiting or
 * delayed. Mapped to HTTP 409 by the central error handler.
 */
export class SyncAlreadyQueuedError extends Error {
  readonly code = "SYNC_ALREADY_QUEUED";

  constructor(message = "Sync already in progress or queued") {
    super(message);
    this.name = "SyncAlreadyQueuedError";
  }
}
