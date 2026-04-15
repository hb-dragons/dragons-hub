"use client";

import { useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { RefereeSyncRunContext } from "./use-sync";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeSyncStatusCards } from "./referee-sync-status-cards";
import { SyncHistoryTable } from "./sync-history-table";
import { RefereeSyncScheduleConfig } from "./referee-sync-schedule-config";
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

  return (
    <SWRConfig
      value={{
        fallback: {
          [SWR_KEYS.refereeSyncStatus]: initialStatus,
          [SWR_KEYS.refereeSyncLogs(20, 0)]: initialLogs,
          [SWR_KEYS.refereeSyncSchedule]: initialSchedule,
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
      <RefereeSyncStatusCards />
      <SyncHistoryTable />
      <RefereeSyncScheduleConfig />
    </div>
  );
}
