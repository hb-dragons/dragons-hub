"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverAnchor } from "./popover";
import { Input } from "./input";
import { cn } from "@dragons/ui/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  onSearch: (query: string) => Promise<ComboboxOption[]>;
  onSelect: (option: ComboboxOption) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function Combobox({
  onSearch,
  onSelect,
  placeholder = "Search...",
  debounceMs = 300,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const results = await onSearch(query);
        setOptions(results);
        setOpen(results.length > 0);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, debounceMs, onSearch]);

  function handleSelect(option: ComboboxOption) {
    onSelect(option);
    setQuery("");
    setOptions([]);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {loading && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Searching...
          </div>
        )}
        {!loading && options.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No results found
          </div>
        )}
        <ul className="max-h-60 overflow-auto">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                  "focus:bg-muted focus:outline-none",
                )}
                onClick={() => handleSelect(option)}
              >
                <div className="font-medium">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-muted-foreground">
                    {option.description}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
