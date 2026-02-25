"use client";

import { useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { SyncRunContext } from "./use-sync";
import type {
  SyncStatusResponse,
  LogsResponse,
  SyncScheduleData,
} from "./types";
import { SWR_KEYS } from "@/lib/swr-keys";

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
  initialLogs: LogsResponse | null;
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

  return (
    <SWRConfig
      value={{
        fallback: {
          [SWR_KEYS.syncStatus]: initialStatus,
          [SWR_KEYS.syncLogs(20, 0)]: initialLogs,
          [SWR_KEYS.syncSchedule]: initialSchedule,
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
