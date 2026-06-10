import type {
  BookingListItem,
  BookingDetail,
  ReconcilePreview,
} from "@dragons/shared";
import type {
  BookingListQuery,
  BookingCreateBody,
  BookingUpdateBody,
  BookingStatusBody,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

export function bookingEndpoints(client: ApiClient) {
  return {
    list(query?: Partial<BookingListQuery>): Promise<BookingListItem[]> {
      return client.get(
        "/admin/bookings",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    get(id: number): Promise<BookingDetail> {
      return client.get(`/admin/bookings/${id}`);
    },
    create(body: BookingCreateBody): Promise<BookingDetail> {
      return client.post("/admin/bookings", body);
    },
    update(id: number, body: BookingUpdateBody): Promise<BookingListItem> {
      return client.patch(`/admin/bookings/${id}`, body);
    },
    updateStatus(id: number, body: BookingStatusBody): Promise<BookingListItem> {
      return client.patch(`/admin/bookings/${id}/status`, body);
    },
    delete(id: number): Promise<{ success: boolean }> {
      return client.delete(`/admin/bookings/${id}`);
    },
    previewReconcile(): Promise<ReconcilePreview> {
      return client.get("/admin/bookings/reconcile/preview");
    },
    applyReconcile(): Promise<{ applied: boolean }> {
      return client.post("/admin/bookings/reconcile");
    },
  };
}
