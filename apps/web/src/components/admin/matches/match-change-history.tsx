"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Loader2 } from "lucide-react";
import type {
  MatchChangeHistoryItem,
  MatchChangeHistoryResponse,
} from "./types";

interface MatchChangeHistoryProps {
  matchId: number;
  initialData?: MatchChangeHistoryResponse;
}

const PAGE_SIZE = 50;

export function MatchChangeHistory({
  matchId,
  initialData,
}: MatchChangeHistoryProps) {
  const t = useTranslations("matchDetail.history");
  const format = useFormatter();
  const [limit, setLimit] = useState(PAGE_SIZE);

  const swrKey = SWR_KEYS.matchHistory(matchId, limit, 0);
  const { data, isLoading } = useSWR<MatchChangeHistoryResponse>(
    swrKey,
    apiFetcher,
    { fallbackData: initialData },
  );

  const changes = data?.changes ?? [];
  const total = data?.total ?? 0;
  const hasMore = changes.length < total;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-0">
            {changes.map((change) => (
              <HistoryEntry key={change.id} change={change} t={t} format={format} />
            ))}

            {hasMore && (
              <div className="pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isLoading}
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("showMore")}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryEntry({
  change,
  t,
  format,
}: {
  change: MatchChangeHistoryItem;
  t: ReturnType<typeof useTranslations<"matchDetail.history">>;
  format: ReturnType<typeof useFormatter>;
}) {
  const isLocal = change.track === "local";
  const borderColor = isLocal ? "border-l-primary" : "border-l-muted-foreground/30";
  const dotColor = isLocal ? "bg-primary" : "bg-muted-foreground/40";

  const description = formatChangeDescription(change);
  const actor = isLocal
    ? change.changedBy
      ? t("changedBy", { name: change.changedBy })
      : t("local")
    : t("fromSync");

  const relativeTime = format.relativeTime(new Date(change.createdAt));

  return (
    <div className={`flex gap-3 border-l-2 ${borderColor} py-2 pl-4`}>
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-mono text-xs">{change.fieldName}</span>
          {": "}
          {description}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {actor} &middot; {relativeTime}
        </p>
      </div>
    </div>
  );
}

function formatChangeDescription(change: MatchChangeHistoryItem): string {
  const { oldValue, newValue } = change;

  if (oldValue != null && newValue != null) {
    return `${oldValue} \u2192 ${newValue}`;
  }
  if (oldValue == null && newValue != null) {
    return newValue;
  }
  if (oldValue != null && newValue == null) {
    return `${oldValue} \u2192 \u2014`;
  }
  return "\u2014";
}
