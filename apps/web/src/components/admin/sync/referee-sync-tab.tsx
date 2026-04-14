"use client";

import { useState, useCallback, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SWRConfig } from "swr";
import { useSWRConfig } from "swr";
import { Button } from "@dragons/ui/components/button";
import { Loader2, Play } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import {
  RefereeSyncRunContext,
  useRefereeSyncRunContext,
  useRefereeSyncStatus,
  useTriggerRefereeSync,
  RefereeSyncCompletionWatcher,
} from "./use-sync";
import { RefereeSyncStatusCards } from "./referee-sync-status-cards";
import { SyncLiveLogs } from "./sync-live-logs";
import { RefereeSyncHistoryTable } from "./sync-history-table";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { SyncStatusResponse, PaginatedResponse, SyncRun } from "./types";

// --- Internal helpers ---

function deriveRunningSyncRunId(
  status: SyncStatusResponse | null,
): number | null {
  if (status?.isRunning && status.lastSync?.status === "running") {
    return status.lastSync.id;
  }
  return null;
}

// --- RefereeSyncRunProvider ---

interface RefereeSyncRunProviderProps {
  initialStatus: SyncStatusResponse | null;
  initialLogs: PaginatedResponse<SyncRun> | null;
  children: ReactNode;
}

function RefereeSyncRunProvider({
  initialStatus,
  initialLogs,
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
        },
      }}
    >
      <RefereeSyncRunContext
        value={{ runningSyncRunId, setRunningSyncRunId, triggering, setTriggering }}
      >
        {children}
      </RefereeSyncRunContext>
    </SWRConfig>
  );
}

// --- RefereeSyncTriggerButton ---

function RefereeSyncTriggerButton() {
  const t = useTranslations();
  const { isRunning } = useRefereeSyncStatus();
  const { triggering } = useRefereeSyncRunContext();
  const { trigger } = useTriggerRefereeSync();

  return (
    <Button onClick={trigger} disabled={isRunning || triggering}>
      {triggering ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Play className="mr-2 h-4 w-4" />
      )}
      {t("refereeGames.syncButton")}
    </Button>
  );
}

// --- RefereeSyncLiveLogsContainer ---

function RefereeSyncLiveLogsContainer() {
  const t = useTranslations();
  const { runningSyncRunId, triggering } = useRefereeSyncRunContext();
  const { mutate } = useSWRConfig();

  const onSyncComplete = useCallback(() => {
    void mutate(SWR_KEYS.refereeSyncStatus);
    void mutate(SWR_KEYS.refereeSyncLogs(20, 0));
  }, [mutate]);

  if (!runningSyncRunId && !triggering) return null;

  if (!runningSyncRunId) {
    return (
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <CardTitle>{t("sync.live.title")}</CardTitle>
          </div>
          <CardDescription>{t("sync.live.starting")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground">
            {t("sync.live.preparing")}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <SyncLiveLogs syncRunId={runningSyncRunId} onComplete={onSyncComplete} />
  );
}

// --- Exported RefereeSyncTab ---

interface RefereeSyncTabProps {
  initialStatus: SyncStatusResponse | null;
  initialLogs: PaginatedResponse<SyncRun> | null;
}

export function RefereeSyncTab({
  initialStatus,
  initialLogs,
}: RefereeSyncTabProps) {
  return (
    <RefereeSyncRunProvider initialStatus={initialStatus} initialLogs={initialLogs}>
      <RefereeSyncCompletionWatcher />
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <RefereeSyncTriggerButton />
        </div>
        <RefereeSyncStatusCards />
        <RefereeSyncLiveLogsContainer />
        <RefereeSyncHistoryTable />
      </div>
    </RefereeSyncRunProvider>
  );
}
