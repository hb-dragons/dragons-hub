"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { cn } from "@dragons/ui/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";

interface OwnClubTeam {
  id: number;
  name: string;
  customName: string | null;
  leagueName: string | null;
  estimatedGameDuration: number | null;
  badgeColor: string | null;
}

export function TeamsTable() {
  const t = useTranslations();
  const { data: teams } = useSWR<OwnClubTeam[]>(SWR_KEYS.teams, apiFetcher);
  const { mutate } = useSWRConfig();
  const teamsList = teams ?? [];
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<number, string>>({});
  const [colorDrafts, setColorDrafts] = useState<Record<number, string | null>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  function getDraft(team: OwnClubTeam) {
    return drafts[team.id] ?? team.customName ?? "";
  }

  function getDurationDraft(team: OwnClubTeam) {
    return durationDrafts[team.id] ?? team.estimatedGameDuration?.toString() ?? "";
  }

  function getColorDraft(team: OwnClubTeam) {
    return team.id in colorDrafts ? colorDrafts[team.id] : team.badgeColor;
  }

  function isDirty(team: OwnClubTeam) {
    const nameDraft = getDraft(team);
    const durDraft = getDurationDraft(team);
    const colorDraft = getColorDraft(team);
    return (
      nameDraft !== (team.customName ?? "") ||
      durDraft !== (team.estimatedGameDuration?.toString() ?? "") ||
      colorDraft !== team.badgeColor
    );
  }

  async function save(team: OwnClubTeam) {
    const draft = getDraft(team);
    const customName = draft.trim() === "" ? null : draft.trim();
    const durDraft = getDurationDraft(team);
    const estimatedGameDuration = durDraft.trim() === "" ? null : parseInt(durDraft.trim(), 10);
    const badgeColor = getColorDraft(team);

    setSaving((prev) => ({ ...prev, [team.id]: true }));
    try {
      const updated = await fetchAPI<OwnClubTeam>(`/admin/teams/${team.id}`, {
        method: "PATCH",
        body: JSON.stringify({ customName, estimatedGameDuration, badgeColor }),
      });
      // Update SWR cache with the changed team
      await mutate(
        SWR_KEYS.teams,
        (current: OwnClubTeam[] | undefined) =>
          (current ?? []).map((t) => (t.id === team.id ? updated : t)),
        { revalidate: false },
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
      setDurationDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
      setColorDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
    } catch {
      // Error is surfaced by fetchAPI; keep draft for retry
    } finally {
      setSaving((prev) => ({ ...prev, [team.id]: false }));
    }
  }

  if (teamsList.length === 0) {
    return <p className="text-muted-foreground">{t("teams.empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("teams.columns.apiName")}</TableHead>
          <TableHead>{t("teams.columns.league")}</TableHead>
          <TableHead>{t("teams.columns.customName")}</TableHead>
          <TableHead>{t("teams.gameDuration")}</TableHead>
          <TableHead>{t("teams.badgeColor")}</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {teamsList.map((team) => (
          <TableRow key={team.id}>
            <TableCell className="font-medium">{team.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {team.leagueName ?? "\u2014"}
            </TableCell>
            <TableCell>
              <Input
                value={getDraft(team)}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [team.id]: e.target.value }))
                }
                placeholder={t("teams.placeholder")}
                maxLength={50}
                className="max-w-xs"
              />
            </TableCell>
            <TableCell>
              <Input
                type="number"
                min={1}
                value={getDurationDraft(team)}
                onChange={(e) =>
                  setDurationDrafts((prev) => ({ ...prev, [team.id]: e.target.value }))
                }
                placeholder={t("teams.gameDurationPlaceholder")}
                className="max-w-[100px]"
              />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                {COLOR_PRESET_KEYS.map((colorKey) => {
                  const preset = getColorPreset(colorKey);
                  const isSelected = getColorDraft(team) === colorKey;
                  return (
                    <button
                      key={colorKey}
                      type="button"
                      style={{ backgroundColor: preset.dot }}
                      className={cn(
                        "size-6 rounded-full border-2 transition-transform",
                        isSelected ? "scale-110 border-foreground ring-2 ring-foreground/20" : "border-transparent hover:scale-105"
                      )}
                      onClick={() =>
                        setColorDrafts((prev) => ({ ...prev, [team.id]: colorKey }))
                      }
                      aria-label={colorKey}
                    />
                  );
                })}
              </div>
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                disabled={!isDirty(team) || saving[team.id]}
                onClick={() => save(team)}
              >
                {saving[team.id] ? t("common.saving") : t("common.save")}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
