import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@dragons/ui/components/skeleton";

/** Route-level fallback for the referee hub's two server prefetches. */
export default function RefereesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64 rounded-md" />
      <div className="grid grid-cols-[200px_320px_1fr] gap-4">
        <LoadingState rows={4} />
        <LoadingState rows={8} />
        <LoadingState rows={5} />
      </div>
    </div>
  );
}
