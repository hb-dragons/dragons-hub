"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "@dragons/ui/components/button";

// Code-split: streamdown + the panel only load when the member opens the chat.
const AssistantPanel = dynamic(() => import("./club-assistant/assistant-panel").then((m) => m.AssistantPanel), {
  ssr: false,
});

export function ClubAssistant() {
  const { data: session } = authClient.useSession();
  const t = useTranslations("qa");
  const [open, setOpen] = useState(false);

  if (!session?.user) return null;

  return (
    <>
      {open ? null : (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(5rem+var(--safe-area-bottom))] right-4 z-40 shadow-lg md:bottom-6"
        >
          {t("trigger")}
        </Button>
      )}
      {open ? <AssistantPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}
