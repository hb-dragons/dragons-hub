"use client";

import { useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { RefereeSyncRunContext } from "./use-sync";
import { queries } from "@/lib/swr-queries";
import { RefereeSyncStatusCards } from "./referee-sync-status-cards";
import { RefereeSyncHistoryTable } from "./sync-history-table";
import { RefereeSyncScheduleConfig } from "./referee-sync-schedule-config";
import { RefereeSyncTriggerButton } from "./referee-sync-trigger-button";
import type {
  SyncStatusResponse,
  PaginatedResponse,
  SyncRun,
  SyncScheduleData,
} from "./types";

function deriveRunningSyncRunId(
  status: SyncStatusResponse | null,
): number | null {
  if (status?.isRunning && status.lastSync?.status === "running") {
    return status.lastSync.id;
  }
  return null;
}

interface RefereeSyncRunProviderProps {
  initialStatus: SyncStatusResponse | null;
  initialLogs: PaginatedResponse<SyncRun> | null;
  initialSchedule: SyncScheduleData | null;
  children: ReactNode;
}

export function RefereeSyncRunProvider({
  initialStatus,
  initialLogs,
  initialSchedule,
  children,
}: RefereeSyncRunProviderProps) {
  const [runningSyncRunId, setRunningSyncRunId] = useState<number | null>(
    deriveRunningSyncRunId(initialStatus),
  );
  const [triggering, setTriggering] = useState(false);

  const statusQ = queries.refereeSyncStatus();
  const logsQ = queries.refereeSyncLogs(20, 0);
  const scheduleQ = queries.refereeSyncSchedule();

  return (
    <SWRConfig
      value={{
        fallback: {
          [statusQ.key]: initialStatus,
          [logsQ.key]: initialLogs,
          [scheduleQ.key]: initialSchedule,
        },
      }}
    >
      <RefereeSyncRunContext
        value={{
          runningSyncRunId,
          setRunningSyncRunId,
          triggering,
          setTriggering,
        }}
      >
        {children}
      </RefereeSyncRunContext>
    </SWRConfig>
  );
}

export function RefereeSyncTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <RefereeSyncTriggerButton />
      </div>
      <RefereeSyncStatusCards />
      <RefereeSyncHistoryTable />
      <RefereeSyncScheduleConfig />
    </div>
  );
}
