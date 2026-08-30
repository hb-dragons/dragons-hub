import type { Row } from "@tanstack/react-table"
import type { DateRange } from "@dragons/ui/components/calendar"
import { calendarDayString } from "@dragons/shared"

/**
 * Range filter over a `YYYY-MM-DD` day column.
 *
 * The picked `Date`s are local midnight of the days the user clicked, so their
 * calendar components are read directly (`calendarDayString`). Converting them
 * to UTC instead — `toISOString().slice(0, 10)` — dropped the end day and
 * admitted the day before the start for every user east of Greenwich, and
 * disagreed with the trigger label, which renders the same days via next-intl.
 */
export function dateRangeFilterFn<TData>(
  row: Row<TData>,
  columnId: string,
  value: unknown,
): boolean {
  const dateRange = value as DateRange | undefined
  if (!dateRange) return true
  const cellValue = row.getValue(columnId) as string
  if (dateRange.from && cellValue < calendarDayString(dateRange.from)) return false
  if (dateRange.to && cellValue > calendarDayString(dateRange.to)) return false
  return true
}
