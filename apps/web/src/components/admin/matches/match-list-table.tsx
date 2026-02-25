"use client"

import { useMemo, useState } from "react"
import { useTranslations, useFormatter } from "next-intl"
import useSWR, { useSWRConfig } from "swr"
import { apiFetcher } from "@/lib/swr"
import { SWR_KEYS } from "@/lib/swr-keys"
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@dragons/ui/components/tooltip"
import { Sheet } from "@dragons/ui/components/sheet"
import { cn } from "@dragons/ui/lib/utils"
import { Ban, Calendar, CircleOff, SearchIcon, SquareActivity } from "lucide-react"
import { Input } from "@dragons/ui/components/input"
import type { DateRange } from "react-day-picker"

import { DataTable } from "@/components/ui/data-table"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter"
import { DataTableDateFilter } from "@/components/ui/data-table-date-filter"

import {
  formatMatchTime,
  formatScore,
  getTeamColor,
  getOwnTeamLabel,
  getOpponentName,
} from "./utils"
import type { MatchListItem, MatchListResponse } from "./types"
import { MatchEditSheet } from "./match-edit-sheet"

function OverrideDot({ match, field }: { match: MatchListItem; field: string }) {
  const t = useTranslations("matchDetail")
  if (!match.overriddenFields.includes(field)) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{t("overrideActive")}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function TeamBadge({ name }: { name: string }) {
  const color = getTeamColor(name)
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        color.bg,
        color.border,
        color.text,
      )}
    >
      {name}
    </span>
  )
}

const dateRangeFilterFn: FilterFn<MatchListItem> = (row, columnId, value) => {
  const dateRange = value as DateRange | undefined
  if (!dateRange) return true
  const cellValue = row.getValue(columnId) as string
  if (dateRange.from) {
    const fromStr = dateRange.from.toISOString().slice(0, 10)
    if (cellValue < fromStr) return false
  }
  if (dateRange.to) {
    const toStr = dateRange.to.toISOString().slice(0, 10)
    if (cellValue > toStr) return false
  }
  return true
}

function getColumns(t: ReturnType<typeof useTranslations<"matches">>, format: ReturnType<typeof useFormatter>): ColumnDef<MatchListItem, unknown>[] {
  return [
    {
      accessorKey: "kickoffDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.date")} />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {format.dateTime(new Date(row.original.kickoffDate + "T00:00:00"), "matchDate")}
          <OverrideDot match={row.original} field="kickoffDate" />
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
          <OverrideDot match={row.original} field="kickoffTime" />
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
      cell: ({ row }) => <TeamBadge name={getOwnTeamLabel(row.original)} />,
      filterFn: (row, id, value) => {
        const filterValues = value as string[] | undefined
        if (!filterValues || filterValues.length === 0) return true
        return filterValues.includes(row.getValue(id) as string)
      },
      meta: { label: t("columns.team") },
    },
    {
      id: "home",
      accessorFn: (row) =>
        row.homeIsOwnClub ? "Dragons" : getOpponentName(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.home")} />
      ),
      cell: ({ getValue }) => (
        <span className="text-sm">{getValue() as string}</span>
      ),
      meta: { label: t("columns.home") },
    },
    {
      id: "guest",
      accessorFn: (row) =>
        row.homeIsOwnClub ? getOpponentName(row) : "Dragons",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.guest")} />
      ),
      cell: ({ getValue }) => (
        <span className="text-sm">{getValue() as string}</span>
      ),
      meta: { label: t("columns.guest") },
    },
    {
      id: "score",
      accessorFn: (row) => formatScore(row.homeScore, row.guestScore),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.score")} />
      ),
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue() as string}</span>
      ),
      sortingFn: (rowA, rowB) => {
        const diffA =
          (rowA.original.homeScore ?? 0) - (rowA.original.guestScore ?? 0)
        const diffB =
          (rowB.original.homeScore ?? 0) - (rowB.original.guestScore ?? 0)
        if (diffA === diffB) {
          return (rowA.original.homeScore ?? 0) - (rowB.original.homeScore ?? 0)
        }
        return diffA - diffB
      },
      meta: { label: t("columns.score") },
    },
    {
      accessorKey: "anschreiber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.anschreiber")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.anschreiber ?? ""}
          <OverrideDot match={row.original} field="anschreiber" />
        </span>
      ),
      meta: { label: t("columns.anschreiber") },
    },
    {
      accessorKey: "zeitnehmer",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.zeitnehmer")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.zeitnehmer ?? ""}
          <OverrideDot match={row.original} field="zeitnehmer" />
        </span>
      ),
      meta: { label: t("columns.zeitnehmer") },
    },
    {
      accessorKey: "shotclock",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.shotclock")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.shotclock ?? ""}
          <OverrideDot match={row.original} field="shotclock" />
        </span>
      ),
      meta: { label: t("columns.shotclock") },
    },
    {
      accessorKey: "publicComment",
      header: t("columns.comment"),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.publicComment ?? ""}
          <OverrideDot match={row.original} field="publicComment" />
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
      filterFn: (row, id, value) => {
        const filterValues = value as string[] | undefined
        if (!filterValues || filterValues.length === 0) return true
        return filterValues.includes(row.getValue(id) as string)
      },
      enableSorting: false,
      enableHiding: false,
      meta: { label: t("status.label") },
    },
  ]
}

