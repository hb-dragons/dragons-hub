export function parseResult(result: string | null): { home: number | null; guest: number | null } {
  if (!result) return { home: null, guest: null };
  const parts = result.split(":");
  if (parts.length !== 2) return { home: null, guest: null };
  return {
    home: parseInt(parts[0] ?? "", 10) || null,
    guest: parseInt(parts[1] ?? "", 10) || null,
  };
}
