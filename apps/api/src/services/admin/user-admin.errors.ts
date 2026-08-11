/**
 * Typed errors raised by the user admin service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `user-admin.service.ts` and its database client.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type UserAdminErrorCode = "USER_NOT_FOUND" | "REFEREE_NOT_FOUND";

const USER_ADMIN_ERROR_STATUS: Record<UserAdminErrorCode, ContentfulStatusCode> = {
  USER_NOT_FOUND: 404,
  REFEREE_NOT_FOUND: 404,
};

export class UserAdminError extends AppError {
  declare readonly code: UserAdminErrorCode;

  constructor(message: string, code: UserAdminErrorCode) {
    super(message, code, USER_ADMIN_ERROR_STATUS[code]);
  }
}
