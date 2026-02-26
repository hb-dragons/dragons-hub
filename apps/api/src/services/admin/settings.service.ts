import { db } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export interface ClubConfig {
  clubId: number;
  clubName: string;
}

export async function getClubConfig(): Promise<ClubConfig | null> {
  const clubId = await getSetting("club_id");
  const clubName = await getSetting("club_name");
  if (!clubId) return null;
  return { clubId: parseInt(clubId, 10), clubName: clubName ?? "" };
}

export async function setClubConfig(clubId: number, clubName: string): Promise<void> {
  await upsertSetting("club_id", String(clubId));
  await upsertSetting("club_name", clubName);
}

export interface BookingSettings {
  bufferBefore: number;
  bufferAfter: number;
  gameDuration: number;
  dueDaysBefore: number;
}

const BOOKING_DEFAULTS: BookingSettings = {
  bufferBefore: 60,
  bufferAfter: 60,
  gameDuration: 90,
  dueDaysBefore: 7,
};

export async function getBookingSettings(): Promise<BookingSettings> {
  const bufferBefore = await getSetting("venue_booking_buffer_before");
  const bufferAfter = await getSetting("venue_booking_buffer_after");
  const gameDuration = await getSetting("venue_booking_game_duration");
  const dueDaysBefore = await getSetting("venue_booking_due_days_before");

  return {
    bufferBefore: bufferBefore ? parseInt(bufferBefore, 10) : BOOKING_DEFAULTS.bufferBefore,
    bufferAfter: bufferAfter ? parseInt(bufferAfter, 10) : BOOKING_DEFAULTS.bufferAfter,
    gameDuration: gameDuration ? parseInt(gameDuration, 10) : BOOKING_DEFAULTS.gameDuration,
    dueDaysBefore: dueDaysBefore ? parseInt(dueDaysBefore, 10) : BOOKING_DEFAULTS.dueDaysBefore,
  };
}

export async function setBookingSettings(settings: BookingSettings): Promise<void> {
  await upsertSetting("venue_booking_buffer_before", String(settings.bufferBefore));
  await upsertSetting("venue_booking_buffer_after", String(settings.bufferAfter));
  await upsertSetting("venue_booking_game_duration", String(settings.gameDuration));
  await upsertSetting("venue_booking_due_days_before", String(settings.dueDaysBefore));
}
