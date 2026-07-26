"use client";

import { useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table";
import { SWR_KEYS } from "@/lib/swr-keys";
import { queries } from "@/lib/swr-queries";
import { authClient } from "@/lib/auth-client";
import { can, clubDayAnchor, clubTimeAnchor } from "@dragons/shared";
import { Badge } from "@dragons/ui/components/badge";
import { Input } from "@dragons/ui/components/input";
import { Sheet } from "@dragons/ui/components/sheet";
import { Button } from "@dragons/ui/components/button";
import { AlertTriangle, Plus, SearchIcon } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { BookingDetailSheet } from "./booking-detail-sheet";
import { CreateBookingDialog } from "./create-booking-dialog";
import { ReconcileDialog } from "./reconcile-dialog";
import type { BookingListItem } from "./types";

const statusVariantMap: Record<
  BookingListItem["status"],
  "secondary" | "default" | "success" | "destructive"
> = {
  pending: "secondary",
  requested: "default",
  confirmed: "success",
  cancelled: "destructive",
};

const BOOKING_STATUSES: BookingListItem["status"][] = [
  "pending",
  "requested",
  "confirmed",
  "cancelled",
];

/** Search across the columns a user would actually type into. */
const bookingGlobalFilterFn: FilterFn<BookingListItem> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = String(filterValue).toLowerCase();
  if (!search) return true;
  return (
    row.original.venueName.toLowerCase().includes(search) ||
    row.original.date.includes(search)
  );
};

function getColumns(
  t: ReturnType<typeof useTranslations>,
  format: ReturnType<typeof useFormatter>,
): ColumnDef<BookingListItem>[] {
  // Times come back as club wall clock; anchoring them explicitly is what
  // keeps an 18:00 window from server-rendering as 19:00 in a UTC container
  // and then flipping on hydration.
  const formatTimeWindow = (booking: BookingListItem): string => {
    if (!booking.effectiveStartTime || !booking.effectiveEndTime) return "—";
    const start = format.dateTime(
      clubTimeAnchor(booking.effectiveStartTime, booking.date),
      "matchTime",
    );
    const end = format.dateTime(
      clubTimeAnchor(booking.effectiveEndTime, booking.date),
      "matchTime",
    );
    return `${start} – ${end}`;
  };

  return [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("bookings.columns.date")} />
      ),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {format.dateTime(clubDayAnchor(row.original.date), "matchDate")}
        </span>
      ),
      meta: { label: t("bookings.columns.date") },
    },
    {
      accessorKey: "venueName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("bookings.columns.venue")} />
      ),
      meta: { label: t("bookings.columns.venue") },
    },
    {
      id: "timeWindow",
      accessorFn: (row) => row.effectiveStartTime ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("bookings.columns.timeWindow")}
        />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">{formatTimeWindow(row.original)}</span>
      ),
      meta: { label: t("bookings.columns.timeWindow") },
    },
    {
      accessorKey: "matchCount",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("bookings.columns.matches")}
        />
      ),
      cell: ({ row }) => (
        <span className="block text-center tabular-nums">
          {row.original.matchCount}
        </span>
      ),
      meta: { label: t("bookings.columns.matches") },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("bookings.columns.status")}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Badge variant={statusVariantMap[row.original.status]} className="text-xs">
            {t(`bookings.status.${row.original.status}`)}
          </Badge>
          {row.original.needsReconfirmation && (
            <span
              className="text-heat inline-flex items-center gap-1 text-xs"
              title={t("bookings.needsReconfirmation")}
            >
              <AlertTriangle className="h-3 w-3" />
            </span>
          )}
        </div>
      ),
      filterFn: (row, id, value) => {
        const selected = value as string[] | undefined;
        if (!selected || selected.length === 0) return true;
        return selected.includes(row.getValue(id) as string);
      },
      meta: { label: t("bookings.columns.status") },
    },
  ];
}

export function BookingListTable() {
  const t = useTranslations();
  const format = useFormatter();
  const { data: session } = authClient.useSession();
  const canCreate = can(session?.user ?? null, "booking", "create");
  const bookingsQ = queries.bookings();
  const { data: bookings } = useSWR(bookingsQ.key, bookingsQ.fetcher);
  const { mutate } = useSWRConfig();
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const columns = useMemo(() => getColumns(t, format), [t, format]);
  const data = useMemo(() => bookings ?? [], [bookings]);

  const statusOptions = BOOKING_STATUSES.map((status) => ({
    label: t(`bookings.status.${status}`),
    value: status,
  }));

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={data}
        globalFilterFn={bookingGlobalFilterFn}
        onRowClick={(row: Row<BookingListItem>) =>
          setSelectedBookingId(row.original.id)
        }
        emptyState={
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("bookings.empty")}
          </p>
        }
      >
        {(table) => (
          <DataTableToolbar table={table}>
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder={t("common.search")}
                value={(table.getState().globalFilter as string) ?? ""}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                className="h-8 w-[150px] pl-8 lg:w-[250px]"
              />
            </div>
            <DataTableFacetedFilter
              column={table.getColumn("status")!}
              title={t("bookings.columns.status")}
              options={statusOptions}
            />
            {canCreate && (
              <ReconcileDialog
                onReconciled={() => {
                  void mutate(SWR_KEYS.bookings);
                }}
              />
            )}
            {canCreate && (
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("bookings.create.title")}
              </Button>
            )}
          </DataTableToolbar>
        )}
      </DataTable>

      <Sheet
        open={selectedBookingId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedBookingId(null);
        }}
      >
        <BookingDetailSheet
          bookingId={selectedBookingId}
          open={selectedBookingId !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedBookingId(null);
          }}
          onUpdated={() => {
            void mutate(SWR_KEYS.bookings);
          }}
        />
      </Sheet>

      <CreateBookingDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={() => {
          void mutate(SWR_KEYS.bookings);
        }}
      />
    </div>
  );
}
