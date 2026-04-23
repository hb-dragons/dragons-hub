"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { fetchAPI, APIError } from "@/lib/api";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Textarea } from "@dragons/ui/components/textarea";
import { Label } from "@dragons/ui/components/label";
import { Badge } from "@dragons/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { Loader2, Send } from "lucide-react";

const TEST_PUSH_ENDPOINT = "/admin/notifications/test-push";
const TEST_PUSH_RECENT_ENDPOINT = "/admin/notifications/test-push/recent";

interface TestPushTicket {
  platform: string;
  status: "sent_ticket" | "failed" | string;
  ticketId: string | null;
  error: string | null;
}

interface TestPushResponse {
  deviceCount: number;
  tickets: TestPushTicket[];
}

interface TestPushRecentItem {
  id: number;
  sentAt: string | null;
  recipientToken: string | null;
  status: string;
  providerTicketId: string | null;
  errorMessage: string | null;
}

interface TestPushRecentResponse {
  results: TestPushRecentItem[];
}

const statusVariant: Record<
  string,
  "success" | "secondary" | "destructive" | "outline"
> = {
  delivered: "success",
  sent_ticket: "secondary",
  sent: "secondary",
  pending: "outline",
  failed: "destructive",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function PushTestCard() {
  const t = useTranslations("settings.pushTest");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const { data, mutate } = useSWR<TestPushRecentResponse>(
    TEST_PUSH_RECENT_ENDPOINT,
    apiFetcher,
    { refreshInterval: 5000 },
  );

  async function handleSend() {
    setSending(true);
    try {
      const trimmed = message.trim();
      const body = trimmed.length > 0 ? { message: trimmed } : {};
      const res = await fetchAPI<TestPushResponse>(TEST_PUSH_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const failed = res.tickets.filter((t) => t.status === "failed").length;
      if (failed === 0) {
        toast.success(t("toast.success", { count: res.deviceCount }));
      } else {
        toast.warning(t("toast.partialFailure", { count: failed }));
      }
      setMessage("");
      await mutate();
    } catch (err) {
      if (err instanceof APIError) {
        if (err.status === 400 && /no_devices/i.test(err.message)) {
          toast.error(t("noDevicesError"));
        } else if (err.status === 403) {
          toast.error(t("permissionError"));
        } else {
          toast.error(err.message || t("genericError"));
        }
      } else {
        toast.error(t("genericError"));
      }
    } finally {
      setSending(false);
    }
  }

  const results = data?.results ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid max-w-xl gap-3">
            <Label htmlFor="push-test-message">{t("messageLabel")}</Label>
            <Textarea
              id="push-test-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("messagePlaceholder")}
              rows={3}
              maxLength={180}
              disabled={sending}
            />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {message.length}/180
              </span>
              <Button
                onClick={handleSend}
                disabled={sending}
                className="w-fit"
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {sending ? t("sendingButton") : t("sendButton")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide">
              {t("recentHeading")}
            </h3>
            {results.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("emptyState")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.sentAt")}</TableHead>
                    <TableHead>{t("columns.token")}</TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead>{t("columns.error")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.sentAt)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.recipientToken ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant[row.status] ?? "outline"}
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs">
                        {row.errorMessage ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
