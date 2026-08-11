import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "@dragons/shared";
import { renderPushTemplate } from "./index";

/**
 * Guard: every deep link a push template can emit must resolve to a route that
 * expo-router actually declares.
 *
 * The route set is derived from the real `apps/native/src/app/` file tree, not
 * from a list maintained by hand here — deleting or renaming a native screen
 * therefore breaks this test, which is the whole point. The event-type set is
 * derived from the `switch` in `./index.ts` for the same reason: a template
 * added there is automatically enrolled.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUSH_TEMPLATE_DIR = HERE;
const NATIVE_APP_DIR = path.resolve(HERE, "../../../../../../native/src/app");

// ── expo-router route declarations ───────────────────────────────────────────

/** A route pattern as segments; ":" stands for a dynamic `[param]` segment. */
type RoutePattern = string[];

function routeFiles(dir: string, prefix: string[] = []): string[][] {
  const found: string[][] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full, [...prefix, entry]));
      continue;
    }
    const match = /^(.+)\.(?:tsx|ts|jsx|js)$/.exec(entry);
    if (!match) continue;
    const name = match[1]!;
    // `_layout` is not navigable; `+not-found` / `+html` are expo-router
    // specials, not destinations a push may target; `*.test` is not a route.
    if (name.startsWith("_") || name.startsWith("+") || name.endsWith(".test")) continue;
    found.push([...prefix, name]);
  }
  return found;
}

const isGroup = (segment: string): boolean => /^\(.+\)$/.test(segment);

function patternsFor(segments: string[]): RoutePattern[] {
  // `index` collapses into its parent directory ("(tabs)/index" -> "/").
  const base = segments.at(-1) === "index" ? segments.slice(0, -1) : segments;
  const normalized = base.map((s) => (/^\[.+\]$/.test(s) ? ":" : s));
  if (!normalized.some(isGroup)) return [normalized];
  // Both forms are legal hrefs: "/(auth)/sign-in" and "/sign-in".
  return [normalized, normalized.filter((s) => !isGroup(s))];
}

const DECLARED_ROUTES: RoutePattern[] = routeFiles(NATIVE_APP_DIR).flatMap(patternsFor);

function linkSegments(link: string): string[] {
  return link.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
}

function matchesDeclaredRoute(link: string): boolean {
  if (!link.startsWith("/")) return false;
  const segments = linkSegments(link);
  return DECLARED_ROUTES.some(
    (route) =>
      route.length === segments.length &&
      route.every((seg, i) => (seg === ":" ? segments[i]!.length > 0 : seg === segments[i])),
  );
}

const routeList = (): string =>
  DECLARED_ROUTES.map((r) => "/" + r.join("/")).sort().join(", ");

// ── template enumeration ─────────────────────────────────────────────────────

function declaredEventTypes(): string[] {
  const source = readFileSync(path.join(PUSH_TEMPLATE_DIR, "index.ts"), "utf8");
  // The switch labels are `case EVENT_TYPES.MATCH_CANCELLED:` rather than raw
  // strings, so that a typo'd event name is a compile error (#101). Resolve the
  // constant back to its value; also accept a string literal so this keeps
  // working if a template is ever added the other way.
  const fromConstants = [...source.matchAll(/case\s+EVENT_TYPES\.([A-Z0-9_]+)\s*:/g)].map((m) => {
    const key = m[1]! as keyof typeof EVENT_TYPES;
    const value = EVENT_TYPES[key];
    expect(value, `EVENT_TYPES.${key} is referenced in the push switch but is not defined`).toBeTypeOf("string");
    return value as string;
  });
  const fromLiterals = [...source.matchAll(/case\s+"([^"]+)"\s*:/g)].map((m) => m[1]!);
  return [...new Set([...fromConstants, ...fromLiterals])];
}

/**
 * Superset of every field the push payloads use, so a template can be rendered
 * without knowing which one it is. A new template needing a field that isn't
 * here will fail loudly — add the field rather than skipping the template.
 */
const KITCHEN_SINK_PAYLOAD: Record<string, unknown> = {
  matchId: 55,
  matchNo: 1234,
  homeTeam: "Dragons U18",
  guestTeam: "TV Buchholz",
  refereeName: "Max Mustermann",
  oldRefereeName: "Max Mustermann",
  newRefereeName: "Erika Mustermann",
  role: "SR1",
  kickoffDate: "2026-05-10",
  kickoffTime: "16:00",
  oldKickoffDate: "2026-05-01",
  oldKickoffTime: "18:00",
  leagueName: "Oberliga",
  venueName: "Sporthalle",
  reason: "Hallensperrung",
  sr1Open: true,
  sr2Open: true,
  sr1Assigned: null,
  sr2Assigned: null,
  reminderLevel: 3,
  eventId: "evt_1",
};

interface Rendered {
  eventType: string;
  link: string;
  title: string;
  body: string;
}

function renderedPushes(extra: Record<string, unknown>): Rendered[] {
  return declaredEventTypes().flatMap((eventType) =>
    (["de", "en"] as const).map((locale) => {
      const out = renderPushTemplate({
        eventType,
        payload: { ...KITCHEN_SINK_PAYLOAD, ...extra },
        locale,
        eventId: "evt_1",
      });
      expect(out, `no push template rendered for ${eventType}`).not.toBeNull();
      return {
        eventType,
        link: String(out!.data["deepLink"]),
        title: out!.title,
        body: out!.body,
      };
    }),
  );
}

