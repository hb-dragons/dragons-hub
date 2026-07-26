/**
 * Parses one side of a `"63:61"` federation result string.
 *
 * `parseInt(x, 10) || null` was wrong twice over: `0 || null` is `null`, so a
 * forfeit reported as `"0:20"` synced as `{home: null, guest: 20}`; and
 * `parseInt("12abc", 10)` silently returns `12`. Emptiness and NaN have to be
 * tested for explicitly — truthiness cannot tell "no score" from "zero".
 */
function parseScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (Number.isNaN(value)) return null;
  // Rejects "1.5" and "Infinity": a score is a whole number of points.
  return Number.isInteger(value) ? value : null;
}

export function parseResult(result: string | null): { home: number | null; guest: number | null } {
  if (!result) return { home: null, guest: null };
  const parts = result.split(":");
  if (parts.length !== 2) return { home: null, guest: null };
  return {
    home: parseScore(parts[0]!),
    guest: parseScore(parts[1]!),
  };
}
