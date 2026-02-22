export type SyncStatus = "pending" | "running" | "completed" | "failed";

export type EntityType =
  | "league"
  | "match"
  | "standing"
  | "team"
  | "venue"
  | "referee"
  | "refereeRole";

export type EntryAction = "created" | "updated" | "skipped" | "failed";

interface EntitySyncStats {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface SyncRunSummary {
  leagues: EntitySyncStats;
  teams: EntitySyncStats;
  matches: EntitySyncStats;
  standings: EntitySyncStats;
  venues: EntitySyncStats;
  referees: {
    created: number;
    updated: number;
    skipped: number;
    rolesUpdated: number;
    assignmentsCreated: number;
  };
}

export interface SyncRun {
  id: number;
  syncType: string;
  status: SyncStatus;
  triggeredBy: string;
  recordsProcessed: number | null;
  recordsCreated: number | null;
  recordsUpdated: number | null;
  recordsFailed: number | null;
  recordsSkipped: number | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  summary: SyncRunSummary | null;
  createdAt: string;
}

export interface SyncRunEntry {
  id: number;
  syncRunId: number;
  entityType: EntityType;
  entityId: string;
  entityName: string | null;
  action: EntryAction;
  message: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

export interface SyncStatusResponse {
  lastSync: SyncRun | null;
  isRunning: boolean;
}

export interface SyncRunEntriesResponse {
  items: SyncRunEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

export interface SyncJobData {
  type: string;
  triggeredBy?: string;
}

export interface Job {
  id: string | undefined;
  name: string;
  data: SyncJobData;
  status: string;
  progress: number | object;
  timestamp: number | undefined;
  processedOn: number | undefined;
  finishedOn: number | undefined;
  failedReason: string | undefined;
}

export interface JobsResponse {
  items: Job[];
  validStatuses: string[];
}

export interface LogsResponse {
  items: SyncRun[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SyncScheduleData {
  id: number | null;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}

export interface TriggerResponse {
  jobId: string;
  syncRunId: number;
  message: string;
}

export interface LiveLogEntry {
  entityType: EntityType;
  entityId: string;
  entityName: string | null;
  action: EntryAction;
  message: string | null;
  timestamp: string;
}
