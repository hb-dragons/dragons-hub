import { useCallback, useEffect, useRef, useState } from "react";
import { createDebouncer, SEARCH_DEBOUNCE_MS, type Debouncer } from "@/lib/ui/debounce";

function useDebouncer(): Debouncer {
  const ref = useRef<Debouncer | null>(null);
  ref.current ??= createDebouncer();
  return ref.current;
}

/**
 * Lags `value` behind by `delayMs`, collapsing bursts. Use for a controlled
 * search field: keep the raw input in state so typing stays instant, and drive
 * the SWR key / filtering off the debounced copy.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  const debouncer = useDebouncer();

  useEffect(() => {
    debouncer.schedule(() => setDebounced(value), delayMs);
    return () => {
      debouncer.cancel();
    };
  }, [value, delayMs, debouncer]);

  return debounced;
}

/**
 * A stable callback that only runs `delayMs` after the last invocation. Use for
 * uncontrolled inputs (e.g. the native header search bar) where there is no
 * per-keystroke React state to debounce in the first place.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number = SEARCH_DEBOUNCE_MS,
): (...args: A) => void {
  const debouncer = useDebouncer();
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(
    () => () => {
      debouncer.cancel();
    },
    [debouncer],
  );

  return useCallback(
    (...args: A) => {
      debouncer.schedule(() => latest.current(...args), delayMs);
    },
    [debouncer, delayMs],
  );
}
