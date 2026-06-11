"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { queries } from "@/lib/swr-queries";
import { authClient } from "@/lib/auth-client";
import { can } from "@dragons/shared";
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
import { api } from "@/lib/api";

export function ClubConfig() {
  const t = useTranslations();
  const { data: session } = authClient.useSession();
  const canUpdate = can(session?.user ?? null, "settings", "update");
  const settingsClubQ = queries.settingsClub();
  const { data: clubConfig } = useSWR(settingsClubQ.key, settingsClubQ.fetcher);
  const { mutate } = useSWRConfig();
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
      const result = await api.settings.setClub({
        clubId: id,
        clubName: clubName.trim(),
      });
      await mutate(SWR_KEYS.settingsClub, result, { revalidate: false });
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
            <span className="text-muted-foreground">({t("settings.club.idCurrent", { id: String(clubConfig.clubId) })})</span>
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
              disabled={!canUpdate}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-name">{t("settings.club.nameLabel")}</Label>
            <Input
              id="club-name"
              placeholder={t("settings.club.namePlaceholder")}
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              disabled={!canUpdate}
            />
          </div>
          <Button
            onClick={() => { void handleSave(); }}
            disabled={!hasChanges || saving || !canUpdate}
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
