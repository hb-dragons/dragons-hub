import { z } from "zod";
import { getDb } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type { ClubConfig, BookingSettings } from "@dragons/shared";
import { BOOKING_DEFAULTS } from "@dragons/shared";
import { readSettings, readIntSetting } from "../settings/app-settings.reader";

// Validates the *stored* value, not a request — request schemas live in
// @dragons/contracts; this one never sees the wire (spec decision D5).
const REFEREE_REMINDER_DAYS_FALLBACK = [7, 3, 1] as const;
const refereeReminderDaysSchema = z.array(z.number().int().positive()).min(1);

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

export async function getRefereeReminderDays(): Promise<number[]> {
  const value = await getSetting("referee_reminder_days");
  // Always a fresh copy — callers get `number[]`, not the shared readonly
  // default, so sorting or mutating a returned fallback can't corrupt it for
  // the next caller.
  if (!value) return [...REFEREE_REMINDER_DAYS_FALLBACK];
  try {
    const parsed = refereeReminderDaysSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [...REFEREE_REMINDER_DAYS_FALLBACK];
  } catch {
    return [...REFEREE_REMINDER_DAYS_FALLBACK];
  }
}
