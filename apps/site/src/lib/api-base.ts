/**
 * Base URL of the sports API (apps/api) for the `/public/*` endpoints.
 * Kept zod-free so browser islands can import the constant without dragging
 * schema code into their bundle.
 */
export const DEFAULT_API_BASE = "https://api.app.hbdragons.de";

/** Build-time resolution (frontmatter only — references process.env). */
export function apiBase(): string {
  const configured =
    (import.meta.env?.PUBLIC_API_URL as string | undefined) ?? process.env.PUBLIC_API_URL;
  return configured == null || configured === "" ? DEFAULT_API_BASE : configured;
}
