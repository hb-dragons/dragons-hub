import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { userNotificationPreferences } from "@dragons/db/schema";
import { isUserToggleableEventType } from "@dragons/shared";

export interface UserNotificationPreferences {
  mutedEventTypes: string[];
  locale: "de" | "en";
}

export interface UserNotificationPreferencesPatch {
  mutedEventTypes?: string[];
  locale?: "de" | "en";
}

export async function getUserNotificationPreferences(
  userId: string,
): Promise<UserNotificationPreferences> {
  const [row] = await db
    .select({
      mutedEventTypes: userNotificationPreferences.mutedEventTypes,
      locale: userNotificationPreferences.locale,
    })
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1);
  if (!row) return { mutedEventTypes: [], locale: "de" };
  return {
    mutedEventTypes: row.mutedEventTypes,
    locale: row.locale === "en" ? "en" : "de",
  };
}

export async function updateUserNotificationPreferences(
  userId: string,
  patch: UserNotificationPreferencesPatch,
): Promise<UserNotificationPreferences> {
  if (patch.mutedEventTypes) {
    for (const ev of patch.mutedEventTypes) {
      if (!isUserToggleableEventType(ev)) {
        throw new Error(`Unknown event type: ${ev}`);
      }
    }
  }

  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.mutedEventTypes !== undefined) setFields.mutedEventTypes = patch.mutedEventTypes;
  if (patch.locale !== undefined) setFields.locale = patch.locale;

  await db
    .insert(userNotificationPreferences)
    .values({
      userId,
      mutedEventTypes: patch.mutedEventTypes ?? [],
      locale: patch.locale ?? "de",
    })
    .onConflictDoUpdate({
      target: userNotificationPreferences.userId,
      set: setFields,
    });

  return getUserNotificationPreferences(userId);
}
