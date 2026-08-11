import { Skeleton } from "@dragons/ui/components/skeleton";
import { cn } from "@dragons/ui/lib/utils";

export interface LoadingStateProps {
  /** Number of placeholder rows to render. */
  rows?: number;
  className?: string;
  /** Accessible label announced while the region is busy. */
  label?: string;
}

/**
 * The single loading affordance for the app. Rendering this instead of an empty
 * list is what keeps "still fetching" from reading as "there is nothing here".
 */
export function LoadingState({ rows = 3, className, label }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-slot="loading-state"
      className={cn("space-y-2", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} data-slot="loading-row" className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}
