"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Activity, Clock, Timer, Calendar } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type { SyncScheduleData } from "./types";
import { useSyncStatus, useSyncSchedule } from "./use-sync";
import { formatDuration } from "./utils";

export function SyncStatusCards() {
  const t = useTranslations();
  const { status } = useSyncStatus();
  const { schedule } = useSyncSchedule();
  const isRunning = status?.isRunning ?? false;
  const lastSync = status?.lastSync;

  // Tick relative times every 30s so they stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const cronHour = (cron: string) => cron.split(" ")[1]?.padStart(2, "0") ?? "04";

  function getNextRunLabel(sched: SyncScheduleData | null): string {
    if (!sched?.enabled) return t("sync.status.disabled");

    try {
      const parts = sched.cronExpression.split(" ");
      const hour = parseInt(parts[1] ?? "4", 10);

      const now = new Date();
      const nowInTz = new Date(
        now.toLocaleString("en-US", { timeZone: sched.timezone }),
      );
      const next = new Date(nowInTz);
      next.setHours(hour, 0, 0, 0);
      if (next <= nowInTz) {
        next.setDate(next.getDate() + 1);
      }

      const diffMs = next.getTime() - nowInTz.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (diffHours === 0) return t("sync.status.inMinutes", { minutes: String(diffMinutes) });
      if (diffHours < 24) return t("sync.status.inHours", { hours: String(diffHours), minutes: String(diffMinutes) });
      return t("sync.status.tomorrow");
    } catch {
      return t("sync.schedule.cronFormat", { hour: cronHour(sched.cronExpression) });
    }
  }

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
                {new Date(lastSync.startedAt).toLocaleString()} &middot;{" "}
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
            {getNextRunLabel(schedule)}
          </div>
          {schedule?.enabled && (
            <p className="text-xs text-muted-foreground">
              {t("sync.schedule.cronFormat", { hour: cronHour(schedule.cronExpression) })} ({schedule.timezone})
            </p>
          )}
        </CardContent>
      </Card>

      {/* Scheduled Sync */}
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
          {schedule && (
            <p className="text-xs text-muted-foreground">
              {t("sync.schedule.cronFormat", { hour: cronHour(schedule.cronExpression) })} ({schedule.timezone})
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
