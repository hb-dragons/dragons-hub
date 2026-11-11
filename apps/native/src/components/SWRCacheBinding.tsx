import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { bindSWRCacheMutate } from "@/lib/swr-config";

/**
 * Hands sign-out the app cache's own `mutate` (`resetSWRCache` in
 * `lib/swr-config.ts`), which runs outside the React tree. Mounted once,
 * directly inside the root layout's `<SWRConfig>`.
 */
export function SWRCacheBinding() {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    bindSWRCacheMutate(mutate);
    return () => bindSWRCacheMutate(null);
  }, [mutate]);
  return null;
}
