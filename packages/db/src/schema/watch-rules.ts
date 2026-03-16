import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export interface FilterConditionRow {
  field: "teamId" | "leagueId" | "venueId" | "source";
  operator: "eq" | "neq" | "in" | "any";
  value: string | string[] | null;
}

export interface ChannelTargetRow {
  channel: "in_app" | "whatsapp_group" | "push" | "email";
  targetId: string;
}

export const watchRules = pgTable("watch_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").notNull(),
  eventTypes: text("event_types").array().notNull(),
  filters: jsonb("filters")
    .notNull()
    .$type<FilterConditionRow[]>()
    .default([]),
  channels: jsonb("channels")
    .notNull()
    .$type<ChannelTargetRow[]>()
    .default([]),
  urgencyOverride: text("urgency_override"),
  templateOverride: text("template_override"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WatchRuleRow = typeof watchRules.$inferSelect;
export type WatchRuleInsert = typeof watchRules.$inferInsert;
