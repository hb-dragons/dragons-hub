"use client";

import { Link } from "@/lib/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Wordmark } from "@/components/brand/wordmark";

// The schedule/standings/teams nav links are hidden while those pages are
// parked behind the /spielplan redirect (see SPIELPLAN_REDIRECT_PREFIXES in
// src/proxy.ts) — a nav whose every entry lands on the current page is
// noise. Restore them together with the redirect entries.

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 bg-surface-low/95 backdrop-blur supports-[backdrop-filter]:bg-surface-low/60 pt-[var(--safe-area-top)]">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center">
          <Wordmark width={110} alt="Dragons" />
        </Link>

        <div className="flex-1" />

        <ThemeToggle />
        <LocaleSwitcher />
      </div>
    </header>
  );
}
