"use client"

import { useTranslations, useFormatter } from "next-intl"
import type { Column } from "@tanstack/react-table"
import { CalendarIcon } from "lucide-react"
import { Button } from "@dragons/ui/components/button"
import { Calendar } from "@dragons/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover"
import { cn } from "@dragons/ui/lib/utils"
import type { DateRange } from "@dragons/ui/components/calendar"
import { berlinDayAnchor, calendarDayString } from "@/lib/tz"

interface DataTableDateFilterProps<TData, TValue> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableDateFilter<TData, TValue>({
  column,
  title,
}: DataTableDateFilterProps<TData, TValue>) {
  "use no memo"
  const t = useTranslations()
  const format = useFormatter()
  const dateRange = column.getFilterValue() as DateRange | undefined
  const hasValue = dateRange?.from || dateRange?.to

  // The formatter renders in Europe/Berlin, but the calendar hands back local
  // midnight of the clicked day. Re-anchoring the picked day in Berlin keeps
  // the label naming the day the user actually clicked — and keeps it equal to
  // what the column's range filter matches — in every runtime timezone.
  const label = (picked: Date) =>
    format.dateTime(berlinDayAnchor(calendarDayString(picked)), "short")

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 border-dashed", hasValue && "border-solid")}
        >
          <CalendarIcon />
          {hasValue ? (
            <span>
              {dateRange?.from ? label(dateRange.from) : ""}{" "}
              {dateRange?.to ? `– ${label(dateRange.to)}` : ""}
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
          onSelect={(range) => column.setFilterValue(range ?? undefined)}
          numberOfMonths={2}
        />
        {hasValue && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => column.setFilterValue(undefined)}
            >
              {t("common.reset")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
