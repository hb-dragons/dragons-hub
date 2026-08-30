"use client"

import { useMemo } from "react"
import { useFormatter, useTranslations } from "next-intl"
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import { Ban, CircleOff, SearchIcon, SquareActivity } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import { Input } from "@dragons/ui/components/input"

import type { MatchListItem } from "@dragons/shared"
import { clubDayAnchor } from "@dragons/shared"
import { DataTable } from "@/components/ui/data-table"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter"
import { DataTableDateFilter } from "@/components/ui/data-table-date-filter"
import { dateRangeFilterFn } from "@/components/ui/data-table-filters"
import { TeamBadge } from "@/components/admin/shared/team-badge"
import {
  formatMatchTime,
  formatScore,
  getOpponentName,
  getOwnTeamLabel,
} from "@/components/admin/matches/utils"
import { isDerbyGame, spielplanRowClass, withDerbyPrefix } from "./utils"
import { exportSpielplanXlsx } from "./xlsx-export"

const includesFilterFn: FilterFn<MatchListItem> = (row, id, value) => {
  const filterValues = value as string[] | undefined
  if (!filterValues || filterValues.length === 0) return true
  return filterValues.includes(row.getValue(id) as string)
}

const spielplanGlobalFilterFn: FilterFn<MatchListItem> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = (filterValue as string).toLowerCase()
  if (!search) return true

  const home = (
    row.original.homeIsOwnClub ? "Dragons" : getOpponentName(row.original)
  ).toLowerCase()
  const guest = (
    row.original.homeIsOwnClub ? getOpponentName(row.original) : "Dragons"
  ).toLowerCase()
  const comment = (row.original.publicComment || "").toLowerCase()
  const team = getOwnTeamLabel(row.original).toLowerCase()

  return (
    home.includes(search) ||
    guest.includes(search) ||
    comment.includes(search) ||
    team.includes(search)
  )
}

function getColumns(
  t: ReturnType<typeof useTranslations<"spielplan">>,
  format: ReturnType<typeof useFormatter>,
): ColumnDef<MatchListItem, unknown>[] {
  return [
    {
      accessorKey: "matchNo",
      header: t("columns.nr"),
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue() as number}</span>
      ),
      meta: { label: t("columns.nr") },
    },
    {
      accessorKey: "kickoffDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.date")} />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {format.dateTime(clubDayAnchor(row.original.kickoffDate), "matchDate")}
        </span>
      ),
      filterFn: dateRangeFilterFn,
      meta: { label: t("columns.date") },
    },
    {
      accessorKey: "kickoffTime",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.time")} />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">
          {formatMatchTime(row.original.kickoffTime)}
        </span>
      ),
      meta: { label: t("columns.time") },
    },
    {
      id: "team",
      accessorFn: (row) => getOwnTeamLabel(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.team")} />
      ),
      cell: ({ row }) => {
        const m = row.original
        const badgeColor = m.homeIsOwnClub ? m.homeBadgeColor : m.guestBadgeColor
        return <TeamBadge name={getOwnTeamLabel(m)} badgeColor={badgeColor} />
      },
      filterFn: includesFilterFn,
      meta: { label: t("columns.team") },
    },
    {
      accessorKey: "leagueName",
      header: t("columns.league"),
      cell: ({ getValue }) => (
        <span className="text-sm">{(getValue() as string | null) ?? ""}</span>
      ),
      meta: { label: t("columns.league") },
    },
    {
      id: "home",
      accessorFn: (row) => (row.homeIsOwnClub ? "Dragons" : getOpponentName(row)),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.home")} />
      ),
      cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      meta: { label: t("columns.home") },
    },
    {
      id: "guest",
      accessorFn: (row) => (row.homeIsOwnClub ? getOpponentName(row) : "Dragons"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.guest")} />
      ),
      cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      meta: { label: t("columns.guest") },
    },
    {
      id: "venue",
      accessorFn: (row) => row.venueNameOverride ?? row.venueName ?? "",
      header: t("columns.venue"),
      cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      meta: { label: t("columns.venue") },
    },
    {
      id: "score",
      accessorFn: (row) => formatScore(row.homeScore, row.guestScore),
      header: t("columns.score"),
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue() as string}</span>
      ),
      enableSorting: false,
      meta: { label: t("columns.score") },
    },
    {
      accessorKey: "anschreiber",
      header: t("columns.anschreiber"),
      cell: ({ row }) =>
        row.original.anschreiber ? <TeamBadge name={row.original.anschreiber} /> : null,
      meta: { label: t("columns.anschreiber") },
    },
    {
      accessorKey: "zeitnehmer",
      header: t("columns.zeitnehmer"),
      cell: ({ row }) =>
        row.original.zeitnehmer ? <TeamBadge name={row.original.zeitnehmer} /> : null,
      meta: { label: t("columns.zeitnehmer") },
    },
    {
      accessorKey: "shotclock",
      header: t("columns.shotclock"),
      cell: ({ row }) =>
        row.original.shotclock ? <TeamBadge name={row.original.shotclock} /> : null,
      meta: { label: t("columns.shotclock") },
    },
    {
      accessorKey: "publicComment",
      header: t("columns.comment"),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {withDerbyPrefix(row.original.publicComment, isDerbyGame(row.original))}
        </span>
      ),
      enableSorting: false,
      meta: { label: t("columns.comment") },
    },
    {
      id: "status",
      accessorFn: (row) => {
        if (row.isForfeited) return "forfeited"
        if (row.isCancelled) return "cancelled"
        return "active"
      },
      header: () => null,
      cell: () => null,
      filterFn: includesFilterFn,
      enableSorting: false,
      enableHiding: false,
      meta: { label: t("status.label") },
    },
    {
      id: "homeAway",
      accessorFn: (row) => (row.homeIsOwnClub ? "home" : "away"),
      header: () => null,
      cell: () => null,
      filterFn: includesFilterFn,
      enableSorting: false,
      enableHiding: false,
      meta: { label: t("homeAway.label") },
    },
  ]
}

