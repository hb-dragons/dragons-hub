/**
 * Minimal ambient declaration for the one node builtin the style tests need.
 * This package's tsconfig pins ambient types to react only and @types/node is
 * deliberately absent, while vitest stubs CSS imports — `?raw` included — to
 * empty strings, so reading the theme files from disk is the only honest
 * route. If @types/node ever lands here, this merges as a compatible overload;
 * delete it then.
 */
declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}
