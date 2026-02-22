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
