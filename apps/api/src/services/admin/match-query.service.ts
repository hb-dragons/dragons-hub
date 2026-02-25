import { db } from "../../config/database";
import type { Database } from "@dragons/db";
import {
  matches,
  teams,
  leagues,
  venues,
  matchOverrides,
  matchRemoteVersions,
} from "@dragons/db/schema";
import { eq, sql, and, or, inArray, gte, lte, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { computeDiffs } from "./match-diff.service";

export type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface MatchListParams {
  limit: number;
  offset: number;
  leagueId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface OverrideInfo {
  fieldName: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: Date;
}

export interface MatchListItem {
  id: number;
  apiMatchId: number;
  matchNo: number;
  matchDay: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamApiId: number;
  homeTeamName: string;
  homeTeamNameShort: string | null;
  homeTeamCustomName: string | null;
  guestTeamApiId: number;
  guestTeamName: string;
  guestTeamNameShort: string | null;
  guestTeamCustomName: string | null;
  homeIsOwnClub: boolean;
  guestIsOwnClub: boolean;
  homeScore: number | null;
  guestScore: number | null;
  leagueId: number | null;
  leagueName: string | null;
  venueId: number | null;
  venueName: string | null;
  venueStreet: string | null;
  venueCity: string | null;
  venueNameOverride: string | null;
  isConfirmed: boolean | null;
  isForfeited: boolean | null;
  isCancelled: boolean | null;
  anschreiber: string | null;
  zeitnehmer: string | null;
  shotclock: string | null;
  publicComment: string | null;
  hasLocalChanges: boolean;
  overriddenFields: string[];
}

export interface MatchDetail extends MatchListItem {
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: string | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
  homeQ5: number | null;
  guestQ5: number | null;
  homeQ6: number | null;
  guestQ6: number | null;
  homeQ7: number | null;
  guestQ7: number | null;
  homeQ8: number | null;
  guestQ8: number | null;
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
  internalNotes: string | null;
  currentRemoteVersion: number;
  currentLocalVersion: number;
  lastRemoteSync: Date | null;
  createdAt: Date;
  updatedAt: Date;
  overrides: OverrideInfo[];
}

export interface MatchDetailResponse {
  match: MatchDetail;
  diffs: import("./match-diff.service").FieldDiff[];
}

export interface MatchUpdateData {
  kickoffDate?: string | null;
  kickoffTime?: string | null;
  isForfeited?: boolean | null;
  isCancelled?: boolean | null;
  homeScore?: number | null;
  guestScore?: number | null;
  homeHalftimeScore?: number | null;
  guestHalftimeScore?: number | null;
  homeQ1?: number | null;
  guestQ1?: number | null;
  homeQ2?: number | null;
  guestQ2?: number | null;
  homeQ3?: number | null;
  guestQ3?: number | null;
  homeQ4?: number | null;
  guestQ4?: number | null;
  homeOt1?: number | null;
  guestOt1?: number | null;
  homeOt2?: number | null;
  guestOt2?: number | null;
  venueNameOverride?: string | null;
  anschreiber?: string | null;
  zeitnehmer?: string | null;
  shotclock?: string | null;
  internalNotes?: string | null;
  publicComment?: string | null;
  changeReason?: string;
}

const homeTeam = alias(teams, "homeTeam");
const guestTeam = alias(teams, "guestTeam");

/**
 * Build the standard match-with-joins select query.
 * Accepts an optional client parameter (Database or TransactionClient); defaults to `db`.
 */
export function queryMatchWithJoins(client: Database | TransactionClient = db) {
  return client
    .select({
      id: matches.id,
      apiMatchId: matches.apiMatchId,
      matchNo: matches.matchNo,
      matchDay: matches.matchDay,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      homeTeamApiId: matches.homeTeamApiId,
      homeTeamName: homeTeam.name,
      homeTeamNameShort: homeTeam.nameShort,
      homeTeamCustomName: homeTeam.customName,
      guestTeamApiId: matches.guestTeamApiId,
      guestTeamName: guestTeam.name,
      guestTeamNameShort: guestTeam.nameShort,
      guestTeamCustomName: guestTeam.customName,
      homeIsOwnClub: homeTeam.isOwnClub,
      guestIsOwnClub: guestTeam.isOwnClub,
      homeScore: matches.homeScore,
      guestScore: matches.guestScore,
      leagueId: matches.leagueId,
      leagueName: leagues.name,
      venueId: matches.venueId,
      venueName: venues.name,
      venueStreet: venues.street,
      venueCity: venues.city,
      venueNameOverride: matches.venueNameOverride,
      isConfirmed: matches.isConfirmed,
      isForfeited: matches.isForfeited,
      isCancelled: matches.isCancelled,
      currentLocalVersion: matches.currentLocalVersion,
      currentRemoteVersion: matches.currentRemoteVersion,
      homeHalftimeScore: matches.homeHalftimeScore,
      guestHalftimeScore: matches.guestHalftimeScore,
      periodFormat: matches.periodFormat,
      homeQ1: matches.homeQ1,
      guestQ1: matches.guestQ1,
      homeQ2: matches.homeQ2,
      guestQ2: matches.guestQ2,
      homeQ3: matches.homeQ3,
      guestQ3: matches.guestQ3,
      homeQ4: matches.homeQ4,
      guestQ4: matches.guestQ4,
      homeQ5: matches.homeQ5,
      guestQ5: matches.guestQ5,
      homeQ6: matches.homeQ6,
      guestQ6: matches.guestQ6,
      homeQ7: matches.homeQ7,
      guestQ7: matches.guestQ7,
      homeQ8: matches.homeQ8,
      guestQ8: matches.guestQ8,
      homeOt1: matches.homeOt1,
      guestOt1: matches.guestOt1,
      homeOt2: matches.homeOt2,
      guestOt2: matches.guestOt2,
      anschreiber: matches.anschreiber,
      zeitnehmer: matches.zeitnehmer,
      shotclock: matches.shotclock,
      internalNotes: matches.internalNotes,
      publicComment: matches.publicComment,
      lastRemoteSync: matches.lastRemoteSync,
      createdAt: matches.createdAt,
      updatedAt: matches.updatedAt,
    })
    .from(matches)
    .innerJoin(homeTeam, eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId))
    .innerJoin(guestTeam, eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId))
    .leftJoin(leagues, eq(matches.leagueId, leagues.id))
    .leftJoin(venues, eq(matches.venueId, venues.id));
}

