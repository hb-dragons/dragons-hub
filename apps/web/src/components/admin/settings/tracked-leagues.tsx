"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@dragons/ui";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Loader2, Save } from "lucide-react";
import { Switch } from "@dragons/ui/components/switch";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";

interface TrackedLeague {
  id: number;
  ligaNr: number;
  name: string;
  seasonName: string;
  ownClubRefs: boolean;
}

function formatLigaNrs(
  data: { leagues: { ligaNr: number }[] } | null | undefined,
): string {
  return data ? data.leagues.map((l) => l.ligaNr).join(", ") : "";
}

export function TrackedLeagues() {
  const t = useTranslations();
  const settingsClubQ = queries.settingsClub();
  const { data: clubConfig } = useSWR(settingsClubQ.key, settingsClubQ.fetcher);
  const settingsLeaguesQ = queries.settingsLeagues();
  const { data: leaguesData } = useSWR(settingsLeaguesQ.key, settingsLeaguesQ.fetcher);
  const { mutate } = useSWRConfig();

  const trackedLeagues: TrackedLeague[] = useMemo(
    () =>
      leaguesData?.leagues.map((l) => ({
        id: l.id,
        ligaNr: l.ligaNr,
        name: l.name,
        seasonName: l.seasonName,
        ownClubRefs: l.ownClubRefs ?? false,
      })) ?? [],
    [leaguesData],
  );

  const columns: ColumnDef<TrackedLeague>[] = useMemo(
    () => [
      {
        accessorKey: "ligaNr",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("settings.leagues.columns.ligaNr")}
          />
        ),
        cell: ({ row }) => <span className="font-mono">{row.original.ligaNr}</span>,
        meta: { label: t("settings.leagues.columns.ligaNr") },
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("settings.leagues.columns.name")}
          />
        ),
        meta: { label: t("settings.leagues.columns.name") },
      },
      {
        accessorKey: "seasonName",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("settings.leagues.columns.season")}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.seasonName}</span>
        ),
        meta: { label: t("settings.leagues.columns.season") },
      },
      {
        accessorKey: "ownClubRefs",
        header: t("settings.leagues.columns.ownClubRefs"),
        cell: ({ row }) => (
          <Switch
            checked={row.original.ownClubRefs}
            onCheckedChange={(checked) => {
              void handleToggleOwnClubRefs(row.original.id, checked);
            }}
          />
        ),
        enableSorting: false,
        meta: { label: t("settings.leagues.columns.ownClubRefs") },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleToggleOwnClubRefs is stable for a render pass
    [t],
  );

  const [input, setInput] = useState(() => formatLigaNrs(leaguesData));
  const [saving, setSaving] = useState(false);
  const [lastNotFound, setLastNotFound] = useState<number[]>([]);
  // The server prefetch on /admin/settings can fail into `null`, in which case
  // the league list only arrives via client revalidation. Without this sync the
  // input stays empty while the table below fills in, and Save posts an empty
  // list — untracking every league. Same shape as `booking-config.tsx`.
  const [initialized, setInitialized] = useState(() => leaguesData != null);

  useEffect(() => {
    if (leaguesData && !initialized) {
      setInput(formatLigaNrs(leaguesData));
      setInitialized(true);
    }
  }, [leaguesData, initialized]);

  const canEdit = !!clubConfig && initialized;

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
      await api.settings.setLeagueOwnClubRefs(leagueId, { ownClubRefs });
      await mutate(SWR_KEYS.settingsLeagues);
    } catch {
      toast.error(t("settings.leagues.toast.saveFailed"));
    }
  }

  async function handleSave() {
    // Refuse to write a list that was never read — an empty `input` here would
    // mean "untrack everything" purely because the fetch hadn't landed.
    if (!canEdit) return;

    const leagueNumbers = parseInput(input);

    try {
      setSaving(true);
      setLastNotFound([]);

      const result = await api.settings.setLeagues({ leagueNumbers });

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
              disabled={!canEdit}
            />
          </div>
          <Button
            onClick={() => { void handleSave(); }}
            disabled={!canEdit || saving}
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
          <DataTable columns={columns} data={trackedLeagues} />
        )}
      </CardContent>
    </Card>
  );
}
