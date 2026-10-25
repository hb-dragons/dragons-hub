"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays } from "lucide-react";
import { clubDayAnchor, clubTimeAnchor, HALL_TIME_COVERAGES } from "@dragons/shared";
import type { HallOccupancyDay, HallTimeCoverage } from "@dragons/shared";
import { Label } from "@dragons/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { Link } from "@/lib/navigation";
import { queries } from "@/lib/swr-queries";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { TeamBadge } from "@/components/admin/shared/team-badge";
import { HallTimeCoverageBadge } from "@/components/admin/hall-times/hall-time-coverage-badge";

const ALL = "all";

function getColumns(
  t: ReturnType<typeof useTranslations<"hallOccupancy">>,
  format: ReturnType<typeof useFormatter>,
): ColumnDef<HallOccupancyDay>[] {
  // Times are club wall clock; anchoring them is what keeps 18:00 from
  // server-rendering as 19:00 in a UTC container and flipping on hydration.
  const time = (value: string, date: string) =>
    format.dateTime(clubTimeAnchor(value, date), "matchTime");
  const range = (start: string, end: string, date: string) =>
    `${time(start, date)} – ${time(end, date)}`;

  return [
    {
      accessorKey: "date",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("columns.date")} />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {format.dateTime(clubDayAnchor(row.original.date), "matchDate")}
        </span>
      ),
      meta: { label: t("columns.date") },
    },
    {
      accessorKey: "venueName",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("columns.hall")} />,
      cell: ({ row }) => (
        <Link
          href={`/admin/venues?hallTimes=${row.original.venueId}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.venueName}
        </Link>
      ),
      meta: { label: t("columns.hall") },
    },
    {
      id: "games",
      header: t("columns.games"),
      cell: ({ row }) => (
        <ul className="space-y-1">
          {row.original.games.map((game) => (
            <li key={game.matchId}>
              <Link
                href={`/admin/matches/${game.matchId}`}
                className="flex flex-wrap items-center gap-2 text-sm hover:underline"
              >
                <span className="tabular-nums">{time(game.kickoffTime, row.original.date)}</span>
                <TeamBadge
                  name={game.homeTeamCustomName ?? game.homeTeam}
                  badgeColor={game.homeBadgeColor}
                />
                <span className="text-muted-foreground">{t("versus", { guest: game.guestTeam })}</span>
              </Link>
            </li>
          ))}
        </ul>
      ),
      enableSorting: false,
      meta: { label: t("columns.games") },
    },
    {
      id: "window",
      header: t("columns.window"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {range(row.original.windowStart, row.original.windowEnd, row.original.date)}
        </span>
      ),
      enableSorting: false,
      meta: { label: t("columns.window") },
    },
    {
      id: "hallTime",
      header: t("columns.hallTime"),
      cell: ({ row }) => {
        const { hallTime, date } = row.original;
        if (!hallTime) return <span className="text-muted-foreground">{t("noHallTime")}</span>;
        if (hallTime.kind === "closed") {
          return (
            <span>
              {hallTime.note ? t("closedWithNote", { note: hallTime.note }) : t("closed")}
            </span>
          );
        }
        return (
          <span className="tabular-nums">
            {hallTime.startTime && hallTime.endTime
              ? range(hallTime.startTime, hallTime.endTime, date)
              : "—"}
          </span>
        );
      },
      enableSorting: false,
      meta: { label: t("columns.hallTime") },
    },
    {
      id: "coverage",
      header: t("columns.coverage"),
      cell: ({ row }) => {
        const { coverage, gapBeforeMinutes, gapAfterMinutes } = row.original;
        return (
          <div className="flex flex-col items-start gap-1">
            <HallTimeCoverageBadge coverage={coverage} className="text-xs" />
            {gapBeforeMinutes > 0 && (
              <span className="text-heat text-xs">{t("gapEarly", { minutes: gapBeforeMinutes })}</span>
            )}
            {gapAfterMinutes > 0 && (
              <span className="text-heat text-xs">{t("gapLate", { minutes: gapAfterMinutes })}</span>
            )}
          </div>
        );
      },
      enableSorting: false,
      meta: { label: t("columns.coverage") },
    },
  ];
}

export function HallOccupancyTable() {
  const t = useTranslations("hallOccupancy");
  const tCoverage = useTranslations("hallTimes.coverage");
  const format = useFormatter();
  const [venueId, setVenueId] = useState<number | undefined>(undefined);
  const [coverage, setCoverage] = useState<HallTimeCoverage | undefined>(undefined);

  const occupancyQ = queries.hallOccupancy({
    ...(venueId !== undefined ? { venueId } : {}),
    ...(coverage ? { coverage } : {}),
  });
  const { data, error, isLoading, mutate } = useSWR(occupancyQ.key, occupancyQ.fetcher);
  const venuesQ = queries.venues();
  const { data: venues } = useSWR(venuesQ.key, venuesQ.fetcher);

  const columns = useMemo(() => getColumns(t, format), [t, format]);

  if (error) return <ErrorState onRetry={() => void mutate()} />;
  if (isLoading && !data) return <LoadingState rows={6} />;

  return (
    <DataTable
      columns={columns}
      data={data ?? []}
      emptyState={
        <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
          <CalendarDays className="mb-2 h-8 w-8" />
          <p>{t("empty")}</p>
        </div>
      }
    >
      {() => (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="hall-occupancy-hall">{t("filters.hall")}</Label>
            <Select
              value={venueId === undefined ? ALL : String(venueId)}
              onValueChange={(v) => setVenueId(v === ALL ? undefined : Number(v))}
            >
              <SelectTrigger id="hall-occupancy-hall" className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.allHalls")}</SelectItem>
                {(venues ?? []).map((venue) => (
                  <SelectItem key={venue.id} value={String(venue.id)}>
                    {venue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hall-occupancy-coverage">{t("filters.coverage")}</Label>
            <Select
              value={coverage ?? ALL}
              onValueChange={(v) => setCoverage(v === ALL ? undefined : (v as HallTimeCoverage))}
            >
              <SelectTrigger id="hall-occupancy-coverage" className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.allCoverages")}</SelectItem>
                {HALL_TIME_COVERAGES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tCoverage(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </DataTable>
  );
}
