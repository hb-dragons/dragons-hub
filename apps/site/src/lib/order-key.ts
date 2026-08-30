/**
 * Comparator for Payload's `orderable` fractional-index keys (`_order`).
 * The keys are base62 strings built so plain code-unit comparison is the
 * sort order — `localeCompare` would apply locale tailoring and must not be
 * used. Ties (a duplicated key after an import) keep the input order.
 */
export function compareOrderKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
