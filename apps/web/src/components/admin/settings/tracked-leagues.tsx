"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
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
import { Loader2, Save } from "lucide-react";
import { Switch } from "@dragons/ui/components/switch";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import type {
  ClubConfig as ClubConfigType,
  TrackedLeaguesResponse,
} from "./settings-provider";

interface ResolvedLeague {
  ligaNr: number;
  ligaId: number;
  name: string;
  seasonName: string;
}

interface ResolveResponse {
  resolved: ResolvedLeague[];
  notFound: number[];
  tracked: number;
  untracked: number;
}

export function TrackedLeagues() {
  const t = useTranslations();
  const { data: clubConfig } = useSWR<ClubConfigType | null>(SWR_KEYS.settingsClub, apiFetcher);
  const { data: leaguesData } = useSWR<TrackedLeaguesResponse>(SWR_KEYS.settingsLeagues, apiFetcher);
  const { mutate } = useSWRConfig();

  const trackedLeagues = leaguesData?.leagues.map((l) => ({
    id: l.id,
    ligaNr: l.ligaNr,
    name: l.name,
    seasonName: l.seasonName,
    ownClubRefs: l.ownClubRefs ?? false,
  })) ?? [];

  const initialValue = trackedLeagues.map((l) => l.ligaNr).join(", ");
  const [input, setInput] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [lastNotFound, setLastNotFound] = useState<number[]>([]);

  function parseInput(value: string): number[] {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n) && n > 0);
  }

  async function handleToggleOwnClubRefs(leagueId: number, ownClubRefs: boolean) {
    try {
      await fetchAPI(`/admin/settings/leagues/${leagueId}/own-club-refs`, {
        method: "PATCH",
        body: JSON.stringify({ ownClubRefs }),
      });
      await mutate(SWR_KEYS.settingsLeagues);
    } catch {
      toast.error(t("settings.leagues.toast.saveFailed"));
    }
  }

  async function handleSave() {
    const leagueNumbers = parseInput(input);

    try {
      setSaving(true);
      setLastNotFound([]);

      const result = await fetchAPI<ResolveResponse>("/admin/settings/leagues", {
        method: "PUT",
        body: JSON.stringify({ leagueNumbers }),
      });

      // Revalidate from server to get full league data
      await mutate(SWR_KEYS.settingsLeagues);
      setLastNotFound(result.notFound);

      if (result.notFound.length > 0) {
        toast.warning(
          t("settings.leagues.toast.partial", {
            tracked: String(result.tracked),
            notFoundCount: String(result.notFound.length),
            notFoundList: result.notFound.join(", "),
          }),
        );
      } else {
        toast.success(t("settings.leagues.toast.saved", { count: String(result.tracked) }));
      }
    } catch {
      toast.error(t("settings.leagues.toast.saveFailed"));
    } finally {
      setSaving(false);
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
        <div className="grid max-w-md gap-4">
          <div className="space-y-2">
            <Label htmlFor="league-numbers">{t("settings.leagues.numbersLabel")}</Label>
            <Input
              id="league-numbers"
              placeholder={t("settings.leagues.numbersPlaceholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!clubConfig}
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={!clubConfig || saving}
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

        {!clubConfig && (
          <p className="text-sm text-muted-foreground">
            {t("settings.leagues.configureClubFirst")}
          </p>
        )}

        {lastNotFound.length > 0 && (
          <p className="text-sm text-destructive">
            {t("settings.leagues.notFound", { numbers: lastNotFound.join(", ") })}
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
                        onCheckedChange={(checked) => handleToggleOwnClubRefs(league.id, checked)}
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
