"use client";

import { useTranslations } from "next-intl";
import { toolChip } from "./parts";

interface ChatActivityChipProps {
  part: { type: string; state?: string; toolName?: string };
}

const KNOWN_TOOLS = new Set(["get_standings", "get_dashboard", "list_matches"]);

/** A compact "Checking …/✓ Checked …" chip for one tool part. Renders nothing for non-tool parts. */
export function ChatActivityChip({ part }: ChatActivityChipProps) {
  const t = useTranslations("qa");
  const chip = toolChip(part);
  if (!chip) return null;

  const what = t(`tools.${KNOWN_TOOLS.has(chip.toolKey) ? chip.toolKey : "fallback"}` as Parameters<typeof t>[0]);

  if (chip.status === "running") {
    return (
      <span className="mb-2 inline-flex items-center gap-2 rounded-4xl bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
        <span className="size-2 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
        {t("activity.checking", { what })}
      </span>
    );
  }
  if (chip.status === "error") {
    return (
      <span className="mb-2 inline-flex items-center gap-1.5 text-xs text-destructive">
        {t("activity.failed", { what })}
      </span>
    );
  }
  return (
    <span className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden>✓</span>
      {t("activity.checked", { what })}
    </span>
  );
}
