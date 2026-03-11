import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const socialBackgrounds = pgTable("social_backgrounds", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SocialBackground = typeof socialBackgrounds.$inferSelect;
export type NewSocialBackground = typeof socialBackgrounds.$inferInsert;
