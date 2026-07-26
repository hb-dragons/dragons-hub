"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@dragons/ui/components/button";
import { cn } from "@dragons/ui/lib/utils";

export interface ErrorStateProps {
  /** Overrides the shared `errors.title` headline. */
  title?: string;
  /** Overrides the shared `errors.description` body copy. */
  description?: string;
  /**
   * Required: a failed fetch must always offer a way out. Wire this to the
   * owning SWR hook's `mutate` (or a manual refetch) so the user can recover
   * without a full page reload.
   */
  onRetry: () => void;
  className?: string;
}

/**
 * The single error affordance for the app. A failed fetch must render this and
 * never an empty state — "nothing here" and "we could not load it" mean very
 * different things to the user. `role="alert"` is what makes the two
 * distinguishable to assistive tech and to regression tests.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  const t = useTranslations("errors");
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        "bg-destructive/10 flex flex-col items-center justify-center gap-3 rounded-md p-6 text-center",
        className,
      )}
    >
      <AlertTriangle className="text-destructive size-6 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-display text-destructive text-sm font-bold uppercase tracking-tight">
          {title ?? t("title")}
        </p>
        <p className="text-muted-foreground text-sm">
          {description ?? t("description")}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("tryAgain")}
      </Button>
    </div>
  );
}
