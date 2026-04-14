export {
  matchFormSchema,
  type MatchFormValues,
  type DiffStatus,
  type FieldDiff,
  type OverrideInfo,
  type MatchListItem,
  type MatchDetail,
  type MatchDetailResponse,
  type MatchFieldChange,
  type MatchChangesResponse,
  type MatchChangeHistoryItem,
  type MatchChangeHistoryResponse,
  type PaginatedResponse,
} from "@dragons/shared";

// Web-only types
export interface MatchFilters {
  teamNames?: string[];
  dateFrom?: string;
  dateTo?: string;
}
