"use client"

import type { Table } from "@tanstack/react-table"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select"

import { PAGE_SIZES } from "@/hooks/use-data-table"

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  pageSizes?: readonly number[]
}

export function DataTablePagination<TData>({
  table,
  pageSizes = PAGE_SIZES,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex flex-col-reverse items-center justify-between gap-4 overflow-auto px-2 py-4 sm:flex-row sm:gap-6 lg:gap-8">
      <div className="flex items-center gap-2">
        <p className="whitespace-nowrap text-sm font-medium">Zeilen pro Seite</p>
        <Select
          value={`${table.getState().pagination.pageSize}`}
          onValueChange={(value) => {
            table.setPageSize(Number(value))
          }}
        >
          <SelectTrigger className="h-8 w-[4.5rem]">
            <SelectValue placeholder={table.getState().pagination.pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {pageSizes.map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-center text-sm font-medium">
        Seite {table.getState().pagination.pageIndex + 1} von{" "}
        {table.getPageCount()}
      </div>
      <div className="flex items-center gap-2">
        <Button
          aria-label="Zur ersten Seite"
          variant="outline"
          className="hidden size-8 p-0 lg:flex"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronsLeftIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          aria-label="Vorherige Seite"
          variant="outline"
          className="size-8 p-0"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          aria-label="Nächste Seite"
          variant="outline"
          className="size-8 p-0"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          aria-label="Zur letzten Seite"
          variant="outline"
          className="hidden size-8 p-0 lg:flex"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          <ChevronsRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
