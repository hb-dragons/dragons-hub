/**
 * "Kalender abonnieren" for the Spielplan: a popover with a squad picker, the
 * calendar feed URL it produces, a copy button and the per-app steps. The URL
 * is the subscription — a calendar app never re-reads this page — so the
 * picker starts from the page's team filter and, once touched, keeps its own
 * selection so a visitor can pick squads for the calendar without changing
 * the table. Sibling of the Web-App's SubscribeButton, kept separate because
 * the site has its own strings and no next-intl.
 */
import { useState } from "react";
import { Button } from "@dragons/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@dragons/ui";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Label } from "@dragons/ui/components/label";
import {
  calendarFeedSquadIds,
  calendarFeedUrl,
  type SquadIdGame,
  type TeamFilterOption,
} from "../../lib/spielplan";
import { strings } from "../../lib/strings";
import { TeamBadge } from "./TeamBadge";

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
  games,
  teams,
  filterSelection,
}: {
  apiBase: string;
  games: readonly SquadIdGame[];
  /** Every Dragons team in the plan, in filter order. */
  teams: readonly TeamFilterOption[];
  /** The page's team filter; null means no explicit choice, i.e. every team. */
  filterSelection: ReadonlySet<string> | null;
}) {
  const [copied, setCopied] = useState(false);
  // null = follow the page filter; a Set = the visitor picked inside here.
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const selected = picked ?? filterSelection ?? new Set(teams.map((team) => team.name));
  const url = calendarFeedUrl(apiBase, calendarFeedSquadIds(games, selected));
  const t = strings.spielplan;

  const toggle = (name: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(name);
    } else {
      next.delete(name);
    }
    setPicked(next);
  };

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
        <ul className="mb-3 max-h-56 space-y-1.5 overflow-y-auto">
          {teams.map((team) => {
            const id = `calendar-team-${team.name}`;
            return (
              <li key={team.name} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={selected.has(team.name)}
                  onCheckedChange={(checked) => toggle(team.name, checked === true)}
                />
                <Label htmlFor={id} className="cursor-pointer">
                  <TeamBadge teamName={team.name} badgeColor={team.badgeColor} disableLink />
                </Label>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5">
          <code className="flex-1 truncate text-xs">{url}</code>
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
