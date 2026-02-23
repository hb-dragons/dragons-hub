"use client"

import type { Column } from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import { cn } from "@dragons/ui/lib/utils"

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  "use no memo"
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  // Extract to a primitive so React Compiler doesn't skip re-renders
  const sorted = column.getIsSorted()

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => {
          if (sorted === "asc") {
            column.toggleSorting(true)
          } else if (sorted === "desc") {
            column.clearSorting()
          } else {
            column.toggleSorting(false)
          }
        }}
      >
        <span>{title}</span>
        {sorted === "desc" ? (
          <ArrowDownIcon />
        ) : sorted === "asc" ? (
          <ArrowUpIcon />
        ) : (
          <ChevronsUpDownIcon className="text-muted-foreground/70" />
        )}
      </Button>
    </div>
  )
}
