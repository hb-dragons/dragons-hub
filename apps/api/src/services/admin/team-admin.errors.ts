/**
 * Typed errors raised by the team admin service.
 *
 * They live in their own leaf module so `middleware/error.ts` can map them
 * centrally without importing `team-admin.service.ts` and its database client.
 */

/**
 * A team reorder request that cannot be satisfied. `code` is the stable part of
 * the wire contract; the message is for humans.
 *
 * Previously these were `new Error("INVALID_TEAM_SET")` and the route read the
 * code back out of `err.message`, which silently swallowed any unrelated error
 * whose message happened to match and gave the client `{"error": "INVALID_TEAM_SET"}`
 * as its human-readable text.
 */
export class TeamReorderError extends Error {
  constructor(
    readonly code: "INVALID_TEAM_SET" | "DUPLICATE_TEAM_ID",
    message: string,
  ) {
    super(message);
    this.name = "TeamReorderError";
  }

  static duplicateTeamId(): TeamReorderError {
    return new TeamReorderError(
      "DUPLICATE_TEAM_ID",
      "The team order contains the same team more than once.",
    );
  }

  static invalidTeamSet(): TeamReorderError {
    return new TeamReorderError(
      "INVALID_TEAM_SET",
      "The team order must list every own-club team exactly once.",
    );
  }
}