/** Row type returned by queryMatchWithJoins */
export type MatchRow = Awaited<ReturnType<typeof queryMatchWithJoins>>[number];

export async function loadOverrides(matchId: number, client: Database | TransactionClient = db) {
  return client
    .select({
      fieldName: matchOverrides.fieldName,
      reason: matchOverrides.reason,
      changedBy: matchOverrides.changedBy,
      createdAt: matchOverrides.createdAt,
    })
    .from(matchOverrides)
    .where(eq(matchOverrides.matchId, matchId));
}

export async function loadRemoteSnapshot(
  client: Database | TransactionClient,
  matchId: number,
  remoteVersion: number,
): Promise<Record<string, unknown> | null> {
  if (remoteVersion <= 0) return null;
  const [latestRemote] = await client
    .select({ snapshot: matchRemoteVersions.snapshot })
    .from(matchRemoteVersions)
    .where(
      and(
        eq(matchRemoteVersions.matchId, matchId),
        eq(matchRemoteVersions.versionNumber, remoteVersion),
      ),
    )
    .limit(1);
  return (latestRemote?.snapshot as Record<string, unknown>) ?? null;
}

export function rowToListItem(
  row: MatchRow,
  overriddenFields: string[],
): MatchListItem {
  return {
    id: row.id,
    apiMatchId: row.apiMatchId,
    matchNo: row.matchNo,
    matchDay: row.matchDay,
    kickoffDate: row.kickoffDate,
    kickoffTime: row.kickoffTime,
    homeTeamApiId: row.homeTeamApiId,
    homeTeamName: row.homeTeamName,
    homeTeamNameShort: row.homeTeamNameShort,
    homeTeamCustomName: row.homeTeamCustomName,
    guestTeamApiId: row.guestTeamApiId,
    guestTeamName: row.guestTeamName,
    guestTeamNameShort: row.guestTeamNameShort,
    guestTeamCustomName: row.guestTeamCustomName,
    homeIsOwnClub: row.homeIsOwnClub ?? false,
    guestIsOwnClub: row.guestIsOwnClub ?? false,
    homeScore: row.homeScore,
    guestScore: row.guestScore,
    leagueId: row.leagueId,
    leagueName: row.leagueName,
    venueId: row.venueId,
    venueName: row.venueName,
    venueStreet: row.venueStreet,
    venueCity: row.venueCity,
    venueNameOverride: row.venueNameOverride,
    isConfirmed: row.isConfirmed,
    isForfeited: row.isForfeited,
    isCancelled: row.isCancelled,
    anschreiber: row.anschreiber,
    zeitnehmer: row.zeitnehmer,
    shotclock: row.shotclock,
    publicComment: row.publicComment,
    hasLocalChanges: row.currentLocalVersion > 0,
    overriddenFields,
  };
}

