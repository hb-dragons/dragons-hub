"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Label } from "@dragons/ui/components/label";
import { Switch } from "@dragons/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import type { SyncScheduleData } from "./types";
import { useRefereeSyncSchedule } from "./use-sync";

const INTERVAL_MINUTES = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440];

function formatIntervalLabel(
  t: ReturnType<typeof useTranslations>,
  minutes: number,
): string {
  if (minutes >= 1440) return t("sync.refereeSchedule.daily");
  if (minutes >= 60 && minutes % 60 === 0) {
    return t("sync.refereeSchedule.everyNHours", { hours: minutes / 60 });
  }
  return t("sync.refereeSchedule.everyNMinutes", { minutes });
}

export function RefereeSyncScheduleConfig() {
  const t = useTranslations();
  const { schedule, mutate: scheduleMutate } = useRefereeSyncSchedule();
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [interval, setInterval] = useState(
    String(schedule?.intervalMinutes ?? 30),
  );
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">(
    "idle",
  );

  // Sync local state when SWR data arrives (e.g. after initial fetch)
  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.enabled);
      setInterval(String(schedule.intervalMinutes ?? 30));
    }
  }, [schedule]);

  const hasChanges =
    enabled !== (schedule?.enabled ?? true) ||
    interval !== String(schedule?.intervalMinutes ?? 30);

  async function handleSave() {
    try {
      setSaving(true);
      setSaveState("idle");

      const updated = await fetchAPI<SyncScheduleData>(
        "/admin/sync/schedule",
        {
          method: "PUT",
          body: JSON.stringify({
            syncType: "referee-games",
            enabled,
            intervalMinutes: parseInt(interval, 10),
          }),
        },
      );

      await scheduleMutate(updated, { revalidate: false });
      setSaveState("success");
      toast.success(t("sync.schedule.toast.updated"));
    } catch {
      setSaveState("error");
      toast.error(t("sync.schedule.toast.updateFailed"));
    } finally {
      setSaving(false);
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sync.refereeSchedule.title")}</CardTitle>
        <CardDescription>
          {t("sync.refereeSchedule.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="referee-schedule-enabled">
              {t("sync.schedule.enabledLabel")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("sync.refereeSchedule.intervalDescription")}
            </p>
          </div>
          <Switch
            id="referee-schedule-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Interval */}
        <div className="space-y-2">
          <Label>{t("sync.refereeSchedule.intervalLabel")}</Label>
          <Select
            value={interval}
            onValueChange={setInterval}
            disabled={!enabled}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_MINUTES.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {formatIntervalLabel(t, minutes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : saveState === "success" ? (
              <Check className="mr-2 h-4 w-4" />
            ) : saveState === "error" ? (
              <AlertCircle className="mr-2 h-4 w-4" />
            ) : null}
            {saving
              ? t("common.saving")
              : saveState === "success"
                ? t("common.saved")
                : saveState === "error"
                  ? t("common.failed")
                  : t("common.saveChanges")}
          </Button>
          {hasChanges && (
            <span className="text-sm text-yellow-600">
              {t("common.unsavedChanges")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
