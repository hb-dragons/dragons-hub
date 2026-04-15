"use client";

import { useMemo, useState, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { RefereeGameListItem, PaginatedResponse } from "@dragons/shared";
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { cn } from "@dragons/ui/lib/utils";
import {
  Ban,
  Calendar,
  CircleOff,
  Loader2,
  RefreshCw,
  SearchIcon,
  SquareActivity,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";

// ------------------------------------------------------------------
// SrSlotBadge
// ------------------------------------------------------------------

interface SrSlotBadgeProps {
  status: "open" | "offered" | "assigned";
  ourClub: boolean;
  name: string | null;
  t: ReturnType<typeof useTranslations<"refereeGames">>;
}

function SrSlotBadge({ status, ourClub, name, t }: SrSlotBadgeProps) {
  if (status === "assigned" && ourClub) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap",
          "bg-primary/10 text-primary border-primary/20",
        )}
      >
        {name ?? t("srStatus.assigned")}
      </Badge>
    );
  }

  if (status === "assigned") {
    return (
      <span className="text-sm text-muted-foreground">{name ?? t("srStatus.assigned")}</span>
    );
  }

  if (status === "offered" && ourClub) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap",
          "border-heat/20 bg-heat/10 text-heat",
        )}
      >
        {name ?? t("srStatus.offered")}
      </Badge>
    );
  }

  if (status === "offered") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap",
          "border-secondary/20 bg-secondary/10 text-secondary-foreground",
        )}
      >
        {name ?? t("srStatus.offered")}
      </Badge>
    );
  }

  // open
  if (ourClub) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap font-medium",
          "border-heat/30 bg-heat/15 text-heat",
        )}
      >
        {t("srStatus.open")}
      </Badge>
    );
  }

  return (
    <span className="text-sm text-muted-foreground">{t("srStatus.open")}</span>
  );
}

// ------------------------------------------------------------------
// FacetChips — SR-status filter
// ------------------------------------------------------------------

type GameFilterValue = "our-duty" | "open-slots" | "all";

interface FacetChipsProps {
  value: GameFilterValue;
  onChange: (v: GameFilterValue) => void;
  options: { label: string; value: GameFilterValue }[];
}

function FacetChips({ value, onChange, options }: FacetChipsProps) {

  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-4xl border px-3 py-1 text-xs transition-colors",
            value === opt.value
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Global filter
// ------------------------------------------------------------------

const globalFilterFn: FilterFn<RefereeGameListItem> = (row, _columnId, filterValue) => {
  const search = (filterValue as string).toLowerCase();
  if (!search) return true;
  const m = row.original;
  return (
    m.homeTeamName.toLowerCase().includes(search) ||
    m.guestTeamName.toLowerCase().includes(search) ||
    (m.leagueName ?? "").toLowerCase().includes(search) ||
    (m.venueName ?? "").toLowerCase().includes(search)
  );
};

// ------------------------------------------------------------------
// Column definitions
// ------------------------------------------------------------------

function getColumns(
  t: ReturnType<typeof useTranslations<"refereeGames">>,
  format: ReturnType<typeof useFormatter>,
): ColumnDef<RefereeGameListItem, unknown>[] {
  return [
    {
      accessorKey: "kickoffDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.date")} />
      ),
      cell: ({ row }) => {
        const inactive = row.original.isCancelled || row.original.isForfeited;
        return (
          <span className={cn("whitespace-nowrap text-sm", inactive && "line-through")}>
            {format.dateTime(new Date(row.original.kickoffDate + "T00:00:00"), "matchDate")}
          </span>
        );
      },
      meta: { label: t("columns.date") },
    },
    {
      accessorKey: "kickoffTime",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.time")} />
      ),
      cell: ({ row }) => {
        const inactive = row.original.isCancelled || row.original.isForfeited;
        return (
          <span className={cn("whitespace-nowrap tabular-nums text-sm", inactive && "line-through")}>
            {row.original.kickoffTime?.slice(0, 5) ?? ""}
          </span>
        );
      },
      meta: { label: t("columns.time") },
    },
    {
      accessorKey: "homeTeamName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.home")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const inactive = m.isCancelled || m.isForfeited;
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn("text-sm", inactive && "line-through")}>
              {m.homeTeamName}
            </span>
            {m.isHomeGame && (
              <Badge variant="outline" className="rounded-4xl text-xs text-primary border-primary/20 bg-primary/5">
                {t("badges.home")}
              </Badge>
            )}
          </div>
        );
      },
      meta: { label: t("columns.home") },
    },
    {
      accessorKey: "guestTeamName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.guest")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const inactive = m.isCancelled || m.isForfeited;
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn("text-sm", inactive && "line-through")}>
              {m.guestTeamName}
            </span>
            {!m.isHomeGame && (
              <Badge variant="outline" className="rounded-4xl text-xs text-muted-foreground border-border">
                {t("badges.away")}
              </Badge>
            )}
          </div>
        );
      },
      meta: { label: t("columns.guest") },
    },
    {
      accessorKey: "leagueName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.league")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const inactive = m.isCancelled || m.isForfeited;
        if (inactive) {
          return (
            <Badge variant="outline" className="rounded-4xl text-destructive border-destructive/30">
              {m.isCancelled ? t("status.cancelled") : t("status.forfeited")}
            </Badge>
          );
        }
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{m.leagueName ?? "—"}</span>
            {!m.isTrackedLeague && (
              <Badge variant="outline" className="rounded-4xl text-xs text-muted-foreground border-border">
                {t("badges.untracked")}
              </Badge>
            )}
          </div>
        );
      },
      meta: { label: t("columns.league") },
    },
    {
      id: "sr1",
      accessorFn: () => null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.sr1")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        if (m.isCancelled || m.isForfeited) return <span className="text-muted-foreground">—</span>;
        return (
          <SrSlotBadge
            status={m.sr1Status}
            ourClub={m.sr1OurClub}
            name={m.sr1Name}
            t={t}
          />
        );
      },
      enableSorting: false,
      meta: { label: t("columns.sr1") },
    },
    {
      id: "sr2",
      accessorFn: () => null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.sr2")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        if (m.isCancelled || m.isForfeited) return <span className="text-muted-foreground">—</span>;
        return (
          <SrSlotBadge
            status={m.sr2Status}
            ourClub={m.sr2OurClub}
            name={m.sr2Name}
            t={t}
          />
        );
      },
      enableSorting: false,
      meta: { label: t("columns.sr2") },
    },
    {
      id: "status",
      accessorFn: (row) => {
        if (row.isForfeited) return "forfeited";
        if (row.isCancelled) return "cancelled";
        return "active";
      },
      header: () => null,
      cell: () => null,
      filterFn: (row, id, value) => {
        const filterValues = value as string[] | undefined;
        if (!filterValues || filterValues.length === 0) return true;
        return filterValues.includes(row.getValue(id) as string);
      },
      enableSorting: false,
      enableHiding: false,
      meta: { label: t("status.active") },
    },
  ];
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

