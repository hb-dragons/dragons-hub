"use client"

import type { Table as TanstackTable, Row } from "@tanstack/react-table"
import { flexRender } from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table"
import { cn } from "@dragons/ui/lib/utils"
import { DataTablePagination } from "./data-table-pagination"

interface DataTableProps<TData> {
  table: TanstackTable<TData>
  onRowClick?: (row: Row<TData>, event: React.MouseEvent) => void
  rowClassName?: (row: Row<TData>) => string | undefined
  emptyState?: React.ReactNode
  children?: React.ReactNode
}

export function DataTable<TData>({
  table,
  onRowClick,
  rowClassName,
  emptyState,
  children,
}: DataTableProps<TData>) {
  return (
    <div className="space-y-2">
      {children && <div className="px-6">{children}</div>}
      {table.getRowModel().rows.length === 0 ? (
        emptyState
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
                data-state={row.getIsSelected() && "selected"}
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
      <DataTablePagination table={table} />
    </div>
  )
}
