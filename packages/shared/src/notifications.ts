export interface NotificationItem {
  id: number;
  recipientId: string;
  channel: string;
  title: string;
  body: string;
  relatedTaskId: number | null;
  relatedBookingId: number | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: NotificationItem[];
  total: number;
}
