import { useCallback, useEffect } from "react";
import { router } from "expo-router";
import { deliverSheetResult, releaseSheetResult } from "@/lib/nav/sheet-result";

/**
 * The sheet-route side of the result convention (issue #219).
 *
 * Returns "hand this value back and close". The token is released when the
 * route unmounts, so a sheet the user swiped away — or one that closed after
 * delivering — leaves nothing registered.
 */
export function useSheetResult<T>(token: string | undefined): (value: T) => void {
  useEffect(() => () => releaseSheetResult(token), [token]);

  return useCallback(
    (value: T) => {
      deliverSheetResult(token, value);
      router.back();
    },
    [token],
  );
}
