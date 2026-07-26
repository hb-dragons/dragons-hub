import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { domainEvents } from "./domain-events";
import { channelConfigs } from "./channel-configs";

export const digestBuffer = pgTable(
  "digest_buffer",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => domainEvents.id),
    // Transient pending work, not an audit record: if a channel config is ever
    // hard-deleted its unsent digest entries have no meaning and go with it.
    // (Routine retirement is a soft delete — see `channelConfigs.deletedAt` —
    // which purges these explicitly.)
    channelConfigId: integer("channel_config_id")
      .notNull()
      .references(() => channelConfigs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventChannelIdx: uniqueIndex("digest_buffer_event_channel_idx").on(
      table.eventId,
      table.channelConfigId,
    ),
  }),
);

export type DigestBufferRow = typeof digestBuffer.$inferSelect;
export type DigestBufferInsert = typeof digestBuffer.$inferInsert;
