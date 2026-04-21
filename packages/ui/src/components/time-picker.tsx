"use client"

import * as React from "react"

import { cn } from "@dragons/ui/lib/utils"

interface TimePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  className?: string
  disabled?: boolean
}

function TimePicker({ value, onChange, className, disabled }: TimePickerProps) {
  return (
    <input
      type="time"
      data-slot="time-picker"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={cn(
        "bg-input border-border/20 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:text-muted-foreground h-8 rounded-md border px-2.5 py-1 text-sm transition-colors focus-visible:ring-3 outline-none appearance-none [&::-webkit-calendar-picker-indicator]:hidden",
        className
      )}
    />
  )
}

export { TimePicker }
export type { TimePickerProps }
