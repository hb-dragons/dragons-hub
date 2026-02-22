"use client"

import { useMemo, useState } from "react"
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  TableState,
  VisibilityState,
} from "@tanstack/react-table"
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useQueryStates, parseAsInteger } from "nuqs"

import { getSortingStateParser } from "@/lib/parsers"

interface UseDataTableProps<TData> {
  data: TData[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[]
  pageCount: number
  initialState?: Omit<Partial<TableState>, "sorting">
  state?: Omit<Partial<TableState>, "sorting">
  enableRowSelection?: boolean
  shallow?: boolean
  clearOnDefault?: boolean
}

const PAGE_SIZES = [10, 20, 30, 50, 100] as const

export function useDataTable<TData>({
  data,
  columns,
  pageCount,
  initialState,
  state: controlledState,
  enableRowSelection = false,
  shallow = true,
  clearOnDefault = true,
}: UseDataTableProps<TData>) {
  const queryStateOptions = {
    history: "push" as const,
    shallow,
    clearOnDefault,
  }

  // URL-synced pagination state
  const [pagination, setPagination] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      perPage: parseAsInteger.withDefault(10),
    },
    queryStateOptions,
  )

  const { page, perPage } = pagination

  // URL-synced sorting state
  const sortingParser = getSortingStateParser()
  const [sorting, setSorting] = useQueryStates(
    {
      sort: sortingParser,
    },
    queryStateOptions,
  )

  const sortingState: SortingState = sorting.sort

  // Local column visibility state
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialState?.columnVisibility ?? {},
  )

  // Local row selection state
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(
    initialState?.rowSelection ?? {},
  )

  // Column filters state (local — server-side filtering done via URL params)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialState?.columnFilters ?? [],
  )

  // Map page/perPage to tanstack pagination (0-indexed)
  const paginationState: PaginationState = useMemo(
    () => ({
      pageIndex: page - 1,
      pageSize: perPage,
    }),
    [page, perPage],
  )

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      pagination: paginationState,
      sorting: sortingState,
      columnVisibility,
      rowSelection,
      columnFilters,
      ...controlledState,
    },
    enableRowSelection,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    onPaginationChange: (updaterOrValue) => {
      const updated =
        typeof updaterOrValue === "function"
          ? updaterOrValue(paginationState)
          : updaterOrValue
      void setPagination({
        page: updated.pageIndex + 1,
        perPage: updated.pageSize,
      })
    },
    onSortingChange: (updaterOrValue) => {
      const updated =
        typeof updaterOrValue === "function"
          ? updaterOrValue(sortingState)
          : updaterOrValue
      // Reset to first page on sort change
      void setPagination({ page: 1, perPage })
      void setSorting({ sort: updated })
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return { table }
}

export { PAGE_SIZES }
