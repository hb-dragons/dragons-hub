import { db } from "../../config/database";
import type { Database } from "@dragons/db";
import {
  matches,
  teams,
  leagues,
  venues,
  matchOverrides,
  matchLocalVersions,
  matchRemoteVersions,
  matchChanges,
} from "@dragons/db/schema";
import { eq, sql, and, or, inArray, gte, lte, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type DiffStatus = "diverged" | "synced" | "local-only";

export interface FieldDiff {
  field: string;
  label: string;
  remoteValue: string | null;
  localValue: string | null;
  status: DiffStatus;
}

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
  diffs: FieldDiff[];
}

/** Fields that can be overridden (values written directly to matches table + match_overrides row) */
const OVERRIDABLE_FIELDS = [
  "kickoffDate",
  "kickoffTime",
  "isForfeited",
  "isCancelled",
  "homeScore",
  "guestScore",
  "homeHalftimeScore",
  "guestHalftimeScore",
  "homeQ1", "guestQ1", "homeQ2", "guestQ2",
  "homeQ3", "guestQ3", "homeQ4", "guestQ4",
  "homeOt1", "guestOt1", "homeOt2", "guestOt2",
] as const;

/** Fields that are local-only (no remote counterpart) */
const LOCAL_ONLY_FIELDS = [
  "venueNameOverride",
  "anschreiber",
  "zeitnehmer",
  "shotclock",
  "internalNotes",
  "publicComment",
] as const;

type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];
type LocalOnlyField = (typeof LOCAL_ONLY_FIELDS)[number];
type AllEditableField = OverridableField | LocalOnlyField;

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

