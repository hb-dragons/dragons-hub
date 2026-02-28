"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { cn } from "@dragons/ui/lib/utils";
import { CalendarDays, Trophy, Users } from "lucide-react";

const tabs = [
  { href: "/schedule" as const, labelKey: "public.schedule" as const, icon: CalendarDays },
  { href: "/standings" as const, labelKey: "public.standings" as const, icon: Trophy },
  { href: "/teams" as const, labelKey: "public.teams" as const, icon: Users },
];

export function PublicBottomTabs() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden pb-[var(--safe-area-bottom)]">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-around px-4">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-xs font-medium transition-colors min-w-[64px]",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "text-mint-shade")} />
              <span>{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
