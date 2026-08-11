import { and, eq } from "drizzle-orm";
import { pushDevices } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { logger } from "../../config/logger";
import { PushDeviceError } from "./push-device.errors";

/**
 * Registers (or re-registers) a push device token for a user.
 *
 * Possession of an Expo push token is not proof of ownership — the token is
 * treated as a secret elsewhere (redacted from log paths, masked in test-push
 * responses), so it must not be sufficient to move a device between accounts.
 * `setWhere` folds the ownership check into the upsert, so concurrent
 * registrations cannot race past it: a conflicting row owned by someone else
 * updates nothing and returns no row. The rightful owner reclaims the token
 * by unregistering it (DELETE /:token), which is the client's logout path.
 */
export async function registerPushDevice(input: {
  userId: string;
  token: string;
  platform: string;
  locale?: string;
}): Promise<void> {
  const { userId, token, platform, locale } = input;

  const [row] = await getDb()
    .insert(pushDevices)
    .values({ userId, token, platform, locale })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: {
        userId,
        platform,
        locale,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
      setWhere: eq(pushDevices.userId, userId),
    })
    .returning({ id: pushDevices.id });

  if (!row) {
    // Token deliberately omitted from the log line: it is a credential-grade
    // value, and the rejected caller already holds it.
    logger.warn(
      { userId, platform },
      "Rejected push device registration: token is registered to another user",
    );
    throw new PushDeviceError(
      "Push token is registered to a different account",
      "TOKEN_OWNED_BY_ANOTHER_USER",
    );
  }
}

export async function unregisterPushDevice(userId: string, token: string): Promise<void> {
  await getDb()
    .delete(pushDevices)
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)));
}
