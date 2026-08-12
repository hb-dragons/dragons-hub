import { useEffect, useRef } from "react";

/**
 * Seed form state from data that arrives asynchronously, exactly once.
 *
 * The sheet routes that edit an existing record (board settings, column
 * settings) read it out of SWR. SWR hands back a fresh object on every
 * revalidation — a focus event, or any mutation the board screen underneath
 * runs — so a plain `useEffect` keyed on the record would re-seed the inputs
 * and throw away whatever the user had typed. This fires on the first
 * non-nullish `value` and stays quiet after that, which is what the sheets'
 * imperative predecessors did when they snapshotted at `open()`.
 */
export function useSeedOnce<T>(value: T | null | undefined, seed: (value: T) => void): void {
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || value == null) return;
    seeded.current = true;
    seed(value);
    // `seed` only ever calls setState; re-running on its identity would make
    // every render a re-seed and defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
