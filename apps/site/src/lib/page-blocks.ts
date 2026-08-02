/**
 * Joins for the pages.layout block renderer (PageBlocks.astro).
 *
 * Relations inside layout blocks arrive one populate level deep (ids +
 * display fields only — see content.config.ts pageBlock), so the renderer
 * joins them back to the fully populated Astro collections by id.
 */

interface Ref {
  id: number;
}

/** Full entries for the block's refs, in block order; unknown ids drop out. */
export function resolveRefs<T extends Ref>(
  refs: readonly Ref[] | null | undefined,
  entries: readonly T[],
): T[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return (refs ?? []).flatMap((ref) => {
    const entry = byId.get(ref.id);
    return entry === undefined ? [] : [entry];
  });
}

/**
 * Vorstand card clipping, ported from dragons/team/index.vue: first card
 * clips right, last clips left, middle cards both — a lone card clips right
 * (the legacy ternary checks index 0 first).
 */
export function vorstandClipDirection(index: number, count: number): "left" | "right" | "both" {
  if (index === 0) return "right";
  if (index === count - 1) return "left";
  return "both";
}
