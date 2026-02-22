import type { FilterOperator } from "@/config/data-table"

export type FilterVariant = "text" | "number" | "range" | "date" | "dateRange" | "boolean" | "select" | "multiSelect"

export interface FilterOption {
  label: string
  value: string
  count?: number
  icon?: React.ComponentType<{ className?: string }>
}

export interface ExtendedColumnMeta {
  label?: string
  variant?: FilterVariant
  options?: FilterOption[]
  range?: [number, number]
  unit?: string
  icon?: React.ComponentType<{ className?: string }>
  placeholder?: string
}

export interface FilterField {
  id: string
  value: string[]
  operator: FilterOperator
  filterId: string
}

export interface FilterFieldValue {
  filterId: string
  value: string[]
  operator: FilterOperator
}
