import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { TaskPriority } from "@dragons/shared";
import { TASK_PRIORITIES } from "@dragons/shared";

export interface BoardFilters {
  assigneeIds: string[];
  priority: TaskPriority | null;
  q: string;
}

function isTaskPriority(value: string | null): value is TaskPriority {
  return value !== null && (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function useBoardFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const priorityRaw = searchParams.get("priority");
  const filters: BoardFilters = {
    assigneeIds: searchParams.getAll("assignee"),
    priority: isTaskPriority(priorityRaw) ? priorityRaw : null,
    q: searchParams.get("q") ?? "",
  };

  const update = (next: Partial<BoardFilters>) => {
    const qs = new URLSearchParams();
    const assigneeIds = next.assigneeIds ?? filters.assigneeIds;
    const priority =
      next.priority !== undefined ? next.priority : filters.priority;
    const q = next.q !== undefined ? next.q : filters.q;
    for (const id of assigneeIds) qs.append("assignee", id);
    if (priority) qs.set("priority", priority);
    if (q) qs.set("q", q);
    const suffix = qs.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, {
      scroll: false,
    });
  };

  return {
    filters,
    setAssigneeIds: (ids: string[]) => update({ assigneeIds: ids }),
    setPriority: (p: TaskPriority | null) => update({ priority: p }),
    setQuery: (q: string) => update({ q }),
    clear: () =>
      update({ assigneeIds: [], priority: null, q: "" }),
  };
}
