import { AlertCircle } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";

export interface PageErrorProps {
  /** The failure to show. Already user-facing text, not a raw stack. */
  message: string;
  className?: string;
}

/**
 * Failure notice for a page whose data is fetched during the server render.
 *
 * `ErrorState` is the interactive counterpart and demands an `onRetry`; a
 * server component has no client handler to offer, so this is the flat
 * variant. Both carry `role="alert"` so "we could not load it" stays
 * distinguishable from "there is nothing here".
 */
export function PageError({ message, className }: PageErrorProps) {
  return (
    <div
      role="alert"
      data-slot="page-error"
      className={cn(
        "bg-destructive/10 text-destructive flex items-center gap-2 rounded-md p-4 text-sm",
        className,
      )}
    >
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      {message}
    </div>
  );
}
