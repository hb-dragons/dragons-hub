"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
} from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import type {
  SyncStatusResponse,
  PaginatedResponse,
  SyncScheduleData,
  SyncRun,
  TriggerResponse,
} from "./types";

// --- Minimal context for sync run tracking ---

interface SyncRunContextValue {
  runningSyncRunId: number | null;
  setRunningSyncRunId: (id: number | null) => void;
  triggering: boolean;
  setTriggering: (v: boolean) => void;
}

export const SyncRunContext = createContext<SyncRunContextValue | null>(null);

export function useSyncRunContext() {
  const ctx = useContext(SyncRunContext);
  if (!ctx) throw new Error("useSyncRunContext requires SyncRunProvider");
  return ctx;
}

// --- SWR hooks ---

export function useSyncStatus() {
  const { runningSyncRunId } = useSyncRunContext();
  const isLocalRunning = runningSyncRunId !== null;

  const { data, error, mutate } = useSWR<SyncStatusResponse>(
    SWR_KEYS.syncStatus,
    apiFetcher,
    {
      refreshInterval: isLocalRunning ? 3000 : 15000,
      revalidateOnFocus: true,
    },
  );

  // Derive isRunning from both server state and local tracking
  const serverRunning = data?.isRunning ?? false;
  const isRunning = serverRunning || isLocalRunning;

  return { status: data ?? null, error, isRunning, mutate };
}

export function useSyncLogs() {
  const { runningSyncRunId } = useSyncRunContext();
  const isRunning = runningSyncRunId !== null;

  const { data, error, mutate, isLoading } = useSWR<PaginatedResponse<SyncRun>>(
    SWR_KEYS.syncLogs(20, 0),
    apiFetcher,
    {
      refreshInterval: isRunning ? 3000 : 15000,
      revalidateOnFocus: true,
    },
  );

  return {
    logs: data?.items ?? [],
    hasMore: data?.hasMore ?? false,
    error,
    isLoading,
    mutate,
  };
}

export function useSyncSchedule() {
  const { data, error, mutate } = useSWR<SyncScheduleData>(
    SWR_KEYS.syncSchedule,
    apiFetcher,
  );

  return { schedule: data ?? null, error, mutate };
}

export function useTriggerSync() {
  const t = useTranslations();
  const { setRunningSyncRunId, setTriggering } = useSyncRunContext();
  const { mutate: mutateStatus } = useSyncStatus();
  const { mutate: mutateLogs } = useSyncLogs();

  const trigger = useCallback(async () => {
    try {
      setTriggering(true);
      const result = await fetchAPI<TriggerResponse>("/admin/sync/trigger", {
        method: "POST",
      });

      setRunningSyncRunId(result.syncRunId);

      // Optimistic: tell SWR the status is now running
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

      await mutateStatus(
        { isRunning: true, lastSync: optimisticRun },
        { revalidate: false },
      );
      await mutateLogs(
        (current) => {
          const items = current?.items ?? [];
          return {
            ...current!,
            items: [
              optimisticRun,
              ...items.filter((r) => r.id !== result.syncRunId),
            ],
            hasMore: current?.hasMore ?? false,
          };
        },
        { revalidate: false },
      );
    } catch {
      toast.error(t("sync.toast.triggerFailed"));
    } finally {
      setTriggering(false);
    }
  }, [t, setRunningSyncRunId, setTriggering, mutateStatus, mutateLogs]);

  return { trigger };
}

// Watcher component that clears runningSyncRunId when the tracked run is done
export function SyncCompletionWatcher() {
  const { runningSyncRunId, setRunningSyncRunId } = useSyncRunContext();
  const { logs } = useSyncLogs();

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
  }, [runningSyncRunId, logs, setRunningSyncRunId]);

  return null;
}
