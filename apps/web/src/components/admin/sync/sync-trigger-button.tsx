"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Loader2, Play } from "lucide-react";
import { useSyncStatus, useTriggerSync, useSyncRunContext } from "./use-sync";

export function SyncTriggerButton() {
  const t = useTranslations();
  const { isRunning } = useSyncStatus();
  const { triggering } = useSyncRunContext();
  const { trigger } = useTriggerSync();

  return (
    <Button onClick={trigger} disabled={isRunning || triggering}>
      {triggering ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Play className="mr-2 h-4 w-4" />
      )}
      {t("sync.trigger")}
    </Button>
  );
}
