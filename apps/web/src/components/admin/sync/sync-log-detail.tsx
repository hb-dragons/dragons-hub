"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { Input } from "@dragons/ui/components/input";
import {
  Trophy,
  Gamepad2,
  Users,
  BarChart,
  MapPin,
  Shield,
  ClipboardList,
  Plus,
  RefreshCw,
  SkipForward,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FilterX,
  ArrowRight,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import type {
  SyncRun,
  SyncRunEntry,
  SyncRunEntriesResponse,
  MatchFieldChange,
  MatchChangesResponse,
  EntityType,
  EntryAction,
} from "./types";

interface SyncLogDetailProps {
  syncRun: SyncRun;
}

const ENTITY_CONFIG: Record<
  EntityType,
  { icon: React.ElementType; labelKey: "league" | "match" | "team" | "standing" | "venue" | "referee" | "refereeRole" | "refereeGame"; color: string }
> = {
  league: { icon: Trophy, labelKey: "league", color: "text-yellow-600" },
  match: { icon: Gamepad2, labelKey: "match", color: "text-purple-600" },
  team: { icon: Users, labelKey: "team", color: "text-blue-600" },
  standing: { icon: BarChart, labelKey: "standing", color: "text-green-600" },
  venue: { icon: MapPin, labelKey: "venue", color: "text-orange-600" },
  referee: { icon: Shield, labelKey: "referee", color: "text-teal-600" },
  refereeRole: {
    icon: ClipboardList,
    labelKey: "refereeRole",
    color: "text-indigo-600",
  },
  refereeGame: {
    icon: ClipboardList,
    labelKey: "refereeGame",
    color: "text-cyan-600",
  },
};

const ACTION_CONFIG: Record<
  EntryAction,
  { icon: React.ElementType; labelKey: "created" | "updated" | "skipped" | "failed"; variant: "success" | "default" | "secondary" | "destructive" }
> = {
  created: { icon: Plus, labelKey: "created", variant: "success" },
  updated: { icon: RefreshCw, labelKey: "updated", variant: "default" },
  skipped: { icon: SkipForward, labelKey: "skipped", variant: "secondary" },
  failed: { icon: XCircle, labelKey: "failed", variant: "destructive" },
};

export function SyncLogDetail({ syncRun }: SyncLogDetailProps) {
  const t = useTranslations("sync.logDetail");
  const tEntity = useTranslations("sync.logDetail.entity");
  const tAction = useTranslations("sync.logDetail.action");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [entries, setEntries] = useState<SyncRunEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showStack, setShowStack] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [matchChangesCache, setMatchChangesCache] = useState<Record<number, MatchFieldChange[] | "loading" | "error">>({});

  const hasActiveFilters = entityFilter !== "all" || actionFilter !== "all" || searchQuery !== "";

  function handleSearchChange(value: string) {
    setSearchInput(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }

  useEffect(() => {
    return () => clearTimeout(searchTimerRef.current);
  }, []);

  function clearFilters() {
    setEntityFilter("all");
    setActionFilter("all");
    setSearchInput("");
    setSearchQuery("");
    clearTimeout(searchTimerRef.current);
  }

  async function toggleMatchChanges(entry: SyncRunEntry) {
    const entryId = entry.id;
    if (expandedEntries.has(entryId)) {
      setExpandedEntries((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
      return;
    }

    setExpandedEntries((prev) => new Set(prev).add(entryId));

    if (matchChangesCache[entryId] && matchChangesCache[entryId] !== "error") return;

    setMatchChangesCache((prev) => ({ ...prev, [entryId]: "loading" }));
    try {
      const data = await fetchAPI<MatchChangesResponse>(
        `/admin/sync/logs/${syncRun.id}/match-changes/${entry.entityId}`,
      );
      setMatchChangesCache((prev) => ({ ...prev, [entryId]: data.changes }));
    } catch {
      setMatchChangesCache((prev) => ({ ...prev, [entryId]: "error" }));
    }
  }

  const loadEntries = useCallback(
    async (offset = 0, append = false, signal?: AbortSignal) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: "50",
          offset: String(offset),
        });
        if (entityFilter !== "all") params.set("entityType", entityFilter);
        if (actionFilter !== "all") params.set("action", actionFilter);
        if (searchQuery) params.set("search", searchQuery);

        const data = await fetchAPI<SyncRunEntriesResponse>(
          `/admin/sync/logs/${syncRun.id}/entries?${params}`,
          { signal },
        );

        setEntries((prev) => {
          if (!append) return data.items;
          const existingIds = new Set(prev.map((e) => e.id));
          return [...prev, ...data.items.filter((e) => !existingIds.has(e.id))];
        });
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [syncRun.id, entityFilter, actionFilter, searchQuery, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadEntries(0, false, controller.signal);
    return () => controller.abort();
  }, [loadEntries]);

  return (
    <div className="space-y-4 p-4">
      {/* Error Details */}
      {syncRun.status === "failed" && syncRun.errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-400">
                {syncRun.errorMessage}
              </p>
              {syncRun.errorStack && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-1 h-auto p-0 text-xs text-red-600"
                  onClick={() => setShowStack(!showStack)}
                >
                  <ChevronDown
                    className={`mr-1 h-3 w-3 transition-transform ${showStack ? "rotate-180" : ""}`}
                  />
                  {showStack ? t("hideStack") : t("showStack")}
                </Button>
              )}
              {showStack && syncRun.errorStack && (
                <pre className="mt-2 max-h-[200px] overflow-auto rounded bg-red-100 p-2 font-mono text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                  {syncRun.errorStack}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-9 w-[200px] bg-background pl-8 text-sm"
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allEntities")}</SelectItem>
            {(Object.keys(ENTITY_CONFIG) as EntityType[]).map((key) => (
              <SelectItem key={key} value={key}>
                {tEntity(ENTITY_CONFIG[key].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[140px] bg-background">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allActions")}</SelectItem>
            {(Object.keys(ACTION_CONFIG) as EntryAction[]).map((key) => (
              <SelectItem key={key} value={key}>
                {tAction(ACTION_CONFIG[key].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX className="mr-1 h-3 w-3" />
            {tCommon("clear")}
          </Button>
        )}

        <span className="text-sm text-muted-foreground">
          {t("entries", { count: total })}
        </span>
      </div>

      {/* Entries List */}
      <div className="max-h-[400px] overflow-y-auto rounded-md border">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t("loadingEntries")}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <p>
              {hasActiveFilters
                ? t("noMatchingEntries")
                : t("noEntries")}
            </p>
            {hasActiveFilters && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                {tCommon("clearFilters")}
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => {
              const entityCfg = ENTITY_CONFIG[entry.entityType] ?? {
                icon: ClipboardList,
                labelKey: entry.entityType,
                color: "text-muted-foreground",
              };
              const actionCfg = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.skipped;
              const EntityIcon = entityCfg.icon;
              const ActionIcon = actionCfg.icon;
              const isExpandable = entry.entityType === "match" && entry.action === "updated";
              const isExpanded = expandedEntries.has(entry.id);
              const cachedChanges = matchChangesCache[entry.id];

              return (
                <div key={entry.id}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2 text-sm bg-background ${isExpandable ? "cursor-pointer hover:bg-muted/50" : ""}`}
                    onClick={isExpandable ? () => toggleMatchChanges(entry) : undefined}
                  >
                    {isExpandable ? (
                      isExpanded ? (
                        <ChevronDown className={`h-4 w-4 shrink-0 ${entityCfg.color}`} />
                      ) : (
                        <ChevronRight className={`h-4 w-4 shrink-0 ${entityCfg.color}`} />
                      )
                    ) : (
                      <EntityIcon className={`h-4 w-4 shrink-0 ${entityCfg.color}`} />
                    )}
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {tEntity(entityCfg.labelKey)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {entry.entityName || entry.entityId}
                      </span>
                      {entry.message && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {entry.message}
                        </span>
                      )}
                    </div>
                    <Badge variant={actionCfg.variant} className="shrink-0">
                      <ActionIcon className="h-3 w-3" />
                      {tAction(actionCfg.labelKey)}
                    </Badge>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {format.dateTime(new Date(entry.createdAt), "timeOnly")}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="border-t bg-muted/30 px-6 py-2">
                      {cachedChanges === "loading" && (
                        <p className="text-xs text-muted-foreground">{t("loadingChanges")}</p>
                      )}
                      {cachedChanges === "error" && (
                        <p className="text-xs text-destructive">{t("changesFailed")}</p>
                      )}
                      {Array.isArray(cachedChanges) && cachedChanges.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t("noChanges")}</p>
                      )}
                      {Array.isArray(cachedChanges) && cachedChanges.length > 0 && (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-muted-foreground">
                              <th className="pb-1 pr-4 font-medium">{t("field")}</th>
                              <th className="pb-1 pr-4 font-medium">{t("fieldOld")}</th>
                              <th className="pb-1 font-medium">{t("fieldNew")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cachedChanges.map((change) => (
                              <tr key={change.fieldName}>
                                <td className="py-0.5 pr-4 font-mono">{change.fieldName}</td>
                                <td className="py-0.5 pr-4 text-muted-foreground">{change.oldValue ?? "–"}</td>
                                <td className="py-0.5 font-medium">
                                  <span className="inline-flex items-center gap-1">
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    {change.newValue ?? "–"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEntries(entries.length, true)}
            disabled={loading}
          >
            {t("loadMore", { remaining: String(total - entries.length) })}
          </Button>
        </div>
      )}
    </div>
  );
}
