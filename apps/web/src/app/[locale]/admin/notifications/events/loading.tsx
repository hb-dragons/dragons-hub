import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@dragons/ui/components/skeleton";

/** Route-level fallback for the domain-event browser's server prefetch. */
export default function EventsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64 rounded-md" />
      <LoadingState rows={10} />
    </div>
  );
}
