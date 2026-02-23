"use client"

import type { Table } from "@tanstack/react-table"
import { XIcon } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import { DataTableViewOptions } from "./data-table-view-options"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  children?: React.ReactNode
}

export function DataTableToolbar<TData>({
  table,
  children,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {children}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Zurücksetzen
            <XIcon />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  )
}
