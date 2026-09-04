/**
 * Absolute URL of a staff portrait. `photoUrl` comes back as a path relative to
 * the API (so each caller prefixes its own origin), and three surfaces render
 * the same portrait — the pool list, the person editor and the team's staff
 * dialog — so the prefixing lives here rather than three times over.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function portraitSrc(photoUrl: string): string {
  return `${API_BASE}${photoUrl}`;
}
