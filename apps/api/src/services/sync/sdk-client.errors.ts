/**
 * Typed errors raised by the federation SDK client.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `sdk-client.ts` — that would drag the SDK, its
 * token bucket and its module-level env reads into every module that touches
 * the error handler.
 */

/**
 * A referee assignment operation was attempted without `REFEREE_SDK_USERNAME` /
 * `REFEREE_SDK_PASSWORD` configured. The referee auth client falls back to the
 * main federation account when they are unset, and that account must not stand
 * in for the referee one on a write: the federation records the assignment
 * against whoever submitted it.
 *
 * Mapped to HTTP 503 by the central error handler — the request is well-formed,
 * the deployment is simply missing the credentials to serve it.
 */
export class RefereeSdkNotConfiguredError extends Error {
  readonly code = "REFEREE_SDK_NOT_CONFIGURED";

  constructor(
    message = "Referee SDK credentials are not configured. Set REFEREE_SDK_USERNAME "
      + "and REFEREE_SDK_PASSWORD; the main federation account must not be used for "
      + "referee assignment operations.",
  ) {
    super(message);
    this.name = "RefereeSdkNotConfiguredError";
  }
}
