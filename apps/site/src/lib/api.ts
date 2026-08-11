import { ApiClient, createApi } from "@dragons/api-client";

/**
 * The one place the site resolves the public API origin: `PUBLIC_API_URL` in
 * dev/preview, the production host otherwise. Islands share the client below;
 * asset URLs (club logos) build on `API_BASE`.
 */
export const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ??
  "https://api.app.hbdragons.de";

export const api = createApi(new ApiClient({ baseUrl: API_BASE }));
