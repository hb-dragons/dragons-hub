"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@dragons/ui/components/tooltip"
import { Sheet } from "@dragons/ui/components/sheet"
import { cn } from "@dragons/ui/lib/utils"
import { Calendar } from "lucide-react"
import { Input } from "@dragons/ui/components/input"
import type { DateRange } from "react-day-picker"

import { DataTable } from "@/components/ui/data-table"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter"
import { DataTableDateFilter } from "@/components/ui/data-table-date-filter"

import {
  formatMatchDate,
  formatMatchTime,
  formatScore,
  getTeamColor,
  getOwnTeamLabel,
  getOpponentName,
} from "./utils"
import type { MatchListItem } from "./types"
import { matchStrings } from "./match-strings"
import { MatchEditSheet } from "./match-edit-sheet"

function OverrideDot({ match, field }: { match: MatchListItem; field: string }) {
  if (!match.overriddenFields.includes(field)) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Override aktiv</p>
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

const columns: ColumnDef<MatchListItem, unknown>[] = [
  {
    accessorKey: "kickoffDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnDate} />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {formatMatchDate(row.original.kickoffDate)}
        <OverrideDot match={row.original} field="kickoffDate" />
      </span>
    ),
    filterFn: dateRangeFilterFn,
    meta: { label: matchStrings.columnDate },
  },
  {
    accessorKey: "kickoffTime",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnTime} />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">
        {formatMatchTime(row.original.kickoffTime)}
        <OverrideDot match={row.original} field="kickoffTime" />
      </span>
    ),
    meta: { label: matchStrings.columnTime },
  },
  {
    id: "team",
    accessorFn: (row) => getOwnTeamLabel(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnTeam} />
    ),
    cell: ({ row }) => <TeamBadge name={getOwnTeamLabel(row.original)} />,
    filterFn: (row, id, value) => {
      const filterValues = value as string[] | undefined
      if (!filterValues || filterValues.length === 0) return true
      return filterValues.includes(row.getValue(id) as string)
    },
    meta: { label: matchStrings.columnTeam },
  },
  {
    id: "home",
    accessorFn: (row) =>
      row.homeIsOwnClub ? "Dragons" : getOpponentName(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnHome} />
    ),
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue() as string}</span>
    ),
    meta: { label: matchStrings.columnHome },
  },
  {
    id: "guest",
    accessorFn: (row) =>
      row.homeIsOwnClub ? getOpponentName(row) : "Dragons",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnGuest} />
    ),
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue() as string}</span>
    ),
    meta: { label: matchStrings.columnGuest },
  },
  {
    id: "score",
    accessorFn: (row) => formatScore(row.homeScore, row.guestScore),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnScore} />
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
    meta: { label: matchStrings.columnScore },
  },
  {
    accessorKey: "anschreiber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnAnschreiber} />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.anschreiber ?? ""}
        <OverrideDot match={row.original} field="anschreiber" />
      </span>
    ),
    meta: { label: matchStrings.columnAnschreiber },
  },
  {
    accessorKey: "zeitnehmer",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnZeitnehmer} />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.zeitnehmer ?? ""}
        <OverrideDot match={row.original} field="zeitnehmer" />
      </span>
    ),
    meta: { label: matchStrings.columnZeitnehmer },
  },
  {
    accessorKey: "shotclock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={matchStrings.columnShotclock} />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.shotclock ?? ""}
        <OverrideDot match={row.original} field="shotclock" />
      </span>
    ),
    meta: { label: matchStrings.columnShotclock },
  },
  {
    accessorKey: "publicComment",
    header: matchStrings.columnComment,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.publicComment ?? ""}
        <OverrideDot match={row.original} field="publicComment" />
      </span>
    ),
    enableSorting: false,
    meta: { label: matchStrings.columnComment },
  },
]

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

interface MatchListTableProps {
  data: MatchListItem[]
  teamOptions: string[]
}

export function MatchListTable({
  data,
  teamOptions,
}: MatchListTableProps) {
  const router = useRouter()
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null)

  const teamFilterOptions = teamOptions.map((name) => ({
    label: name,
    value: name,
  }))

  function handleRowClick(row: Row<MatchListItem>, e: React.MouseEvent) {
    const href = `/admin/matches/${row.original.id}`
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank")
    } else {
      setSelectedMatchId(row.original.id)
    }
  }

  function getRowClassName(row: Row<MatchListItem>) {
    return row.original.homeIsOwnClub
      ? "border-l-2 border-l-green-500"
      : undefined
  }

  return (
    <TooltipProvider>
    <Sheet
      open={selectedMatchId !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedMatchId(null)
      }}
    >
    <DataTable
      columns={columns}
      data={data}
      onRowClick={handleRowClick}
      rowClassName={getRowClassName}
      globalFilterFn={matchGlobalFilterFn}
      initialColumnVisibility={{ score: false, publicComment: false }}
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="mb-2 h-8 w-8" />
          <p>{matchStrings.noResults}</p>
        </div>
      }
    >
      {(table) => (
        <DataTableToolbar table={table}>
          <Input
            placeholder={matchStrings.searchPlaceholder}
            value={(table.getState().globalFilter as string) ?? ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="h-8 w-[150px] lg:w-[250px]"
          />
          <DataTableFacetedFilter
            column={table.getColumn("team")!}
            title={matchStrings.columnTeam}
            options={teamFilterOptions}
          />
          <DataTableDateFilter
            column={table.getColumn("kickoffDate")!}
            title={matchStrings.dateFilter}
          />
        </DataTableToolbar>
      )}
    </DataTable>
    <MatchEditSheet
      matchId={selectedMatchId}
      open={selectedMatchId !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedMatchId(null)
      }}
      onSaved={() => router.refresh()}
    />
    </Sheet>
    </TooltipProvider>
  )
}
