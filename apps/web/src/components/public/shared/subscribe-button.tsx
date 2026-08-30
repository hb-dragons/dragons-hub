"use client";

import { useState } from "react";
import { Button } from "@dragons/ui";
import { Popover, PopoverTrigger, PopoverContent } from "@dragons/ui";
import { CalendarPlus } from "lucide-react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface SubscribeButtonProps {
  teamApiId: number | null;
  translations: {
    subscribe: string;
    subscribeTitle: string;
    copy: string;
    copied: string;
    instructionApple: string;
    instructionGoogle: string;
    instructionOutlook: string;
  };
}

function buildIcsUrl(teamApiId: number | null): string {
  const url = new URL(`${API_BASE_URL}/public/schedule.ics`);
  if (teamApiId) url.searchParams.set("teamApiId", teamApiId.toString());
  return url.toString();
}

export function SubscribeButton({
  teamApiId,
  translations: t,
}: SubscribeButtonProps) {
  const [copied, setCopied] = useState(false);
  const icsUrl = buildIcsUrl(teamApiId);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(icsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus className="mr-2 h-4 w-4" />
          {t.subscribe}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="mb-2 text-sm font-medium">{t.subscribeTitle}</p>
        <div className="bg-surface-low flex items-center gap-1.5 rounded-md px-2 py-1.5">
          <code className="flex-1 truncate text-xs">{icsUrl}</code>
          <button
            type="button"
            onClick={() => { void handleCopy(); }}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-accent"
          >
            {copied ? t.copied : t.copy}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Apple:</strong> {t.instructionApple}
          <br />
          <strong>Google:</strong> {t.instructionGoogle}
          <br />
          <strong>Outlook:</strong> {t.instructionOutlook}
        </p>
      </PopoverContent>
    </Popover>
  );
}

