"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { cn } from "@dragons/ui/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Wordmark } from "@/components/brand/wordmark";

const navLinks = [
  { href: "/schedule" as const, labelKey: "public.schedule" as const },
  { href: "/standings" as const, labelKey: "public.standings" as const },
  { href: "/teams" as const, labelKey: "public.teams" as const },
];

export function PublicHeader() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[var(--safe-area-top)]">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center">
          <Wordmark width={110} alt="Dragons" />
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex flex-1 items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 md:hidden" />

        <ThemeToggle />
        <LocaleSwitcher />
      </div>
    </header>
  );
}
