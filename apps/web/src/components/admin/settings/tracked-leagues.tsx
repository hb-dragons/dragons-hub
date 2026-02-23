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
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { useSettings, type TrackedLeague } from "./settings-provider";

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

interface TrackedLeaguesResponse {
  leagueNumbers: number[];
  leagues: Array<TrackedLeague & { apiLigaId: number }>;
}

export function TrackedLeagues() {
  const t = useTranslations();
  const { clubConfig, trackedLeagues, setTrackedLeagues } = useSettings();
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

  async function handleSave() {
    const leagueNumbers = parseInput(input);

    try {
      setSaving(true);
      setLastNotFound([]);

      const result = await fetchAPI<ResolveResponse>("/admin/settings/leagues", {
        method: "PUT",
        body: JSON.stringify({ leagueNumbers }),
      });

      // Re-fetch tracked leagues to get full data including id
      const fresh = await fetchAPI<TrackedLeaguesResponse>("/admin/settings/leagues");
      setTrackedLeagues(
        fresh.leagues.map((l) => ({
          id: l.id,
          ligaNr: l.ligaNr,
          name: l.name,
          seasonName: l.seasonName,
        })),
      );
      setLastNotFound(result.notFound);

      if (result.notFound.length > 0) {
        toast.warning(
          t("settings.leagues.toast.partial", {
            tracked: result.tracked,
            notFoundCount: result.notFound.length,
            notFoundList: result.notFound.join(", "),
          }),
        );
      } else {
        toast.success(t("settings.leagues.toast.saved", { count: result.tracked }));
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
                </tr>
              </thead>
              <tbody>
                {trackedLeagues.map((league) => (
                  <tr key={league.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono">{league.ligaNr}</td>
                    <td className="px-4 py-2">{league.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{league.seasonName}</td>
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
