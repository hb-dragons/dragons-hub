/**
 * "Kalender abonnieren" for the Spielplan: a popover with the calendar feed
 * URL, a copy button and the per-app steps. The URL is the subscription — a
 * calendar app never re-reads this page — so the squads come in as ids and
 * the popover only renders what {@link calendarFeedUrl} builds from them.
 * Sibling of the Web-App's SubscribeButton, kept separate because the site
 * has its own strings and no next-intl.
 */
import { useState } from "react";
import { Button } from "@dragons/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@dragons/ui";
import { calendarFeedUrl } from "../../lib/spielplan";
import { strings } from "../../lib/strings";

function CalendarPlusIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M12 14v4M10 16h4" />
    </svg>
  );
}

export function CalendarSubscribe({
  apiBase,
  squadIds,
}: {
  apiBase: string;
  /** Squads to narrow the feed to; empty means every Dragons game. */
  squadIds: readonly number[];
}) {
  const [copied, setCopied] = useState(false);
  const url = calendarFeedUrl(apiBase, squadIds);
  const t = strings.spielplan;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarPlusIcon />
          {t.subscribe}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="mb-1 text-sm font-medium">{t.subscribeTitle}</p>
        <p className="mb-2 text-xs text-muted-foreground">{t.subscribeHint}</p>
        <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5">
          <code className="flex-1 truncate text-xs">
            {url}
          </code>
          <button
            type="button"
            onClick={() => {
              void copy();
            }}
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
