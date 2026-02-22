"use client"

import * as React from "react"

import { cn } from "@dragons/ui/lib/utils"

interface TimePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  className?: string
}

function TimePicker({ value, onChange, className }: TimePickerProps) {
  return (
    <input
      type="time"
      data-slot="time-picker"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(
        "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-sm transition-colors focus-visible:ring-3 outline-none appearance-none [&::-webkit-calendar-picker-indicator]:hidden",
        className
      )}
    />
  )
}

export { TimePicker }
export type { TimePickerProps }
