import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../config/database";
import { BroadcastError } from "./config.errors";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
  teamEntries,
} from "@dragons/db/schema";
import type {
  BroadcastConfig,
  BroadcastMatch,
  BroadcastMatchTeam,
} from "@dragons/shared";
import { pickDefined } from "../utils/object";

const DEFAULT_HOME_COLOR = "#1e90ff";
const DEFAULT_GUEST_COLOR = "#dc2626";

function deriveAbbr(team: { nameShort: string | null; name: string }): string {
  const src = team.nameShort ?? team.name;
  return src.slice(0, 3).toUpperCase();
}

export function rowToConfig(
  row: typeof broadcastConfigs.$inferSelect,
): BroadcastConfig {
  return {
    deviceId: row.deviceId,
    matchId: row.matchId,
    isLive: row.isLive,
    homeAbbr: row.homeAbbr,
    guestAbbr: row.guestAbbr,
    homeColorOverride: row.homeColorOverride,
    guestColorOverride: row.guestColorOverride,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getBroadcastConfig(
  deviceId: string,
): Promise<BroadcastConfig | null> {
  const rows = await getDb()
    .select()
    .from(broadcastConfigs)
    .where(eq(broadcastConfigs.deviceId, deviceId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToConfig(rows[0]!);
}

export interface UpsertInput {
  deviceId: string;
  matchId?: number | null;
  homeAbbr?: string | null;
  guestAbbr?: string | null;
  homeColorOverride?: string | null;
  guestColorOverride?: string | null;
}

export async function upsertBroadcastConfig(
  input: UpsertInput,
): Promise<BroadcastConfig> {
  const now = new Date();
  const set = {
    ...pickDefined(input, [
      "matchId",
      "homeAbbr",
      "guestAbbr",
      "homeColorOverride",
      "guestColorOverride",
    ]),
    updatedAt: now,
  };
  await getDb()
    .insert(broadcastConfigs)
    .values({
      deviceId: input.deviceId,
      matchId: input.matchId ?? null,
      homeAbbr: input.homeAbbr ?? null,
      guestAbbr: input.guestAbbr ?? null,
      homeColorOverride: input.homeColorOverride ?? null,
      guestColorOverride: input.guestColorOverride ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: broadcastConfigs.deviceId,
      set,
    });
  const out = await getBroadcastConfig(input.deviceId);
  if (!out) throw new Error("upsert failed");
  return out;
}

export async function setBroadcastLive(
  deviceId: string,
  isLive: boolean,
): Promise<BroadcastConfig | null> {
  const now = new Date();
  await getDb().transaction(async (tx) => {
    if (isLive) {
      const [existing] = await tx
        .select()
        .from(broadcastConfigs)
        .where(eq(broadcastConfigs.deviceId, deviceId))
        .for("update")
        .limit(1);
      if (!existing || existing.matchId === null) {
        throw new BroadcastError("MISSING_MATCH");
      }
    }
    await tx
      .update(broadcastConfigs)
      .set({
        isLive,
        startedAt: isLive ? now : null,
        endedAt: isLive ? null : now,
        updatedAt: now,
      })
      .where(eq(broadcastConfigs.deviceId, deviceId));
  });
  const out = await getBroadcastConfig(deviceId);
  if (!out) {
    if (isLive) throw new BroadcastError("ROW_MISSING");
    return null;
  }
  return out;
}

export interface JoinedMatchInputs {
  matchId: number | null;
  homeAbbr: string | null;
  guestAbbr: string | null;
  homeColorOverride: string | null;
  guestColorOverride: string | null;
}

export async function loadJoinedMatch(
  inputs: JoinedMatchInputs,
): Promise<BroadcastMatch | null> {
  if (inputs.matchId === null) return null;
  const [match] = await getDb()
    .select()
    .from(matches)
    .where(eq(matches.id, inputs.matchId))
    .limit(1);
  if (!match) return null;
  const [home] = await getDb()
    .select()
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, match.homeTeamApiId))
    .limit(1);
  const [guest] = await getDb()
    .select()
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, match.guestTeamApiId))
    .limit(1);
  if (!home || !guest) return null;

  let league: { id: number; name: string } | null = null;
  let seasonRefId: number | null = null;
  if (match.leagueId !== null) {
    const [lg] = await getDb()
      .select()
      .from(leagues)
      .where(eq(leagues.id, match.leagueId))
      .limit(1);
    if (lg) {
      league = { id: lg.id, name: lg.name };
      seasonRefId = lg.seasonRefId;
    }
  }

  // customName/badgeColor live on team_entries now, scoped to the match's
  // season. No league (or no season on it) means no entries can apply.
  const entries =
    seasonRefId !== null
      ? await getDb()
          .select({
            teamId: teamEntries.teamId,
            customName: teamEntries.customName,
            badgeColor: teamEntries.badgeColor,
          })
          .from(teamEntries)
          .where(
            and(inArray(teamEntries.teamId, [home.id, guest.id]), eq(teamEntries.seasonId, seasonRefId)),
          )
      : [];
  const entryByTeamId = new Map(entries.map((e) => [e.teamId, e]));
  const homeEntry = entryByTeamId.get(home.id) ?? null;
  const guestEntry = entryByTeamId.get(guest.id) ?? null;

  const homeTeam: BroadcastMatchTeam = {
    name: homeEntry?.customName ?? home.name,
    abbr: inputs.homeAbbr ?? deriveAbbr(home),
    color: inputs.homeColorOverride ?? homeEntry?.badgeColor ?? DEFAULT_HOME_COLOR,
    clubId: home.clubId,
  };
  const guestTeam: BroadcastMatchTeam = {
    name: guestEntry?.customName ?? guest.name,
    abbr: inputs.guestAbbr ?? deriveAbbr(guest),
    color: inputs.guestColorOverride ?? guestEntry?.badgeColor ?? DEFAULT_GUEST_COLOR,
    clubId: guest.clubId,
  };

  return {
    id: match.id,
    kickoffDate: match.kickoffDate,
    kickoffTime: match.kickoffTime,
    league,
    home: homeTeam,
    guest: guestTeam,
  };
}
