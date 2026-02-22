"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Activity, Clock, Timer, Calendar } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type { SyncScheduleData } from "./types";
import { useSyncContext } from "./sync-provider";
import { formatDuration, formatRelativeTime, formatCron } from "./utils";

function getNextRunLabel(schedule: SyncScheduleData | null): string {
  if (!schedule?.enabled) return "Disabled";

  try {
    const parts = schedule.cronExpression.split(" ");
    const hour = parseInt(parts[1] ?? "4", 10);

    const now = new Date();
    const nowInTz = new Date(
      now.toLocaleString("en-US", { timeZone: schedule.timezone }),
    );
    const next = new Date(nowInTz);
    next.setHours(hour, 0, 0, 0);
    if (next <= nowInTz) {
      next.setDate(next.getDate() + 1);
    }

    const diffMs = next.getTime() - nowInTz.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours === 0) return `in ${diffMinutes}m`;
    if (diffHours < 24) return `in ${diffHours}h ${diffMinutes}m`;
    return "tomorrow";
  } catch {
    return formatCron(schedule.cronExpression);
  }
}

export function SyncStatusCards() {
  const { status, schedule } = useSyncContext();
  const isRunning = status?.isRunning ?? false;
  const lastSync = status?.lastSync;

  // Tick relative times every 30s so they stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Current Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Current Status</CardTitle>
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
              <span className="text-blue-500">Running</span>
            ) : (
              "Idle"
            )}
          </div>
          {isRunning && lastSync && (
            <p className="text-xs text-muted-foreground">
              Type: {lastSync.syncType}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Last Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
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
                  ? "Success"
                  : lastSync.status === "failed"
                    ? "Failed"
                    : lastSync.status}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(lastSync.startedAt)} &middot;{" "}
                {formatDuration(lastSync.durationMs)}
              </p>
            </>
          ) : (
            <div className="text-2xl font-bold text-muted-foreground">
              Never
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Next Sync</CardTitle>
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
              {formatCron(schedule.cronExpression)} ({schedule.timezone})
            </p>
          )}
        </CardContent>
      </Card>

      {/* Scheduled Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Schedule</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold",
              schedule?.enabled ? "text-green-600" : "text-muted-foreground",
            )}
          >
            {schedule?.enabled ? "Enabled" : "Disabled"}
          </div>
          {schedule && (
            <p className="text-xs text-muted-foreground">
              {formatCron(schedule.cronExpression)} ({schedule.timezone})
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
