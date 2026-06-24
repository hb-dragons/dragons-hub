"use client";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { queries } from "@/lib/swr-queries";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import type { SeasonWithCounts } from "@dragons/shared";
import { SeasonWizard } from "./season-wizard";

export function SeasonsList() {
  const t = useTranslations();
  const q = queries.seasons();
  const { data: seasons } = useSWR(q.key, q.fetcher);
  const { mutate } = useSWRConfig();
  const [wizardOpen, setWizardOpen] = useState(false);

  async function activate(season: SeasonWithCounts) {
    if (
      season.leagueCount === 0 &&
      !window.confirm(t("settings.seasons.confirmEmptyActivate"))
    ) {
      return;
    }
    try {
      await api.seasons.activate(season.id);
      await mutate(SWR_KEYS.seasons);
      toast.success(t("settings.seasons.toast.activated"));
    } catch {
      toast.error(t("settings.seasons.toast.activateFailed"));
    }
  }

  return (
    <>
    <SeasonWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("settings.seasons.title")}</CardTitle>
        <Button onClick={() => setWizardOpen(true)}>{t("settings.seasons.createSeason")}</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {(seasons ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between">
            <span>
              {s.name} · {t(`settings.seasons.status.${s.status}`)} ·{" "}
              {s.leagueCount}
            </span>
            {s.status === "upcoming" && (
              <Button onClick={() => { void activate(s); }}>
                {t("settings.seasons.activate")}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
    </>
  );
}
