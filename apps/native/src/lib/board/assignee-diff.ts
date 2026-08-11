/**
 * Which assignments a task gains and loses when the picker hands back its
 * final selection.
 *
 * The assignee sheet batches locally and delivers a set once (issue #219), so
 * the caller is the one that has to turn "who is assigned now" into add and
 * remove calls.
 */
export function diffAssignees(
  current: Iterable<string>,
  selected: ReadonlySet<string>,
): { added: string[]; removed: string[] } {
  const initial = new Set(current);
  return {
    added: [...selected].filter((id) => !initial.has(id)),
    removed: [...initial].filter((id) => !selected.has(id)),
  };
}
