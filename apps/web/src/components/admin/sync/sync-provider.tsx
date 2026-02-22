"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import type {
  SyncStatusResponse,
  LogsResponse,
  SyncScheduleData,
  SyncRun,
  TriggerResponse,
} from "./types";

const POLL_INTERVAL_IDLE = 15000;
const POLL_INTERVAL_ACTIVE = 3000;

interface SyncContextValue {
  status: SyncStatusResponse | null;
  logs: SyncRun[];
  logsHasMore: boolean;
  schedule: SyncScheduleData | null;
  error: string | null;
  triggering: boolean;
  loadingMore: boolean;
  runningSyncRunId: number | null;
  isRunning: boolean;
  triggerSync: () => Promise<void>;
  loadMoreLogs: () => Promise<void>;
  updateSchedule: (schedule: SyncScheduleData) => void;
  refreshData: () => Promise<void>;
  onSyncComplete: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSyncContext must be used within a SyncProvider");
  }
  return ctx;
}

function deriveRunningSyncRunId(
  status: SyncStatusResponse | null,
): number | null {
  if (status?.isRunning && status.lastSync?.status === "running") {
    return status.lastSync.id;
  }
  return null;
}

interface SyncProviderProps {
  initialStatus: SyncStatusResponse | null;
  initialLogs: LogsResponse | null;
  initialSchedule: SyncScheduleData | null;
  initialError: string | null;
  children: ReactNode;
}

export function SyncProvider({
  initialStatus,
  initialLogs,
  initialSchedule,
  initialError,
  children,
}: SyncProviderProps) {
  const [status, setStatus] = useState(initialStatus);
  const [logs, setLogs] = useState<SyncRun[]>(initialLogs?.items ?? []);
  const [logsHasMore, setLogsHasMore] = useState(
    initialLogs?.hasMore ?? false,
  );
  const [schedule, setSchedule] = useState(initialSchedule);
  const [error, setError] = useState(initialError);
  const [triggering, setTriggering] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [runningSyncRunId, setRunningSyncRunId] = useState<number | null>(
    deriveRunningSyncRunId(initialStatus),
  );
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);
  const consecutiveFailsRef = useRef(0);

  const refreshData = useCallback(async () => {
    try {
      const [newStatus, newLogs] = await Promise.all([
        fetchAPI<SyncStatusResponse>("/admin/sync/status"),
        fetchAPI<LogsResponse>("/admin/sync/logs?limit=20&offset=0"),
      ]);
      setStatus(newStatus);
      setLogs(newLogs.items);
      setLogsHasMore(newLogs.hasMore);
      setError(null);
      consecutiveFailsRef.current = 0;

      // If server confirms a sync is running, track it
      if (newStatus.isRunning && newStatus.lastSync?.status === "running") {
        setRunningSyncRunId(newStatus.lastSync.id);
      }
      // Never clear runningSyncRunId here — onSyncComplete (SSE) handles
      // dismissing the live logs card. The fallback effect below handles
      // the case where SSE misses the "complete" event.
    } catch {
      consecutiveFailsRef.current += 1;
      if (consecutiveFailsRef.current === 3) {
        toast.error("Lost connection to API", {
          description: "Data may be stale. Retrying in the background.",
        });
      }
      setError("Failed to connect to API");
    }
  }, []);

  // Consider sync "running" if either the server says so OR we just triggered one
  const isRunning = (status?.isRunning ?? false) || runningSyncRunId !== null;

  // Smart polling: faster when running, slower when idle, pauses when tab hidden
  useEffect(() => {
    const interval = isRunning ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;

    function startPolling() {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(refreshData, interval);
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stopPolling();
      } else {
        refreshData();
        startPolling();
      }
    }

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshData, isRunning]);

  // Clear runningSyncRunId once the tracked run is actually done according
  // to polled server data. This is the single source of truth for dismissing
  // the live logs card — neither refreshData nor onSyncComplete clear it
  // directly, because the SSE endpoint may send "complete" before the sync
  // job has even started processing in the queue.
  useEffect(() => {
    if (runningSyncRunId === null) return;
    const trackedRun = logs.find((r) => r.id === runningSyncRunId);
    if (
      trackedRun &&
      trackedRun.status !== "running" &&
      trackedRun.status !== "pending"
    ) {
      setRunningSyncRunId(null);
    }
  }, [runningSyncRunId, logs]);

  const triggerSync = useCallback(async () => {
    try {
      setTriggering(true);
      const result = await fetchAPI<TriggerResponse>("/admin/sync/trigger", {
        method: "POST",
      });

      // Optimistic update — show the new run immediately without waiting
      // for the next poll. Polling at 3s will replace this with real data.
      const now = new Date().toISOString();
      const optimisticRun: SyncRun = {
        id: result.syncRunId,
        syncType: "full",
        status: "running",
        triggeredBy: "manual",
        recordsProcessed: null,
        recordsCreated: null,
        recordsUpdated: null,
        recordsFailed: null,
        recordsSkipped: null,
        startedAt: now,
        completedAt: null,
        durationMs: null,
        errorMessage: null,
        errorStack: null,
        summary: null,
        createdAt: now,
      };

      setRunningSyncRunId(result.syncRunId);
      setStatus({ isRunning: true, lastSync: optimisticRun });
      setLogs((prev) => [
        optimisticRun,
        ...prev.filter((r) => r.id !== optimisticRun.id),
      ]);
    } catch {
      toast.error("Failed to trigger sync");
      setError("Failed to trigger sync");
    } finally {
      setTriggering(false);
    }
  }, []);

  const onSyncComplete = useCallback(() => {
    // Don't clear runningSyncRunId here — the SSE endpoint may fire
    // "complete" before the job has started processing. The effect above
    // clears it once the polled data confirms the run is actually done.
    refreshData();
  }, [refreshData]);

  const loadMoreLogs = useCallback(async () => {
    try {
      setLoadingMore(true);
      const offset = logs.length;
      const data = await fetchAPI<LogsResponse>(
        `/admin/sync/logs?limit=20&offset=${offset}`,
      );
      setLogs((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        return [
          ...prev,
          ...data.items.filter((r) => !existingIds.has(r.id)),
        ];
      });
      setLogsHasMore(data.hasMore);
    } catch {
      toast.error("Failed to load more logs");
    } finally {
      setLoadingMore(false);
    }
  }, [logs.length]);

  const value: SyncContextValue = {
    status,
    logs,
    logsHasMore,
    schedule,
    error,
    triggering,
    loadingMore,
    runningSyncRunId,
    isRunning,
    triggerSync,
    loadMoreLogs,
    updateSchedule: setSchedule,
    refreshData,
    onSyncComplete,
  };

  return <SyncContext value={value}>{children}</SyncContext>;
}
