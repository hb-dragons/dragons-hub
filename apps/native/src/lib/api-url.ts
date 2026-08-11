/**
 * Resolves the API base URL without ever throwing at import time.
 *
 * This used to `throw` at module scope when `EXPO_PUBLIC_API_URL` was missing
 * or non-HTTPS in a release build. `lib/auth-client.ts` calls it during module
 * evaluation, which happens before `ErrorBoundary` mounts — so an OTA update
 * published without the variable produced a bundle that died on load with no
 * in-process recovery and no diagnosable message.
 *
 * Degrading is not the same as being lax: a release build still refuses to hand
 * out a cleartext URL, because that would push session cookies over http://.
 * It returns an empty base URL instead, so requests fail fast and the screens'
 * error states (with retry) surface the problem, while the misconfiguration is
 * recorded for logging.
 */

export const DEFAULT_API_URL = "http://localhost:3001";

export interface ApiUrlResolution {
  /** Base URL to use. Empty string when the configuration is unusable. */
  url: string;
  /** Human-readable misconfiguration, or null when the URL is usable. */
  error: string | null;
}

export function resolveApiUrlSafe(opts: {
  configured: string | undefined;
  isDev: boolean;
}): ApiUrlResolution {
  const configured = opts.configured?.trim() ?? "";

  if (!configured) {
    if (opts.isDev) return { url: DEFAULT_API_URL, error: null };
    return {
      url: "",
      error:
        "EXPO_PUBLIC_API_URL is not set. This build cannot reach the API; " +
        "rebuild or republish the update with the variable configured.",
    };
  }

  if (!opts.isDev && !configured.startsWith("https://")) {
    return {
      url: "",
      error: `EXPO_PUBLIC_API_URL must use HTTPS in release builds, got: ${configured}`,
    };
  }

  return { url: configured, error: null };
}

function isDevBuild(): boolean {
  // `__DEV__` is injected by Metro; it is absent under vitest and in any other
  // plain-Node context, where the strict (release) rules are the safe default.
  return typeof __DEV__ !== "undefined" && __DEV__;
}

let cached: ApiUrlResolution | null = null;

function resolution(): ApiUrlResolution {
  if (cached === null) {
    cached = resolveApiUrlSafe({
      configured: process.env.EXPO_PUBLIC_API_URL,
      isDev: isDevBuild(),
    });
    if (cached.error) {
      console.error(`[api-url] ${cached.error}`);
    }
  }
  return cached;
}

/** The API base URL. Empty string when the build is misconfigured. */
export function resolveApiUrl(): string {
  return resolution().url;
}

/** The recorded misconfiguration, or null. Safe to call at any time. */
export function getApiUrlConfigError(): string | null {
  return resolution().error;
}
