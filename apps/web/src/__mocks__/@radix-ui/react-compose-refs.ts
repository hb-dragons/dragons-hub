"use client";

/**
 * Patched @radix-ui/react-compose-refs for the test environment.
 *
 * The upstream composeRefs@1.1.2 passes the full `refs` array as the
 * useCallback dependency, which causes a new ref callback identity on every
 * render whenever an inline arrow function is one of the refs. React 19 then
 * calls the old callback with null (cleanup) before attaching the new one,
 * triggering a setState → re-render → new inline fn → repeat cycle that hits
 * React's maximum update depth limit.
 *
 * This patch uses a ref-backed stable callback pattern so the composed ref
 * identity never changes across renders.
 */
import * as React from "react";

type PossibleRef<T> = React.Ref<T> | undefined;

function setRef<T>(ref: PossibleRef<T>, value: T): (() => void) | void {
  if (typeof ref === "function") {
    return ref(value);
  } else if (ref !== null && ref !== undefined) {
    (ref as React.RefObject<T>).current = value;
  }
}

function composeRefs<T>(...refs: PossibleRef<T>[]) {
  return (node: T | null) => {
    let hasCleanup = false;
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node as T);
      if (!hasCleanup && typeof cleanup === "function") hasCleanup = true;
      return cleanup;
    });
    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i];
          if (typeof cleanup === "function") {
            cleanup();
          } else {
            setRef(refs[i], null as unknown as T);
          }
        }
      };
    }
  };
}

function useComposedRefs<T>(...refs: PossibleRef<T>[]) {
  // Keep latest refs in a ref so the stable callback always sees current values.
  const refsRef = React.useRef(refs);
  refsRef.current = refs;
  // Empty deps → stable identity → React 19 never detects a ref-callback change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useCallback(
    (node: T | null) => composeRefs<T>(...refsRef.current)(node),
    [],
  );
}

export { composeRefs, useComposedRefs };
