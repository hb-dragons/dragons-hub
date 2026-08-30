"use client"

import { useMemo, useState } from "react"
import { useFormatter, useTranslations } from "next-intl"
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import {
  Ban,
  CircleOff,
  FilterIcon,
  MessageSquareText,
  SearchIcon,
  SquareActivity,
  XIcon,
} from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import { Input } from "@dragons/ui/components/input"
import { cn } from "@dragons/ui/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@dragons/ui/components/tooltip"

import type { MatchListItem } from "@dragons/shared"
import { clubDayAnchor } from "@dragons/shared"
import { DataTable } from "@/components/ui/data-table"
import { DataTableViewOptions } from "@/components/ui/data-table-view-options"
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
import { SpielplanDetailSheet } from "./spielplan-detail-sheet"
import { exportSpielplanXlsx } from "./xlsx-export"

/**
 * Marks a game that carries an admin-entered note so it stays visible even
 * when the Kommentar column is toggled off or truncated on a narrow screen.
 */
function CommentDot({ match, label }: { match: MatchListItem; label: string }) {
  if (!match.publicComment) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label={label} className="ml-1 inline-flex align-text-top text-heat">
          <MessageSquareText className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-64 text-xs">{match.publicComment}</p>
      </TooltipContent>
    </Tooltip>
  )
}

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
        <span className="tabular-nums text-xs md:text-sm">{getValue() as number}</span>
      ),
      meta: { label: t("columns.nr") },
    },
    {
      accessorKey: "kickoffDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.date")} />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs md:text-sm">
          {format.dateTime(clubDayAnchor(row.original.kickoffDate), "matchDate")}
          <CommentDot match={row.original} label={t("hasComment")} />
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
        <span className="tabular-nums text-xs md:text-sm">
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
        <span className="text-xs md:text-sm">{(getValue() as string | null) ?? ""}</span>
      ),
      meta: { label: t("columns.league") },
    },
    {
      id: "home",
      accessorFn: (row) => (row.homeIsOwnClub ? "Dragons" : getOpponentName(row)),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.home")} />
      ),
      cell: ({ getValue }) => <span className="text-xs md:text-sm">{getValue() as string}</span>,
      meta: { label: t("columns.home") },
    },
    {
      id: "guest",
      accessorFn: (row) => (row.homeIsOwnClub ? getOpponentName(row) : "Dragons"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.guest")} />
      ),
      cell: ({ getValue }) => <span className="text-xs md:text-sm">{getValue() as string}</span>,
      meta: { label: t("columns.guest") },
    },
    {
      id: "venue",
      accessorFn: (row) => row.venueNameOverride ?? row.venueName ?? "",
      header: t("columns.venue"),
      cell: ({ getValue }) => <span className="text-xs md:text-sm">{getValue() as string}</span>,
      meta: { label: t("columns.venue") },
    },
    {
      id: "score",
      accessorFn: (row) => formatScore(row.homeScore, row.guestScore),
      header: t("columns.score"),
      cell: ({ getValue }) => (
        <span className="tabular-nums text-xs md:text-sm">{getValue() as string}</span>
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
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedGame, setSelectedGame] = useState<MatchListItem | null>(null)
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
    <TooltipProvider>
      <DataTable
        columns={columns}
        data={matches}
        className="min-h-0 flex-1 flex flex-col"
        containerClassName="min-h-0 flex-1 overflow-auto overscroll-contain"
        stickyHeader
      onRowClick={(row) => setSelectedGame(row.original)}
      rowClassName={getRowClassName}
      globalFilterFn={spielplanGlobalFilterFn}
      initialColumnVisibility={{
        matchNo: false,
        leagueName: false,
        venue: false,
        score: false,
        anschreiber: false,
        zeitnehmer: false,
        shotclock: false,
        publicComment: false,
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
        const isFiltered = table.getState().columnFilters.length > 0
        return (
          <div className="flex flex-col gap-2">
            {/* Row 1: search always visible; the mobile-only toggle reveals the secondary filters. */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={(table.getState().globalFilter as string) ?? ""}
                  onChange={(event) => table.setGlobalFilter(event.target.value)}
                  className="h-8 w-full pl-8 sm:w-[150px] lg:w-[250px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={t("moreFilters")}
                aria-expanded={filtersOpen}
                className="h-8 md:hidden"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <FilterIcon />
              </Button>
              <div className="ml-auto">
                <DataTableViewOptions table={table} />
              </div>
            </div>

            {/* Row 2: the team filter is the coaches' main filter — never collapsed. */}
            <div className="flex flex-wrap items-center gap-2">
              <DataTableFacetedFilter
                column={table.getColumn("team")!}
                title={t("columns.team")}
                options={teamFilterOptions}
              />
              {isFiltered && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => table.resetColumnFilters()}
                  className="h-8 px-2 lg:px-3"
                >
                  {tCommon("reset")}
                  <XIcon />
                </Button>
              )}
            </div>

            {/* Secondary filters: inline from md up, behind the toggle on phones. */}
            <div
              data-slot="extra-filters"
              className={cn(
                "flex-wrap items-center gap-2",
                filtersOpen ? "flex" : "hidden md:flex",
              )}
            >
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
            </div>

            <div className="flex items-center justify-between text-xs md:text-sm text-muted-foreground">
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
      <SpielplanDetailSheet
        game={selectedGame}
        onOpenChange={(open) => {
          if (!open) setSelectedGame(null)
        }}
      />
    </TooltipProvider>
  )
}
