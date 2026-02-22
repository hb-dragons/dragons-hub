"use client";

import { Button } from "@dragons/ui/components/button";
import { Loader2, Play } from "lucide-react";
import { useSyncContext } from "./sync-provider";

export function SyncTriggerButton() {
  const { isRunning, triggering, triggerSync } = useSyncContext();

  return (
    <Button onClick={triggerSync} disabled={isRunning || triggering}>
      {triggering ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Play className="mr-2 h-4 w-4" />
      )}
      Start Sync
    </Button>
  );
}
