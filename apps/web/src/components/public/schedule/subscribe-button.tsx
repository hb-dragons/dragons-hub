"use client";

import { useState } from "react";
import { Button } from "@dragons/ui";
import { Popover, PopoverTrigger, PopoverContent } from "@dragons/ui";

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
          <CalendarPlusIcon className="mr-2 h-4 w-4" />
          {t.subscribe}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="mb-2 text-sm font-medium">{t.subscribeTitle}</p>
        <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1.5">
          <code className="flex-1 truncate text-xs">{icsUrl}</code>
          <button
            type="button"
            onClick={handleCopy}
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

function CalendarPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  );
}
