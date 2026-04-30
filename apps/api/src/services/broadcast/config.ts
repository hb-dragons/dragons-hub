import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import type {
  BroadcastConfig,
  BroadcastMatch,
  BroadcastMatchTeam,
} from "@dragons/shared";

const DEFAULT_HOME_COLOR = "#1e90ff";
const DEFAULT_GUEST_COLOR = "#dc2626";

function deriveAbbr(team: { nameShort: string | null; name: string }): string {
  const src = team.nameShort ?? team.name;
  return src.slice(0, 3).toUpperCase();
}

function rowToConfig(
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
  const rows = await db
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
  const set: Record<string, unknown> = { updatedAt: now };
  if (input.matchId !== undefined) set.matchId = input.matchId;
  if (input.homeAbbr !== undefined) set.homeAbbr = input.homeAbbr;
  if (input.guestAbbr !== undefined) set.guestAbbr = input.guestAbbr;
  if (input.homeColorOverride !== undefined)
    set.homeColorOverride = input.homeColorOverride;
  if (input.guestColorOverride !== undefined)
    set.guestColorOverride = input.guestColorOverride;
  await db
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
): Promise<BroadcastConfig> {
  if (isLive) {
    const existing = await getBroadcastConfig(deviceId);
    if (!existing || existing.matchId === null) {
      throw new Error("Cannot go live without matchId");
    }
  }
  const now = new Date();
  await db
    .update(broadcastConfigs)
    .set({
      isLive,
      startedAt: isLive ? now : undefined,
      endedAt: isLive ? undefined : now,
      updatedAt: now,
    })
    .where(eq(broadcastConfigs.deviceId, deviceId));
  const out = await getBroadcastConfig(deviceId);
  if (!out) throw new Error("config row missing");
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
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, inputs.matchId))
    .limit(1);
  if (!match) return null;
  const [home] = await db
    .select()
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, match.homeTeamApiId))
    .limit(1);
  const [guest] = await db
    .select()
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, match.guestTeamApiId))
    .limit(1);
  if (!home || !guest) return null;

  let league: { id: number; name: string } | null = null;
  if (match.leagueId !== null) {
    const [lg] = await db
      .select()
      .from(leagues)
      .where(eq(leagues.id, match.leagueId))
      .limit(1);
    if (lg) league = { id: lg.id, name: lg.name };
  }

  const homeTeam: BroadcastMatchTeam = {
    name: home.customName ?? home.name,
    abbr: inputs.homeAbbr ?? deriveAbbr(home),
    color: inputs.homeColorOverride ?? home.badgeColor ?? DEFAULT_HOME_COLOR,
    clubId: home.clubId,
  };
  const guestTeam: BroadcastMatchTeam = {
    name: guest.customName ?? guest.name,
    abbr: inputs.guestAbbr ?? deriveAbbr(guest),
    color: inputs.guestColorOverride ?? guest.badgeColor ?? DEFAULT_GUEST_COLOR,
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
