"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { SWR_KEYS } from "@/lib/swr-keys";
import { apiFetcher } from "@/lib/swr";
import { StatCard } from "@/components/admin/shared/stat-card";
import { PageHeader } from "@/components/admin/shared/page-header";
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
import type {
  PaginatedResponse,
  MatchListItem,
  LeagueStandings,
  RefereeListItem,
} from "@dragons/shared";
import type { SyncStatusData } from "./types";

function formatTime(kickoffTime: string | null): string {
  if (!kickoffTime) return "--:--";
  return kickoffTime.slice(0, 5);
}

export function DashboardView() {
  const t = useTranslations("dashboard");
  const today = new Date().toISOString().slice(0, 10);

  const { data: referees } = useSWR<PaginatedResponse<RefereeListItem>>(
    SWR_KEYS.referees(),
    apiFetcher,
  );
  const { data: upcoming } = useSWR<PaginatedResponse<MatchListItem>>(
    SWR_KEYS.dashboardUpcomingMatches,
    apiFetcher,
  );
  const { data: todayMatches } = useSWR<PaginatedResponse<MatchListItem>>(
    SWR_KEYS.dashboardTodayMatches(today),
    apiFetcher,
  );
  const { data: standings } = useSWR<LeagueStandings[]>(
    SWR_KEYS.standings,
    apiFetcher,
  );
  const { data: teams } = useSWR<{ id: number; name: string }[]>(
    SWR_KEYS.teams,
    apiFetcher,
  );
  const { data: syncStatus } = useSWR<SyncStatusData>(
    SWR_KEYS.syncStatus,
    apiFetcher,
  );

  // Compute KPIs
  const refereeCount = referees?.total ?? 0;
  const upcomingCount = upcoming?.total ?? 0;
  const teamsCount = Array.isArray(teams) ? teams.length : 0;

  const bestPosition = standings
    ?.flatMap((league) => league.standings)
    .filter((s) => s.isOwnClub)
    .reduce<number | null>((best, s) => {
      if (best === null || s.position < best) return s.position;
      return best;
    }, null);

  // Compute urgent tasks
  const unreffedMatches =
    todayMatches?.items.filter(
      (m) => !m.anschreiber && !m.zeitnehmer && !m.isCancelled,
    ).length ?? 0;

  const syncFailed = syncStatus?.lastRun?.status === "failed";

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("kpi.referees")}
          value={refereeCount}
          icon={Users}
        />
        <StatCard
          label={t("kpi.upcomingMatches")}
          value={upcomingCount}
          icon={CalendarDays}
        />
        <StatCard
          label={t("kpi.leaguePosition")}
          value={bestPosition ? `#${bestPosition}` : "—"}
          icon={Medal}
        />
        <StatCard
          label={t("kpi.teamsTracked")}
          value={teamsCount}
          icon={Shield}
        />
      </div>

      {/* Two-column: Urgent Tasks + Today's Schedule */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Urgent Tasks */}
        <div className="bg-card rounded-lg p-5 space-y-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">
            {t("urgentTasks.title")}
          </h2>
          <div className="space-y-3">
            {unreffedMatches === 0 && !syncFailed ? (
              <p className="text-muted-foreground text-sm">
                {t("urgentTasks.noTasks")}
              </p>
            ) : (
              <>
                {unreffedMatches > 0 && (
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
                {syncFailed && (
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
            {!todayMatches?.items.length ? (
              <p className="text-muted-foreground text-sm">
                {t("todaySchedule.noMatches")}
              </p>
            ) : (
              todayMatches.items.slice(0, 5).map((match) => (
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
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/teams"
          className="bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low"
        >
          <Shield className="text-primary size-5" />
          <div>
            <p className="font-medium">{t("quickLinks.teams")}</p>
            <p className="text-muted-foreground text-xs">
              {t("quickLinks.teamsDesc", { count: teamsCount })}
            </p>
          </div>
        </Link>
        <Link
          href="/admin/bookings"
          className="bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low"
        >
          <CalendarDays className="text-primary size-5" />
          <div>
            <p className="font-medium">{t("quickLinks.bookings")}</p>
          </div>
        </Link>
        <Link
          href="/admin/sync"
          className={cn(
            "bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low",
          )}
        >
          <div
            className={cn(
              "size-2 rounded-full shrink-0",
              syncFailed ? "bg-destructive" : "bg-primary",
            )}
          />
          <div>
            <p className="font-medium">{t("quickLinks.sync")}</p>
            <p className="text-muted-foreground text-xs">
              {syncFailed
                ? t("quickLinks.syncFailed")
                : t("quickLinks.syncHealthy")}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
