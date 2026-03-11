import { integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const playerPhotos = pgTable("player_photos", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PlayerPhoto = typeof playerPhotos.$inferSelect;
export type NewPlayerPhoto = typeof playerPhotos.$inferInsert;
