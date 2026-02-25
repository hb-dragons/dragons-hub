"use client"

import { useTranslations } from "next-intl"
import type { Table } from "@tanstack/react-table"
import { SlidersHorizontalIcon } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu"

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  "use no memo"
  const t = useTranslations()
  const columns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && column.getCanHide(),
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 shrink-0">
          <SlidersHorizontalIcon />
          <span className="hidden sm:inline">{t("common.columns")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuLabel>{t("common.columnsToggle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => {
          const label =
            (column.columnDef.meta as { label?: string } | undefined)?.label ??
            column.id
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
              onSelect={(e) => e.preventDefault()}
            >
              {label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
