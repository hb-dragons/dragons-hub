/**
 * Detect whether the app is running inside a Capacitor native shell.
 * Only available on the client — always returns false during SSR.
 */
export function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).Capacitor !== undefined
  );
}
