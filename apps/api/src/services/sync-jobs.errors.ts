/**
 * Typed errors raised by the sync-jobs service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `sync-jobs.service.ts` — that would drag BullMQ
 * queue construction (and its Redis client) into every module that touches the
 * error handler.
 */

import { AppError } from "../app-error";

/**
 * A manual full sync was requested while one is already active, waiting or
 * delayed. Mapped to HTTP 409 by the central error handler.
 */
export class SyncAlreadyQueuedError extends AppError {
  declare readonly code: "SYNC_ALREADY_QUEUED";

  constructor(message = "Sync already in progress or queued") {
    super(message, "SYNC_ALREADY_QUEUED", 409);
  }
}

/**
 * A retry was requested for a queue job that is not in the `failed` state.
 * Only a failed job may be retried; every other state is a no-op the caller
 * should be told about. Mapped to HTTP 400 by the central error handler.
 */
export class SyncJobNotFailedError extends AppError {
  declare readonly code: "INVALID_STATE";

  constructor(state: string) {
    super(`Job is not in failed state (current: ${state})`, "INVALID_STATE", 400);
  }
}
