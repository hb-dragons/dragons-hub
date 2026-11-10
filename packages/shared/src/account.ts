/**
 * An account closure request (#400, ADR-0013): the signed-in account asked the
 * club to close it. The club carries it out in the web admin; until then the
 * request only records when it was made.
 */
export interface AccountClosureRequest {
  /** ISO 8601 instant. */
  requestedAt: string;
}

/** `GET /me/account-closure`: the caller's request, or `null` before one. */
export interface AccountClosureStatus {
  request: AccountClosureRequest | null;
}
