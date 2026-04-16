export function buildQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined,
  );

  if (entries.length === 0) return "";

  const searchParams = new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );

  return `?${searchParams.toString()}`;
}
