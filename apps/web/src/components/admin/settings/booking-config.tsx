"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface BookingSettings {
  bufferBefore: number;
  bufferAfter: number;
  gameDuration: number;
  dueDaysBefore: number;
}

const DEFAULTS: BookingSettings = {
  bufferBefore: 60,
  bufferAfter: 60,
  gameDuration: 90,
  dueDaysBefore: 7,
};

export function BookingConfig() {
  const t = useTranslations();
  const { data: settings } = useSWR<BookingSettings>(
    SWR_KEYS.settingsBooking,
    apiFetcher,
  );
  const { mutate } = useSWRConfig();

  const [bufferBefore, setBufferBefore] = useState(DEFAULTS.bufferBefore.toString());
  const [bufferAfter, setBufferAfter] = useState(DEFAULTS.bufferAfter.toString());
  const [gameDuration, setGameDuration] = useState(DEFAULTS.gameDuration.toString());
  const [dueDays, setDueDays] = useState(DEFAULTS.dueDaysBefore.toString());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setBufferBefore(settings.bufferBefore.toString());
      setBufferAfter(settings.bufferAfter.toString());
      setGameDuration(settings.gameDuration.toString());
      setDueDays(settings.dueDaysBefore.toString());
    }
  }, [settings]);

  const hasChanges =
    settings &&
    (bufferBefore !== settings.bufferBefore.toString() ||
      bufferAfter !== settings.bufferAfter.toString() ||
      gameDuration !== settings.gameDuration.toString() ||
      dueDays !== settings.dueDaysBefore.toString());

  async function handleSave() {
    setSaving(true);
    try {
      const result = await fetchAPI<BookingSettings>(
        "/admin/settings/booking",
        {
          method: "PUT",
          body: JSON.stringify({
            bufferBefore: parseInt(bufferBefore, 10),
            bufferAfter: parseInt(bufferAfter, 10),
            gameDuration: parseInt(gameDuration, 10),
            dueDaysBefore: parseInt(dueDays, 10),
          }),
        },
      );
      await mutate(SWR_KEYS.settingsBooking, result, { revalidate: false });
      toast.success(t("common.saved"));
    } catch {
      toast.error(t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.booking.title")}</CardTitle>
        <CardDescription>{t("settings.booking.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid max-w-sm gap-4">
          <div className="space-y-2">
            <Label htmlFor="buffer-before">
              {t("settings.booking.bufferBefore")}
            </Label>
            <Input
              id="buffer-before"
              type="number"
              min={0}
              value={bufferBefore}
              onChange={(e) => setBufferBefore(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buffer-after">
              {t("settings.booking.bufferAfter")}
            </Label>
            <Input
              id="buffer-after"
              type="number"
              min={0}
              value={bufferAfter}
              onChange={(e) => setBufferAfter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="game-duration">
              {t("settings.booking.gameDuration")}
            </Label>
            <Input
              id="game-duration"
              type="number"
              min={1}
              value={gameDuration}
              onChange={(e) => setGameDuration(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="due-days">
              {t("settings.booking.dueDaysBefore")}
            </Label>
            <Input
              id="due-days"
              type="number"
              min={0}
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-fit"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
