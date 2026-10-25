"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import { cn } from "@dragons/ui/lib/utils";
import type { HallTimeCoverage } from "@dragons/shared";

const VARIANT: Record<HallTimeCoverage, "success" | "outline" | "destructive" | "secondary"> = {
  covered: "success",
  partial: "outline",
  uncovered: "destructive",
  closed: "secondary",
  none: "secondary",
};

/**
 * Whether the club holds the hall for a home game day's programme window: the
 * one badge every screen uses for it, so a `partial` reads the same on the
 * game plan, match detail, edit sheet and the alternative-date finder.
 */
export function HallTimeCoverageBadge({
  coverage,
  className,
}: {
  coverage: HallTimeCoverage;
  className?: string;
}) {
  const t = useTranslations("hallTimes.coverage");
  return (
    <Badge
      variant={VARIANT[coverage]}
      className={cn(coverage === "partial" && "border-heat/50 text-heat", className)}
      data-coverage={coverage}
    >
      {t(coverage)}
    </Badge>
  );
}
