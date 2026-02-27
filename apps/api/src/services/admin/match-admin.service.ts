import { db } from "../../config/database";
import {
  matches,
  matchOverrides,
  matchRemoteVersions,
  matchLocalVersions,
  matchChanges,
} from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { OVERRIDABLE_FIELDS, LOCAL_ONLY_FIELDS } from "./match-diff.service";
import type { MatchDetailResponse } from "@dragons/shared";
import type { MatchUpdateData } from "./match-query.service";
import { buildDetailResponse, loadRemoteSnapshot } from "./match-query.service";

// ── Re-exports ──────────────────────────────────────────────────────────────

export { computeDiffs, OVERRIDABLE_FIELDS, LOCAL_ONLY_FIELDS } from "./match-diff.service";
export type { DiffStatus, FieldDiff } from "@dragons/shared";
export type { DiffInput, OverridableField, LocalOnlyField, AllEditableField } from "./match-diff.service";

export type { OverrideInfo, MatchListItem, MatchDetail, MatchDetailResponse } from "@dragons/shared";
export {
  getOwnClubMatches,
  getMatchDetail,
  queryMatchWithJoins,
  loadOverrides,
  loadRemoteSnapshot,
  buildDetailResponse,
} from "./match-query.service";
export type {
  MatchListParams,
  MatchUpdateData,
  MatchRow,
  TransactionClient,
} from "./match-query.service";

// ── Write operations ────────────────────────────────────────────────────────

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
      remoteSnapshot = await loadRemoteSnapshot(tx, id, locked.currentRemoteVersion);
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
      // No actual value changes — return current state from within the transaction
      return buildDetailResponse(tx, id);
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
    return buildDetailResponse(tx, id);
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

    // Re-query within transaction for full response
    return buildDetailResponse(tx, matchId);
  });
}
