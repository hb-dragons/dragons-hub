"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type {
  RefereeMatchListItem,
  TakeMatchResponse,
  VerifyMatchResponse,
  PaginatedResponse,
} from "@dragons/shared";
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { cn } from "@dragons/ui/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@dragons/ui/components/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@dragons/ui/components/tooltip";
import { Ban, Calendar, Check, CheckCircle2, CircleOff, Clock, ExternalLink, Loader2, RefreshCw, SearchIcon, SquareActivity, Trash2, X, XCircle } from "lucide-react";
import type { DateRange } from "@dragons/ui/components/calendar";

import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { DataTableDateFilter } from "@/components/ui/data-table-date-filter";

function refName(ref: { firstName: string | null; lastName: string | null }): string {
  return [ref.firstName, ref.lastName].filter(Boolean).join(" ") || "—";
}

interface SlotCellProps {
  match: RefereeMatchListItem;
  slotNumber: 1 | 2;
  isOpen: boolean;
  assignedReferee: { firstName: string | null; lastName: string | null } | null;
  onTake: (matchId: number, slotNumber: number) => Promise<void>;
  onCancel: (matchId: number, slotNumber: number) => Promise<void>;
  onAdminRelease: (matchId: number, refereeId: number, slotNumber: number) => Promise<void>;
  takingSlot: string | null;
  isAdmin: boolean;
  t: ReturnType<typeof useTranslations<"refereeMatches">>;
}

function SlotCell({ match, slotNumber, isOpen, assignedReferee, onTake, onCancel, onAdminRelease, takingSlot, isAdmin, t }: SlotCellProps) {
  const currentRefereeId = match.currentRefereeId;
  const slotIntents = match.intents.filter((i) => i.slotNumber === slotNumber);
  const myIntent = slotIntents.find((i) => i.refereeId === currentRefereeId);
  const otherIntents = slotIntents.filter((i) => i.refereeId !== currentRefereeId);
  const isTaking = takingSlot === `${match.id}-${slotNumber}`;
  const isCancelling = takingSlot === `cancel-${match.id}-${slotNumber}`;

  if (assignedReferee) {
    return <span className="text-sm text-muted-foreground">{refName(assignedReferee)}</span>;
  }

  const hasAnyIntent = myIntent || otherIntents.length > 0;

  return (
    <div className="flex flex-col gap-1">
      {/* Current user's intent */}
      {myIntent?.confirmedBySyncAt ? (
        <Badge variant="default" className="gap-1">
          <Check className="h-3 w-3" />
          {t("slot.confirmed")}
        </Badge>
      ) : myIntent ? (
        <Badge
          variant="secondary"
          className="cursor-pointer gap-1 hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            void onCancel(match.id, slotNumber);
          }}
        >
          {isCancelling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
          {t("slot.requested")}
        </Badge>
      ) : null}

      {/* Other referees' intents */}
      {otherIntents.map((intent) => (
        <div key={intent.refereeId} className="flex items-center gap-1 text-xs">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1">
                  {intent.confirmedBySyncAt ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  )}
                  <span className={cn(
                    "truncate",
                    intent.confirmedBySyncAt ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {refName({ firstName: intent.refereeFirstName, lastName: intent.refereeLastName })}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {intent.confirmedBySyncAt
                  ? t("slot.intentConfirmed")
                  : t("slot.intentPending")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isAdmin && !intent.confirmedBySyncAt && (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                void onAdminRelease(match.id, intent.refereeId, slotNumber);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {/* Take button (only if no own intent, no other pending intent, and slot is open) */}
      {!myIntent && isOpen && otherIntents.every((i) => i.confirmedBySyncAt) && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-green-500 text-green-700 hover:bg-green-50 hover:text-green-800"
          disabled={isTaking}
          onClick={(e) => {
            e.stopPropagation();
            void onTake(match.id, slotNumber);
          }}
        >
          {isTaking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            t("slot.take")
          )}
        </Button>
      )}

      {/* Dash when nothing to show */}
      {!hasAnyIntent && !isOpen && <span className="text-muted-foreground">—</span>}
    </div>
  );
}

const dateRangeFilterFn: FilterFn<RefereeMatchListItem> = (row, columnId, value) => {
  const dateRange = value as DateRange | undefined;
  if (!dateRange) return true;
  const cellValue = row.getValue(columnId) as string;
  if (dateRange.from) {
    const fromStr = dateRange.from.toISOString().slice(0, 10);
    if (cellValue < fromStr) return false;
  }
  if (dateRange.to) {
    const toStr = dateRange.to.toISOString().slice(0, 10);
    if (cellValue > toStr) return false;
  }
  return true;
};

const globalFilterFn: FilterFn<RefereeMatchListItem> = (row, _columnId, filterValue) => {
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

function getColumns(
  t: ReturnType<typeof useTranslations<"refereeMatches">>,
  format: ReturnType<typeof useFormatter>,
  takingSlot: string | null,
  onTake: (matchId: number, slotNumber: number) => Promise<void>,
  onCancel: (matchId: number, slotNumber: number) => Promise<void>,
  onAdminRelease: (matchId: number, refereeId: number, slotNumber: number) => Promise<void>,
  isAdmin: boolean,
): ColumnDef<RefereeMatchListItem, unknown>[] {
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
      filterFn: dateRangeFilterFn,
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
        const inactive = row.original.isCancelled || row.original.isForfeited;
        return (
          <span className={cn("text-sm", inactive && "line-through")}>
            {row.original.homeTeamName}
          </span>
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
        const inactive = row.original.isCancelled || row.original.isForfeited;
        return (
          <span className={cn("text-sm", inactive && "line-through")}>
            {row.original.guestTeamName}
          </span>
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
            <Badge variant="outline" className="text-destructive border-destructive/30">
              {m.isCancelled ? t("status.cancelled") : t("status.forfeited")}
            </Badge>
          );
        }
        return (
          <span className="text-sm text-muted-foreground">
            {m.leagueName ?? "—"}
          </span>
        );
      },
      meta: { label: t("columns.league") },
    },
    {
      accessorKey: "venueName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.venue")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.venueName ?? "—"}
        </span>
      ),
      meta: { label: t("columns.venue") },
    },
    {
      id: "sr1",
      accessorFn: () => null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.sr1")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const inactive = m.isCancelled || m.isForfeited;
        if (inactive) return <span className="text-muted-foreground">—</span>;
        return (
          <SlotCell
            match={m}
            slotNumber={1}
            isOpen={m.sr1Open || (m.ownClubRefs && m.homeIsOwnClub)}
            assignedReferee={m.sr1Referee}
            onTake={onTake}
            onCancel={onCancel}
            onAdminRelease={onAdminRelease}
            takingSlot={takingSlot}
            isAdmin={isAdmin}
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
        const inactive = m.isCancelled || m.isForfeited;
        if (inactive) return <span className="text-muted-foreground">—</span>;
        return (
          <SlotCell
            match={m}
            slotNumber={2}
            isOpen={m.sr2Open || (m.ownClubRefs && m.homeIsOwnClub)}
            assignedReferee={m.sr2Referee}
            onTake={onTake}
            onCancel={onCancel}
            onAdminRelease={onAdminRelease}
            takingSlot={takingSlot}
            isAdmin={isAdmin}
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
      meta: { label: t("status.label") },
    },
  ];
}

