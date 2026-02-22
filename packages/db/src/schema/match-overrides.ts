import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const matchOverrides = pgTable(
  "match_overrides",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    fieldName: varchar("field_name", { length: 100 }).notNull(),
    reason: text("reason"),
    changedBy: text("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matchFieldUnique: unique("match_overrides_match_field_unique").on(
      table.matchId,
      table.fieldName,
    ),
    matchIdIdx: index("match_overrides_match_id_idx").on(table.matchId),
  }),
);

export type MatchOverride = typeof matchOverrides.$inferSelect;
export type NewMatchOverride = typeof matchOverrides.$inferInsert;
