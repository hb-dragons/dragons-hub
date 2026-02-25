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
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function Combobox({
  onSearch,
  onSelect,
  value,
  onChange,
  placeholder = "Search...",
  debounceMs = 300,
  className,
}: ComboboxProps) {
  const isControlled = value !== undefined;
  const [internalQuery, setInternalQuery] = React.useState("");
  const displayValue = isControlled ? value : internalQuery;

  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Only search when the user is actively typing, not on programmatic value changes
  const userTypingRef = React.useRef(false);

  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!userTypingRef.current) return;
    userTypingRef.current = false;

    if (displayValue.length < 2) {
      setOptions([]);
      setOpen(false);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const results = await onSearch(displayValue);
        setOptions(results);
        setHasSearched(true);
        setOpen(true);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [displayValue, debounceMs, onSearch]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    userTypingRef.current = true;
    const newValue = e.target.value;
    if (isControlled) {
      onChange?.(newValue);
    } else {
      setInternalQuery(newValue);
    }
  }

  function handleSelect(option: ComboboxOption) {
    onSelect(option);
    if (isControlled) {
      onChange?.(option.label);
    } else {
      setInternalQuery(option.label);
    }
    setOptions([]);
    setOpen(false);
    setHasSearched(false);
    // Return focus to input after selection
    inputRef.current?.focus();
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={displayValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={className}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {loading && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Searching...
          </div>
        )}
        {!loading && hasSearched && options.length === 0 && (
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
                onMouseDown={(e) => e.preventDefault()}
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
