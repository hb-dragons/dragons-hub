"use client";

import type { TaskAssignee } from "@dragons/shared";

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (
    parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)
  ).toUpperCase();
}

function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 45%)`;
}

export interface AssigneeStackProps {
  assignees: TaskAssignee[];
  max?: number;
  size?: "sm" | "md";
}

export function AssigneeStack({
  assignees,
  max = 3,
  size = "sm",
}: AssigneeStackProps) {
  if (assignees.length === 0) return null;
  const shown = assignees.slice(0, max);
  const extra = assignees.length - shown.length;
  const dim = size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-xs";

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <span
          key={u.userId}
          title={u.name ?? u.userId}
          className={`inline-flex ${dim} items-center justify-center rounded-full border-2 border-card font-semibold text-white`}
          style={{ backgroundColor: colorFromId(u.userId) }}
        >
          {initials(u.name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          className={`inline-flex ${dim} items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground font-semibold`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
