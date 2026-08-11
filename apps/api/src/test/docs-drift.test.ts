import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@dragons/db/schema";
import { routes } from "../routes/index";
import { mcpRoutes } from "../routes/mcp.routes";
import { envSchema } from "../config/env";
import { fullSync } from "../services/sync";

/**
 * AGENTS.md and CLAUDE.md are load-bearing: agents are instructed to follow
 * them. They drifted badly (issue #121) because every list in them was
 * hand-maintained. These tests re-derive the lists from source and fail the
 * build when the docs and the code disagree — in both directions, so a new
 * endpoint or table is as loud as a deleted one.
 */

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const agentsMd = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
const claudeMd = readFileSync(path.join(repoRoot, "CLAUDE.md"), "utf8");
const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");

/** Extract the body of a `## Heading` section, up to the next `## `. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  expect(start, `AGENTS.md/CLAUDE.md is missing the "## ${heading}" section`).toBeGreaterThan(-1);
  const rest = markdown.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Lines of `text` matching `pattern`, tagged with their 1-based line number.
 * Asserting this is `[]` beats `expect(doc).not.toMatch(...)`, which dumps the
 * whole 800-line document into the failure output.
 */
function linesMatching(text: string, pattern: RegExp): string[] {
  return text
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .filter((line) => pattern.test(line));
}

/** Extract a `### Heading` subsection, up to the next heading of any level. */
function subsection(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n### ${heading}\n`);
  expect(start, `AGENTS.md is missing the "### ${heading}" subsection`).toBeGreaterThan(-1);
  const rest = markdown.slice(start + 1);
  const end = rest.search(/\n#{2,3} /);
  return end === -1 ? rest : rest.slice(0, end);
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * Registered on `app` itself (apps/api/src/app.ts) rather than on the `routes`
 * sub-router, so they are absent from `routes.routes`.
 *
 * `/api/auth/*` is deliberately not listed: better-auth mounts its own handler
 * behind a single `app.on(["POST", "GET"], "/api/auth/*")`, so its individual
 * paths never reach a Hono route table and cannot be machine-checked. Doc rows
 * under that prefix are skipped by `PREFIXES_NOT_IN_ROUTE_TABLE`.
 */
const APP_LEVEL_ENDPOINTS = [
  "GET /",
  "GET /openapi.json",
  "GET /docs",
  "GET /admin/queues/*",
] as const;

const PREFIXES_NOT_IN_ROUTE_TABLE = ["/api/auth/"];

/** Hono keeps regex constraints inline (`:id{[0-9]+\.webp}`); drop them. */
function normalizePath(p: string): string {
  return p.replace(/\{[^}]*\}/g, "").replace(/\?.*$/, "");
}

function registeredEndpoints(): Set<string> {
  const found = new Set<string>(APP_LEVEL_ENDPOINTS);
  for (const router of [routes, mcpRoutes]) {
    for (const route of router.routes) {
      if (route.method === "ALL") continue;
      found.add(`${route.method} ${normalizePath(route.path)}`);
    }
  }
  return found;
}

function documentedEndpoints(): Set<string> {
  const body = section(agentsMd, "API Endpoints");
  const found = new Set<string>();
  const row = /^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`/gm;
  let match: RegExpExecArray | null;
  while ((match = row.exec(body)) !== null) {
    const p = normalizePath(match[2]!);
    if (PREFIXES_NOT_IN_ROUTE_TABLE.some((prefix) => p.startsWith(prefix))) continue;
    found.add(`${match[1]!} ${p}`);
  }
  return found;
}

describe("AGENTS.md endpoint list", () => {
  it("documents every registered endpoint", () => {
    const documented = documentedEndpoints();
    const undocumented = [...registeredEndpoints()].filter((e) => !documented.has(e)).sort();
    expect(undocumented).toEqual([]);
  });

  it("documents no endpoint that is not registered", () => {
    const registered = registeredEndpoints();
    const phantom = [...documentedEndpoints()].filter((e) => !registered.has(e)).sort();
    expect(phantom).toEqual([]);
  });

  it("uses the mounted `/api/devices` prefix everywhere it mentions device registration", () => {
    // AGENTS.md used to say `/devices/register` in the endpoint table and
    // `/api/devices/register` in the notification-channels prose.
    expect(linesMatching(agentsMd, /[^/]`\/devices\//)).toEqual([]);
  });
});

// ── Data model ───────────────────────────────────────────────────────────────

function declaredTables(): string[] {
  return Object.entries(schema)
    .filter(([, value]) => is(value, PgTable))
    .map(([name]) => name)
    .sort();
}

function documentedTables(): string[] {
  const body = subsection(agentsMd, "Database Tables");
  const found: string[] = [];
  const row = /^\|\s*`([A-Za-z][A-Za-z0-9_]*)`\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = row.exec(body)) !== null) found.push(match[1]!);
  return found.sort();
}

describe("AGENTS.md data model", () => {
  it("lists exactly the tables exported from @dragons/db/schema", () => {
    expect(documentedTables()).toEqual(declaredTables());
  });

  it("documents the real matchReferees uniqueness (matchId, slotNumber)", () => {
    expect(agentsMd).toMatch(/MatchReferee unique constraint: \(matchId, slotNumber\)/);
  });
});

// ── Sync pipeline ────────────────────────────────────────────────────────────

