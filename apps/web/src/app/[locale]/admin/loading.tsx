import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@dragons/ui/components/skeleton";

/**
 * Route-level fallback for the dashboard, which blocks on six server fetches
 * before it can paint. Without this the browser shows the previous route (or
 * nothing) for the whole round trip.
 */
export default function AdminDashboardLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-64 rounded-md" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <LoadingState rows={1} className="[&>*]:h-24" />
        <LoadingState rows={1} className="[&>*]:h-24" />
        <LoadingState rows={1} className="[&>*]:h-24" />
        <LoadingState rows={1} className="[&>*]:h-24" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <LoadingState rows={3} />
        <LoadingState rows={3} />
      </div>
    </div>
  );
}
