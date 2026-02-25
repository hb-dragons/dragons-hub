"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Loader2 } from "lucide-react";
import { SyncLiveLogs } from "./sync-live-logs";
import { useSyncRunContext } from "./use-sync";
import { SWR_KEYS } from "@/lib/swr-keys";

export function SyncLiveLogsContainer() {
  const t = useTranslations();
  const { runningSyncRunId, triggering } = useSyncRunContext();
  const { mutate } = useSWRConfig();

  const onSyncComplete = useCallback(() => {
    // Don't clear runningSyncRunId here — the SSE endpoint may fire
    // "complete" before the job has started processing. The SyncCompletionWatcher
    // clears it once polled data confirms the run is actually done.
    void mutate(SWR_KEYS.syncStatus);
    void mutate(SWR_KEYS.syncLogs(20, 0));
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