const matchGlobalFilterFn: FilterFn<MatchListItem> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = (filterValue as string).toLowerCase()
  if (!search) return true

  const home = (
    row.original.homeIsOwnClub
      ? "Dragons"
      : getOpponentName(row.original)
  ).toLowerCase()
  const guest = (
    row.original.homeIsOwnClub
      ? getOpponentName(row.original)
      : "Dragons"
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

export function MatchListTable() {
  const t = useTranslations("matches")
  const format = useFormatter()
  const { mutate } = useSWRConfig()
  const { data: response } = useSWR<MatchListResponse>(SWR_KEYS.matches, apiFetcher)
  const columns = useMemo(() => getColumns(t, format), [t, format])
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null)

  const allItems = response?.items ?? []
  const teamOptions = useMemo(
    () => [...new Set(allItems.map((m) => getOwnTeamLabel(m)))].sort(),
    [allItems],
  )

  const teamFilterOptions = teamOptions.map((name) => ({
    label: name,
    value: name,
  }))

  const statusFilterOptions = [
    { label: t("status.active"), value: "active", icon: SquareActivity },
    { label: t("status.cancelled"), value: "cancelled", icon: Ban },
    { label: t("status.forfeited"), value: "forfeited", icon: CircleOff },
  ]

  function handleRowClick(row: Row<MatchListItem>, e: React.MouseEvent) {
    const href = `/admin/matches/${row.original.id}`
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank")
    } else {
      setSelectedMatchId(row.original.id)
    }
  }

  function getRowClassName(row: Row<MatchListItem>) {
    return cn(
      row.original.homeIsOwnClub && "border-l-2 border-l-green-500",
      row.original.isCancelled && "line-through text-muted-foreground opacity-60",
      row.original.isForfeited && "line-through text-muted-foreground opacity-40",
    )
  }

  return (
    <TooltipProvider>
      <DataTable
        columns={columns}
        data={allItems}
        onRowClick={handleRowClick}
        rowClassName={getRowClassName}
        globalFilterFn={matchGlobalFilterFn}
        initialColumnVisibility={{ score: false, publicComment: false, status: false }}
        initialColumnFilters={[{ id: "status", value: ["active", "cancelled"] }]}
        emptyState={
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Calendar className="mb-2 h-8 w-8" />
            <p>{t("empty")}</p>
          </div>
        }
      >
        {(table) => (
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
              title="Team"
              options={teamFilterOptions}
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
        )}
      </DataTable>
      {selectedMatchId !== null && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setSelectedMatchId(null)
          }}
        >
          <MatchEditSheet
            matchId={selectedMatchId}
            open
            onOpenChange={(open) => {
              if (!open) setSelectedMatchId(null)
            }}
            onSaved={() => mutate(SWR_KEYS.matches)}
          />
        </Sheet>
      )}
    </TooltipProvider>
  )
}
