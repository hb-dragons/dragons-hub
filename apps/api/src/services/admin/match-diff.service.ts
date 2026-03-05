import type { DiffStatus, FieldDiff } from "@dragons/shared";

/** Fields that can be overridden (values written directly to matches table + match_overrides row) */
export const OVERRIDABLE_FIELDS = [
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
export const LOCAL_ONLY_FIELDS = [
  "venueId",
  "venueNameOverride",
  "anschreiber",
  "zeitnehmer",
  "shotclock",
  "internalNotes",
  "publicComment",
] as const;

export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];
export type LocalOnlyField = (typeof LOCAL_ONLY_FIELDS)[number];
export type AllEditableField = OverridableField | LocalOnlyField;

/** Minimal shape needed by computeDiffs — avoids coupling to the full DB row type. */
export interface DiffInput {
  kickoffDate: string;
  kickoffTime: string;
  venueNameOverride: string | null;
  venueName: string | null;
  isForfeited: boolean | null;
  isCancelled: boolean | null;
  anschreiber: string | null;
  zeitnehmer: string | null;
  shotclock: string | null;
  internalNotes: string | null;
  publicComment: string | null;
}

export function computeDiffs(
  row: DiffInput,
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
