"use client";

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
  const { runningSyncRunId, triggering, onSyncComplete } = useSyncContext();

  if (!runningSyncRunId && !triggering) return null;

  if (!runningSyncRunId) {
    return (
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <CardTitle>Live Sync Progress</CardTitle>
          </div>
          <CardDescription>Starting sync...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground">
            Preparing sync job...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <SyncLiveLogs syncRunId={runningSyncRunId} onComplete={onSyncComplete} />
  );
}
