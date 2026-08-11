"use client";

import { PageError } from "@/components/admin/shared/page-error";
import { useSyncStatus } from "./use-sync";

export function SyncErrorBanner() {
  const { error } = useSyncStatus();

  if (!error) return null;

  return <PageError message={error.message || String(error)} />;
}
