"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { Link } from "@/lib/navigation";
import { toast } from "sonner";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dragons/ui/components/tabs";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
} from "lucide-react";
import type {
  NotificationItem,
  NotificationListResult,
  FailedNotificationItem,
  FailedNotificationListResult,
} from "./types";

const PAGE_SIZE = 20;

const statusVariantMap: Record<
  string,
  "success" | "secondary" | "destructive" | "outline"
> = {
  sent: "success",
  read: "secondary",
  failed: "destructive",
  pending: "outline",
};

const urgencyVariantMap: Record<string, "destructive" | "secondary"> = {
  immediate: "destructive",
  routine: "secondary",
};

const entityTypeVariantMap: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  match: "default",
  booking: "secondary",
  referee: "outline",
};

export function NotificationCenter() {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const { mutate } = useSWRConfig();

  const [page, setPage] = useState(0);
  const [failedPage, setFailedPage] = useState(1);

  const offset = page * PAGE_SIZE;
  const inboxKey = SWR_KEYS.notifications(PAGE_SIZE, offset);
  const failedKey = SWR_KEYS.domainEventsFailed(failedPage, PAGE_SIZE);

  const { data: inboxData } = useSWR<NotificationListResult>(
    inboxKey,
    apiFetcher,
  );
  const { data: failedData } = useSWR<FailedNotificationListResult>(
    failedKey,
    apiFetcher,
  );

  const notifications = inboxData?.notifications ?? [];
  const totalInbox = inboxData?.total ?? 0;
  const failedNotifications = failedData?.notifications ?? [];
  const totalFailed = failedData?.total ?? 0;

  const totalInboxPages = Math.max(1, Math.ceil(totalInbox / PAGE_SIZE));
  const totalFailedPages = Math.max(1, Math.ceil(totalFailed / PAGE_SIZE));

  async function handleMarkRead(id: number) {
    try {
      await fetchAPI(`/admin/notifications/${id}/read`, { method: "PATCH" });
      await mutate(inboxKey);
    } catch {
      toast.error(t("retryFailed"));
    }
  }

  async function handleMarkAllRead() {
    try {
      await fetchAPI(
        "/admin/notifications/read-all",
        { method: "PATCH" },
      );
      await mutate(inboxKey);
    } catch {
      toast.error(t("retryFailed"));
    }
  }

  async function handleRetry(id: number) {
    try {
      await fetchAPI(`/admin/notifications/${id}/retry`, { method: "POST" });
      toast.success(t("retrySuccess"));
      await mutate(failedKey);
    } catch {
      toast.error(t("retryFailed"));
    }
  }

  function formatTimestamp(dateStr: string): string {
    return format.dateTime(new Date(dateStr), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function truncateBody(body: string, max = 120): string {
    if (body.length <= max) return body;
    return body.slice(0, max).trimEnd() + "\u2026";
  }

  return (
    <Tabs defaultValue="inbox">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="inbox">
            {t("tabs.inbox")}
            {totalInbox > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({totalInbox})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="failed">
            {t("tabs.failed")}
            {totalFailed > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({totalFailed})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
          <CheckCheck className="mr-2 h-4 w-4" />
          {t("markAllRead")}
        </Button>
      </div>

      {/* Inbox Tab */}
      <TabsContent value="inbox" className="mt-4 space-y-3">
        {notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <>
            {notifications.map((item) => (
              <InboxCard
                key={item.id}
                item={item}
                t={t}
                formatTimestamp={formatTimestamp}
                truncateBody={truncateBody}
                onMarkRead={handleMarkRead}
              />
            ))}
            <Pagination
              page={page}
              totalPages={totalInboxPages}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() =>
                setPage((p) => Math.min(totalInboxPages - 1, p + 1))
              }
            />
          </>
        )}
      </TabsContent>

      {/* Failed Tab */}
      <TabsContent value="failed" className="mt-4 space-y-3">
        {failedNotifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <>
            {failedNotifications.map((item) => (
              <FailedCard
                key={item.id}
                item={item}
                t={t}
                formatTimestamp={formatTimestamp}
                onRetry={handleRetry}
              />
            ))}
            <Pagination
              page={failedPage - 1}
              totalPages={totalFailedPages}
              onPrev={() => setFailedPage((p) => Math.max(1, p - 1))}
              onNext={() =>
                setFailedPage((p) => Math.min(totalFailedPages, p + 1))
              }
            />
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

function InboxCard({
  item,
  t,
  formatTimestamp,
  truncateBody,
  onMarkRead,
}: {
  item: NotificationItem;
  t: ReturnType<typeof useTranslations<"notifications">>;
  formatTimestamp: (d: string) => string;
  truncateBody: (b: string, max?: number) => string;
  onMarkRead: (id: number) => void;
}) {
  const isUnread = !item.readAt;

  return (
    <Card
      className={
        isUnread ? "border-l-4 border-l-primary" : "border-l-4 border-l-transparent"
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium leading-snug">
              <Link
                href={item.deepLinkPath}
                className="hover:underline"
              >
                {item.title}
              </Link>
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              {truncateBody(item.body)}
            </CardDescription>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatTimestamp(item.createdAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={entityTypeVariantMap[item.entityType] ?? "outline"}
              className="text-xs"
            >
              {item.entityType}
            </Badge>
            <Badge
              variant={statusVariantMap[item.status] ?? "outline"}
              className="text-xs"
            >
              {item.status}
            </Badge>
            <Badge
              variant={urgencyVariantMap[item.urgency] ?? "secondary"}
              className="text-xs"
            >
              {item.urgency}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {item.entityName}
            </span>
          </div>
          {isUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onMarkRead(item.id)}
            >
              <Eye className="mr-1 h-3 w-3" />
              {t("markRead")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FailedCard({
  item,
  t,
  formatTimestamp,
  onRetry,
}: {
  item: FailedNotificationItem;
  t: ReturnType<typeof useTranslations<"notifications">>;
  formatTimestamp: (d: string) => string;
  onRetry: (id: number) => void;
}) {
  return (
    <Card className="border-l-4 border-l-destructive">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium leading-snug">
              {item.title}
            </CardTitle>
            {item.errorMessage && (
              <CardDescription className="mt-1 text-xs text-destructive">
                {item.errorMessage}
              </CardDescription>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatTimestamp(item.createdAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-xs">
              {item.entityName}
            </Badge>
            <Badge variant="destructive" className="text-xs">
              {item.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("columns.retries")}: {item.retryCount}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onRetry(item.id)}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("retry")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page <= 0}
        onClick={onPrev}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground">
        {page + 1} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages - 1}
        onClick={onNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
