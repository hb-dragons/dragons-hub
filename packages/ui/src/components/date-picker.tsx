"use client"

import * as React from "react"
import { format, parse } from "date-fns"
import { de } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"

import { cn } from "@dragons/ui/lib/utils"
import { Button } from "@dragons/ui/components/button"
import { Calendar } from "@dragons/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover"

interface DatePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function DatePicker({
  value,
  onChange,
  placeholder = "Datum wählen",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const date = React.useMemo(() => {
    if (!value) return undefined
    return parse(value, "yyyy-MM-dd", new Date())
  }, [value])

  function handleSelect(selected: Date | undefined) {
    if (selected) {
      onChange(format(selected, "yyyy-MM-dd"))
    } else {
      onChange(null)
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4" data-icon="inline-start" />
          {date ? format(date, "dd.MM.yyyy", { locale: de }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={handleSelect}
          locale={de}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
export type { DatePickerProps }
