/**
 * Typed errors raised by the broadcast config service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `config.ts` and its database client.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type BroadcastErrorCode = "MISSING_MATCH" | "ROW_MISSING";

/**
 * `ROW_MISSING` is an invariant violation, not a client mistake: the device
 * already passed `isConfiguredDevice()`, so its config row should exist. It
 * keeps its 500 so the central handler still reports it to Cloud Error
 * Reporting.
 */
const BROADCAST_ERROR: Record<
  BroadcastErrorCode,
  { status: ContentfulStatusCode; message: string }
> = {
  MISSING_MATCH: {
    status: 400,
    message: "Cannot go live without matchId",
  },
  ROW_MISSING: {
    status: 500,
    message: "Broadcast config row is missing for a configured device",
  },
};

export class BroadcastError extends AppError {
  declare readonly code: BroadcastErrorCode;

  constructor(code: BroadcastErrorCode) {
    super(BROADCAST_ERROR[code].message, code, BROADCAST_ERROR[code].status);
  }
}
