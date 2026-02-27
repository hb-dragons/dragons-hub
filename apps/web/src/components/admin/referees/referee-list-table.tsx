"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { apiFetcher } from "@/lib/swr"
import { SWR_KEYS } from "@/lib/swr-keys"
import type { ColumnDef, FilterFn } from "@tanstack/react-table"
import { SearchIcon, Users } from "lucide-react"
import { Input } from "@dragons/ui/components/input"
import { Badge } from "@dragons/ui/components/badge"

import { DataTable } from "@/components/ui/data-table"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

import type { RefereeListItem, PaginatedResponse } from "./types"

function getColumns(t: ReturnType<typeof useTranslations<"referees">>): ColumnDef<RefereeListItem, unknown>[] {
  return [
    {
      accessorKey: "lastName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.lastName")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.lastName ?? ""}</span>
      ),
      meta: { label: t("columns.lastName") },
    },
    {
      accessorKey: "firstName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.firstName")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.firstName ?? ""}</span>
      ),
      meta: { label: t("columns.firstName") },
    },
    {
      accessorKey: "licenseNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.licenseNumber")} />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">{row.original.licenseNumber ?? ""}</span>
      ),
      meta: { label: t("columns.licenseNumber") },
    },
    {
      accessorKey: "matchCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.matchCount")} />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">{row.original.matchCount}</span>
      ),
      meta: { label: t("columns.matchCount") },
    },
    {
      id: "roles",
      accessorFn: (row) => row.roles.join(", "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.roles")} />
      ),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((role) => (
            <Badge key={role} variant="secondary" className="text-xs">
              {role}
            </Badge>
          ))}
        </div>
      ),
      meta: { label: t("columns.roles") },
    },
    {
      accessorKey: "apiId",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.apiId")} />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums text-sm text-muted-foreground">{row.original.apiId}</span>
      ),
      meta: { label: t("columns.apiId") },
    },
  ]
}

const refereeGlobalFilterFn: FilterFn<RefereeListItem> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = (filterValue as string).toLowerCase()
  if (!search) return true

  const firstName = (row.original.firstName ?? "").toLowerCase()
  const lastName = (row.original.lastName ?? "").toLowerCase()
  const license = String(row.original.licenseNumber ?? "")
  const roles = row.original.roles.join(" ").toLowerCase()

  return (
    firstName.includes(search) ||
    lastName.includes(search) ||
    license.includes(search) ||
    roles.includes(search)
  )
}

export function RefereeListTable() {
  const t = useTranslations("referees")
  const { data: response } = useSWR<PaginatedResponse<RefereeListItem>>(SWR_KEYS.referees, apiFetcher)
  const columns = useMemo(() => getColumns(t), [t])

  const allItems = response?.items ?? []

  return (
    <DataTable
      columns={columns}
      data={allItems}
      globalFilterFn={refereeGlobalFilterFn}
      initialColumnVisibility={{ apiId: false }}
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="mb-2 h-8 w-8" />
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
        </DataTableToolbar>
      )}
    </DataTable>
  )
}
