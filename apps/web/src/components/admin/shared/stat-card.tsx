import { cn } from "@dragons/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg p-4 space-y-2",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </p>
        {Icon && (
          <Icon className="text-muted-foreground size-4" />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <p className="font-display text-3xl font-bold">{value}</p>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trendUp ? "text-primary" : "text-heat",
            )}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
