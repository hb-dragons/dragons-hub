import { pgTable, serial, text, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per member the email channel has ever addressed: the unsubscribe
 * token that mail carries, and whether that member has opted out.
 *
 * ## Recorded decision (issue #134): opting out is per channel
 *
 * A row here switches **email** off for that member entirely. Push and
 * whatsapp_group are untouched, and per-event-type muting stays where it
 * already lives (`user_notification_preferences.muted_event_types`). One
 * switch is what an unsubscribe link in a mail can honestly promise — a member
 * clicking "unsubscribe" in a mail client expects that mail to stop, not to be
 * handed a preference matrix — and it is the granularity RFC 8058 one-click
 * can express, since the POST carries no choice.
 *
 * ## Why the state lives here and not on `user`
 *
 * Keyed by `user_id`, in a table nothing else writes. An opt-out is therefore
 * not a column that a re-sync, a re-verification or a profile update can
 * overwrite: nothing in the sync pipeline touches this table, so a rewritten
 * `user` row leaves the opt-out standing. Keying on the member rather than on
 * the address also means changing the address does not resurrect delivery.
 *
 * ## The token
 *
 * 32 bytes from `crypto.randomBytes`, base64url — 256 bits, so it cannot be
 * guessed or enumerated, and `unique` makes a collision a write error rather
 * than a silent cross-account opt-out. It is stored in the clear rather than
 * hashed, deliberately: the same token has to keep working in every message
 * already sitting in the member's mailbox, so it cannot be minted per send,
 * and a link that stops working is exactly the silent failure the GDPR
 * obligation is about. What it grants is one non-destructive action — stop
 * sending this member email — with no read access to anything and no way to
 * switch delivery back on. Revoking or rotating one is a single UPDATE of this
 * column.
 */
export const emailSubscriptions = pgTable("email_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).notNull().unique(),
  /** Null means the member still receives email. Set once, never cleared here. */
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  /** How consent was withdrawn: `one_click` (RFC 8058) or `confirmation_page`. */
  unsubscribedVia: varchar("unsubscribed_via", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailSubscription = typeof emailSubscriptions.$inferSelect;
export type NewEmailSubscription = typeof emailSubscriptions.$inferInsert;
