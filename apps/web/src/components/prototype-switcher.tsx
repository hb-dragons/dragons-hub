"use client";

// PROTOTYPE — floating variant switcher for UI prototypes. Rendered only
// while a `?variant=` parameter is present; remove it from main together with
// the prototype it serves.

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PrototypeVariant {
  key: string;
  name: string;
}

/**
 * The `?variant=` value, or null without one (or with an unknown one). Null
 * means "no prototype": the page renders as it does for everyone else, so the
 * prototype can sit on production behind the parameter.
 */
export function usePrototypeVariant(variants: readonly PrototypeVariant[]): string | null {
  const value = useSearchParams().get("variant");
  return variants.some((v) => v.key === value) ? value : null;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: readonly PrototypeVariant[];
  current: string;
}) {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length]!;
    const params = new URLSearchParams(window.location.search);
    params.set("variant", next.key);
    // History API, like the hub itself: Next syncs useSearchParams from it.
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, [contenteditable=true], [role=combobox], [role=listbox], [role=menu]"))) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const v = variants[index]!;
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-amber-300 px-2 py-1 text-sm font-semibold text-black shadow-lg ring-2 ring-black/80">
      <button type="button" aria-label="Previous variant" className="rounded-full p-1 hover:bg-black/10" onClick={() => go(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center">
        PROTOTYPE {v.key} · {v.name} <span className="font-normal opacity-60">({index + 1}/{variants.length})</span>
      </span>
      <button type="button" aria-label="Next variant" className="rounded-full p-1 hover:bg-black/10" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
