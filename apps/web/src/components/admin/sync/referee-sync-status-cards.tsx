"use client";

import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Activity, Clock, Timer, Calendar } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type { SyncScheduleData, SyncRun } from "./types";
import { useRefereeSyncStatus, useRefereeSyncSchedule } from "./use-sync";
import { formatDuration } from "./utils";

export function RefereeSyncStatusCards() {
  const t = useTranslations();
  const format = useFormatter();

  const [now, setNow] = useState(() => Date.now());

  // Tick relative times every 30s so they stay fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function getNextRunLabel(
    lastSync: Pick<SyncRun, "completedAt" | "status"> | null,
    sched: SyncScheduleData | null,
  ): string {
    if (!sched?.enabled) return t("sync.status.disabled");
    if (!sched.intervalMinutes) return t("sync.status.disabled");
    if (!lastSync?.completedAt) return t("sync.refereeSchedule.startingSoon");

    const lastCompleted = new Date(lastSync.completedAt).getTime();
    const nextRun = lastCompleted + sched.intervalMinutes * 60 * 1000;
    const diffMs = nextRun - now;

    if (diffMs <= 0) return t("sync.refereeSchedule.startingSoon");
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    return t("sync.status.inMinutes", { minutes: String(diffMinutes) });
  }
  const { status, isRunning } = useRefereeSyncStatus();
  const { schedule } = useRefereeSyncSchedule();
  const lastSync = status?.lastSync;


  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            </>
          ) : (
            <div className="text-2xl font-bold text-muted-foreground">
              {t("sync.status.never")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.nextSync")}</CardTitle>
          <Timer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold",
              schedule?.enabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {getNextRunLabel(lastSync ?? null, schedule)}
          </div>
          {schedule?.enabled && schedule.intervalMinutes && (
            <p className="text-xs text-muted-foreground">
              {t("sync.refereeSchedule.everyNMinutes", { minutes: String(schedule.intervalMinutes) })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.schedule")}</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold",
              schedule?.enabled ? "text-green-600" : "text-muted-foreground",
            )}
          >
            {schedule?.enabled ? t("sync.status.enabled") : t("sync.status.disabled")}
          </div>
          {schedule?.intervalMinutes && (
            <p className="text-xs text-muted-foreground">
              {t("sync.refereeSchedule.everyNMinutes", { minutes: String(schedule.intervalMinutes) })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
