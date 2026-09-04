/**
 * A required variable, thrown by name when unset or blank — the one env
 * contract every one-off in this package follows, so an operator reading the
 * failure knows which line of `.env` to fill in. Each module's header names
 * the variables it reads.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}
