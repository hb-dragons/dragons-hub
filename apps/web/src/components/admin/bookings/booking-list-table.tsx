"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Badge } from "@dragons/ui/components/badge";
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
import { AlertTriangle } from "lucide-react";
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
  const { data: bookings } = useSWR<BookingListItem[]>(
    SWR_KEYS.bookings,
    apiFetcher,
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const bookingList = bookings ?? [];
  const filtered =
    statusFilter === "all"
      ? bookingList
      : bookingList.filter((b) => b.status === statusFilter);

  if (bookingList.length === 0) {
    return <p className="text-muted-foreground">{t("bookings.empty")}</p>;
  }

  function formatTimeWindow(booking: BookingListItem): string {
    if (!booking.effectiveStartTime || !booking.effectiveEndTime) return "\u2014";
    return `${booking.effectiveStartTime} \u2013 ${booking.effectiveEndTime}`;
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
      </div>

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
            <TableRow key={booking.id}>
              <TableCell className="font-medium tabular-nums">
                {booking.date}
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
                  <Badge variant={statusVariantMap[booking.status]}>
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
    </div>
  );
}
