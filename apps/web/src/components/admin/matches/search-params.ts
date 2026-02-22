import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsTimestamp,
} from "nuqs/server"

import { getSortingStateParser } from "@/lib/parsers"

export const matchSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser(),
  team: parseAsArrayOf(parseAsString).withDefault([]),
  dateFrom: parseAsTimestamp.withOptions({ clearOnDefault: true }),
  dateTo: parseAsTimestamp.withOptions({ clearOnDefault: true }),
}

export const matchSearchParamsCache = createSearchParamsCache(matchSearchParams)
