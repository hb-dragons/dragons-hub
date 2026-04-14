import { createHash } from "node:crypto";
import { db } from "../../config/database";
import { refereeGames, matches } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../config/logger";
import { createRefereeSdkClient } from "./referee-sdk-client";
import { publishDomainEvent } from "../events/event-publisher";
import { scheduleReminderJobs, cancelReminderJobs } from "../referee/referee-reminders.service";
import { EVENT_TYPES } from "@dragons/shared";
import type { SdkOffeneSpielResult, SdkSpielleitung } from "@dragons/sdk";

const log = logger.child({ service: "referee-games-sync" });

// --- Pure helpers ---

export function deriveSrStatus(
  sr: SdkSpielleitung | null,
  offenAngeboten: boolean,
): "assigned" | "offered" | "open" {
  if (sr !== null) return "assigned";
  if (offenAngeboten) return "offered";
  return "open";
}

export function computeRefereeGameHash(row: {
  sr1Status: string;
  sr2Status: string;
  sr1Name: string | null;
  sr2Name: string | null;
  kickoffDate: string;
  kickoffTime: string;
  isCancelled: boolean;
  isForfeited: boolean;
}): string {
  const data = [
    row.sr1Status,
    row.sr2Status,
    row.sr1Name,
    row.sr2Name,
    row.kickoffDate,
    row.kickoffTime,
    row.isCancelled,
    row.isForfeited,
  ];
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function epochMsToBerlin(epochMs: number): { date: string; time: string } {
  const d = new Date(epochMs);

  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return {
    date: dateFmt.format(d), // YYYY-MM-DD (en-CA locale)
    time: timeFmt.format(d), // HH:MM
  };
}

function extractRefereeName(sr: SdkSpielleitung | null): string | null {
  if (!sr) return null;
  const { vorname, nachname } = sr.schiedsrichter.personVO;
  return `${vorname} ${nachname}`;
}

function extractRefereeApiId(sr: SdkSpielleitung | null): number | null {
  if (!sr) return null;
  return sr.schiedsrichter.schiedsrichterId;
}

export function mapApiResultToRow(result: SdkOffeneSpielResult) {
  const { sp, sr1, sr2, sr1MeinVerein, sr2MeinVerein, sr1OffenAngeboten, sr2OffenAngeboten } = result;
  const { date: kickoffDate, time: kickoffTime } = epochMsToBerlin(sp.spieldatum);

  return {
    apiMatchId: sp.spielplanId,
    matchNo: sp.spielnr,
    kickoffDate,
    kickoffTime,
    homeTeamName: sp.heimMannschaftLiga.mannschaftName,
    guestTeamName: sp.gastMannschaftLiga.mannschaftName,
    leagueName: sp.liga.liganame,
    leagueShort: sp.liga.ligaKurzname,
    venueName: sp.spielfeld?.bezeichnung ?? null,
    venueCity: sp.spielfeld?.ort ?? null,
    sr1OurClub: sr1MeinVerein,
    sr2OurClub: sr2MeinVerein,
    sr1Name: extractRefereeName(sr1),
    sr2Name: extractRefereeName(sr2),
    sr1RefereeApiId: extractRefereeApiId(sr1),
    sr2RefereeApiId: extractRefereeApiId(sr2),
    sr1Status: deriveSrStatus(sr1, sr1OffenAngeboten),
    sr2Status: deriveSrStatus(sr2, sr2OffenAngeboten),
    isCancelled: sp.abgesagt,
    isForfeited: sp.verzicht,
    homeClubId: sp.heimMannschaftLiga.mannschaft.verein.vereinId,
    guestClubId: sp.gastMannschaftLiga.mannschaft.verein.vereinId,
  };
}

// --- Private helpers for sync logic ---

function hasOpenOurClubSlot(row: {
  sr1OurClub: boolean;
  sr2OurClub: boolean;
  sr1Status: string;
  sr2Status: string;
}): boolean {
  return (row.sr1OurClub && row.sr1Status !== "assigned") ||
    (row.sr2OurClub && row.sr2Status !== "assigned");
}

function bothSlotsFilled(row: {
  sr1Status: string;
  sr2Status: string;
}): boolean {
  return row.sr1Status === "assigned" && row.sr2Status === "assigned";
}

function buildPayload(row: ReturnType<typeof mapApiResultToRow> & { matchId?: number | null }) {
  return {
    matchId: row.matchId ?? null,
    matchNo: row.matchNo,
    homeTeam: row.homeTeamName,
    guestTeam: row.guestTeamName,
    leagueId: null,
    leagueName: row.leagueName ?? "",
    kickoffDate: row.kickoffDate,
    kickoffTime: row.kickoffTime,
    venueId: null,
    venueName: row.venueName,
    sr1Open: row.sr1Status !== "assigned",
    sr2Open: row.sr2Status !== "assigned",
    sr1Assigned: row.sr1Status === "assigned" ? row.sr1Name : null,
    sr2Assigned: row.sr2Status === "assigned" ? row.sr2Name : null,
    deepLink: `/admin/referee-games`,
  };
}

async function findMatchId(apiMatchId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.apiMatchId, apiMatchId))
    .limit(1);
  return row?.id ?? null;
}

// --- Main sync ---

