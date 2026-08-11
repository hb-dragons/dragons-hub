/**
 * Typed errors raised by the season service.
 *
 * A leaf module so `middleware/error.ts` can map them centrally without
 * importing `season.service.ts`, which pulls in the database client.
 */

import { AppError } from "../../app-error";

/**
 * Activate or archive addressed a season id that no longer exists — a stale
 * seasons list, or two admins racing on the same row. Mapped to HTTP 404 by the
 * central error handler; it used to surface as a 500.
 */
export class SeasonNotFoundError extends AppError {
  declare readonly code: "NOT_FOUND";

  constructor(id: number) {
    super(`Season ${id} not found`, "NOT_FOUND", 404);
  }
}
