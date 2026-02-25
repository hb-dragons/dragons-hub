"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import type {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  Row,
  SortingState,
  Table as TanstackTable,
  VisibilityState,
} from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table"
import { cn } from "@dragons/ui/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  children?: (table: TanstackTable<TData>) => React.ReactNode
  onRowClick?: (row: Row<TData>, event: React.MouseEvent) => void
  rowClassName?: (row: Row<TData>) => string | undefined
  emptyState?: React.ReactNode
  initialColumnVisibility?: VisibilityState
  initialColumnFilters?: ColumnFiltersState
  globalFilterFn?: FilterFn<TData>
}

export function DataTable<TData, TValue>({
  columns,
  data,
  children,
  onRowClick,
  rowClassName,
  emptyState,
  initialColumnVisibility,
  initialColumnFilters,
  globalFilterFn,
}: DataTableProps<TData, TValue>) {
  "use no memo" // table instance is a stable ref with mutable state — opt out of React Compiler
  const t = useTranslations()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialColumnFilters ?? [],
  )
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {},
  )
  const [globalFilter, setGlobalFilter] = useState("")

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <div className="space-y-2">
      {children && <div className="px-6">{children(table)}</div>}
      {table.getRowModel().rows.length === 0 ? (
        emptyState ?? (
          <p className="py-12 text-center text-muted-foreground">
            {t("common.noResults")}
          </p>
        )
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row),
                )}
                onClick={
                  onRowClick ? (e) => onRowClick(row, e) : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
