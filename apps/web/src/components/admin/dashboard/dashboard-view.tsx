"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { queries } from "@/lib/swr-queries";
import { can, todayInClubZone, type GateUser } from "@dragons/shared";
import { StatCard } from "@/components/admin/shared/stat-card";
import { PageHeader } from "@/components/admin/shared/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Users,
  CalendarDays,
  Medal,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";

function formatTime(kickoffTime: string | null): string {
  if (!kickoffTime) return "--:--";
  return kickoffTime.slice(0, 5);
}

/** Placeholder for a KPI whose value is not knowable yet. */
const UNKNOWN_VALUE = "—";

export interface DashboardViewProps {
  /**
   * Session user resolved server-side by `admin/layout.tsx`. Passing it down
   * avoids a second client-side session round trip that would make every
   * permission check false on first paint and flash a blank dashboard.
   */
  user: GateUser;
}

export function DashboardView({ user }: DashboardViewProps) {
  const t = useTranslations("dashboard");
  const today = todayInClubZone();
  const canViewReferees = can(user, "referee", "view");
  const canViewMatches = can(user, "match", "view");
  const canViewStandings = can(user, "standing", "view");
  const canViewTeams = can(user, "team", "view");
  const canViewSync = can(user, "sync", "view");
  const canViewBookings = can(user, "booking", "view");

  const refsQ = queries.refereesPaginated({ scope: "own", limit: 50 });
  const refereesR = useSWR(canViewReferees ? refsQ.key : null, refsQ.fetcher);
  const upcomingQ = queries.dashboardUpcomingMatches();
  const upcomingR = useSWR(canViewMatches ? upcomingQ.key : null, upcomingQ.fetcher);
  const todayQ = queries.dashboardTodayMatches(today);
  const todayR = useSWR(canViewMatches ? todayQ.key : null, todayQ.fetcher);
  const standingsQ = queries.standings();
  const standingsR = useSWR(canViewStandings ? standingsQ.key : null, standingsQ.fetcher);
  const teamsQ = queries.teams();
  const teamsR = useSWR(canViewTeams ? teamsQ.key : null, teamsQ.fetcher);
  const statusQ = queries.syncStatus();
  const statusR = useSWR(canViewSync ? statusQ.key : null, statusQ.fetcher);

  const all = [refereesR, upcomingR, todayR, standingsR, teamsR, statusR];
  const anyError = all.some((r) => r.error !== undefined);
  const retryAll = () => {
    for (const r of all) void r.mutate();
  };

  // Compute KPIs. A failed or in-flight query yields "unknown", never zero.
  const refereeCount = kpi(refereesR, (d) => d.total);
  const upcomingCount = kpi(upcomingR, (d) => d.total);
  const teamsCount = kpi(teamsR, (d) => d.length);
  const teamsCountNumber = teamsR.data?.length ?? 0;

  const bestPosition = standingsR.data
    ?.flatMap((league) => league.standings)
    .filter((s) => s.isOwnClub)
    .reduce<number | null>((best, s) => {
      if (best === null || s.position < best) return s.position;
      return best;
    }, null);

  // Urgent tasks: only meaningful once both feeding queries have resolved.
  const urgentError = todayR.error !== undefined || statusR.error !== undefined;
  const urgentLoading =
    !urgentError && (isPending(todayR, canViewMatches) || isPending(statusR, canViewSync));
  const unreffedMatches =
    todayR.data?.items.filter(
      (m) => !m.anschreiber && !m.zeitnehmer && !m.isCancelled,
    ).length ?? 0;

  const syncFailed = statusR.data?.lastSync?.status === "failed";
  // Three-way, never two-way: an undefined status must not read as healthy.
  const syncState: "failed" | "healthy" | "unknown" = statusR.data
    ? syncFailed
      ? "failed"
      : "healthy"
    : "unknown";

  const todayError = todayR.error !== undefined;
  const todayLoading = !todayError && isPending(todayR, canViewMatches);

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {anyError && <ErrorState onRetry={retryAll} className="items-start text-left" />}

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {canViewReferees && (
          <StatCard label={t("kpi.referees")} value={refereeCount} icon={Users} />
        )}
        {canViewMatches && (
          <StatCard
            label={t("kpi.upcomingMatches")}
            value={upcomingCount}
            icon={CalendarDays}
          />
        )}
        {canViewStandings && (
          <StatCard
            label={t("kpi.leaguePosition")}
            value={
              standingsR.error || !standingsR.data
                ? UNKNOWN_VALUE
                : bestPosition
                  ? `#${bestPosition}`
                  : UNKNOWN_VALUE
            }
            icon={Medal}
          />
        )}
        {canViewTeams && (
          <StatCard label={t("kpi.teamsTracked")} value={teamsCount} icon={Shield} />
        )}
      </div>

      {/* Two-column: Urgent Tasks + Today's Schedule */}
      {(canViewMatches || canViewSync) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Urgent Tasks */}
          <div className="bg-card rounded-lg p-5 space-y-4">
            <h2 className="font-display text-lg font-bold uppercase tracking-tight">
              {t("urgentTasks.title")}
            </h2>
            <div className="space-y-3">
              {urgentError ? (
                <ErrorState onRetry={retryAll} />
              ) : urgentLoading ? (
                <LoadingState rows={2} />
              ) : unreffedMatches === 0 && !syncFailed ? (
                <p className="text-muted-foreground text-sm">
                  {t("urgentTasks.noTasks")}
                </p>
              ) : (
                <>
                  {canViewMatches && unreffedMatches > 0 && (
                    <Link
                      href="/admin/matches"
                      className="flex items-center gap-3 rounded-md bg-heat/10 p-3 text-sm transition-colors hover:bg-heat/20"
                    >
                      <AlertTriangle className="size-4 text-heat shrink-0" />
                      <span>
                        {t("urgentTasks.unreffedMatches", {
                          count: unreffedMatches,
                        })}
                      </span>
                      <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                    </Link>
                  )}
                  {canViewSync && syncFailed && (
                    <Link
                      href="/admin/sync"
                      className="flex items-center gap-3 rounded-md bg-destructive/10 p-3 text-sm transition-colors hover:bg-destructive/20"
                    >
                      <AlertTriangle className="size-4 text-destructive shrink-0" />
                      <span>{t("urgentTasks.syncError")}</span>
                      <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Today's Schedule */}
          {canViewMatches && (
            <div className="bg-card rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold uppercase tracking-tight">
                  {t("todaySchedule.title")}
                </h2>
                <Link
                  href="/admin/matches"
                  className="text-primary text-xs font-medium uppercase tracking-wide hover:underline"
                >
                  {t("todaySchedule.viewAll")}
                </Link>
              </div>
              <div className="space-y-2">
                {todayError ? (
                  <ErrorState onRetry={() => { void todayR.mutate(); }} />
                ) : todayLoading ? (
                  <LoadingState rows={3} />
                ) : !todayR.data?.items.length ? (
                  <p className="text-muted-foreground text-sm">
                    {t("todaySchedule.noMatches")}
                  </p>
                ) : (
                  todayR.data.items.slice(0, 5).map((match) => (
                    <Link
                      key={match.id}
                      href={`/admin/matches/${match.id}`}
                      className="flex items-center gap-4 rounded-md p-3 text-sm transition-colors hover:bg-surface-low"
                    >
                      <span className="font-display text-muted-foreground w-12 shrink-0 font-medium">
                        {formatTime(match.kickoffTime)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {match.homeTeamName}{" "}
                          <span className="text-muted-foreground">vs</span>{" "}
                          {match.guestTeamName}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {match.venueName ?? match.venueNameOverride ?? "—"} •{" "}
                          {match.leagueName ?? "—"}
                        </p>
                      </div>
                      {match.anschreiber ? (
                        <CheckCircle className="text-primary size-4 shrink-0" />
                      ) : (
                        <Clock className="text-heat size-4 shrink-0" />
                      )}
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        {canViewTeams && (
          <Link
            href="/admin/teams"
            className="bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low"
          >
            <Shield className="text-primary size-5" />
            <div>
              <p className="font-medium">{t("quickLinks.teams")}</p>
              <p className="text-muted-foreground text-xs">
                {t("quickLinks.teamsDesc", { count: teamsCountNumber })}
              </p>
            </div>
          </Link>
        )}
        {canViewBookings && (
          <Link
            href="/admin/bookings"
            className="bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low"
          >
            <CalendarDays className="text-primary size-5" />
            <div>
              <p className="font-medium">{t("quickLinks.bookings")}</p>
            </div>
          </Link>
        )}
        {canViewSync && (
          <Link
            href="/admin/sync"
            className="bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low"
          >
            <div
              data-testid="sync-indicator"
              data-sync-state={syncState}
              className={cn(
                "size-2 rounded-full shrink-0",
                syncState === "failed" && "bg-destructive",
                syncState === "healthy" && "bg-primary",
                // Unknown must look nothing like healthy: a hollow ring, not a
                // filled brand-green dot.
                syncState === "unknown" && "border-muted-foreground/60 border",
              )}
            />
            <div>
              <p className="font-medium">{t("quickLinks.sync")}</p>
              <p className="text-muted-foreground text-xs">
                {syncState === "failed"
                  ? t("quickLinks.syncFailed")
                  : syncState === "healthy"
                    ? t("quickLinks.syncHealthy")
                    : t("quickLinks.syncUnknown")}
              </p>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * True while a permitted query has neither data nor an error yet. SWR reports
 * `isLoading: false` for a null key, so the gate is folded in explicitly.
 */
function isPending(
  result: { data: unknown; error: unknown; isLoading: boolean },
  allowed: boolean,
): boolean {
  return allowed && result.error === undefined && result.data === undefined;
}

/** Renders a numeric KPI, or the unknown placeholder when it cannot be known. */
function kpi<T>(
  result: { data: T | undefined; error: unknown },
  select: (data: T) => number,
): string | number {
  if (result.error !== undefined || result.data === undefined) return UNKNOWN_VALUE;
  return select(result.data);
}