export function RefereeGamesList() {
  const t = useTranslations("refereeGames");
  const format = useFormatter();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const [syncing, setSyncing] = useState(false);
  const [gameFilter, setGameFilter] = useState<GameFilterValue>("our-duty");
  const [search, setSearch] = useState("");

  const { data } = useSWR<PaginatedResponse<RefereeGameListItem>>(
    SWR_KEYS.refereeGames,
    apiFetcher,
  );

  const allItems = useMemo(() => data?.items ?? [], [data?.items]);

  // Apply game filter
  const items = useMemo(() => {
    if (gameFilter === "all") return allItems;
    if (gameFilter === "our-duty") {
      // Games where our club has at least one unfilled slot
      return allItems.filter(
        (m) =>
          (m.sr1OurClub && m.sr1Status !== "assigned") ||
          (m.sr2OurClub && m.sr2Status !== "assigned"),
      );
    }
    // open-slots: any game with at least one unfilled slot
    return allItems.filter(
      (m) => m.sr1Status !== "assigned" || m.sr2Status !== "assigned",
    );
  }, [allItems, gameFilter]);

  const hasOurClubOpenSlot = useCallback(
    (row: Row<RefereeGameListItem>) => {
      const m = row.original;
      return (
        (m.sr1Status !== "assigned" && m.sr1OurClub) ||
        (m.sr2Status !== "assigned" && m.sr2OurClub)
      );
    },
    [],
  );

  function getRowClassName(row: Row<RefereeGameListItem>) {
    return cn(
      hasOurClubOpenSlot(row) && "border-l-2 border-l-primary/50 bg-primary/5",
      (row.original.isCancelled || row.original.isForfeited) && "opacity-60",
    );
  }

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetchAPI("/admin/settings/referee-games-sync", { method: "POST" });
      toast.success(t("syncTriggered"));
    } catch {
      toast.error(t("syncFailed"));
    } finally {
      setSyncing(false);
    }
  }, [t]);

  const columns = useMemo(() => getColumns(t, format), [t, format]);

  const statusFilterOptions = [
    { label: t("status.active"), value: "active", icon: SquareActivity },
    { label: t("status.cancelled"), value: "cancelled", icon: Ban },
    { label: t("status.forfeited"), value: "forfeited", icon: CircleOff },
  ];

  return (
    <DataTable
      columns={columns}
      data={items}
      rowClassName={getRowClassName}
      globalFilterFn={globalFilterFn}
      initialColumnVisibility={{ status: false }}
      initialColumnFilters={[{ id: "status", value: ["active"] }]}
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="mb-2 h-8 w-8" />
          <p>{t("filters.srFilterAll")}</p>
        </div>
      }
    >
      {(table) => (
        <DataTableToolbar table={table}>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("filters.search")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                table.setGlobalFilter(e.target.value);
              }}
              className="h-8 w-[150px] pl-8 lg:w-[250px]"
            />
          </div>
          <DataTableFacetedFilter
            column={table.getColumn("status")!}
            title={t("filters.status")}
            options={statusFilterOptions}
          />
          <FacetChips
            value={gameFilter}
            onChange={setGameFilter}
            options={[
              { label: t("filters.srFilterOurClub"), value: "our-duty" },
              { label: t("filters.srFilterAnyOpen"), value: "open-slots" },
              { label: t("filters.srFilterAll"), value: "all" },
            ]}
          />
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t("syncButton")}
            </Button>
          )}
        </DataTableToolbar>
      )}
    </DataTable>
  );
}
