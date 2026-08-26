"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";

interface AssistantAiNoticeProps {
  onAcknowledge: () => void;
}

/** First-interaction AI notice (AI Act Art. 50(1), ADR 0005). */
export function AssistantAiNotice({ onAcknowledge }: AssistantAiNoticeProps) {
  const t = useTranslations("qa");

  return (
    <div className="flex flex-1 flex-col justify-end pb-2">
      <div role="note" className="flex flex-col gap-3 rounded-md bg-surface-low p-4 ring-1 ring-foreground/10">
        <p className="font-display text-lg font-bold text-foreground">{t("notice.title")}</p>
        <p className="text-sm leading-relaxed text-foreground">{t("notice.body")}</p>
        <Button type="button" onClick={onAcknowledge}>
          {t("notice.acknowledge")}
        </Button>
      </div>
    </div>
  );
}
