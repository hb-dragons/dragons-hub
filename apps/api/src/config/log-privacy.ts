// GDPR-minded log sanitization. IPs are anonymized before entering logs,
// and URL query-string values are redacted while keys stay visible.

// https://ec.europa.eu/newsroom/article29/items/611236 (Article 29 WP 136)
// — truncating the last octet (IPv4) or last 64 bits (IPv6) is the
// commonly-accepted pseudonymisation for operational logs.

const REDACT_QUERY_VALUE = "[REDACTED]";

export function anonymizeIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const trimmed = ip.trim();
  if (!trimmed) return undefined;

  // Strip IPv6 zone identifier (e.g. "fe80::1%en0" → "fe80::1").
  const withoutZone = trimmed.split("%")[0] ?? trimmed;

  // IPv4-mapped IPv6 (`::ffff:203.0.113.5`) — anonymize as IPv4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(withoutZone);
  const candidate = mapped?.[1] ?? withoutZone;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
    const parts = candidate.split(".").map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return undefined;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (candidate.includes(":")) {
    const expanded = expandIpv6(candidate);
    if (!expanded) return undefined;
    const groups = expanded.split(":");
    return `${groups.slice(0, 4).join(":")}::`;
  }

  return undefined;
}

function expandIpv6(ip: string): string | null {
  if (ip === "::") return "0:0:0:0:0:0:0:0";

  const doubleColonCount = (ip.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  if (doubleColonCount === 0) {
    const groups = ip.split(":");
    if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) {
      return null;
    }
    return groups.join(":");
  }

  const [leftStr = "", rightStr = ""] = ip.split("::");
  const left = leftStr ? leftStr.split(":") : [];
  const right = rightStr ? rightStr.split(":") : [];
  const allGroups = [...left, ...right];
  if (allGroups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;

  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const filler = new Array(missing).fill("0");
  return [...left, ...filler, ...right].join(":");
}

export function scrubUrl(url: string): string {
  const q = url.indexOf("?");
  if (q === -1) {
    // Could still be a full URL; try to parse.
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  try {
    const parsed = new URL(url);
    if (parsed.search === "") return `${parsed.origin}${parsed.pathname}`;
    return `${parsed.origin}${parsed.pathname}?${redactSearchParams(parsed.searchParams)}`;
  } catch {
    // Not a full URL — treat as path?query.
    const path = url.slice(0, q);
    const queryString = url.slice(q + 1);
    if (!queryString) return path;
    const params = new URLSearchParams(queryString);
    return `${path}?${redactSearchParams(params)}`;
  }
}

function redactSearchParams(params: URLSearchParams): string {
  const redacted = new URLSearchParams();
  for (const key of params.keys()) {
    redacted.append(key, REDACT_QUERY_VALUE);
  }
  return redacted.toString();
}
