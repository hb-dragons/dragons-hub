"use client"

import { useRouter } from "next/navigation"
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card"
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
      <DataTableColumnHeader column={column} title="Datum" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {formatMatchDate(row.original.kickoffDate)}
      </span>
    ),
    filterFn: dateRangeFilterFn,
    meta: { label: "Datum" },
  },
  {
    accessorKey: "kickoffTime",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Uhrzeit" />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">
        {formatMatchTime(row.original.kickoffTime)}
      </span>
    ),
    meta: { label: "Uhrzeit" },
  },
  {
    id: "team",
    accessorFn: (row) => getOwnTeamLabel(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team" />
    ),
    cell: ({ row }) => <TeamBadge name={getOwnTeamLabel(row.original)} />,
    filterFn: (row, id, value) => {
      const filterValues = value as string[] | undefined
      if (!filterValues || filterValues.length === 0) return true
      return filterValues.includes(row.getValue(id) as string)
    },
    meta: { label: "Team" },
  },
  {
    id: "home",
    accessorFn: (row) =>
      row.homeIsOwnClub ? "Dragons" : getOpponentName(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Heim" />
    ),
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue() as string}</span>
    ),
    meta: { label: "Heim" },
  },
  {
    id: "guest",
    accessorFn: (row) =>
      row.homeIsOwnClub ? getOpponentName(row) : "Dragons",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Gast" />
    ),
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue() as string}</span>
    ),
    meta: { label: "Gast" },
  },
  {
    id: "score",
    accessorFn: (row) => formatScore(row.homeScore, row.guestScore),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ergebnis" />
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
    meta: { label: "Ergebnis" },
  },
  {
    accessorKey: "anschreiber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Anschreiber" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.anschreiber ?? ""}</span>
    ),
    meta: { label: "Anschreiber" },
  },
  {
    accessorKey: "zeitnehmer",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Zeitnehmer" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.zeitnehmer ?? ""}</span>
    ),
    meta: { label: "Zeitnehmer" },
  },
  {
    accessorKey: "shotclock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Shotclock" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.shotclock ?? ""}</span>
    ),
    meta: { label: "Shotclock" },
  },
  {
    accessorKey: "publicComment",
    header: "Kommentar",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.publicComment ?? ""}
      </span>
    ),
    enableSorting: false,
    meta: { label: "Kommentar" },
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

  const teamFilterOptions = teamOptions.map((name) => ({
    label: name,
    value: name,
  }))

  function handleRowClick(row: Row<MatchListItem>, e: React.MouseEvent) {
    const href = `/admin/matches/${row.original.id}`
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank")
    } else {
      router.push(href)
    }
  }

  function getRowClassName(row: Row<MatchListItem>) {
    return row.original.homeIsOwnClub
      ? "bg-green-100 dark:bg-green-950/30"
      : undefined
  }

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Spiele</CardTitle>
        <CardDescription>Alle Spiele des eigenen Vereins</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
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
              <p>Keine Spiele gefunden</p>
            </div>
          }
        >
          {(table) => (
            <DataTableToolbar table={table}>
              <Input
                placeholder="Spiele suchen..."
                value={(table.getState().globalFilter as string) ?? ""}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                className="h-8 w-[150px] lg:w-[250px]"
              />
              <DataTableFacetedFilter
                column={table.getColumn("team")!}
                title="Team"
                options={teamFilterOptions}
              />
              <DataTableDateFilter
                column={table.getColumn("kickoffDate")!}
                title="Datum"
              />
            </DataTableToolbar>
          )}
        </DataTable>
      </CardContent>
    </Card>
  )
}
