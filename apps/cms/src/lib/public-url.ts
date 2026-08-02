// Payload's public-facing URL settings, driven by CMS_PUBLIC_URL so the
// testing→prod domain switch at cutover is an env change + redeploy, not a
// code change (plan Task A5 step 2c).
//
// Value: comma-separated list of origins. The first is the canonical public
// URL (Payload `serverURL`); every entry is trusted for CORS and CSRF — the
// prod list carries the LB domain first plus the bare run.app URL so the
// admin panel stays usable on both. Unset (dev, CI build) yields no settings:
// Payload then falls back to relative URLs and same-origin requests.

interface PublicUrlSettings {
  cors?: string[];
  csrf?: string[];
  serverURL?: string;
}

export function publicUrlSettings(raw: string | undefined): PublicUrlSettings {
  if (!raw) return {};

  const origins = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        throw new Error(`CMS_PUBLIC_URL entry is not a valid URL: "${entry}"`);
      }
    });

  if (origins.length === 0) return {};

  return { serverURL: origins[0], cors: origins, csrf: origins };
}
