"use client";

import { AlertCircle } from "lucide-react";
import { useSyncContext } from "./sync-provider";

export function SyncErrorBanner() {
  const { error } = useSyncContext();

  if (!error) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {error}
    </div>
  );
}
