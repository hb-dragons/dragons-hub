"use client"

import { useRouter } from "next/navigation"
import { useQueryStates, parseAsArrayOf, parseAsString, parseAsTimestamp } from "nuqs"
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card"
import { cn } from "@dragons/ui/lib/utils"
import { Calendar } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { useDataTable } from "@/hooks/use-data-table"
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

const columns: ColumnDef<MatchListItem>[] = [
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
    meta: { label: "Ergebnis" },
  },
  {
    accessorKey: "anschreiber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Anschreiber" />
    ),
    cell: ({ row }) =>
      row.original.anschreiber ? (
        <TeamBadge name={row.original.anschreiber} />
      ) : null,
    meta: { label: "Anschreiber" },
  },
  {
    accessorKey: "zeitnehmer",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Zeitnehmer" />
    ),
    cell: ({ row }) =>
      row.original.zeitnehmer ? (
        <TeamBadge name={row.original.zeitnehmer} />
      ) : null,
    meta: { label: "Zeitnehmer" },
  },
  {
    accessorKey: "shotclock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Shotclock" />
    ),
    cell: ({ row }) =>
      row.original.shotclock ? (
        <TeamBadge name={row.original.shotclock} />
      ) : null,
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

interface MatchListTableProps {
  data: MatchListItem[]
  pageCount: number
  teamOptions: string[]
}

export function MatchListTable({
  data,
  pageCount,
  teamOptions,
}: MatchListTableProps) {
  const router = useRouter()
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
  })

  // URL-synced filter state for team (multiSelect)
  const [teamFilter, setTeamFilter] = useQueryStates(
    {
      team: parseAsArrayOf(parseAsString).withDefault([]),
    },
    { history: "push", shallow: true, clearOnDefault: true },
  )

  // URL-synced filter state for date range
  const [dateFilter, setDateFilter] = useQueryStates(
    {
      dateFrom: parseAsTimestamp.withOptions({ clearOnDefault: true }),
      dateTo: parseAsTimestamp.withOptions({ clearOnDefault: true }),
    },
    { history: "push", shallow: true, clearOnDefault: true },
  )

  const teamFilterOptions = teamOptions.map((name) => ({
    label: name,
    value: name,
  }))

  const selectedTeams = new Set(teamFilter.team)

  const dateRange: DateRange | undefined =
    dateFilter.dateFrom || dateFilter.dateTo
      ? {
          from: dateFilter.dateFrom ?? undefined,
          to: dateFilter.dateTo ?? undefined,
        }
      : undefined

  function handleRowClick(row: Row<MatchListItem>, e: React.MouseEvent) {
    const href = `/admin/matches/${row.original.id}`
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank")
    } else {
      router.push(href)
    }
  }

  function getRowClassName(row: Row<MatchListItem>) {
    return row.original.homeIsOwnClub ? "bg-muted/30" : undefined
  }

  function handleTeamChange(values: string[]) {
    void setTeamFilter({ team: values.length > 0 ? values : [] })
  }

  function handleDateRangeChange(range: DateRange | undefined) {
    void setDateFilter({
      dateFrom: range?.from ?? null,
      dateTo: range?.to ?? null,
    })
  }

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Spiele</CardTitle>
        <CardDescription>Alle Spiele des eigenen Vereins</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          table={table}
          onRowClick={handleRowClick}
          rowClassName={getRowClassName}
          emptyState={
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="mb-2 h-8 w-8" />
              <p>Keine Spiele gefunden</p>
            </div>
          }
        >
          <DataTableToolbar table={table}>
            <DataTableFacetedFilter
              title="Team"
              options={teamFilterOptions}
              selectedValues={selectedTeams}
              onSelectionChange={handleTeamChange}
            />
            <DataTableDateFilter
              title="Datum"
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
            />
          </DataTableToolbar>
        </DataTable>
      </CardContent>
    </Card>
  )
}
