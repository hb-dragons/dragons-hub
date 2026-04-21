"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { Link } from "@/lib/navigation";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Sheet } from "@dragons/ui/components/sheet";
import { ArrowLeft, Pencil } from "lucide-react";
import { Can } from "@/components/rbac/can";
import { MatchEditSheet } from "./match-edit-sheet";
import { MatchDivergenceTable } from "./match-divergence-table";
import { MatchChangeHistory } from "./match-change-history";
import { formatMatchTime, formatScore, formatPeriodScores } from "./utils";
import type {
  MatchDetailResponse,
  MatchChangeHistoryResponse,
} from "./types";

interface MatchDetailPageProps {
  matchId: number;
  initialDetail: MatchDetailResponse;
  initialHistory: MatchChangeHistoryResponse;
}

export function MatchDetailPage({
  matchId,
  initialDetail,
  initialHistory,
}: MatchDetailPageProps) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const [editOpen, setEditOpen] = useState(false);

  const { data: detailData, mutate: mutateDetail } = useSWR<MatchDetailResponse>(
    SWR_KEYS.matchDetail(matchId),
    apiFetcher,
    { fallbackData: initialDetail },
  );

  const match = detailData?.match ?? initialDetail.match;
  const diffs = detailData?.diffs ?? initialDetail.diffs;
  const overrideCount = match.overrides.length;
  const periodScores = formatPeriodScores(match);

  function handleSaved() {
    mutateDetail();
    // Revalidate history — use a matcher to catch any limit/offset variant
    globalMutate(
      (key) => typeof key === "string" && key.startsWith(`/admin/matches/${matchId}/history`),
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/matches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("common.back")}
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {match.homeTeamName} vs {match.guestTeamName}
          </h1>
          <p className="text-muted-foreground">
            {t("matchDetail.matchday", { day: String(match.matchDay) })}
            {match.leagueName ? ` \u00B7 ${match.leagueName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overrideCount > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {t("matchDetail.overrideCount", { count: overrideCount })}
            </Badge>
          )}
          <Can resource="match" action="update">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t("matchDetail.edit")}
            </Button>
          </Can>
        </div>
      </div>

      {/* Match Info */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("matchDetail.info.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.info.matchNo")}</dt>
                <dd className="font-medium">{match.matchNo}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.info.matchday")}</dt>
                <dd className="font-medium">{match.matchDay}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.info.league")}</dt>
                <dd className="font-medium">{match.leagueName ?? "\u2014"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.info.date")}</dt>
                <dd className="font-medium">
                  {format.dateTime(new Date(match.kickoffDate + "T00:00:00"), "matchDate")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.info.time")}</dt>
                <dd className="font-medium">{formatMatchTime(match.kickoffTime)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.info.venue")}</dt>
                <dd className="font-medium">
                  {match.venueNameOverride ?? match.venueName ?? "\u2014"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("matchDetail.score.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.score.final")}</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {formatScore(match.homeScore, match.guestScore)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("matchDetail.score.halftime")}</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {formatScore(match.homeHalftimeScore, match.guestHalftimeScore)}
                </dd>
              </div>
            </div>

            {periodScores.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-xs font-medium text-muted-foreground" />
                      {periodScores.map((p) => (
                        <th key={p.label} className="px-2 py-1 text-center text-xs font-medium text-muted-foreground">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1 text-xs font-medium">{match.homeTeamName}</td>
                      {periodScores.map((p) => (
                        <td key={p.label} className="px-2 py-1 text-center tabular-nums">
                          {p.home ?? "\u2014"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-xs font-medium">{match.guestTeamName}</td>
                      {periodScores.map((p) => (
                        <td key={p.label} className="px-2 py-1 text-center tabular-nums">
                          {p.guest ?? "\u2014"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              {match.isConfirmed && <Badge variant="default">{t("matchDetail.status.confirmed")}</Badge>}
              {match.isForfeited && <Badge variant="destructive">{t("matchDetail.status.forfeited")}</Badge>}
              {match.isCancelled && <Badge variant="destructive">{t("matchDetail.status.cancelled")}</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referees */}
      {match.refereeSlots && match.refereeSlots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("matchDetail.referees.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {match.refereeSlots.map((slot) => (
                <div key={slot.slotNumber} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      SR {slot.slotNumber}
                    </span>
                    {slot.referee ? (
                      <span className="text-sm">
                        {slot.referee.firstName} {slot.referee.lastName}
                        {slot.role && (
                          <span className="text-muted-foreground">
                            {" "}({slot.role.shortName ?? slot.role.name})
                          </span>
                        )}
                      </span>
                    ) : slot.isOpen ? (
                      <Badge variant="destructive">{t("matchDetail.referees.open")}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Booking */}
      {match.booking && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("matchDetail.booking.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  match.booking.status === "confirmed"
                    ? "success"
                    : match.booking.status === "requested"
                      ? "default"
                      : match.booking.status === "cancelled"
                        ? "destructive"
                        : "secondary"
                }
              >
                {t(`bookings.status.${match.booking.status}`)}
              </Badge>
              {match.booking.needsReconfirmation && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  {t("matchDetail.booking.needsReconfirmation")}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Divergence */}
      <MatchDivergenceTable diffs={diffs} />

      {/* Change History */}
      <MatchChangeHistory matchId={matchId} initialData={initialHistory} />

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <MatchEditSheet
          matchId={matchId}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={handleSaved}
        />
      </Sheet>
    </div>
  );
}