export async function syncRefereeGames(): Promise<{
  created: number;
  updated: number;
  unchanged: number;
}> {
  const client = createRefereeSdkClient();
  const response = await client.fetchOffeneSpiele();

  if (response.results.length === 0) {
    log.info("No referee games returned from API");
    return { created: 0, updated: 0, unchanged: 0 };
  }

  log.info({ count: response.results.length }, "Processing referee games from API");

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const result of response.results) {
    try {
      const mapped = mapApiResultToRow(result);
      const hash = computeRefereeGameHash(mapped);

      // Look up existing referee_games row
      const [existing] = await db
        .select()
        .from(refereeGames)
        .where(eq(refereeGames.apiMatchId, mapped.apiMatchId))
        .limit(1);

      // Look up matches row for matchId
      const matchId = await findMatchId(mapped.apiMatchId);

      if (!existing) {
        // INSERT
        const now = new Date();
        const [inserted] = await db.insert(refereeGames).values({
          ...mapped,
          matchId,
          dataHash: hash,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        }).returning({ id: refereeGames.id, apiMatchId: refereeGames.apiMatchId });

        created++;

        // Emit event + schedule reminders for open our-club slots (not cancelled/forfeited)
        if (!mapped.isCancelled && !mapped.isForfeited && hasOpenOurClubSlot(mapped)) {
          try {
            await publishDomainEvent({
              type: EVENT_TYPES.REFEREE_SLOTS_NEEDED,
              source: "sync",
              entityType: "referee",
              entityId: inserted.id,
              entityName: `${mapped.homeTeamName} vs ${mapped.guestTeamName}`,
              deepLinkPath: `/admin/referee-games`,
              payload: buildPayload({ ...mapped, matchId }),
            });
          } catch (err) {
            log.warn({ err, apiMatchId: mapped.apiMatchId }, "Failed to emit REFEREE_SLOTS_NEEDED event");
          }

          try {
            await scheduleReminderJobs(mapped.apiMatchId, inserted.id, mapped.kickoffDate, mapped.kickoffTime);
          } catch (err) {
            log.warn({ err, apiMatchId: mapped.apiMatchId }, "Failed to schedule reminder jobs");
          }
        }
      } else if (existing.dataHash !== hash) {
        // UPDATE
        const now = new Date();
        await db
          .update(refereeGames)
          .set({
            ...mapped,
            matchId,
            dataHash: hash,
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(refereeGames.id, existing.id));

        updated++;

        // Detect state changes and act accordingly
        const wasCancelledOrForfeited = existing.isCancelled || existing.isForfeited;
        const nowCancelledOrForfeited = mapped.isCancelled || mapped.isForfeited;

        if (nowCancelledOrForfeited && !wasCancelledOrForfeited) {
          // Game was cancelled or forfeited — cancel reminders
          try {
            await cancelReminderJobs(mapped.apiMatchId);
          } catch (err) {
            log.warn({ err, apiMatchId: mapped.apiMatchId }, "Failed to cancel reminder jobs on cancellation");
          }
        } else if (bothSlotsFilled(mapped)) {
          // Both slots now filled — cancel reminders
          try {
            await cancelReminderJobs(mapped.apiMatchId);
          } catch (err) {
            log.warn({ err, apiMatchId: mapped.apiMatchId }, "Failed to cancel reminder jobs when slots filled");
          }
        } else {
          // Check if a slot opened (was assigned, now not)
          const slotOpened =
            (existing.sr1OurClub && existing.sr1Status === "assigned" && mapped.sr1Status !== "assigned") ||
            (existing.sr2OurClub && existing.sr2Status === "assigned" && mapped.sr2Status !== "assigned");

          if (slotOpened && !nowCancelledOrForfeited) {
            try {
              await publishDomainEvent({
                type: EVENT_TYPES.REFEREE_SLOTS_NEEDED,
                source: "sync",
                entityType: "referee",
                entityId: existing.id,
                entityName: `${mapped.homeTeamName} vs ${mapped.guestTeamName}`,
                deepLinkPath: `/admin/referee-games`,
                payload: buildPayload({ ...mapped, matchId }),
              });
            } catch (err) {
              log.warn({ err, apiMatchId: mapped.apiMatchId }, "Failed to emit REFEREE_SLOTS_NEEDED event on slot open");
            }
          }

          // Check if kickoff changed — reschedule reminders
          const kickoffChanged =
            existing.kickoffDate !== mapped.kickoffDate ||
            existing.kickoffTime !== mapped.kickoffTime;

          if (kickoffChanged && !nowCancelledOrForfeited) {
            try {
              await cancelReminderJobs(mapped.apiMatchId);
              await scheduleReminderJobs(mapped.apiMatchId, existing.id, mapped.kickoffDate, mapped.kickoffTime);
            } catch (err) {
              log.warn({ err, apiMatchId: mapped.apiMatchId }, "Failed to reschedule reminder jobs on kickoff change");
            }
          }
        }
      } else {
        unchanged++;
      }
    } catch (err) {
      log.error({ err, spielplanId: result.sp.spielplanId }, "Failed to sync referee game");
    }
  }

  log.info({ created, updated, unchanged }, "Referee games sync completed");
  return { created, updated, unchanged };
}
