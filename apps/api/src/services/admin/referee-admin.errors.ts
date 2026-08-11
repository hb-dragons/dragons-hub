/**
 * Typed errors raised by the referee admin service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `referee-admin.service.ts` and its database
 * client.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type RefereeSettingsErrorCode = "NOT_FOUND" | "NOT_OWN_CLUB" | "VALIDATION_ERROR";

/**
 * `NOT_OWN_CLUB` is 400 here and 403 on `AssignmentError`. Both are correct:
 * there the caller is not allowed to act, here the request body names a referee
 * who does not qualify for the setting being written. Keeping the tables per
 * class is what lets both stay true.
 */
const REFEREE_SETTINGS_ERROR_STATUS: Record<
  RefereeSettingsErrorCode,
  ContentfulStatusCode
> = {
  NOT_FOUND: 404,
  NOT_OWN_CLUB: 400,
  VALIDATION_ERROR: 400,
};

export class RefereeSettingsError extends AppError {
  declare readonly code: RefereeSettingsErrorCode;

  constructor(message: string, code: RefereeSettingsErrorCode) {
    super(message, code, REFEREE_SETTINGS_ERROR_STATUS[code]);
  }
}
