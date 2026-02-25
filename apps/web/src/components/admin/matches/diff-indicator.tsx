"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import type { DiffStatus } from "./types";

const DIFF_CONFIG: Record<
  DiffStatus,
  { labelKey: "diverged" | "synced" | "local"; variant: "default" | "success" | "secondary" }
> = {
  diverged: { labelKey: "diverged", variant: "default" },
  synced: { labelKey: "synced", variant: "success" },
  "local-only": { labelKey: "local", variant: "secondary" },
};

interface DiffIndicatorProps {
  status: DiffStatus;
}

export function DiffIndicator({ status }: DiffIndicatorProps) {
  const t = useTranslations("matchDetail.diff");
  const config = DIFF_CONFIG[status];
  return (
    <Badge
      variant={config.variant}
      className={status === "diverged" ? "border-amber-500 bg-amber-50 text-amber-700" : undefined}
    >
      {t(config.labelKey)}
    </Badge>
  );
}