interface PendingVerification {
  matchId: number;
  matchLabel: string;
  deepLink: string;
}

export function RefereeMatchList() {
  const t = useTranslations("refereeMatches");
  const format = useFormatter();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";
  const [takingSlot, setTakingSlot] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyMatchResponse | null>(null);
  const pendingRef = useRef<PendingVerification | null>(null);

  const { data, mutate } = useSWR<PaginatedResponse<RefereeMatchListItem>>(
    SWR_KEYS.refereeMatches,
    apiFetcher,
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  // Show dialog when user returns from external tab
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && pendingRef.current) {
        setPendingVerification(pendingRef.current);
        setVerifyDialogOpen(true);
        pendingRef.current = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const handleVerify = useCallback(
    async (matchId: number) => {
      setVerifying(true);
      try {
        const result = await fetchAPI<VerifyMatchResponse>(
          `/referee/matches/${matchId}/verify`,
          { method: "POST" },
        );
        setVerifyResult(result);
        await mutate();
      } catch {
        // fetchAPI throws APIError
      } finally {
        setVerifying(false);
      }
    },
    [mutate],
  );

  const closeVerifyDialog = useCallback(() => {
    setVerifyDialogOpen(false);
    setPendingVerification(null);
    setVerifyResult(null);
  }, []);

  const handleTake = useCallback(
    async (matchId: number, slotNumber: number) => {
      const key = `${matchId}-${slotNumber}`;
      setTakingSlot(key);
      try {
        const result = await fetchAPI<TakeMatchResponse>(
          `/referee/matches/${matchId}/take`,
          {
            method: "POST",
            body: JSON.stringify({ slotNumber }),
          },
        );

        if (result.deepLink) {
          const match = items.find((m) => m.id === matchId);
          const label = match
            ? `${match.homeTeamName} – ${match.guestTeamName}`
            : `#${matchId}`;
          pendingRef.current = { matchId, matchLabel: label, deepLink: result.deepLink };
          window.open(result.deepLink, "_blank");
        }

        await mutate();
      } catch {
        // Error handling via fetchAPI throwing APIError
      } finally {
        setTakingSlot(null);
      }
    },
    [mutate, items],
  );

  const handleCancel = useCallback(
    async (matchId: number, slotNumber: number) => {
      const key = `cancel-${matchId}-${slotNumber}`;
      setTakingSlot(key);
      try {
        await fetchAPI(
          `/referee/matches/${matchId}/take`,
          {
            method: "DELETE",
            body: JSON.stringify({ slotNumber }),
          },
        );
        await mutate();
      } catch {
        // Error handling via fetchAPI throwing APIError
      } finally {
        setTakingSlot(null);
      }
    },
    [mutate],
  );

  const handleAdminRelease = useCallback(
    async (matchId: number, refereeId: number, slotNumber: number) => {
      const key = `cancel-${matchId}-${slotNumber}`;
      setTakingSlot(key);
      try {
        await fetchAPI(
          `/referee/matches/${matchId}/intent/${refereeId}`,
          {
            method: "DELETE",
            body: JSON.stringify({ slotNumber }),
          },
        );
        await mutate();
      } catch {
        // Error handling via fetchAPI throwing APIError
      } finally {
        setTakingSlot(null);
      }
    },
    [mutate],
  );

  const columns = useMemo(
    () => getColumns(t, format, takingSlot, handleTake, handleCancel, handleAdminRelease, isAdmin),
    [t, format, takingSlot, handleTake, handleCancel, handleAdminRelease, isAdmin],
  );

  const statusFilterOptions = [
    { label: t("status.active"), value: "active", icon: SquareActivity },
    { label: t("status.cancelled"), value: "cancelled", icon: Ban },
    { label: t("status.forfeited"), value: "forfeited", icon: CircleOff },
  ];

  function getRowClassName(row: Row<RefereeMatchListItem>) {
    return cn(
      (row.original.homeIsOwnClub || row.original.guestIsOwnClub) &&
      "border-l-2 border-l-muted-foreground/30 bg-muted/40",
      (row.original.isCancelled || row.original.isForfeited) && "opacity-60",
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={items}
        rowClassName={getRowClassName}
        globalFilterFn={globalFilterFn}
        initialColumnVisibility={{ status: false, venueName: false }}
        initialColumnFilters={[
          { id: "status", value: ["active"] },
          { id: "kickoffDate", value: { from: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00") } },
        ]}
        emptyState={
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Calendar className="mb-2 h-8 w-8" />
            <p>{t("empty")}</p>
          </div>
        }
      >
        {(table) => (
          <DataTableToolbar table={table}>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={(table.getState().globalFilter as string) ?? ""}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                className="h-8 w-[150px] pl-8 lg:w-[250px]"
              />
            </div>
            <DataTableFacetedFilter
              column={table.getColumn("status")!}
              title={t("status.label")}
              options={statusFilterOptions}
            />
            <DataTableDateFilter
              column={table.getColumn("kickoffDate")!}
              title={t("columns.date")}
            />
          </DataTableToolbar>
        )}
      </DataTable>

      <AlertDialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("verify.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {pendingVerification && (
                  <p>
                    <span className="font-medium text-foreground">{pendingVerification.matchLabel}</span>
                    <br />
                    {t("verify.description")}
                  </p>
                )}
                {pendingVerification && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    onClick={() => window.open(pendingVerification.deepLink, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("verify.openLink")}
                  </button>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {verifyResult && (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
              {verifyResult.confirmed ? (
                <>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  <span>{t("verify.confirmed")}</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 shrink-0 text-amber-500" />
                  <span>{t("verify.notConfirmed")}</span>
                </>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {!verifyResult ? (
              <>
                <Button variant="outline" onClick={closeVerifyDialog}>
                  {t("verify.no")}
                </Button>
                <Button
                  disabled={verifying}
                  onClick={() => {
                    if (pendingVerification) {
                      void handleVerify(pendingVerification.matchId);
                    }
                  }}
                >
                  {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("verify.yes")}
                </Button>
              </>
            ) : verifyResult.confirmed ? (
              <Button onClick={closeVerifyDialog}>
                {t("verify.close")}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeVerifyDialog}>
                  {t("verify.close")}
                </Button>
                <Button
                  disabled={verifying}
                  onClick={() => {
                    if (pendingVerification) {
                      setVerifyResult(null);
                      void handleVerify(pendingVerification.matchId);
                    }
                  }}
                >
                  {verifying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {t("verify.retry")}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
