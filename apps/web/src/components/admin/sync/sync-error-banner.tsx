"use client";

import { AlertCircle } from "lucide-react";
import { useSyncStatus } from "./use-sync";

export function SyncErrorBanner() {
  const { error } = useSyncStatus();

  if (!error) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {error.message || String(error)}
    </div>
  );
}
