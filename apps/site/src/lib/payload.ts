/**
 * Build-time content plumbing against the Payload CMS REST API.
 *
 * Failure model (the legacy site's silent-empty-prerender is designed out):
 * - CMS env fully absent → the build is an env-less shell build (CI compile
 *   check, fresh clone). Collections stay empty with a logged warning —
 *   mirrors the env-presence gating payload.config.ts uses for GCS storage.
 * - CMS env present → every failure is fatal: non-200, network error,
 *   unexpected response shape, and schema drift (via `parseData`) all throw
 *   and fail the build loudly. Production/deploy builds always set the env
 *   (turbo.json declares it for `@dragons/site#build`), so a broken CMS can
 *   never ship empty pages.
 * - CMS env half-configured → always a mistake, always fatal.
 */
import type { Loader } from "astro/loaders";
import { z } from "astro/zod";

const pageEnvelope = z.object({
  docs: z.array(z.unknown()),
  hasNextPage: z.boolean(),
});

const siteSettingsSchema = z.object({
  memberCount: z.number().nullish(),
  foundingYear: z.number().nullish(),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

interface CmsEnv {
  base: string;
  headers: { Authorization: string };
}

/** Empty string counts as unset — an exported-but-blank var is not a config. */
function readEnv(name: "CMS_URL" | "CMS_API_TOKEN"): string | undefined {
  const value = (import.meta.env?.[name] as string | undefined) ?? process.env[name];
  return value === "" ? undefined : value;
}

function cmsEnv(): CmsEnv | null {
  const base = readEnv("CMS_URL");
  const token = readEnv("CMS_API_TOKEN");
  if (base === undefined && token === undefined) return null;
  if (base === undefined || token === undefined) {
    const missing = base === undefined ? "CMS_URL" : "CMS_API_TOKEN";
    throw new Error(
      `payload: ${missing} is not set but its counterpart is — set both CMS_URL and CMS_API_TOKEN (see apps/site/.env.example)`,
    );
  }
  return { base, headers: { Authorization: `users API-Key ${token}` } };
}

async function fetchJson(env: CmsEnv, path: string, params: URLSearchParams, resource: string): Promise<unknown> {
  // String concatenation, not `new URL(path, base)` — the latter would drop a
  // path prefix in CMS_URL (https://host/cms → https://host/api/…).
  const url = new URL(`${env.base.replace(/\/$/, "")}${path}`);
  for (const [key, value] of params) url.searchParams.set(key, value);
  const res = await fetch(url.toString(), { headers: env.headers });
  if (!res.ok) throw new Error(`payload ${resource}: HTTP ${res.status} for ${url.toString()}`);
  return res.json();
}

export interface PayloadLoaderOptions {
  /** Relationship population depth (Payload `depth` query param). Default 1. */
  depth?: number;
  /** Payload `sort` query param, e.g. `-publishedDate` or `orderIndex`. */
  sort?: string;
  /**
   * Fail the build when the CMS is configured and this collection comes back
   * with zero documents. A revoked or expired `CMS_API_TOKEN` does not 403 —
   * `apps/cms/src/lib/access.ts` degrades it to an anonymous read — so the
   * build would otherwise succeed with drafts, or everything, missing and
   * publish an empty site (#269). Set on the collections the site cannot be
   * itself without.
   */
  required?: boolean;
}

/**
 * Astro Content Layer loader that pages through a Payload collection's REST
 * endpoint until `hasNextPage` is false. `collection` is the REST slug
 * (`shop-items`), not the Astro collection key (`shopItems`).
 */
export function payloadLoader(collection: string, opts: PayloadLoaderOptions = {}): Loader {
  return {
    name: `payload:${collection}`,
    async load({ store, parseData, logger }) {
      const env = cmsEnv();
      if (env === null) {
        logger.warn(
          `CMS_URL/CMS_API_TOKEN not set — leaving "${collection}" empty (env-less shell build). ` +
            "Content builds must set both; see apps/site/.env.example.",
        );
        return;
      }
      store.clear();
      let stored = 0;
      for (let page = 1; ; page++) {
        const params = new URLSearchParams({
          limit: "100",
          page: String(page),
          depth: String(opts.depth ?? 1),
        });
        if (opts.sort !== undefined) params.set("sort", opts.sort);
        const json = await fetchJson(env, `/api/${collection}`, params, collection);
        const parsed = pageEnvelope.safeParse(json);
        if (!parsed.success) {
          throw new Error(
            `payload ${collection}: unexpected response shape (expected { docs, hasNextPage }): ${parsed.error.message}`,
          );
        }
        for (const doc of parsed.data.docs) {
          const id = String((doc as { id: string | number }).id);
          store.set({ id, data: await parseData({ id, data: doc as Record<string, unknown> }) });
          stored += 1;
        }
        if (!parsed.data.hasNextPage) break;
      }
      if (opts.required === true && stored === 0) {
        throw new Error(
          `payload ${collection}: the CMS is configured but "${collection}" came back empty. ` +
            "Refusing to publish a site without it — check CMS_API_TOKEN and that the documents are published.",
        );
      }
    },
  };
}

/**
 * Fetches the `site-settings` global. Returns null on env-less shell builds
 * (same gating as {@link payloadLoader}); throws on any CMS failure.
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  const env = cmsEnv();
  if (env === null) return null;
  const json = await fetchJson(env, "/api/globals/site-settings", new URLSearchParams({ depth: "0" }), "site-settings");
  return siteSettingsSchema.parse(json);
}
