"use client";

import { useMemo } from "react";
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

/**
 * Read-only view of the *active* season's tracked leagues, plus the own-club-refs
 * toggle. Which leagues a season tracks is chosen on /admin/seasons (browse and
 * multi-select); the paste-a-list-of-league-numbers form that used to live here
 * was removed with the route behind it, because `liganr` is null for preliminary
 * leagues and the flow could not reach a new season at all.
 */
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

  async function handleToggleOwnClubRefs(leagueId: number, ownClubRefs: boolean) {
    try {
      await api.settings.setLeagueOwnClubRefs(leagueId, { ownClubRefs });
      await mutate(SWR_KEYS.settingsLeagues);
    } catch {
      toast.error(t("settings.leagues.toast.saveFailed"));
    }
  }

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.leagues.title")}</CardTitle>
        <CardDescription>{t("settings.leagues.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!clubConfig && (
          <p className="text-sm text-muted-foreground">
            {t("settings.leagues.configureClubFirst")}
          </p>
        )}

        {trackedLeagues.length > 0 && <DataTable columns={columns} data={trackedLeagues} />}
      </CardContent>
    </Card>
  );
}
