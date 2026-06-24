"use client";

import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { queries } from "@/lib/swr-queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Switch } from "@dragons/ui/components/switch";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function TrackedLeagues() {
  const t = useTranslations();
  const settingsClubQ = queries.settingsClub();
  const { data: clubConfig } = useSWR(settingsClubQ.key, settingsClubQ.fetcher);
  const settingsLeaguesQ = queries.settingsLeagues();
  const { data: leaguesData } = useSWR(settingsLeaguesQ.key, settingsLeaguesQ.fetcher);
  const { mutate } = useSWRConfig();

  const trackedLeagues = leaguesData?.leagues.map((l) => ({
    id: l.id,
    ligaNr: l.ligaNr,
    name: l.name,
    seasonName: l.seasonName,
    ownClubRefs: l.ownClubRefs ?? false,
  })) ?? [];

  async function handleToggleOwnClubRefs(leagueId: number, ownClubRefs: boolean) {
    try {
      await api.settings.setLeagueOwnClubRefs(leagueId, { ownClubRefs });
      await mutate(SWR_KEYS.settingsLeagues);
    } catch {
      toast.error(t("settings.leagues.toast.saveFailed"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.leagues.title")}</CardTitle>
        <CardDescription>
          {t("settings.leagues.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!clubConfig && (
          <p className="text-sm text-muted-foreground">
            {t("settings.leagues.configureClubFirst")}
          </p>
        )}

        {trackedLeagues.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left font-medium">{t("settings.leagues.columns.ligaNr")}</th>
                  <th className="px-4 py-2 text-left font-medium">{t("settings.leagues.columns.name")}</th>
                  <th className="px-4 py-2 text-left font-medium">{t("settings.leagues.columns.season")}</th>
                  <th className="px-4 py-2 text-left font-medium">{t("settings.leagues.columns.ownClubRefs")}</th>
                </tr>
              </thead>
              <tbody>
                {trackedLeagues.map((league) => (
                  <tr key={league.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono">{league.ligaNr}</td>
                    <td className="px-4 py-2">{league.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{league.seasonName}</td>
                    <td className="px-4 py-2">
                      <Switch
                        checked={league.ownClubRefs}
                        onCheckedChange={(checked) => { void handleToggleOwnClubRefs(league.id, checked); }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
