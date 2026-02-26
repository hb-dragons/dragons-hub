"use client"

import { useTranslations } from "next-intl"
import useSWR from "swr"
import { apiFetcher } from "@/lib/swr"
import { SWR_KEYS } from "@/lib/swr-keys"
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

import type { LeagueStandings } from "./types"

export function StandingsView() {
  const t = useTranslations("standings")
  const { data: leagues } = useSWR<LeagueStandings[]>(SWR_KEYS.standings, apiFetcher)

  const leagueList = leagues ?? []

  if (leagueList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Trophy className="mb-2 h-8 w-8" />
        <p>{t("empty")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
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
