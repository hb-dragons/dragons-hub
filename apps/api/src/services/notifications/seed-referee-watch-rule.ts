import { db } from "../../config/database";
import { channelConfigs, watchRules } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../config/logger";

const log = logger.child({ service: "referee-notification-seed" });

const CHANNEL_CONFIG_NAME = "Referee WhatsApp Group";
const WATCH_RULE_NAME = "Referee slots → WhatsApp group";

/**
 * Ensure the WhatsApp group channel config and watch rule exist.
 * Idempotent: skips if already present (matched by name).
 *
 * The channelConfig stores the groupId (to be set by admin).
 * The watchRule routes referee.slots.* events to that channel.
 */
export async function seedRefereeNotificationConfig(): Promise<void> {
  // 1. Ensure channel config exists
  const [existingConfig] = await db
    .select({ id: channelConfigs.id })
    .from(channelConfigs)
    .where(
      and(
        eq(channelConfigs.name, CHANNEL_CONFIG_NAME),
        eq(channelConfigs.type, "whatsapp_group"),
      ),
    )
    .limit(1);

  let channelConfigId: number;

  if (existingConfig) {
    channelConfigId = existingConfig.id;
    log.debug("Referee WhatsApp channel config already exists");
  } else {
    const [created] = await db
      .insert(channelConfigs)
      .values({
        name: CHANNEL_CONFIG_NAME,
        type: "whatsapp_group",
        enabled: false, // disabled until admin sets the groupId
        config: { groupId: "", locale: "de" },
        digestMode: "none",
      })
      .returning({ id: channelConfigs.id });

    channelConfigId = created!.id;
    log.info(
      { channelConfigId },
      "Created referee WhatsApp channel config (disabled — admin must set groupId)",
    );
  }

  // 2. Ensure watch rule exists
  const [existingRule] = await db
    .select({ id: watchRules.id })
    .from(watchRules)
    .where(eq(watchRules.name, WATCH_RULE_NAME))
    .limit(1);

  if (existingRule) {
    log.debug("Referee slots watch rule already exists");
    return;
  }

  await db.insert(watchRules).values({
    name: WATCH_RULE_NAME,
    enabled: true,
    createdBy: "system",
    eventTypes: ["referee.slots.needed", "referee.slots.reminder"],
    filters: [],
    channels: [
      { channel: "whatsapp_group", targetId: String(channelConfigId) },
    ],
    urgencyOverride: "immediate",
  });

  log.info({ channelConfigId }, "Created referee slots watch rule");
}
