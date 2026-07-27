import { getDb } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type { ClubConfig, BookingSettings } from "@dragons/shared";
import { BOOKING_DEFAULTS } from "@dragons/shared";
import { readSettings, readIntSetting } from "../settings/app-settings.reader";

const CLUB_KEYS = { id: "club_id", name: "club_name" } as const;

const BOOKING_KEYS = {
  bufferBefore: "venue_booking_buffer_before",
  bufferAfter: "venue_booking_buffer_after",
  gameDuration: "venue_booking_game_duration",
  dueDaysBefore: "venue_booking_due_days_before",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  await getDb()
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getClubConfig(): Promise<ClubConfig | null> {
  const values = await readSettings([CLUB_KEYS.id, CLUB_KEYS.name]);
  const clubId = values.get(CLUB_KEYS.id);
  if (!clubId) return null;
  return { clubId: parseInt(clubId, 10), clubName: values.get(CLUB_KEYS.name) ?? "" };
}

export async function setClubConfig(clubId: number, clubName: string): Promise<void> {
  await upsertSetting(CLUB_KEYS.id, String(clubId));
  await upsertSetting(CLUB_KEYS.name, clubName);
}

export async function getBookingSettings(): Promise<BookingSettings> {
  const values = await readSettings(Object.values(BOOKING_KEYS));

  return {
    bufferBefore: readIntSetting(values, BOOKING_KEYS.bufferBefore, BOOKING_DEFAULTS.bufferBefore),
    bufferAfter: readIntSetting(values, BOOKING_KEYS.bufferAfter, BOOKING_DEFAULTS.bufferAfter),
    gameDuration: readIntSetting(values, BOOKING_KEYS.gameDuration, BOOKING_DEFAULTS.gameDuration),
    dueDaysBefore: readIntSetting(
      values,
      BOOKING_KEYS.dueDaysBefore,
      BOOKING_DEFAULTS.dueDaysBefore,
    ),
  };
}

export async function setBookingSettings(settings: BookingSettings): Promise<void> {
  await upsertSetting(BOOKING_KEYS.bufferBefore, String(settings.bufferBefore));
  await upsertSetting(BOOKING_KEYS.bufferAfter, String(settings.bufferAfter));
  await upsertSetting(BOOKING_KEYS.gameDuration, String(settings.gameDuration));
  await upsertSetting(BOOKING_KEYS.dueDaysBefore, String(settings.dueDaysBefore));
}
