"use client"

import { CalendarIcon } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import { Calendar } from "@dragons/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover"
import { cn } from "@dragons/ui/lib/utils"
import type { DateRange } from "react-day-picker"

import { formatDate } from "@/lib/format"

interface DataTableDateFilterProps {
  title?: string
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
}

export function DataTableDateFilter({
  title,
  dateRange,
  onDateRangeChange,
}: DataTableDateFilterProps) {
  const hasValue = dateRange?.from || dateRange?.to

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 border-dashed", hasValue && "border-solid")}
        >
          <CalendarIcon className="mr-2 size-4" />
          {hasValue ? (
            <span>
              {dateRange?.from ? formatDate(dateRange.from) : ""}{" "}
              {dateRange?.to ? `– ${formatDate(dateRange.to)}` : ""}
            </span>
          ) : (
            <span>{title}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={onDateRangeChange}
          numberOfMonths={2}
        />
        {hasValue && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onDateRangeChange(undefined)}
            >
              Zurücksetzen
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
