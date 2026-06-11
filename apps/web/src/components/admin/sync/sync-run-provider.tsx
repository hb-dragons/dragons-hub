"use client";

import { useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { SyncRunContext } from "./use-sync";
import type {
  SyncStatusResponse,
  PaginatedResponse,
  SyncRun,
  SyncScheduleData,
} from "./types";
import { queries } from "@/lib/swr-queries";

function deriveRunningSyncRunId(
  status: SyncStatusResponse | null,
): number | null {
  if (status?.isRunning && status.lastSync?.status === "running") {
    return status.lastSync.id;
  }
  return null;
}

interface SyncRunProviderProps {
  initialStatus: SyncStatusResponse | null;
  initialLogs: PaginatedResponse<SyncRun> | null;
  initialSchedule: SyncScheduleData | null;
  children: ReactNode;
}

export function SyncRunProvider({
  initialStatus,
  initialLogs,
  initialSchedule,
  children,
}: SyncRunProviderProps) {
  const [runningSyncRunId, setRunningSyncRunId] = useState<number | null>(
    deriveRunningSyncRunId(initialStatus),
  );
  const [triggering, setTriggering] = useState(false);

  const statusQ = queries.syncStatus();
  const logsQ = queries.syncLogs(20, 0);
  const scheduleQ = queries.syncSchedule();

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
      <SyncRunContext
        value={{ runningSyncRunId, setRunningSyncRunId, triggering, setTriggering }}
      >
        {children}
      </SyncRunContext>
    </SWRConfig>
  );
}