const syncPipelineSource = readFileSync(
  path.join(repoRoot, "apps/api/src/services/sync/index.ts"),
  "utf8",
);

/**
 * The stage functions `fullSync()` calls, in call order.
 *
 * A stage is anything imported from a module *inside* `services/` — `./x` for a
 * sibling sync module, `../x/y` for another service. `../../` reaches config,
 * workers and other plumbing (`getDb`, `logger`, `INSTANCE_ID`), which is not
 * part of the flow and is deliberately excluded. That rule is mechanical, so a
 * stage added to the pipeline enrolls itself here with no list to update.
 */
function pipelineStages(): string[] {
  const imports = [
    ...syncPipelineSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(\.[^"]*)";/gs),
  ];
  const inServices = imports
    .filter(([, , from]) => /^\.\.?\//.test(from!) && !from!.startsWith("../../"))
    .flatMap(([, names]) =>
      names!
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
    );

  const body = syncPipelineSource.slice(
    syncPipelineSource.indexOf("export async function fullSync"),
  );
  return [...new Set(inServices)]
    .map((name) => ({ name, at: body.search(new RegExp(`\\b${name}\\s*\\(`)) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ name }) => name);
}

describe("AGENTS.md sync pipeline", () => {
  const flow = subsection(agentsMd, "Execution Flow");
  const stages = pipelineStages();

  it("derives a non-trivial stage list from fullSync", () => {
    // Guard on the extractor itself: a regex that silently matches nothing
    // would make the two tests below vacuously pass.
    expect(stages.length).toBeGreaterThan(10);
    expect(stages).toContain("syncLeagues");
    expect(stages).toContain("reconcileAfterSync");
  });

  it("names every stage fullSync calls", () => {
    const missing = stages.filter((name) => !new RegExp(`\\b${name}\\b`).test(flow));
    expect(missing).toEqual([]);
  });

  it("names them in the order fullSync calls them", () => {
    const documentedOrder = [...stages].sort(
      (a, b) => flow.search(new RegExp(`\\b${a}\\b`)) - flow.search(new RegExp(`\\b${b}\\b`)),
    );
    expect(documentedOrder).toEqual(stages);
  });
});

// ── Environment variables ────────────────────────────────────────────────────

// Build-time client variables. They are inlined into the web/native bundles and
// never parsed by apps/api's schema, so they are documented but not validated.
const CLIENT_ENV_PREFIXES = ["NEXT_PUBLIC_", "EXPO_PUBLIC_"];

function isClientEnv(key: string): boolean {
  return CLIENT_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function schemaEnvKeys(): string[] {
  const { shape } = envSchema as unknown as { shape: Record<string, unknown> };
  return Object.keys(shape).sort();
}

function keysDeclaredIn(text: string): string[] {
  const found = new Set<string>();
  const line = /^[ \t]*#?[ \t]*([A-Z][A-Z0-9_]*)=/gm;
  let match: RegExpExecArray | null;
  while ((match = line.exec(text)) !== null) found.add(match[1]!);
  return [...found].sort();
}

describe("environment variable documentation", () => {
  const schemaKeys = schemaEnvKeys();
  const claudeEnvSection = section(claudeMd, "Environment Variables");

  it("documents every variable in config/env.ts in CLAUDE.md", () => {
    const documented = new Set(keysDeclaredIn(claudeEnvSection));
    expect(schemaKeys.filter((k) => !documented.has(k))).toEqual([]);
  });

  it("documents every variable in config/env.ts in .env.example", () => {
    const documented = new Set(keysDeclaredIn(envExample));
    expect(schemaKeys.filter((k) => !documented.has(k))).toEqual([]);
  });

  it("has no variable in CLAUDE.md that config/env.ts does not declare", () => {
    const known = new Set(schemaKeys);
    const dead = keysDeclaredIn(claudeEnvSection).filter((k) => !known.has(k) && !isClientEnv(k));
    expect(dead).toEqual([]);
  });

  it("has no variable in .env.example that config/env.ts does not declare", () => {
    const known = new Set(schemaKeys);
    const dead = keysDeclaredIn(envExample).filter((k) => !known.has(k) && !isClientEnv(k));
    expect(dead).toEqual([]);
  });
});

// ── Instructions that must point at code that exists ─────────────────────────

describe("docs point at real code", () => {
  it("never names SyncOrchestrator, which does not exist", () => {
    expect(linesMatching(agentsMd, /SyncOrchestrator/)).toEqual([]);
    expect(linesMatching(claudeMd, /SyncOrchestrator/)).toEqual([]);
  });

  it("names the real sync entry point, which is callable", () => {
    expect(typeof fullSync).toBe("function");
    expect(agentsMd).toMatch(/services\/sync\/index\.ts/);
    expect(claudeMd).toMatch(/services\/sync\/index\.ts/);
  });

  it("contains no absolute path from another developer's machine", () => {
    // Anchored at a token boundary so URL paths like `/public/home/dashboard`
    // are not mistaken for a `/home/<user>` filesystem path.
    const foreignPath = /(^|[\s`("'])\/(Users|home)\/[a-z]/i;
    expect(linesMatching(agentsMd, foreignPath)).toEqual([]);
    expect(linesMatching(claudeMd, foreignPath)).toEqual([]);
  });
});