function getBaseQuery() {
  return db
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

async function loadOverrides(matchId: number) {
  return db
    .select({
      fieldName: matchOverrides.fieldName,
      reason: matchOverrides.reason,
      changedBy: matchOverrides.changedBy,
      createdAt: matchOverrides.createdAt,
    })
    .from(matchOverrides)
    .where(eq(matchOverrides.matchId, matchId));
}

function rowToListItem(
  row: Awaited<ReturnType<typeof getBaseQuery>>[number],
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

function rowToDetail(
  row: Awaited<ReturnType<typeof getBaseQuery>>[number],
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

export function computeDiffs(
  row: Awaited<ReturnType<typeof getBaseQuery>>[number],
  overriddenFields: string[],
  remoteSnapshot?: Record<string, unknown> | null,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Override diffs — compare effective value vs remote snapshot value
  const overridePairs: {
    field: string;
    label: string;
    effective: string | number | boolean | null;
    remote: string | number | boolean | null;
  }[] = [
    { field: "kickoffDate", label: "Date", effective: row.kickoffDate, remote: remoteSnapshot?.kickoffDate as string ?? row.kickoffDate },
    { field: "kickoffTime", label: "Time", effective: row.kickoffTime, remote: remoteSnapshot?.kickoffTime as string ?? row.kickoffTime },
    { field: "venue", label: "Venue", effective: row.venueNameOverride, remote: row.venueName },
    { field: "isForfeited", label: "Forfeited", effective: row.isForfeited, remote: remoteSnapshot?.isForfeited as boolean ?? row.isForfeited },
    { field: "isCancelled", label: "Cancelled", effective: row.isCancelled, remote: remoteSnapshot?.isCancelled as boolean ?? row.isCancelled },
  ];

  for (const pair of overridePairs) {
    const isOverridden = overriddenFields.includes(pair.field === "venue" ? "venueNameOverride" : pair.field);
    const isVenueWithValue = pair.field === "venue" && pair.effective != null;

    if (!isOverridden && !isVenueWithValue) continue;

    const remoteStr = pair.remote == null ? null : String(pair.remote);
    const effectiveStr = pair.effective == null ? null : String(pair.effective);
    diffs.push({
      field: pair.field,
      label: pair.label,
      remoteValue: remoteStr,
      localValue: effectiveStr,
      status: remoteStr === effectiveStr ? "synced" : "diverged",
    });
  }

  const operationalFields: { field: string; label: string; value: string | null }[] = [
    { field: "anschreiber", label: "Anschreiber", value: row.anschreiber },
    { field: "zeitnehmer", label: "Zeitnehmer", value: row.zeitnehmer },
    { field: "shotclock", label: "Shotclock", value: row.shotclock },
    { field: "internalNotes", label: "Internal Notes", value: row.internalNotes },
    { field: "publicComment", label: "Public Comment", value: row.publicComment },
  ];

  for (const op of operationalFields) {
    if (op.value != null) {
      diffs.push({
        field: op.field,
        label: op.label,
        remoteValue: null,
        localValue: op.value,
        status: "local-only",
      });
    }
  }

  return diffs;
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
    getBaseQuery()
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
  const [row] = await getBaseQuery().where(eq(matches.id, id)).limit(1);

  if (!row) return null;

  const overrides = await loadOverrides(id);
  const overriddenFields = overrides.map((o) => o.fieldName);

  // Load latest remote snapshot for diff comparison
  const remoteSnapshot = await loadRemoteSnapshot(db, id, row.currentRemoteVersion);

  return {
    match: rowToDetail(row, overriddenFields, overrides),
    diffs: computeDiffs(row, overriddenFields, remoteSnapshot),
  };
}

async function loadRemoteSnapshot(
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

function queryMatchWithJoins(client: Database | TransactionClient) {
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

export async function updateMatchLocal(
  id: number,
  data: MatchUpdateData,
  changedBy: string,
): Promise<MatchDetailResponse | null> {
  return await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, id))
      .for("update");

    if (!locked) return null;

    const allFields = [...OVERRIDABLE_FIELDS, ...LOCAL_ONLY_FIELDS] as const;
    const fieldChanges: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    const updateValues: Record<string, string | number | boolean | null> = {};
    const clearedOverrides = new Set<string>(); // fields explicitly set to null

    // Pre-load remote snapshot for restoring values when clearing overrides
    let remoteSnapshot: Record<string, unknown> | null = null;
    const hasClearedOverridable = allFields.some((f) => {
      if (!(f in data)) return false;
      const val = data[f as keyof MatchUpdateData];
      return val === null && (OVERRIDABLE_FIELDS as readonly string[]).includes(f);
    });
    if (hasClearedOverridable && locked.currentRemoteVersion > 0) {
      const [latestRemote] = await tx
        .select({ snapshot: matchRemoteVersions.snapshot })
        .from(matchRemoteVersions)
        .where(
          and(
            eq(matchRemoteVersions.matchId, id),
            eq(matchRemoteVersions.versionNumber, locked.currentRemoteVersion),
          ),
        )
        .limit(1);
      remoteSnapshot = (latestRemote?.snapshot as Record<string, unknown>) ?? null;
    }

    for (const field of allFields) {
      if (!(field in data)) continue;
      const rawVal = data[field as keyof MatchUpdateData];
      if (rawVal === undefined) continue;

      // When clearing an overridable field, restore the remote value
      let newVal = rawVal;
      const isOverridable = (OVERRIDABLE_FIELDS as readonly string[]).includes(field);
      if (rawVal === null && isOverridable) {
        clearedOverrides.add(field);
        const restored = remoteSnapshot?.[field];
        newVal = (restored ?? null) as typeof rawVal;
      }

      const oldVal = locked[field as keyof typeof locked];
      const oldStr = oldVal == null ? null : String(oldVal);
      const newStr = newVal == null ? null : String(newVal);

      if (oldStr !== newStr) {
        fieldChanges.push({ field, oldValue: oldStr, newValue: newStr });
        updateValues[field] = newVal as string | number | boolean | null;
      }
    }

    // Delete override rows for cleared fields (even if value didn't change)
    for (const field of clearedOverrides) {
      await tx.delete(matchOverrides).where(
        and(
          eq(matchOverrides.matchId, id),
          eq(matchOverrides.fieldName, field),
        ),
      );
    }

    if (fieldChanges.length === 0) {
      // No actual value changes — query within transaction to return response
      const [row] = await queryMatchWithJoins(tx)
        .where(eq(matches.id, id))
        .limit(1);
      /* v8 ignore next -- defensive: row was just locked in same transaction */
      if (!row) return null;
      const overrides = await tx.select({ fieldName: matchOverrides.fieldName, reason: matchOverrides.reason, changedBy: matchOverrides.changedBy, createdAt: matchOverrides.createdAt })
        .from(matchOverrides).where(eq(matchOverrides.matchId, id));
      const overriddenFields = overrides.map((o) => o.fieldName);
      const remoteSnapshot = await loadRemoteSnapshot(tx, id, row.currentRemoteVersion);
      return { match: rowToDetail(row, overriddenFields, overrides), diffs: computeDiffs(row, overriddenFields, remoteSnapshot) };
    }

    const newVersion = locked.currentLocalVersion + 1;

    // Build snapshot of all editable fields
    const snapshot: Record<string, string | number | boolean | null> = {};
    for (const field of allFields) {
      snapshot[field] = (field in updateValues
        ? updateValues[field]
        : locked[field as keyof typeof locked]) as string | number | boolean | null;
    }

    await tx.insert(matchLocalVersions).values({
      matchId: id,
      versionNumber: newVersion,
      changedBy,
      changeReason: data.changeReason ?? null,
      snapshot,
      dataHash: "",
      baseRemoteVersion: locked.currentRemoteVersion,
    });

    for (const change of fieldChanges) {
      await tx.insert(matchChanges).values({
        matchId: id,
        track: "local",
        versionNumber: newVersion,
        fieldName: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        changedBy,
      });
    }

    // Upsert override rows for overridable fields
    const overridableChanges = fieldChanges.filter((c) =>
      (OVERRIDABLE_FIELDS as readonly string[]).includes(c.field),
    );
    for (const change of overridableChanges) {
      if (!clearedOverrides.has(change.field)) {
        // Upsert: create or update the override row
        await tx.insert(matchOverrides).values({
          matchId: id,
          fieldName: change.field,
          reason: data.changeReason ?? null,
          changedBy,
        }).onConflictDoUpdate({
          target: [matchOverrides.matchId, matchOverrides.fieldName],
          set: {
            reason: data.changeReason ?? null,
            changedBy,
            updatedAt: new Date(),
          },
        });
      }
    }

    await tx
      .update(matches)
      .set({
        ...updateValues,
        currentLocalVersion: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, id));

    // Re-query within transaction for full response
    const [row] = await queryMatchWithJoins(tx)
      .where(eq(matches.id, id))
      .limit(1);

    /* v8 ignore next -- defensive: row was just locked in same transaction */
    if (!row) return null;

    const overrides = await tx.select({ fieldName: matchOverrides.fieldName, reason: matchOverrides.reason, changedBy: matchOverrides.changedBy, createdAt: matchOverrides.createdAt })
      .from(matchOverrides).where(eq(matchOverrides.matchId, id));
    const overriddenFields = overrides.map((o) => o.fieldName);

    return {
      match: rowToDetail(row, overriddenFields, overrides),
      diffs: computeDiffs(row, overriddenFields, await loadRemoteSnapshot(tx, id, row.currentRemoteVersion)),
    };
  });
}

export async function releaseOverride(
  matchId: number,
  fieldName: string,
  changedBy: string,
): Promise<MatchDetailResponse | null> {
  return await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .for("update");

    if (!locked) return null;

    // Check if override exists
    const [override] = await tx
      .select()
      .from(matchOverrides)
      .where(
        and(
          eq(matchOverrides.matchId, matchId),
          eq(matchOverrides.fieldName, fieldName),
        ),
      )
      .limit(1);

    if (!override) return null;

    // Load latest remote snapshot to get the remote value
    let remoteValue: unknown = null;
    if (locked.currentRemoteVersion > 0) {
      const [latestRemote] = await tx
        .select({ snapshot: matchRemoteVersions.snapshot })
        .from(matchRemoteVersions)
        .where(
          and(
            eq(matchRemoteVersions.matchId, matchId),
            eq(matchRemoteVersions.versionNumber, locked.currentRemoteVersion),
          ),
        )
        .limit(1);
      const snapshot = latestRemote?.snapshot as Record<string, unknown> | undefined;
      remoteValue = snapshot?.[fieldName] ?? null;
    }

    // Restore remote value to the matches column
    const newVersion = locked.currentLocalVersion + 1;
    const currentValue = locked[fieldName as keyof typeof locked];
    const currentStr = currentValue == null ? null : String(currentValue);
    const remoteStr = remoteValue == null ? null : String(remoteValue);

    // Record the change
    await tx.insert(matchChanges).values({
      matchId,
      track: "local",
      versionNumber: newVersion,
      fieldName,
      oldValue: currentStr,
      newValue: remoteStr,
      changedBy,
    });

    // Build snapshot
    const allFields = [...OVERRIDABLE_FIELDS, ...LOCAL_ONLY_FIELDS] as const;
    const snapshot: Record<string, string | number | boolean | null> = {};
    for (const f of allFields) {
      snapshot[f] = (f === fieldName
        ? remoteValue
        : locked[f as keyof typeof locked]) as string | number | boolean | null;
    }

    await tx.insert(matchLocalVersions).values({
      matchId,
      versionNumber: newVersion,
      changedBy,
      changeReason: `Released override for ${fieldName}`,
      snapshot,
      dataHash: "",
      baseRemoteVersion: locked.currentRemoteVersion,
    });

    // Restore value and delete override
    await tx
      .update(matches)
      .set({
        [fieldName]: remoteValue,
        currentLocalVersion: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId));

    await tx.delete(matchOverrides).where(
      and(
        eq(matchOverrides.matchId, matchId),
        eq(matchOverrides.fieldName, fieldName),
      ),
    );

    // Re-query
    const [row] = await queryMatchWithJoins(tx)
      .where(eq(matches.id, matchId))
      .limit(1);

    /* v8 ignore next -- defensive: row was just locked in same transaction */
    if (!row) return null;

    const overrides = await tx.select({ fieldName: matchOverrides.fieldName, reason: matchOverrides.reason, changedBy: matchOverrides.changedBy, createdAt: matchOverrides.createdAt })
      .from(matchOverrides).where(eq(matchOverrides.matchId, matchId));
    const overriddenFields = overrides.map((o) => o.fieldName);

    return {
      match: rowToDetail(row, overriddenFields, overrides),
      diffs: computeDiffs(row, overriddenFields, await loadRemoteSnapshot(tx, matchId, row.currentRemoteVersion)),
    };
  });
}
