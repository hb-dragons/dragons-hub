export const filterOperators = [
  "eq",
  "ne",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "isBetween",
  "isEmpty",
  "isNotEmpty",
  "isFalse",
  "isTrue",
  "isAnyOf",
] as const

export type FilterOperator = (typeof filterOperators)[number]

export const dataTableConfig = {
  textOperators: [
    { label: "Enthält", value: "contains" as const },
    { label: "Enthält nicht", value: "notContains" as const },
    { label: "Ist", value: "eq" as const },
    { label: "Ist nicht", value: "ne" as const },
    { label: "Beginnt mit", value: "startsWith" as const },
    { label: "Endet mit", value: "endsWith" as const },
    { label: "Ist leer", value: "isEmpty" as const },
    { label: "Ist nicht leer", value: "isNotEmpty" as const },
  ],
  numberOperators: [
    { label: "=", value: "eq" as const },
    { label: "≠", value: "ne" as const },
    { label: ">", value: "gt" as const },
    { label: "≥", value: "gte" as const },
    { label: "<", value: "lt" as const },
    { label: "≤", value: "lte" as const },
    { label: "Zwischen", value: "isBetween" as const },
    { label: "Ist leer", value: "isEmpty" as const },
    { label: "Ist nicht leer", value: "isNotEmpty" as const },
  ],
  dateOperators: [
    { label: "Ist", value: "eq" as const },
    { label: "Ist nicht", value: "ne" as const },
    { label: "Nach", value: "gt" as const },
    { label: "Vor", value: "lt" as const },
    { label: "Zwischen", value: "isBetween" as const },
    { label: "Ist leer", value: "isEmpty" as const },
    { label: "Ist nicht leer", value: "isNotEmpty" as const },
  ],
  selectOperators: [
    { label: "Ist", value: "eq" as const },
    { label: "Ist nicht", value: "ne" as const },
    { label: "Ist leer", value: "isEmpty" as const },
    { label: "Ist nicht leer", value: "isNotEmpty" as const },
  ],
  multiSelectOperators: [
    { label: "Ist einer von", value: "isAnyOf" as const },
    { label: "Ist leer", value: "isEmpty" as const },
    { label: "Ist nicht leer", value: "isNotEmpty" as const },
  ],
}
