"use client"

import { useFormatter, useTranslations } from "next-intl"
import type { MatchListItem } from "@dragons/shared"
import { clubDayAnchor } from "@dragons/shared"
import { Badge } from "@dragons/ui/components/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@dragons/ui/components/sheet"
import { TeamBadge } from "@/components/admin/shared/team-badge"
import {
  formatMatchTime,
  formatScore,
  getOwnTeamLabel,
} from "@/components/admin/matches/utils"
import { isDerbyGame, withDerbyPrefix } from "./utils"

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  )
}

interface SpielplanDetailSheetProps {
  game: MatchListItem | null
  onOpenChange: (open: boolean) => void
}

/**
 * Read-only game detail panel — the public counterpart of the admin edit
 * sheet. Carries everything the compact table hides by default (venue,
 * score, Kampfgericht duties, comment), all from the already-loaded row.
 */
export function SpielplanDetailSheet({ game, onOpenChange }: SpielplanDetailSheetProps) {
  const t = useTranslations("spielplan")
  const format = useFormatter()

  return (
    <Sheet open={game !== null} onOpenChange={onOpenChange}>
      {game && (
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {game.homeTeamName} – {game.guestTeamName}
            </SheetTitle>
            <SheetDescription>
              {format.dateTime(clubDayAnchor(game.kickoffDate), "matchDate")}
              {" · "}
              {formatMatchTime(game.kickoffTime)}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-6">
            {(game.isCancelled || game.isForfeited) && (
              <div className="flex gap-2">
                {game.isCancelled && (
                  <Badge variant="destructive">{t("status.cancelled")}</Badge>
                )}
                {game.isForfeited && (
                  <Badge variant="destructive">{t("status.forfeited")}</Badge>
                )}
              </div>
            )}

            <dl className="space-y-3">
              <DetailRow label={t("columns.team")}>
                <TeamBadge
                  name={getOwnTeamLabel(game)}
                  badgeColor={game.homeIsOwnClub ? game.homeBadgeColor : game.guestBadgeColor}
                />
              </DetailRow>
              <DetailRow label={t("columns.score")}>
                <span className="tabular-nums">
                  {formatScore(game.homeScore, game.guestScore)}
                </span>
              </DetailRow>
              <DetailRow label={t("columns.league")}>{game.leagueName ?? "—"}</DetailRow>
              <DetailRow label={t("columns.nr")}>
                <span className="tabular-nums">{game.matchNo}</span>
              </DetailRow>
            </dl>

            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t("columns.venue")}
              </h3>
              <p className="text-sm">{game.venueNameOverride ?? game.venueName ?? "—"}</p>
              {game.venueStreet && <p className="text-sm">{game.venueStreet}</p>}
              {(game.venuePostalCode || game.venueCity) && (
                <p className="text-sm">
                  {[game.venuePostalCode, game.venueCity].filter(Boolean).join(" ")}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t("kampfgericht")}
              </h3>
              <dl className="space-y-3">
                <DetailRow label={t("columns.anschreiber")}>
                  {game.anschreiber ? <TeamBadge name={game.anschreiber} /> : "—"}
                </DetailRow>
                <DetailRow label={t("columns.zeitnehmer")}>
                  {game.zeitnehmer ? <TeamBadge name={game.zeitnehmer} /> : "—"}
                </DetailRow>
                <DetailRow label={t("columns.shotclock")}>
                  {game.shotclock ? <TeamBadge name={game.shotclock} /> : "—"}
                </DetailRow>
              </dl>
            </div>

            {withDerbyPrefix(game.publicComment, isDerbyGame(game)) && (
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("columns.comment")}
                </h3>
                <p className="text-sm">
                  {withDerbyPrefix(game.publicComment, isDerbyGame(game))}
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      )}
    </Sheet>
  )
}
