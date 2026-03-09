"use client";

import { Button } from "@dragons/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef } from "react";

interface WeekendPickerProps {
  /** Formatted label, e.g. "Sa/So 14/15 Mär" */
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function WeekendPicker({
  label,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: WeekendPickerProps) {
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      const threshold = 50;
      if (diff > threshold && hasPrevious) {
        onPrevious();
      } else if (diff < -threshold && hasNext) {
        onNext();
      }
      touchStartX.current = null;
    },
    [hasPrevious, hasNext, onPrevious, onNext],
  );

  return (
    <div
      className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-2"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={!hasPrevious}
        aria-label="Previous weekend"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next weekend"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
