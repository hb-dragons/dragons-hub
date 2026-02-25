import { z } from "zod";

export const matchFormSchema = z.object({
  kickoffDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .nullable()
    .optional(),
  kickoffTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be HH:MM or HH:MM:SS")
    .nullable()
    .optional(),
  isForfeited: z.boolean().nullable().optional(),
  isCancelled: z.boolean().nullable().optional(),
  venueNameOverride: z.string().max(200).nullable().optional(),
  anschreiber: z.string().max(100).nullable().optional(),
  zeitnehmer: z.string().max(100).nullable().optional(),
  shotclock: z.string().max(100).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
  publicComment: z.string().max(500).nullable().optional(),
});

export type MatchFormValues = z.infer<typeof matchFormSchema>;

export type DiffStatus = "diverged" | "synced" | "local-only";

export interface FieldDiff {
  field: string;
  label: string;
  remoteValue: string | null;
  localValue: string | null;
  status: DiffStatus;
}

export interface OverrideInfo {
  fieldName: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
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
  lastRemoteSync: string | null;
  createdAt: string;
  updatedAt: string;
  overrides: OverrideInfo[];
}

export interface MatchDetailResponse {
  match: MatchDetail;
  diffs: FieldDiff[];
}

export interface MatchListResponse {
  items: MatchListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MatchFilters {
  teamNames?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface MatchUpdateData {
  kickoffDate?: string | null;
  kickoffTime?: string | null;
  isForfeited?: boolean | null;
  isCancelled?: boolean | null;
  venueNameOverride?: string | null;
  anschreiber?: string | null;
  zeitnehmer?: string | null;
  shotclock?: string | null;
  internalNotes?: string | null;
  publicComment?: string | null;
}
