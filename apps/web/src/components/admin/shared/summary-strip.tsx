import { cn } from "@dragons/ui/lib/utils";

interface SummaryItem {
  label: string;
  value: string | number;
  emphasis?: boolean;
}

interface SummaryStripProps {
  items: SummaryItem[];
  className?: string;
}

export function SummaryStrip({ items, className }: SummaryStripProps) {
  return (
    <div
      className={cn(
        "bg-surface-low grid gap-px rounded-lg overflow-hidden",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-card p-4 space-y-1"
        >
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {item.label}
          </p>
          <p
            className={cn(
              "font-display text-2xl font-bold",
              item.emphasis && "text-heat",
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
