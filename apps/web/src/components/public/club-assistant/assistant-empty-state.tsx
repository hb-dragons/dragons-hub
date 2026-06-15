"use client";

import { useTranslations } from "next-intl";

interface AssistantEmptyStateProps {
  onPick: (question: string) => void;
}

export function AssistantEmptyState({ onPick }: AssistantEmptyStateProps) {
  const t = useTranslations("qa");
  const examples = t.raw("examples") as string[];

  return (
    <div className="flex flex-1 flex-col justify-end gap-3 pb-2">
      <p className="font-display text-lg font-bold text-foreground">{t("greetingTitle")}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("greetingSubtitle")}</p>
      <p className="mt-1 font-display text-xs uppercase tracking-wide text-muted-foreground">{t("examplesLabel")}</p>
      <div className="flex flex-col gap-2">
        {examples.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-4xl bg-surface-low px-3 py-2 text-left text-sm text-foreground ring-1 ring-foreground/10 hover:bg-surface-high"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
