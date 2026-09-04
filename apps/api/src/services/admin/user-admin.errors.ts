/**
 * Typed errors raised by the user admin service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `user-admin.service.ts` and its database client.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type UserAdminErrorCode =
  | "USER_NOT_FOUND"
  | "REFEREE_NOT_FOUND"
  | "STAFF_NOT_FOUND"
  | "STAFF_ALREADY_LINKED";

const USER_ADMIN_ERROR_STATUS: Record<UserAdminErrorCode, ContentfulStatusCode> = {
  USER_NOT_FOUND: 404,
  REFEREE_NOT_FOUND: 404,
  STAFF_NOT_FOUND: 404,
  // A staff record holds at most one account, so a second claim is a conflict
  // over an existing link, not a malformed request.
  STAFF_ALREADY_LINKED: 409,
};

export class UserAdminError extends AppError {
  declare readonly code: UserAdminErrorCode;

  constructor(message: string, code: UserAdminErrorCode) {
    super(message, code, USER_ADMIN_ERROR_STATUS[code]);
  }
}
