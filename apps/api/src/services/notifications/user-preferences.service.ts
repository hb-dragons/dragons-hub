import { eq } from "drizzle-orm";
import { getDb } from "../../config/database";
import { userNotificationPreferences } from "@dragons/db/schema";
import type { UserToggleableEventType } from "@dragons/shared";

export interface UserNotificationPreferences {
  mutedEventTypes: string[];
  locale: "de" | "en";
}

// The patch is typed by the vocabulary rather than checked against it at
// runtime: `notificationPreferencesBodySchema` enumerates the same list, so an
// unknown type is rejected as a 400 before it reaches here (issue #156).
export interface UserNotificationPreferencesPatch {
  mutedEventTypes?: UserToggleableEventType[];
  locale?: "de" | "en";
}

export async function getUserNotificationPreferences(
  userId: string,
): Promise<UserNotificationPreferences> {
  const [row] = await getDb()
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
  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.mutedEventTypes !== undefined) setFields.mutedEventTypes = patch.mutedEventTypes;
  if (patch.locale !== undefined) setFields.locale = patch.locale;

  await getDb()
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
