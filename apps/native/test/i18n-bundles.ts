/**
 * Reading a message catalogue by key path, for the tests that check a label a
 * module names is one both bundles actually carry.
 *
 * Shared rather than copied: three action/segment vocabularies assert the same
 * thing (`board/task-actions`, `board/board-actions`, `ui/preference-segments`),
 * and a second spelling of the walk is a second set of edge cases to keep
 * honest. Companion to `test/source-tree.ts`, which does the same for the rules
 * that read the source tree.
 */

/** The value a bundle holds at a dotted key path, or `undefined` if absent. */
export function lookup(bundle: object, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      bundle,
    );
}
