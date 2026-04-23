"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight } from "lucide-react";

interface Props {
  cancelled: number;
  forfeited: number;
  onNavigate: () => void;
}

export function IssuesCallout({ cancelled, forfeited, onNavigate }: Props) {
  const t = useTranslations("refereeHistory.issuesCallout");
  if (cancelled + forfeited === 0) return null;
  return (
    <button
      type="button"
      data-testid="issues-callout"
      onClick={onNavigate}
      className="bg-heat/10 text-heat flex w-full items-center gap-2 rounded-md px-4 py-2.5 text-sm hover:bg-heat/15"
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1 text-left">
        {t("label", { cancelled, forfeited })}
      </span>
      <ArrowRight className="size-4" />
    </button>
  );
}
