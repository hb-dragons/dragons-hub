"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@dragons/ui/lib/utils";

/**
 * A row of mutually exclusive choices: a radio group drawn as one pill, with
 * arrow keys moving the choice, as a radio group's should.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const index = options.findIndex((o) => o.value === value);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = options[(index + step + options.length) % options.length]!;
    onChange(next.value);
    // Focus follows the choice, as in a native radio group.
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="bg-muted flex w-full rounded-md p-[3px] sm:inline-flex sm:w-auto">
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={o.value}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              // Full-width and evenly shared on a phone, where four choices
              // would otherwise run off the screen.
              "focus-visible:ring-ring/50 flex-1 rounded-md px-1.5 py-1 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] sm:flex-none sm:px-2.5 sm:text-sm",
              checked
                ? "bg-background dark:bg-surface-bright text-foreground shadow-sm"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