// ── static literal scan ──────────────────────────────────────────────────────

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Route-shaped string / template literals in the template sources. */
function routeLiteralsInTemplates(): { file: string; literal: string }[] {
  const found: { file: string; literal: string }[] = [];
  for (const entry of readdirSync(PUSH_TEMPLATE_DIR).sort()) {
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
    const source = stripComments(readFileSync(path.join(PUSH_TEMPLATE_DIR, entry), "utf8"));
    for (const m of source.matchAll(/"(\/[^"\n]*)"|`(\/[^`\n]*)`/g)) {
      const raw = m[1] ?? m[2]!;
      // `${expr}` stands in for a concrete id.
      found.push({ file: entry, literal: raw.replace(/\$\{[^}]*\}/g, "1") });
    }
  }
  return found;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("push deep links resolve to declared expo-router routes", () => {
  it("reads the real native route tree", () => {
    expect(DECLARED_ROUTES.length).toBeGreaterThan(5);
    expect(routeList()).toContain("/officiating");
    expect(routeList()).toContain("/game/:");
  });

  it("does not match a route the native app never declared", () => {
    // Sanity check on the matcher itself: this is exactly the link the
    // referee-slots template used to emit, and it must NOT be considered valid.
    expect(matchesDeclaredRoute("/(tabs)/referee")).toBe(false);
    expect(matchesDeclaredRoute("/referee")).toBe(false);
    expect(matchesDeclaredRoute("/game")).toBe(false);
    expect(matchesDeclaredRoute("relative/path")).toBe(false);
    // …while the links other templates emit are valid.
    expect(matchesDeclaredRoute("/officiating")).toBe(true);
    expect(matchesDeclaredRoute("/game/55")).toBe(true);
    expect(matchesDeclaredRoute("/referee-game/55")).toBe(true);
    expect(matchesDeclaredRoute("/(auth)/sign-in")).toBe(true);
  });

  it("every rendered push deep link matches a declared route", () => {
    const rendered = renderedPushes({});
    expect(rendered.length).toBeGreaterThan(0);
    for (const { eventType, link } of rendered) {
      expect(
        matchesDeclaredRoute(link),
        `${eventType} emitted deepLink "${link}", which matches no route in apps/native/src/app (declared: ${routeList()})`,
      ).toBe(true);
    }
  });

  it("stays valid when the event payload carries its own deep link", () => {
    for (const { eventType, link } of renderedPushes({ deepLink: "/referee-game/55" })) {
      expect(
        matchesDeclaredRoute(link),
        `${eventType} emitted deepLink "${link}", which matches no route in apps/native/src/app`,
      ).toBe(true);
    }
  });

  it("stays valid when optional payload ids are missing", () => {
    for (const { eventType, link } of renderedPushes({ matchId: null, deepLink: null })) {
      expect(
        matchesDeclaredRoute(link),
        `${eventType} emitted deepLink "${link}", which matches no route in apps/native/src/app`,
      ).toBe(true);
    }
  });

  // This assertion covers every template, not a subset. It was narrowed once,
  // when `match.cancelled` and `match.schedule.changed` rendered "/game/undefined"
  // from payloads no emit site published (#101, #124) — narrowing it is how that
  // stayed invisible. A template that cannot fill a field must shorten its
  // sentence or fall back to a valid route, never stringify the gap.
  it.each([
    ["complete payload", {}],
    ["missing optional ids", { matchId: null, deepLink: null }],
    // Everything the canonical schemas mark optional/nullable. (`kickoffDate`
    // and `kickoffTime` stay: `referee.slots.*` is contracted to carry them,
    // and the match templates' kickoff-less paths are covered by
    // match-push-contract.test.ts.)
    ["nothing but the required fields", {
      matchId: undefined,
      deepLink: undefined,
      reminderLevel: undefined,
      reason: undefined,
      venueName: undefined,
      leagueId: undefined,
      changes: undefined,
    }],
  ])("renders no 'undefined' or 'null' with a %s", (_case, extra) => {
    const rendered = renderedPushes(extra);
    expect(rendered.length).toBeGreaterThan(0);
    for (const { eventType, link, title, body } of rendered) {
      for (const [field, value] of [["deepLink", link], ["title", title], ["body", body]] as const) {
        expect(value, `${eventType} rendered "${value}" into its ${field}`).not.toContain("undefined");
        expect(value, `${eventType} rendered "${value}" into its ${field}`).not.toContain("null");
      }
    }
  });

  it("every route-shaped literal in the template sources is a declared route", () => {
    const literals = routeLiteralsInTemplates();
    expect(literals.length).toBeGreaterThan(0);
    for (const { file, literal } of literals) {
      expect(
        matchesDeclaredRoute(literal),
        `${file} contains route-shaped literal "${literal}", which matches no route in apps/native/src/app (declared: ${routeList()})`,
      ).toBe(true);
    }
  });
});
