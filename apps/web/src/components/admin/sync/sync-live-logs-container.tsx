"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Loader2 } from "lucide-react";
import { SyncLiveLogs } from "./sync-live-logs";
import { useSyncContext } from "./sync-provider";

export function SyncLiveLogsContainer() {
  const t = useTranslations();
  const { runningSyncRunId, triggering, onSyncComplete } = useSyncContext();

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
