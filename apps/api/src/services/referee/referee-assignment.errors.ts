/**
 * Typed errors raised by the referee assignment and claim services.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `referee-assignment.service.ts` — that would drag
 * the database client, the federation SDK and the domain-event publisher into
 * every module that touches the error handler.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type AssignmentErrorCode =
  | "GAME_NOT_FOUND"
  | "NOT_QUALIFIED"
  | "SLOT_TAKEN"
  | "DENY_RULE"
  | "FEDERATION_ERROR"
  | "FORBIDDEN"
  | "NOT_OWN_CLUB"
  | "NOT_ASSIGNED";

/**
 * The single status table for assignment failures.
 *
 * Two route files used to keep a copy of this and the copies drifted: the admin
 * one never learned `NOT_OWN_CLUB` or `NOT_ASSIGNED`, both of which are thrown
 * by `referee-claim.service.ts`. No admin route calls that service today, so the
 * gap produced no live 500 — the table is here so a future caller cannot fall
 * into it. Being keyed by `AssignmentErrorCode` also makes a new code without a
 * status a compile error rather than a silent 500.
 *
 * `FORBIDDEN` (#75, #52) is `assignRefereeAsSelf`'s own-referee-only guard,
 * matching the 403 the route hand-rolled for the same message before the
 * ownership check moved into the service.
 */
const ASSIGNMENT_ERROR_STATUS: Record<AssignmentErrorCode, ContentfulStatusCode> = {
  GAME_NOT_FOUND: 404,
  NOT_QUALIFIED: 422,
  SLOT_TAKEN: 409,
  DENY_RULE: 403,
  FEDERATION_ERROR: 502,
  FORBIDDEN: 403,
  NOT_OWN_CLUB: 403,
  NOT_ASSIGNED: 409,
};

export class AssignmentError extends AppError {
  declare readonly code: AssignmentErrorCode;

  constructor(message: string, code: AssignmentErrorCode) {
    super(message, code, ASSIGNMENT_ERROR_STATUS[code]);
  }
}
