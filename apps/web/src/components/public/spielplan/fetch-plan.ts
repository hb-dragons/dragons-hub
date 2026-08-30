/** `/public/matches` caps `limit` at 1000; a season's own-club plan fits in one page. */
const DEFAULT_PAGE_SIZE = 1000;

interface PageParams {
  limit: number;
  offset: number;
}

/**
 * Crawls every page of a paginated match list. Kept transport-agnostic (the
 * caller supplies the page fetcher) so the loop is testable without a server.
 */
export async function fetchFullPlan<T>(
  getPage: (params: PageParams) => Promise<{ items: T[] }>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { items } = await getPage({ limit: pageSize, offset });
    all.push(...items);
    if (items.length < pageSize) return all;
  }
}
