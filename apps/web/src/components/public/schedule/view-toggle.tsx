"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@dragons/ui/components/button";
import { CalendarDays, List } from "lucide-react";

interface ViewToggleProps {
  view: "weekend" | "calendar";
  weekendLabel: string;
  calendarLabel: string;
}

export function ViewToggle({ view, weekendLabel, calendarLabel }: ViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setView(newView: "weekend" | "calendar") {
    const params = new URLSearchParams(searchParams.toString());
    if (newView === "weekend") {
      params.delete("view");
    } else {
      params.set("view", newView);
    }
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
      <Button
        variant={view === "weekend" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => setView("weekend")}
        className="gap-1.5"
      >
        <List className="h-3.5 w-3.5" />
        {weekendLabel}
      </Button>
      <Button
        variant={view === "calendar" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => setView("calendar")}
        className="gap-1.5"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {calendarLabel}
      </Button>
    </div>
  );
}
