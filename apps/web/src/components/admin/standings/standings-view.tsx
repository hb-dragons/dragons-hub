"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { queries } from "@/lib/swr-queries"
import { SeasonContextSelect } from "@/components/admin/seasons/season-context-select"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { Trophy } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table"
import { cn } from "@dragons/ui/lib/utils"


export function StandingsView() {
  const t = useTranslations("standings")
  // `undefined` is the active season, matching the server prefetch's key.
  const [seasonId, setSeasonId] = useState<number | undefined>(undefined)
  const standingsQ = queries.standings(seasonId)
  const { data: leagues, error, isLoading, mutate } = useSWR(
    standingsQ.key,
    standingsQ.fetcher,
  )

  const leagueList = leagues ?? []

  // The season picker stays mounted through every state below. An upcoming
  // season legitimately has no standings until its first sync, and returning
  // the bare empty state would strand the admin there with no way back to the
  // active season.
  const picker = <SeasonContextSelect value={seasonId} onChange={setSeasonId} />

  // A failed request is not "no standings data" — never collapse the two.
  if (error) {
    return (
      <div className="space-y-8">
        {picker}
        <ErrorState onRetry={() => { void mutate(); }} />
      </div>
    )
  }

  if (isLoading && !leagues) {
    return (
      <div className="space-y-8">
        {picker}
        <LoadingState rows={5} />
      </div>
    )
  }

  if (leagueList.length === 0) {
    return (
      <div className="space-y-8">
        {picker}
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Trophy className="mb-2 h-8 w-8" />
          <p>{t("empty")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {picker}
      {leagueList.map((league) => (
        <div key={league.leagueId} className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">{league.leagueName}</h2>
            <p className="text-sm text-muted-foreground">
              {t("season", { season: league.seasonName })}
            </p>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">{t("columns.position")}</TableHead>
                  <TableHead>{t("columns.team")}</TableHead>
                  <TableHead className="w-12 text-center">{t("columns.played")}</TableHead>
                  <TableHead className="w-12 text-center">{t("columns.won")}</TableHead>
                  <TableHead className="w-12 text-center">{t("columns.lost")}</TableHead>
                  <TableHead className="w-16 text-center">{t("columns.pointsFor")}</TableHead>
                  <TableHead className="w-16 text-center">{t("columns.pointsAgainst")}</TableHead>
                  <TableHead className="w-16 text-center">{t("columns.pointsDiff")}</TableHead>
                  <TableHead className="w-16 text-center font-bold">{t("columns.leaguePoints")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {league.standings.map((standing) => (
                  <TableRow
                    key={`${league.leagueId}-${standing.position}`}
                    className={cn(standing.isOwnClub && "bg-primary/5 font-medium")}
                  >
                    <TableCell className="text-center tabular-nums">{standing.position}</TableCell>
                    <TableCell className={cn(standing.isOwnClub && "font-semibold")}>
                      {standing.teamName}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{standing.played}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.won}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.lost}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.pointsFor}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.pointsAgainst}</TableCell>
                    <TableCell className="text-center tabular-nums">{standing.pointsDiff}</TableCell>
                    <TableCell className="text-center tabular-nums font-bold">{standing.leaguePoints}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  )
}
