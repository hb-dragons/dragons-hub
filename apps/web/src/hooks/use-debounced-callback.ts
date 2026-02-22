import { useEffect, useMemo, useRef } from "react"

import { useCallbackRef } from "./use-callback-ref"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
): T {
  const handleCallback = useCallbackRef(callback)
  const debounceTimerRef = useRef(0)

  useEffect(
    () => () => {
      window.clearTimeout(debounceTimerRef.current)
    },
    [],
  )

  return useMemo(
    () =>
      ((...args: Parameters<T>) => {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = window.setTimeout(
          () => handleCallback(...args),
          delay,
        )
      }) as T,
    [handleCallback, delay],
  )
}
