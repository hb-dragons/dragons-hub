"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { BrowsableLeague, LeagueTeam } from "@dragons/shared";
import { Input } from "@dragons/ui/components/input";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Switch } from "@dragons/ui/components/switch";
import { Badge } from "@dragons/ui/components/badge";

export interface LeaguePickerProps {
  leagues: BrowsableLeague[];
  selected: Set<number>;
  onToggle: (ligaId: number, checked: boolean) => void;
  filter: string;
  onFilterChange: (v: string) => void;
  ownClubOnly: boolean;
  onOwnClubOnlyChange: (v: boolean) => void;
  vorabligaOnly: boolean;
  onVorabligaOnlyChange: (v: boolean) => void;
  loading: boolean;
}

export function LeaguePicker({
  leagues,
  selected,
  onToggle,
  filter,
  onFilterChange,
  ownClubOnly,
  onOwnClubOnlyChange,
  vorabligaOnly,
  onVorabligaOnlyChange,
  loading,
}: LeaguePickerProps) {
  const t = useTranslations();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leagues;
    return leagues.filter((l) =>
      [l.name, l.skName, l.akName, l.geschlecht].some((s) => s?.toLowerCase().includes(q)),
    );
  }, [leagues, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Switch
            id="own-club-only"
            checked={ownClubOnly}
            disabled={loading}
            onCheckedChange={onOwnClubOnlyChange}
          />
          <label htmlFor="own-club-only" className="cursor-pointer">
            {t("settings.seasons.wizard.ownClubOnly")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="vorabliga-only"
            checked={vorabligaOnly}
            disabled={loading}
            onCheckedChange={onVorabligaOnlyChange}
          />
          <label htmlFor="vorabliga-only" className="cursor-pointer">
            {t("settings.seasons.wizard.vorabligaOnly")}
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("settings.seasons.wizard.loadingLeagues")}
        </div>
      ) : leagues.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("settings.seasons.wizard.noLeagues")}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Input
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={t("settings.seasons.wizard.searchPlaceholder")}
              aria-label={t("settings.seasons.wizard.searchPlaceholder")}
            />
            <Badge variant="secondary" className="shrink-0">
              {t("settings.seasons.wizard.selectedCount", { count: selected.size })}
            </Badge>
          </div>
          <ul className="max-h-72 overflow-auto rounded-md bg-surface-low p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("settings.seasons.wizard.noMatches")}
              </li>
            ) : (
              filtered.map((l) => (
                <LeagueRow
                  key={l.ligaId}
                  league={l}
                  checked={selected.has(l.ligaId)}
                  onToggle={onToggle}
                />
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function LeagueRow({
  league,
  checked,
  onToggle,
}: {
  league: BrowsableLeague;
  checked: boolean;
  onToggle: (ligaId: number, checked: boolean) => void;
}) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const [teams, setTeams] = useState<LeagueTeam[] | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError] = useState(false);

  async function expand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (teams !== null || loadingTeams) return; // already loaded / loading
    setLoadingTeams(true);
    setError(false);
    try {
      const res = await api.seasons.leagueTeams(league.ligaId);
      setTeams(res.teams);
    } catch {
      setError(true);
    } finally {
      setLoadingTeams(false);
    }
  }

  return (
    <li>
      <div className="flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-high">
        <Checkbox
          className="mt-0.5"
          checked={checked}
          aria-label={league.name}
          onCheckedChange={(c) => onToggle(league.ligaId, c === true)}
        />
        <span className="flex flex-1 flex-col">
          <span className="text-sm font-medium">{league.name}</span>
          <span className="text-xs text-muted-foreground">
            {[league.skName, league.akName, league.geschlecht].filter(Boolean).join(" · ")}
          </span>
          <button
            type="button"
            className="mt-1 self-start text-xs text-primary hover:underline"
            onClick={() => { void expand(); }}
          >
            {expanded ? t("settings.seasons.wizard.hideTeams") : t("settings.seasons.wizard.showTeams")}
          </button>
          {expanded && (
            <span className="mt-1 text-xs text-muted-foreground">
              {loadingTeams ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  {t("settings.seasons.wizard.teamsLoading")}
                </span>
              ) : error ? (
                t("settings.seasons.wizard.teamsError")
              ) : teams && teams.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {teams.map((tm) => (
                    <span key={tm.teamPermanentId} className={tm.isOwnClub ? "font-medium text-foreground" : ""}>
                      {tm.isOwnClub ? "★ " : ""}<span>{tm.name}</span>
                    </span>
                  ))}
                </span>
              ) : (
                t("settings.seasons.wizard.noTeams")
              )}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}
