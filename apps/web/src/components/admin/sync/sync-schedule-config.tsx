"use client";

import { useState } from "react";
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
import { useSyncContext } from "./sync-provider";

const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);

const TIMEZONES = [
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "America/New_York", label: "New York (EST)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST)" },
  { value: "UTC", label: "UTC" },
];

function cronToHour(cron: string): string {
  const parts = cron.split(" ");
  return parts[1]?.padStart(2, "0") ?? "04";
}

function hourToCron(hour: string): string {
  return `0 ${parseInt(hour, 10)} * * *`;
}

export function SyncScheduleConfig() {
  const { schedule, updateSchedule: onUpdated } = useSyncContext();
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [hour, setHour] = useState(
    cronToHour(schedule?.cronExpression ?? "0 4 * * *"),
  );
  const [timezone, setTimezone] = useState(
    schedule?.timezone ?? "Europe/Berlin",
  );
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">(
    "idle",
  );

  const hasChanges =
    enabled !== (schedule?.enabled ?? true) ||
    hour !== cronToHour(schedule?.cronExpression ?? "0 4 * * *") ||
    timezone !== (schedule?.timezone ?? "Europe/Berlin");

  async function handleSave() {
    try {
      setSaving(true);
      setSaveState("idle");

      const updated = await fetchAPI<SyncScheduleData>(
        "/admin/sync/schedule",
        {
          method: "PUT",
          body: JSON.stringify({
            enabled,
            cronExpression: hourToCron(hour),
            timezone,
          }),
        },
      );

      onUpdated(updated);
      setSaveState("success");
      toast.success("Schedule updated");
    } catch {
      setSaveState("error");
      toast.error("Failed to save schedule");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Settings</CardTitle>
        <CardDescription>
          Configure the automatic sync schedule
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="schedule-enabled">Automatic Sync</Label>
            <p className="text-sm text-muted-foreground">
              Run sync automatically on a daily schedule
            </p>
          </div>
          <Switch
            id="schedule-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Sync Time */}
        <div className="space-y-2">
          <Label>Sync Time</Label>
          <Select value={hour} onValueChange={setHour} disabled={!enabled}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select
            value={timezone}
            onValueChange={setTimezone}
            disabled={!enabled}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
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
              ? "Saving..."
              : saveState === "success"
                ? "Saved"
                : saveState === "error"
                  ? "Failed"
                  : "Save Changes"}
          </Button>
          {hasChanges && (
            <span className="text-sm text-yellow-600">Unsaved changes</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
