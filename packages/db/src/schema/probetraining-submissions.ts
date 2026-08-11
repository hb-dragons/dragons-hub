import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per public Probetraining request (`POST /public/probetraining`).
 *
 * Column names are preserved 1:1 from the legacy form
 * (`dragons-app/app/components/probetraining/Form.vue`): `month`/`year` are the
 * child's birth month and year — the month as the German name the form's
 * dropdown submits — and `mail` (not `email`) is the parent's address.
 *
 * Deliberately **no IP column** (GDPR data minimization): the submitter's IP is
 * needed only for rate limiting, so it lives exclusively in Redis under a
 * one-hour TTL (`probetraining:<ip>`) and is never persisted alongside the
 * personal data here.
 */
export const probetrainingSubmissions = pgTable("probetraining_submissions", {
  id: serial("id").primaryKey(),
  month: text("month").notNull(), // 'Januar' … 'Dezember' (birth month)
  year: integer("year").notNull(), // birth year
  didPlay: boolean("did_play").notNull(),
  gender: text("gender").notNull(), // 'männlich' | 'weiblich' | 'divers'
  mail: text("mail").notNull(),
  message: text("message"),
  acceptedPrivacy: boolean("accepted_privacy").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
