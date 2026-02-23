"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Loader2, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { useSettings } from "./settings-provider";

export function ClubConfig() {
  const t = useTranslations();
  const { clubConfig, setClubConfig } = useSettings();
  const [clubId, setClubId] = useState(clubConfig?.clubId?.toString() ?? "");
  const [clubName, setClubName] = useState(clubConfig?.clubName ?? "");
  const [saving, setSaving] = useState(false);

  const hasChanges =
    clubId !== (clubConfig?.clubId?.toString() ?? "") ||
    clubName !== (clubConfig?.clubName ?? "");

  async function handleSave() {
    const id = parseInt(clubId, 10);
    if (!id || id <= 0) {
      toast.error(t("settings.club.toast.invalidId"));
      return;
    }
    if (!clubName.trim()) {
      toast.error(t("settings.club.toast.nameRequired"));
      return;
    }

    try {
      setSaving(true);
      const result = await fetchAPI<{ clubId: number; clubName: string }>(
        "/admin/settings/club",
        {
          method: "PUT",
          body: JSON.stringify({ clubId: id, clubName: clubName.trim() }),
        },
      );
      setClubConfig(result);
      toast.success(t("settings.club.toast.saved", { name: result.clubName }));
    } catch {
      toast.error(t("settings.club.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.club.title")}</CardTitle>
        <CardDescription>
          {t("settings.club.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {clubConfig && !hasChanges && (
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-600" />
            <span className="font-medium">{clubConfig.clubName}</span>
            <span className="text-muted-foreground">({t("settings.club.idCurrent", { id: clubConfig.clubId })})</span>
          </div>
        )}

        <div className="grid max-w-sm gap-4">
          <div className="space-y-2">
            <Label htmlFor="club-id">{t("settings.club.idLabel")}</Label>
            <Input
              id="club-id"
              type="number"
              min={1}
              placeholder={t("settings.club.idPlaceholder")}
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-name">{t("settings.club.nameLabel")}</Label>
            <Input
              id="club-name"
              placeholder={t("settings.club.namePlaceholder")}
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
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
