import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const liveScoreboards = pgTable("live_scoreboards", {
  deviceId: text("device_id").primaryKey(),
  scoreHome: integer("score_home").notNull().default(0),
  scoreGuest: integer("score_guest").notNull().default(0),
  foulsHome: integer("fouls_home").notNull().default(0),
  foulsGuest: integer("fouls_guest").notNull().default(0),
  timeoutsHome: integer("timeouts_home").notNull().default(0),
  timeoutsGuest: integer("timeouts_guest").notNull().default(0),
  period: integer("period").notNull().default(0),
  clockText: text("clock_text").notNull().default(""),
  clockSeconds: integer("clock_seconds"),
  clockRunning: boolean("clock_running").notNull().default(false),
  shotClock: integer("shot_clock").notNull().default(0),
  timeoutActive: boolean("timeout_active").notNull().default(false),
  timeoutDuration: text("timeout_duration").notNull().default(""),
  panelName: text("panel_name"),
  lastFrameAt: timestamp("last_frame_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const scoreboardSnapshots = pgTable(
  "scoreboard_snapshots",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    scoreHome: integer("score_home").notNull(),
    scoreGuest: integer("score_guest").notNull(),
    foulsHome: integer("fouls_home").notNull(),
    foulsGuest: integer("fouls_guest").notNull(),
    timeoutsHome: integer("timeouts_home").notNull(),
    timeoutsGuest: integer("timeouts_guest").notNull(),
    period: integer("period").notNull(),
    clockText: text("clock_text").notNull(),
    clockSeconds: integer("clock_seconds"),
    clockRunning: boolean("clock_running").notNull(),
    shotClock: integer("shot_clock").notNull(),
    timeoutActive: boolean("timeout_active").notNull(),
    timeoutDuration: text("timeout_duration").notNull(),
    rawHex: text("raw_hex"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    deviceCapturedIdx: index("scoreboard_snapshots_device_captured_idx").on(
      table.deviceId,
      table.capturedAt,
    ),
  }),
);

export type LiveScoreboard = typeof liveScoreboards.$inferSelect;
export type NewLiveScoreboard = typeof liveScoreboards.$inferInsert;
export type ScoreboardSnapshot = typeof scoreboardSnapshots.$inferSelect;
export type NewScoreboardSnapshot = typeof scoreboardSnapshots.$inferInsert;
