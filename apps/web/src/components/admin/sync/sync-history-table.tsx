"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
} from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type { SyncRun } from "./types";
import { SyncLogDetail } from "./sync-log-detail";
import { useSyncContext } from "./sync-provider";
import { formatDuration, formatDate } from "./utils";

const STATUS_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    labelKey: string;
    variant: "success" | "destructive" | "default" | "secondary";
    iconClass?: string;
  }
> = {
  completed: {
    icon: CheckCircle2,
    labelKey: "sync.history.status.completed",
    variant: "success",
  },
  failed: {
    icon: XCircle,
    labelKey: "sync.history.status.failed",
    variant: "destructive",
  },
  running: {
    icon: Loader2,
    labelKey: "sync.history.status.running",
    variant: "default",
    iconClass: "animate-spin",
  },
  pending: {
    icon: Clock,
    labelKey: "sync.history.status.pending",
    variant: "secondary",
  },
};

function formatRecords(run: SyncRun): React.ReactNode {
  const c = run.recordsCreated || 0;
  const u = run.recordsUpdated || 0;
  const s = run.recordsSkipped || 0;
  const f = run.recordsFailed || 0;
  return (
    <span className="tabular-nums">
      <span className="text-green-600">{c}</span>
      <span className="text-muted-foreground/50"> / </span>
      <span className="text-blue-600">{u}</span>
      <span className="text-muted-foreground/50"> / </span>
      <span className="text-muted-foreground">{s}</span>
      {f > 0 && (
        <>
          <span className="text-muted-foreground/50"> / </span>
          <span className="text-red-600">{f}</span>
        </>
      )}
    </span>
  );
}

export function SyncHistoryTable() {
  const t = useTranslations();
  const { logs: rawLogs, logsHasMore: hasMore, loadMoreLogs: onLoadMore, loadingMore } = useSyncContext();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Deduplicate by id to prevent React key warnings from race conditions
  // between optimistic updates and polling refreshes
  const logs = rawLogs.filter(
    (run, i, arr) => arr.findIndex((r) => r.id === run.id) === i,
  );

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>{t("sync.history.title")}</CardTitle>
        <CardDescription>
          {t("sync.history.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="mb-2 h-8 w-8" />
            <p>{t("sync.history.empty")}</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">{t("sync.history.columns.status")}</TableHead>
                  <TableHead>{t("sync.history.columns.type")}</TableHead>
                  <TableHead>{t("sync.history.columns.started")}</TableHead>
                  <TableHead>{t("sync.history.columns.duration")}</TableHead>
                  <TableHead
                    className="text-right"
                    title={t("sync.history.recordsTooltip")}
                  >
                    {t("sync.history.columns.records")}
                  </TableHead>
                  <TableHead>{t("sync.history.columns.trigger")}</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((run) => {
                  const statusCfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
                  const StatusIcon = statusCfg.icon;
                  const isExpanded = expandedId === run.id;

                  return (
                    <Fragment key={run.id}>
                      <TableRow
                        className={cn(
                          "cursor-pointer hover:bg-muted/50",
                          run.status === "failed" &&
                          "border-l-2 border-l-destructive bg-destructive/5",
                        )}
                        onClick={() =>
                          setExpandedId(isExpanded ? null : run.id)
                        }
                      >
                        <TableCell>
                          <Badge variant={statusCfg.variant}>
                            <StatusIcon
                              className={cn(
                                "h-3 w-3",
                                statusCfg.iconClass,
                              )}
                            />
                            {t(statusCfg.labelKey)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {run.syncType}
                        </TableCell>
                        <TableCell>{formatDate(run.startedAt)}</TableCell>
                        <TableCell>{formatDuration(run.durationMs)}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatRecords(run)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{run.triggeredBy}</Badge>
                        </TableCell>
                        <TableCell>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              isExpanded && "rotate-180",
                            )}
                          />
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="hover:bg-background">
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <SyncLogDetail syncRun={run} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {hasMore && (
              <div className="mt-4 text-center">
                <Button
                  variant="outline"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("common.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
