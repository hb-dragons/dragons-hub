"use client";

import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Activity, Clock } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import { useRefereeSyncStatus } from "./use-sync";
import { formatDuration } from "./utils";

export function RefereeSyncStatusCards() {
  const t = useTranslations();
  const format = useFormatter();
  const { status, isRunning } = useRefereeSyncStatus();
  const lastSync = status?.lastSync;

  // Tick relative times every 30s so they stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Current Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.current")}</CardTitle>
          <Activity
            className={cn(
              "h-4 w-4 text-muted-foreground",
              isRunning && "animate-pulse text-blue-500",
            )}
          />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isRunning ? (
              <span className="text-blue-500">{t("sync.status.running")}</span>
            ) : (
              t("sync.status.idle")
            )}
          </div>
          {isRunning && lastSync && (
            <p className="text-xs text-muted-foreground">
              {t("sync.status.type", { type: lastSync.syncType })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Last Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.lastSync")}</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {lastSync && lastSync.status !== "running" ? (
            <>
              <div
                className={cn(
                  "text-2xl font-bold",
                  lastSync.status === "completed"
                    ? "text-green-600"
                    : lastSync.status === "failed"
                      ? "text-red-600"
                      : "",
                )}
              >
                {lastSync.status === "completed"
                  ? t("sync.status.success")
                  : lastSync.status === "failed"
                    ? t("sync.status.failed")
                    : lastSync.status}
              </div>
              <p className="text-xs text-muted-foreground">
                {format.dateTime(new Date(lastSync.startedAt), "full")} &middot;{" "}
                {formatDuration(lastSync.durationMs)}
              </p>
              {(lastSync.recordsCreated != null ||
                lastSync.recordsUpdated != null ||
                lastSync.recordsSkipped != null) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    lastSync.recordsCreated != null &&
                      t("sync.live.created", { count: String(lastSync.recordsCreated) }),
                    lastSync.recordsUpdated != null &&
                      t("sync.live.updated", { count: String(lastSync.recordsUpdated) }),
                    lastSync.recordsSkipped != null &&
                      t("sync.live.skipped", { count: String(lastSync.recordsSkipped) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </>
          ) : (
            <div className="text-2xl font-bold text-muted-foreground">
              {t("sync.status.never")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
