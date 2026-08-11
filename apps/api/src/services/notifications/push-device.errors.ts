/**
 * Typed errors raised by the push device service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `push-device.service.ts` and its database client.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type PushDeviceErrorCode = "TOKEN_OWNED_BY_ANOTHER_USER";

const PUSH_DEVICE_ERROR_STATUS: Record<PushDeviceErrorCode, ContentfulStatusCode> = {
  TOKEN_OWNED_BY_ANOTHER_USER: 409,
};

export class PushDeviceError extends AppError {
  declare readonly code: PushDeviceErrorCode;

  constructor(message: string, code: PushDeviceErrorCode) {
    super(message, code, PUSH_DEVICE_ERROR_STATUS[code]);
  }
}
