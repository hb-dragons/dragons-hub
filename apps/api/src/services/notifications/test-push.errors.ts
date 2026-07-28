/**
 * Typed errors raised by the admin test-push service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `test-push.service.ts` and its database client.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type TestPushErrorCode = "NO_DEVICES" | "PUSH_CHANNEL_MISSING";

const TEST_PUSH_ERROR_STATUS: Record<TestPushErrorCode, ContentfulStatusCode> = {
  NO_DEVICES: 400,
  PUSH_CHANNEL_MISSING: 500,
};

export class TestPushError extends AppError {
  declare readonly code: TestPushErrorCode;

  constructor(message: string, code: TestPushErrorCode) {
    super(message, code, TEST_PUSH_ERROR_STATUS[code]);
  }
}
