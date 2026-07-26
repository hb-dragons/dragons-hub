import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@dragons/ui/components/skeleton";

/**
 * Route-level fallback for /admin/sync, the slowest admin route: it awaits six
 * federation-backed API calls before rendering anything.
 */
export default function SyncLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64 rounded-md" />
      <LoadingState rows={3} className="[&>*]:h-20" />
      <LoadingState rows={6} />
    </div>
  );
}
