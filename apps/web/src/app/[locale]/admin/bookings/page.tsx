import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { BookingListTable } from "@/components/admin/bookings/booking-list-table";
import type { BookingListItem } from "@/components/admin/bookings/types";

export default async function BookingsPage() {
  const t = await getTranslations();
  let data: BookingListItem[] | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<BookingListItem[]>("/admin/bookings");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("bookings.title")} subtitle={t("bookings.description")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.bookings]: data } }}>
          <BookingListTable />
        </SWRConfig>
      )}
    </div>
  );
}