interface SpielplanTableProps {
  matches: MatchListItem[]
}

export function SpielplanTable({ matches }: SpielplanTableProps) {
  const t = useTranslations("spielplan")
  const format = useFormatter()
  const columns = useMemo(() => getColumns(t, format), [t, format])

  const teamFilterOptions = useMemo(
    () =>
      [...new Set(matches.map((m) => getOwnTeamLabel(m)))]
        .sort()
        .map((name) => ({ label: name, value: name })),
    [matches],
  )

  const statusFilterOptions = [
    { label: t("status.active"), value: "active", icon: SquareActivity },
    { label: t("status.cancelled"), value: "cancelled", icon: Ban },
    { label: t("status.forfeited"), value: "forfeited", icon: CircleOff },
  ]

  const homeAwayFilterOptions = [
    { label: t("homeAway.home"), value: "home" },
    { label: t("homeAway.away"), value: "away" },
  ]

  function getRowClassName(row: Row<MatchListItem>) {
    return spielplanRowClass(row.original)
  }

  return (
    <DataTable
      columns={columns}
      data={matches}
      rowClassName={getRowClassName}
      globalFilterFn={spielplanGlobalFilterFn}
      initialColumnVisibility={{
        matchNo: false,
        leagueName: false,
        venue: false,
        status: false,
        homeAway: false,
      }}
      initialColumnFilters={[{ id: "status", value: ["active", "cancelled"] }]}
      emptyState={
        <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
      }
    >
      {(table) => {
        const visibleGames = table.getRowModel().rows.map((row) => row.original)
        return (
          <div className="flex flex-wrap items-center gap-2">
            <DataTableToolbar table={table}>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={(table.getState().globalFilter as string) ?? ""}
                  onChange={(event) => table.setGlobalFilter(event.target.value)}
                  className="h-8 w-[150px] pl-8 lg:w-[250px]"
                />
              </div>
              <DataTableFacetedFilter
                column={table.getColumn("team")!}
                title={t("columns.team")}
                options={teamFilterOptions}
              />
              <DataTableFacetedFilter
                column={table.getColumn("homeAway")!}
                title={t("homeAway.label")}
                options={homeAwayFilterOptions}
              />
              <DataTableFacetedFilter
                column={table.getColumn("status")!}
                title={t("status.label")}
                options={statusFilterOptions}
              />
              <DataTableDateFilter
                column={table.getColumn("kickoffDate")!}
                title={t("columns.date")}
              />
            </DataTableToolbar>
            <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                disabled={visibleGames.length === 0}
                onClick={() => {
                  void exportSpielplanXlsx(visibleGames)
                }}
              >
                {t("export")}
              </Button>
              <span>
                {visibleGames.length} {t("gamesCount")}
              </span>
            </div>
          </div>
        )
      }}
    </DataTable>
  )
}
