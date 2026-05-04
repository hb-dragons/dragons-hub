import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ADMIN_ROUTES_DIR = join(__dirname);
const HTTP_VERBS = ["get", "post", "put", "patch", "delete"];
const PERMISSION_GUARDS = [
  "requirePermission",
  "requireAnyRole",
  "requireRefereeSelf",
  "requireRefereeSelfOrPermission",
];

// Self-service endpoints under /admin/* that intentionally allow any
// authenticated user (no role gate). They mutate only the caller's own row.
const EXCEPTIONS = new Set<string>([
  "notification.routes.ts GET /notifications/preferences",
  "notification.routes.ts PATCH /notifications/preferences",
]);

async function listRouteFiles(): Promise<string[]> {
  const entries = await readdir(ADMIN_ROUTES_DIR);
  return entries.filter((f) => f.endsWith(".routes.ts"));
}

interface HandlerCall {
  file: string;
  verb: string;
  path: string;
  hasGuard: boolean;
  body: string;
}

function findGuardAliases(source: string): string[] {
  const aliases: string[] = [];
  const re = /const\s+(\w+)\s*=\s*(requirePermission|requireAnyRole|requireRefereeSelfOrPermission)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) aliases.push(m[1]!);
  return aliases;
}

function findHandlers(file: string, source: string, guards: string[]): HandlerCall[] {
  const calls: HandlerCall[] = [];
  for (const verb of HTTP_VERBS) {
    const re = new RegExp(`\\.${verb}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const start = m.index + m[0].length;
      const end = matchClosingParen(source, start - 1);
      if (end === -1) continue;
      const body = source.slice(start, end);
      const pathMatch = body.match(/^\s*["'`]([^"'`]+)["'`]/);
      if (!pathMatch) continue;
      if (!pathMatch[1]!.startsWith("/")) continue;
      const hasGuard = guards.some((g) =>
        new RegExp(`\\b${g}\\b`).test(body),
      );
      calls.push({ file, verb, path: pathMatch[1]!, hasGuard, body });
    }
  }
  return calls;
}

function matchClosingParen(source: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const c = source[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

describe("admin route permission coverage", () => {
  it("every admin route handler has an explicit permission/role guard", async () => {
    const files = await listRouteFiles();
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith(".test.ts")) continue;
      const source = await readFile(join(ADMIN_ROUTES_DIR, file), "utf8");
      const guards = [...PERMISSION_GUARDS, ...findGuardAliases(source)];
      for (const call of findHandlers(file, source, guards)) {
        const id = `${file} ${call.verb.toUpperCase()} ${call.path}`;
        if (EXCEPTIONS.has(id)) continue;
        if (!call.hasGuard) offenders.push(id);
      }
    }

    expect(offenders).toEqual([]);
  });
});
