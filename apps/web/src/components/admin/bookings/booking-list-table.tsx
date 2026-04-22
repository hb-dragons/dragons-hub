"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { authClient } from "@/lib/auth-client";
import { can } from "@dragons/shared";
import { Badge } from "@dragons/ui/components/badge";
import { Sheet } from "@dragons/ui/components/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { Button } from "@dragons/ui/components/button";
import { AlertTriangle, Plus } from "lucide-react";
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

export function BookingListTable() {
  const t = useTranslations();
  const format = useFormatter();
  const { data: session } = authClient.useSession();
  const canCreate = can(session?.user ?? null, "booking", "create");
  const { data: bookings } = useSWR<BookingListItem[]>(
    SWR_KEYS.bookings,
    apiFetcher,
  );
  const { mutate } = useSWRConfig();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const bookingList = bookings ?? [];
  const filtered =
    statusFilter === "all"
      ? bookingList
      : bookingList.filter((b) => b.status === statusFilter);

  function formatTimeWindow(booking: BookingListItem): string {
    if (!booking.effectiveStartTime || !booking.effectiveEndTime) return "\u2014";
    const start = format.dateTime(new Date(`1970-01-01T${booking.effectiveStartTime}`), "matchTime");
    const end = format.dateTime(new Date(`1970-01-01T${booking.effectiveEndTime}`), "matchTime");
    return `${start} \u2013 ${end}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("bookings.columns.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("board.filters.all")}</SelectItem>
            <SelectItem value="pending">{t("bookings.status.pending")}</SelectItem>
            <SelectItem value="requested">{t("bookings.status.requested")}</SelectItem>
            <SelectItem value="confirmed">{t("bookings.status.confirmed")}</SelectItem>
            <SelectItem value="cancelled">{t("bookings.status.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
        {canCreate && (
          <ReconcileDialog onReconciled={() => mutate(SWR_KEYS.bookings)} />
        )}
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("bookings.create.title")}
          </Button>
        )}
      </div>

      {bookingList.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("bookings.empty")}</p>
      ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("bookings.columns.date")}</TableHead>
            <TableHead>{t("bookings.columns.venue")}</TableHead>
            <TableHead>{t("bookings.columns.timeWindow")}</TableHead>
            <TableHead className="text-center">{t("bookings.columns.matches")}</TableHead>
            <TableHead>{t("bookings.columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((booking) => (
            <TableRow
              key={booking.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => setSelectedBookingId(booking.id)}
            >
              <TableCell className="font-medium tabular-nums">
                {format.dateTime(new Date(booking.date + "T00:00:00"), "matchDate")}
              </TableCell>
              <TableCell>{booking.venueName}</TableCell>
              <TableCell className="tabular-nums">
                {formatTimeWindow(booking)}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {booking.matchCount}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariantMap[booking.status]} className="text-xs">
                    {t(`bookings.status.${booking.status}`)}
                  </Badge>
                  {booking.needsReconfirmation && (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-amber-600"
                      title={t("bookings.needsReconfirmation")}
                    >
                      <AlertTriangle className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}

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
          onUpdated={() => mutate(SWR_KEYS.bookings)}
        />
      </Sheet>

      <CreateBookingDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={() => mutate(SWR_KEYS.bookings)}
      />
    </div>
  );
}
