import { db } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../config/logger";
import { refereeRemindersQueue } from "../../workers/queues";

const log = logger.child({ service: "referee-reminders" });

const DEFAULT_REMINDER_DAYS = [7, 3, 1];
const SETTINGS_KEY = "referee_reminder_days";

export interface ReminderDelay {
  days: number;
  delayMs: number;
}

/**
 * Build a deterministic BullMQ job ID for deduplication.
 */
export function buildReminderJobId(apiMatchId: number, days: number): string {
  return `reminder:${apiMatchId}:${days}`;
}

/**
 * Parse a kickoff date + time into a UTC Date, correctly handling
 * Europe/Berlin timezone (CET/CEST transitions).
 */
function parseKickoff(kickoffDate: string, kickoffTime: string): Date {
  // Use Intl to resolve the correct UTC offset for this specific date in Europe/Berlin.
  // This handles CET (+01:00) vs CEST (+02:00) automatically.
  const naive = new Date(`${kickoffDate}T${kickoffTime}:00`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  // Get what Europe/Berlin thinks this UTC instant shows as
  const berlinStr = formatter.format(naive);
  const berlinDate = new Date(berlinStr);
  // The difference tells us the offset
  const offsetMs = naive.getTime() - berlinDate.getTime();
  return new Date(naive.getTime() - offsetMs);
}

/**
 * Compute which reminders to schedule and their delays from now.
 * Returns only reminders that are still in the future.
 */
export function computeReminderDelays(
  kickoffDate: string,
  kickoffTime: string,
  reminderDays: number[],
  now: Date = new Date(),
): ReminderDelay[] {
  const kickoff = parseKickoff(kickoffDate, kickoffTime);
  const delays: ReminderDelay[] = [];

  for (const days of reminderDays) {
    const reminderTime = new Date(kickoff.getTime() - days * 24 * 60 * 60 * 1000);
    const delayMs = reminderTime.getTime() - now.getTime();

    if (delayMs > 0) {
      delays.push({ days, delayMs });
    }
  }

  return delays;
}

/**
 * Read the configured reminder days from appSettings.
 * Falls back to [7, 3, 1] if not configured.
 */
export async function getReminderDays(): Promise<number[]> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY))
      .limit(1);

    if (row?.value) {
      const parsed = JSON.parse(row.value) as unknown;
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number" && n > 0)) {
        return parsed.sort((a, b) => b - a); // descending: [7, 3, 1]
      }
    }
  } catch (err) {
    log.warn({ err }, "Failed to read referee_reminder_days, using defaults");
  }

  return DEFAULT_REMINDER_DAYS;
}

/**
 * Schedule delayed reminder jobs for a match.
 * Uses deterministic job IDs for dedup.
 */
export async function scheduleReminderJobs(
  apiMatchId: number,
  refereeGameId: number,
  kickoffDate: string,
  kickoffTime: string,
): Promise<void> {
  const reminderDays = await getReminderDays();
  const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays);

  for (const { days, delayMs } of delays) {
    await refereeRemindersQueue.add(
      "referee-reminder",
      { apiMatchId, refereeGameId, reminderDays: days },
      {
        delay: delayMs,
        jobId: buildReminderJobId(apiMatchId, days),
      },
    );
  }

  if (delays.length > 0) {
    log.info({ apiMatchId, reminders: delays.map((d) => d.days) }, "Scheduled referee reminder jobs");
  }
}

/**
 * Cancel all pending reminder jobs for a match.
 */
export async function cancelReminderJobs(apiMatchId: number): Promise<void> {
  const reminderDays = await getReminderDays();
  for (const days of reminderDays) {
    const jobId = buildReminderJobId(apiMatchId, days);
    const job = await refereeRemindersQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }
  log.info({ apiMatchId }, "Cancelled referee reminder jobs");
}
