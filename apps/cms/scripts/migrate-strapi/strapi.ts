/** A Strapi 5 document. Flat — v5 dropped v4's `attributes` wrapper. */
export interface StrapiDoc {
  id: number;
  documentId: string;
  publishedAt: string | null;
  [key: string]: unknown;
}

export interface StrapiFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  size: number;
  alternativeText: string | null;
}

const PAGE_SIZE = 100;

/** Exported for tests: the exact query Strapi 5 needs. */
export function buildStrapiUrl(
  base: string,
  type: string,
  page: number,
  overrides: Record<string, string>,
): string {
  const url = new URL(`${base.replace(/\/$/, "")}/api/${type}`);
  const params = new URLSearchParams({
    "pagination[page]": String(page),
    "pagination[pageSize]": String(PAGE_SIZE),
    populate: "*",
    // Strapi 5 replaced v4's publicationState=preview with status.
    status: "published",
    // No `locale` parameter on purpose: Strapi returns the default locale (de),
    // and the en translations are deliberately not migrated (spec D5) because
    // Payload has no localization configured. The English text stays in Strapi.
    ...overrides,
  });
  // No params.sort(): URLSearchParams.sort() orders by raw key string, so the
  // "]" that closes "pagination[page]" (0x5D) sorts after the "S" of
  // "pagination[pageSize]" (0x53) — it would put pageSize before page. Object
  // insertion order above already gives a stable, sensible order and Strapi's
  // API does not care about query param order at all.
  url.search = params.toString();
  return url.toString();
}

export function mergePages<T>(pages: T[][]): T[] {
  return pages.flat();
}

function env(name: "STRAPI_URL" | "STRAPI_TOKEN"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env("STRAPI_TOKEN")}` } });
  if (!res.ok) throw new Error(`strapi: HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchAll(
  type: string,
  overrides: Record<string, string> = {},
): Promise<StrapiDoc[]> {
  const pages: StrapiDoc[][] = [];
  for (let page = 1; ; page += 1) {
    const body = (await getJson(buildStrapiUrl(env("STRAPI_URL"), type, page, overrides))) as {
      data: StrapiDoc[];
      meta: { pagination: { pageCount: number } };
    };
    pages.push(body.data);
    if (page >= body.meta.pagination.pageCount) break;
  }
  return mergePages(pages);
}

export async function fetchSingle(type: string): Promise<StrapiDoc | null> {
  const url = new URL(`${env("STRAPI_URL").replace(/\/$/, "")}/api/${type}`);
  url.searchParams.set("populate", "*");
  const body = (await getJson(url.toString())) as { data: StrapiDoc | null };
  return body.data;
}

export async function fetchUploads(): Promise<StrapiFile[]> {
  const url = `${env("STRAPI_URL").replace(/\/$/, "")}/api/upload/files`;
  const body = (await getJson(url)) as StrapiFile[] | { results: StrapiFile[] };
  return Array.isArray(body) ? body : body.results;
}

export async function downloadFile(fileUrl: string): Promise<Blob> {
  const absolute = fileUrl.startsWith("http")
    ? fileUrl
    : `${env("STRAPI_URL").replace(/\/$/, "")}${fileUrl}`;
  const res = await fetch(absolute, {
    headers: { Authorization: `Bearer ${env("STRAPI_TOKEN")}` },
  });
  if (!res.ok) throw new Error(`strapi download: HTTP ${res.status} for ${absolute}`);
  return res.blob();
}
