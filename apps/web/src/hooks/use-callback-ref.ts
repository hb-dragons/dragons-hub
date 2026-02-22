import { useEffect, useMemo, useRef } from "react"

/**
 * Returns a stable callback reference that always invokes the latest version
 * of the provided callback. Useful for callbacks passed to memoized children
 * or effects that should not trigger re-renders.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCallbackRef<T extends (...args: any[]) => any>(
  callback: T | undefined,
): T {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  return useMemo(
    () =>
      ((...args: Parameters<T>) => {
        return callbackRef.current?.(...args)
      }) as T,
    [],
  )
}
