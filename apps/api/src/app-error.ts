/**
 * Base class for errors that carry their own HTTP response.
 *
 * `middleware/error.ts` maps every subclass through one `instanceof AppError`
 * branch, reading the status off the instance. It never imports the subclasses,
 * which is what lets error mapping stay central: the handler would otherwise
 * have to import each service's error module, and those modules pull in BullMQ's
 * Redis client, the federation SDK's token bucket and the database client.
 *
 * The status belongs on the error, not in a table owned by a route. Two routes
 * previously kept their own `ERROR_STATUS_MAP` for `AssignmentError` and the
 * copies drifted apart — one gained codes the other never learned about.
 *
 * A subclass that maps several codes to several statuses keeps its own
 * code-to-status table next to the class. Do not hoist those tables into one
 * shared map here: `NOT_OWN_CLUB` is 403 from `AssignmentError` (the caller may
 * not do this) and 400 from `RefereeSettingsError` (the body names the wrong
 * referee), and a single table would have to silently pick one.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: ContentfulStatusCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
