import type { SearchParams } from "nuqs/server"
import { fetchAPIServer } from "@/lib/api.server"
import { MatchListTable } from "@/components/admin/matches/match-list-table"
import type { MatchListResponse, MatchListItem } from "@/components/admin/matches/types"
import { matchSearchParamsCache } from "@/components/admin/matches/search-params"
import { getOwnTeamLabel } from "@/components/admin/matches/utils"

interface MatchesPageProps {
  searchParams: Promise<SearchParams>
}

function compareValues(a: unknown, b: unknown, desc: boolean): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  let result: number
  if (typeof a === "string" && typeof b === "string") {
    result = a.localeCompare(b)
  } else if (typeof a === "number" && typeof b === "number") {
    result = a - b
  } else {
    result = String(a).localeCompare(String(b))
  }

  return desc ? -result : result
}

function getSortValue(item: MatchListItem, field: string): unknown {
  switch (field) {
    case "team":
      return getOwnTeamLabel(item)
    case "home":
      return item.homeIsOwnClub ? "Dragons" : item.homeTeamName
    case "guest":
      return item.homeIsOwnClub ? item.guestTeamName : "Dragons"
    case "score": {
      if (item.homeScore == null || item.guestScore == null) return null
      return item.homeScore * 1000 + item.guestScore
    }
    default:
      return item[field as keyof MatchListItem]
  }
}

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const { page, perPage, sort, team, dateFrom, dateTo } =
    await matchSearchParamsCache.parse(searchParams)

  let data: MatchListResponse | null = null
  let error: string | null = null

  try {
    data = await fetchAPIServer<MatchListResponse>("/admin/matches")
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API"
  }

  const allItems = data?.items ?? []

  // Compute team options from ALL matches (before filtering)
  const teamOptions = [
    ...new Set(allItems.map((m) => getOwnTeamLabel(m))),
  ].sort()

  // Apply filters
  let items = allItems

  // Filter by team (multiSelect)
  if (team.length > 0) {
    items = items.filter((m) => team.includes(getOwnTeamLabel(m)))
  }

  // Filter by date range
  if (dateFrom) {
    const fromStr = dateFrom.toISOString().slice(0, 10)
    items = items.filter((m) => m.kickoffDate >= fromStr)
  }
  if (dateTo) {
    const toStr = dateTo.toISOString().slice(0, 10)
    items = items.filter((m) => m.kickoffDate <= toStr)
  }

  // Sort
  if (sort.length > 0) {
    items = [...items].sort((a, b) => {
      for (const s of sort) {
        const result = compareValues(
          getSortValue(a, s.id),
          getSortValue(b, s.id),
          s.desc,
        )
        if (result !== 0) return result
      }
      return 0
    })
  }

  // Paginate
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const paginatedData = items.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Spiele</h1>
        <p className="text-muted-foreground">
          Spiele des eigenen Vereins anzeigen und verwalten
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <MatchListTable
          data={paginatedData}
          pageCount={pageCount}
          teamOptions={teamOptions}
        />
      )}
    </div>
  )
}
