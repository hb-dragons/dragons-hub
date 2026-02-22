"use client"

import type { Table } from "@tanstack/react-table"
import { SlidersHorizontalIcon } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@dragons/ui/components/command"
import { CheckIcon } from "lucide-react"
import { cn } from "@dragons/ui/lib/utils"

import type { ExtendedColumnMeta } from "@/types/data-table"

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const columns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && column.getCanHide(),
    )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto hidden lg:flex">
          <SlidersHorizontalIcon className="mr-2 size-4" />
          Spalten
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Spalten suchen..." />
          <CommandList>
            <CommandEmpty>Keine Spalten gefunden.</CommandEmpty>
            <CommandGroup>
              {columns.map((column) => {
                const meta = column.columnDef.meta as
                  | ExtendedColumnMeta
                  | undefined
                const label = meta?.label ?? column.id
                const isVisible = column.getIsVisible()

                return (
                  <CommandItem
                    key={column.id}
                    onSelect={() => column.toggleVisibility(!isVisible)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                        isVisible
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <CheckIcon className="size-4" />
                    </div>
                    <span>{label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
