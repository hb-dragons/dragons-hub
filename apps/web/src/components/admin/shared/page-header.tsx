import { cn } from "@dragons/ui/lib/utils";

interface StatBadge {
  label: string;
  value: string | number;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badges?: StatBadge[];
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badges,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          )}
        </div>
        {badges && badges.length > 0 && (
          <div className="flex gap-4">
            {badges.map((badge) => (
              <div key={badge.label} className="text-right">
                <p className="font-display text-2xl font-bold">{badge.value}</p>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {badge.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
