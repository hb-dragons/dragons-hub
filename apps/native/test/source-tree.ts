import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reading the app's own source tree, for the tests that assert *containment*:
 * which module an API may be reached from, and from where. Shared by
 * `src/lib/nav/architecture.test.ts` (navigation APIs) and
 * `src/lib/haptics.test.ts` (haptic call sites) so both describe the same
 * files by the same rules.
 */

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(PACKAGE_DIR, "src");

/** Every non-test source file under `src/`, as absolute paths, sorted. */
function sourceFiles(dir: string = SRC_DIR): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|d)\.tsx?$/.test(entry)) continue;
    found.push(full);
  }
  return found;
}

export const SOURCE_FILES = sourceFiles();

/**
 * Module specifiers a file imports, covering `import`, `export ... from` and
 * `require`. Exported for the rules that cannot go through `importSites`
 * because the same module is reached by more than one specifier form (an `@/`
 * alias from one file, a relative path from its neighbour).
 */
export function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]!);
  return specifiers;
}

/** Package-relative path, so a failure message points at something clickable. */
export const rel = (file: string): string => path.relative(PACKAGE_DIR, file);

/** Package-relative paths of files importing anything from `module` (exact or a subpath). */
export function importSites(module: string): string[] {
  return SOURCE_FILES.filter((file) =>
    importsOf(file).some((spec) => spec === module || spec.startsWith(`${module}/`)),
  ).map(rel);
}

/**
 * Like `importSites`, but only where the module is imported for a *value*.
 *
 * A containment rule about a runtime API — "only this file may render that
 * component" — should not be tripped by a neighbour importing a type from the
 * same package, since types erase at build time. Recognises the `import type`
 * form; a file that mixes `import { type A, B }` counts as a value import,
 * which is what that syntax means.
 */
export function valueImportSites(module: string): string[] {
  const pattern = new RegExp(
    String.raw`(?:^|\n)\s*import\s+(type\s+)?[^;]*?from\s*["']${module}(?:/[^"']*)?["']`,
    "g",
  );
  return SOURCE_FILES.filter((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(pattern)].some((match) => match[1] === undefined);
  }).map(rel);
}

/** Absolute path for a package-relative one, so callers can name files as they read. */
export const resolveInPackage = (relativePath: string): string =>
  path.join(PACKAGE_DIR, relativePath);
