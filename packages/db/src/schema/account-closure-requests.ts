import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * One account closure request per account (#400, ADR-0013).
 *
 * Accounts are club-managed: the app records that the person asked for their
 * account to be closed, and the club closes it in the web admin. There is no
 * status column; deleting the user removes the row through the cascade.
 */
export const accountClosureRequests = pgTable("account_closure_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique("account_closure_requests_user_id_unique")
    .references(() => user.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AccountClosureRequest = typeof accountClosureRequests.$inferSelect;
