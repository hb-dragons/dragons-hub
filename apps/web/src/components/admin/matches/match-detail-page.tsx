"use client";

import { useCallback, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { Link } from "@/lib/navigation";
import useSWR, { useSWRConfig } from "swr";
import { queries } from "@/lib/swr-queries";
import { clubDayAnchor } from "@dragons/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@dragons/ui/components/sheet";
import { ArrowLeft, CalendarSearch, Pencil } from "lucide-react";
import { Can } from "@/components/rbac/can";
import { MatchEditSheet } from "./match-edit-sheet";
import type { MatchPrefill } from "./match-edit-sheet";
import { AlternativeDatesPanel } from "./alternative-dates-panel";
import { MatchDivergenceTable } from "./match-divergence-table";
import { MatchChangeHistory } from "./match-change-history";
import { formatMatchTime, formatScore, formatPeriodScores } from "./utils";
import type {
  MatchDetailResponse,
  MatchChangeHistoryResponse,
} from "./types";
import { PageHeader } from "@/components/admin/shared/page-header";

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
  // The finder gets its own sheet here rather than the edit sheet's body: the
  // page has no form to take over, and the pick has to survive the handover.
  const [finderOpen, setFinderOpen] = useState(false);
  const [prefill, setPrefill] = useState<MatchPrefill | null>(null);

  const matchDetailQ = queries.matchDetail(matchId);
  const { data: detailData, mutate: mutateDetail } = useSWR(
    matchDetailQ.key,
    matchDetailQ.fetcher,
    { fallbackData: initialDetail },
  );

  const match = detailData?.match ?? initialDetail.match;
  const diffs = detailData?.diffs ?? initialDetail.diffs;
  const overrideCount = match.overrides.length;
  const periodScores = formatPeriodScores(match);

  /** The picked day hands over to the edit sheet, which applies it on load. */
  const handlePick = useCallback((date: string, time: string | null) => {
    setPrefill({ date, time });
    setFinderOpen(false);
    setEditOpen(true);
  }, []);

  /**
   * A pick lives exactly as long as the sheet it was handed to: closing that
   * sheet drops it, so no later opener — the edit button, or one added since —
   * can re-apply a day the staff member picked minutes ago.
   */
  const handleEditOpenChange = useCallback((open: boolean) => {
    setEditOpen(open);
    if (!open) setPrefill(null);
  }, []);

  function handleSaved() {
    void mutateDetail();
    // Revalidate history — use a matcher to catch any limit/offset variant
    void globalMutate(
      (key) => typeof key === "string" && key.startsWith(`/admin/matches/${matchId}/history`),
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`${match.homeTeamName} vs ${match.guestTeamName}`}
        subtitle={
          t("matchDetail.matchday", { day: String(match.matchDay) }) +
          (match.leagueName ? ` \u00B7 ${match.leagueName}` : "")
        }
      >
        <Link href="/admin/matches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("common.back")}
          </Button>
        </Link>
        {overrideCount > 0 && (
          <Badge variant="outline" className="border-heat/50 text-heat">
            {t("matchDetail.overrideCount", { count: overrideCount })}
          </Badge>
        )}
        <Can resource="match" action="update">
          <Button variant="outline" size="sm" onClick={() => setFinderOpen(true)}>
            <CalendarSearch className="mr-2 h-4 w-4" />
            {t("matchDetail.alternativeDates.trigger")}
          </Button>
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("matchDetail.edit")}
          </Button>
        </Can>
      </PageHeader>

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
                  {format.dateTime(clubDayAnchor(match.kickoffDate), "matchDate")}
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
                <Badge variant="outline" className="border-heat/50 text-heat">
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

      {/* Alternative-date finder — only reachable from the gated trigger above,
          so the pick it hands on is behind the same match-update permission. */}
      <Sheet open={finderOpen} onOpenChange={setFinderOpen}>
        <SheetContent className="data-[side=right]:sm:max-w-3xl">
          {/* The panel draws its own heading; this one names the dialog for
              screen readers without showing a second title. */}
          <SheetHeader className="sr-only">
            <SheetTitle>{t("matchDetail.alternativeDates.title")}</SheetTitle>
            <SheetDescription>
              {t("matchDetail.info.matchdaySummary", {
                day: match.matchDay,
                league: match.leagueName ?? "\u2014",
              })}
            </SheetDescription>
          </SheetHeader>
          <AlternativeDatesPanel
            matchId={matchId}
            homeTeamName={match.homeTeamName}
            guestTeamName={match.guestTeamName}
            leagueName={match.leagueName}
            matchDay={match.matchDay}
            onPrefill={handlePick}
            onBack={() => setFinderOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={handleEditOpenChange}>
        <MatchEditSheet
          matchId={matchId}
          open={editOpen}
          onOpenChange={handleEditOpenChange}
          onSaved={handleSaved}
          prefill={prefill}
        />
      </Sheet>
    </div>
  );
}
