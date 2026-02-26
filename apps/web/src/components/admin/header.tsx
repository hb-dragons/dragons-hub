"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { cn } from "@dragons/ui/lib/utils";
import { UserButton } from "@daveyplate/better-auth-ui";
import { LocaleSwitcher } from "@/components/locale-switcher";

const navLinks = [
  { href: "/admin/matches" as const, labelKey: "nav.matches" as const },
  { href: "/admin/referees" as const, labelKey: "nav.referees" as const },
  { href: "/admin/standings" as const, labelKey: "nav.standings" as const },
  { href: "/admin/venues" as const, labelKey: "nav.venues" as const },
  { href: "/admin/teams" as const, labelKey: "nav.teams" as const },
  { href: "/admin/users" as const, labelKey: "nav.users" as const },
  { href: "/admin/sync" as const, labelKey: "nav.sync" as const },
  { href: "/admin/settings" as const, labelKey: "nav.settings" as const },
];

export function Header() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/admin" className="text-lg font-semibold tracking-tight">
          {t("nav.brand")}
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
        </nav>
        <LocaleSwitcher />
        <UserButton
          size="icon"
          align="center"
        />
      </div>
    </header>
  );
}
