"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { USER_TOGGLEABLE_EVENTS } from "@dragons/shared";
import type { NotificationPreferences } from "@dragons/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Label } from "@dragons/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";

type Prefs = NotificationPreferences;

export function MyNotificationsCard() {
  const t = useTranslations("settings.myNotifications");
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    api.notifications.getPreferences().then(setPrefs).catch(() => {
      toast.error(t("saveError"));
    });
  }, [t]);

  async function patch(next: Prefs) {
    const previous = prefs;
    setPrefs(next);
    try {
      const saved = await api.notifications.updatePreferences(next);
      setPrefs(saved);
      toast.success(t("saveSuccess"));
    } catch {
      setPrefs(previous);
      toast.error(t("saveError"));
    }
  }

  function toggleEvent(eventType: string, nextEnabled: boolean) {
    if (!prefs) return;
    const muted = new Set(prefs.mutedEventTypes);
    if (nextEnabled) muted.delete(eventType);
    else muted.add(eventType);
    void patch({ ...prefs, mutedEventTypes: [...muted] });
  }

  function changeLocale(locale: "de" | "en") {
    if (!prefs) return;
    void patch({ ...prefs, locale });
  }

  if (!prefs) return null;

  const muted = new Set(prefs.mutedEventTypes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t("cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {USER_TOGGLEABLE_EVENTS.map((ev) => {
            const checked = !muted.has(ev.type);
            const label = t(ev.labelKey);
            return (
              <div key={ev.type} className="flex items-center gap-2">
                <Checkbox
                  id={`evt-${ev.type}`}
                  checked={checked}
                  onCheckedChange={(v) => toggleEvent(ev.type, Boolean(v))}
                  aria-label={label}
                />
                <Label htmlFor={`evt-${ev.type}`}>{label}</Label>
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          <Label>{t("language")}</Label>
          <Select value={prefs.locale} onValueChange={(v) => changeLocale(v as "de" | "en")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="de">{t("localeDe")}</SelectItem>
              <SelectItem value="en">{t("localeEn")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-muted-foreground text-sm">{t("refereeNote")}</p>
      </CardContent>
    </Card>
  );
}
