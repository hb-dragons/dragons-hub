import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { matches, teams, leagues, matchReferees, referees, venues } from "@dragons/db/schema";
import { publishDomainEvent } from "../services/events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
import type { RefereeSlotsPayload } from "@dragons/shared";

export interface ReminderJobData {
  matchId: number;
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
 * Load match with current slot assignments from DB.
 */
async function loadMatchWithSlots(matchId: number) {
  const homeTeam = db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
    .from(teams)
    .as("home_team");
  const guestTeam = db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
    .from(teams)
    .as("guest_team");

  const [row] = await db
    .select({
      id: matches.id,
      apiMatchId: matches.apiMatchId,
      matchNo: matches.matchNo,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      isCancelled: matches.isCancelled,
      isForfeited: matches.isForfeited,
      sr1Open: matches.sr1Open,
      sr2Open: matches.sr2Open,
      leagueId: matches.leagueId,
      leagueName: leagues.name,
      homeTeamName: homeTeam.name,
      guestTeamName: guestTeam.name,
      venueName: venues.name,
      venueId: matches.venueId,
    })
    .from(matches)
    .innerJoin(homeTeam, eq(homeTeam.apiTeamPermanentId, matches.homeTeamApiId))
    .innerJoin(guestTeam, eq(guestTeam.apiTeamPermanentId, matches.guestTeamApiId))
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .leftJoin(venues, eq(matches.venueId, venues.id))
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!row) return null;

  // Load current referee assignments for sr1 (slotNumber=1) and sr2 (slotNumber=2)
  const assignments = await db
    .select({
      slotNumber: matchReferees.slotNumber,
      firstName: referees.firstName,
      lastName: referees.lastName,
    })
    .from(matchReferees)
    .innerJoin(referees, eq(matchReferees.refereeId, referees.id))
    .where(eq(matchReferees.matchId, matchId));

  const sr1Ref = assignments.find((a) => a.slotNumber === 1);
  const sr2Ref = assignments.find((a) => a.slotNumber === 2);

  return {
    ...row,
    sr1Assigned: sr1Ref ? `${sr1Ref.firstName} ${sr1Ref.lastName}` : null,
    sr2Assigned: sr2Ref ? `${sr2Ref.firstName} ${sr2Ref.lastName}` : null,
  };
}

export const refereeReminderWorker = new Worker<ReminderJobData>(
  "referee-reminders",
  async (job: Job<ReminderJobData>) => {
    const log = logger.child({ service: "referee-reminder-worker" });
    const { matchId, reminderDays } = job.data;
    const jobLog = log.child({ jobId: job.id, matchId, reminderDays });

    jobLog.info("Processing referee reminder");

    const match = await loadMatchWithSlots(matchId);
    if (!match) {
      jobLog.warn("Match not found, skipping reminder");
      return { skipped: true, reason: "match_not_found" };
    }

    if (!shouldEmitReminder({
      isCancelled: match.isCancelled ?? false,
      isForfeited: match.isForfeited ?? false,
      sr1Assigned: match.sr1Assigned,
      sr2Assigned: match.sr2Assigned,
    })) {
      jobLog.info("Slots filled or match cancelled, skipping reminder");
      return { skipped: true, reason: "not_needed" };
    }

    // For reminders about own-club home games, "open" means "not assigned" —
    // the club needs to fill the slot regardless of the federation's sr*Open flag.
    const payload: RefereeSlotsPayload = {
      matchId: match.id,
      matchNo: match.matchNo,
      homeTeam: match.homeTeamName,
      guestTeam: match.guestTeamName,
      leagueId: match.leagueId!,
      leagueName: match.leagueName,
      kickoffDate: match.kickoffDate,
      kickoffTime: match.kickoffTime,
      venueId: match.venueId,
      venueName: match.venueName,
      sr1Open: match.sr1Open || !match.sr1Assigned,
      sr2Open: match.sr2Open || !match.sr2Assigned,
      sr1Assigned: match.sr1Assigned,
      sr2Assigned: match.sr2Assigned,
      reminderLevel: reminderDays,
      deepLink: `/referee/matches?take=${match.id}`,
    };

    await publishDomainEvent({
      type: EVENT_TYPES.REFEREE_SLOTS_REMINDER,
      source: "sync",
      entityType: "match",
      entityId: match.id,
      entityName: `${match.homeTeamName} vs ${match.guestTeamName}`,
      deepLinkPath: `/referee/matches?take=${match.id}`,
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