export function rowToDetail(
  row: MatchRow,
  overriddenFields: string[],
  overrides: OverrideInfo[],
): MatchDetail {
  return {
    ...rowToListItem(row, overriddenFields),
    homeHalftimeScore: row.homeHalftimeScore,
    guestHalftimeScore: row.guestHalftimeScore,
    periodFormat: row.periodFormat,
    homeQ1: row.homeQ1,
    guestQ1: row.guestQ1,
    homeQ2: row.homeQ2,
    guestQ2: row.guestQ2,
    homeQ3: row.homeQ3,
    guestQ3: row.guestQ3,
    homeQ4: row.homeQ4,
    guestQ4: row.guestQ4,
    homeQ5: row.homeQ5,
    guestQ5: row.guestQ5,
    homeQ6: row.homeQ6,
    guestQ6: row.guestQ6,
    homeQ7: row.homeQ7,
    guestQ7: row.guestQ7,
    homeQ8: row.homeQ8,
    guestQ8: row.guestQ8,
    homeOt1: row.homeOt1,
    guestOt1: row.guestOt1,
    homeOt2: row.homeOt2,
    guestOt2: row.guestOt2,
    internalNotes: row.internalNotes,
    currentRemoteVersion: row.currentRemoteVersion,
    currentLocalVersion: row.currentLocalVersion,
    lastRemoteSync: row.lastRemoteSync,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    overrides,
  };
}

/**
 * Shared tail pattern for building a MatchDetailResponse from a match ID.
 * Used by both updateMatchLocal and releaseOverride after their mutations.
 */
export async function buildDetailResponse(
  client: Database | TransactionClient,
  matchId: number,
): Promise<MatchDetailResponse | null> {
  const [row] = await queryMatchWithJoins(client)
    .where(eq(matches.id, matchId))
    .limit(1);

  /* v8 ignore next -- defensive: row was just locked in same transaction */
  if (!row) return null;

  const overrides = await loadOverrides(matchId, client);
  const overriddenFields = overrides.map((o) => o.fieldName);
  const remoteSnapshot = await loadRemoteSnapshot(client, matchId, row.currentRemoteVersion);

  return {
    match: rowToDetail(row, overriddenFields, overrides),
    diffs: computeDiffs(row, overriddenFields, remoteSnapshot),
  };
}

export async function getOwnClubMatches(params: MatchListParams) {
  const { limit, offset, leagueId, dateFrom, dateTo } = params;

  const ownTeams = await db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(eq(teams.isOwnClub, true));

  const ownTeamIds = ownTeams.map((t) => t.apiTeamPermanentId);

  if (ownTeamIds.length === 0) {
    return { items: [], total: 0, limit, offset, hasMore: false };
  }

  const conditions = [
    or(
      inArray(matches.homeTeamApiId, ownTeamIds),
      inArray(matches.guestTeamApiId, ownTeamIds),
    )!,
  ];

  if (leagueId) {
    conditions.push(eq(matches.leagueId, leagueId));
  }
  if (dateFrom) {
    conditions.push(gte(matches.kickoffDate, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(matches.kickoffDate, dateTo));
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  const [rows, countResult] = await Promise.all([
    queryMatchWithJoins()
      .where(whereClause)
      .orderBy(asc(matches.kickoffDate), asc(matches.kickoffTime))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matches)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Load overrides for all matches in one query
  const matchIds = rows.map((r) => r.id);
  const allOverrides = matchIds.length > 0
    ? await db
        .select({ matchId: matchOverrides.matchId, fieldName: matchOverrides.fieldName })
        .from(matchOverrides)
        .where(inArray(matchOverrides.matchId, matchIds))
    : [];

  const overridesByMatch = new Map<number, string[]>();
  for (const o of allOverrides) {
    const existing = overridesByMatch.get(o.matchId) ?? [];
    existing.push(o.fieldName);
    overridesByMatch.set(o.matchId, existing);
  }

  const items = rows.map((row) => rowToListItem(row, overridesByMatch.get(row.id) ?? []));

  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

export async function getMatchDetail(id: number): Promise<MatchDetailResponse | null> {
  return buildDetailResponse(db, id);
}
