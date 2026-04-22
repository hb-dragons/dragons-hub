"use client";

interface Props {
  total: number;
  max: number;
}

export function WorkloadBar({ total, max }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, total / max)) : 0;
  return (
    <div className="bg-surface-low h-2 w-full overflow-hidden rounded-sm">
      <div
        data-testid="workload-bar-fill"
        className="bg-primary h-full"
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
