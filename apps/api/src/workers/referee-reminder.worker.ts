import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { refereeGames } from "@dragons/db/schema";
import { publishDomainEvent } from "../services/events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
import type { RefereeSlotsPayload } from "@dragons/shared";

export interface ReminderJobData {
  apiMatchId: number;
  refereeGameId: number;
  reminderDays: number;
}

interface MatchSlotState {
  isCancelled: boolean;
  isForfeited: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
}

/**
 * Determine whether a reminder notification should be emitted.
 * Exported for testing.
 */
export function shouldEmitReminder(state: MatchSlotState): boolean {
  if (state.isCancelled || state.isForfeited) return false;
  if (state.sr1Assigned && state.sr2Assigned) return false;
  return true;
}

/**
 * Load referee game row from DB.
 */
async function loadRefereeGame(refereeGameId: number) {
  const [row] = await db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.id, refereeGameId));
  return row ?? null;
}

export const refereeReminderWorker = new Worker<ReminderJobData>(
  "referee-reminders",
  async (job: Job<ReminderJobData>) => {
    const log = logger.child({ service: "referee-reminder-worker" });
    const { apiMatchId, refereeGameId, reminderDays } = job.data;
    const jobLog = log.child({ jobId: job.id, apiMatchId, refereeGameId, reminderDays });

    jobLog.info("Processing referee reminder");

    const game = await loadRefereeGame(refereeGameId);
    if (!game) {
      jobLog.warn("Referee game not found, skipping reminder");
      return { skipped: true, reason: "game_not_found" };
    }

    const sr1Assigned = game.sr1Status === "assigned" ? game.sr1Name ?? null : null;
    const sr2Assigned = game.sr2Status === "assigned" ? game.sr2Name ?? null : null;

    if (!shouldEmitReminder({
      isCancelled: game.isCancelled,
      isForfeited: game.isForfeited,
      sr1Assigned,
      sr2Assigned,
    })) {
      jobLog.info("Slots filled or match cancelled, skipping reminder");
      return { skipped: true, reason: "not_needed" };
    }

    const sr1Open = game.sr1OurClub && game.sr1Status !== "assigned";
    const sr2Open = game.sr2OurClub && game.sr2Status !== "assigned";

    const deepLink = game.matchId
      ? `/referee/matches?take=${game.matchId}`
      : `/referee/games?apiMatchId=${game.apiMatchId}`;

    const payload: RefereeSlotsPayload = {
      matchId: game.matchId,
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      leagueId: null,
      leagueName: game.leagueName ?? "",
      kickoffDate: game.kickoffDate,
      kickoffTime: game.kickoffTime,
      venueId: null,
      venueName: game.venueName,
      sr1Open,
      sr2Open,
      sr1Assigned,
      sr2Assigned,
      reminderLevel: reminderDays,
      deepLink,
    };

    await publishDomainEvent({
      type: EVENT_TYPES.REFEREE_SLOTS_REMINDER,
      source: "sync",
      entityType: "match",
      entityId: game.apiMatchId,
      entityName: `${game.homeTeamName} vs ${game.guestTeamName}`,
      deepLinkPath: deepLink,
      payload: payload as unknown as Record<string, unknown>,
    });

    jobLog.info("Referee slots reminder event published");
    return { emitted: true };
  },
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 3,
  },
);

/* v8 ignore next 3 */
refereeReminderWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Referee reminder job failed");
});
