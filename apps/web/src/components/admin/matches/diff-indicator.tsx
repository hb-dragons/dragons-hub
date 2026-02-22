"use client";

import { Badge } from "@dragons/ui/components/badge";
import type { DiffStatus } from "./types";

const DIFF_CONFIG: Record<
  DiffStatus,
  { label: string; variant: "default" | "success" | "secondary" }
> = {
  diverged: { label: "Diverged", variant: "default" },
  synced: { label: "Synced", variant: "success" },
  "local-only": { label: "Local", variant: "secondary" },
};

interface DiffIndicatorProps {
  status: DiffStatus;
}

export function DiffIndicator({ status }: DiffIndicatorProps) {
  const config = DIFF_CONFIG[status];
  return (
    <Badge
      variant={config.variant}
      className={status === "diverged" ? "border-amber-500 bg-amber-50 text-amber-700" : undefined}
    >
      {config.label}
    </Badge>
  );
}
