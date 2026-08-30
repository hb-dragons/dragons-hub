/**
 * `next-intl/middleware`'s `createMiddleware` reaches into a nested copy of
 * `next/server` inside its own pnpm-isolated node_modules tree, and vitest's
 * resolver trips on that package's `exports` map outside a real Next.js
 * build. Mocking it out lets these tests exercise proxy()'s own decision
 * (redirect vs. pass-through) without depending on next-intl's internals,
 * which aren't what issue #95 is about.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

import { PUBLIC_PATH_PREFIXES, PUBLIC_ROOT_PATH, proxy } from "./proxy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicGroupDir = path.join(__dirname, "app/[locale]/(public)");

function isRedirectToSignIn(response: NextResponse): boolean {
  const location = response.headers.get("location");
  return response.status === 307 && location !== null && location.includes("/auth/sign-in");
}

describe("public route allowlist derivation (regression guard for #95)", () => {
  it("has an allowlist entry for every directory under the (public) route group", () => {
    const directoryNames = fs
      .readdirSync(publicGroupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // Sanity check: fail loudly (not silently pass an empty list) if the
    // route group ever moves or is renamed out from under this test.
    expect(directoryNames.length).toBeGreaterThan(0);

    const missingFromAllowlist = directoryNames
      .map((name) => `/${name}`)
      .filter((segment) => !PUBLIC_PATH_PREFIXES.includes(segment));

    expect(missingFromAllowlist).toEqual([]);
  });

  it("has a page.tsx directly in the (public) group mapped to the root path", () => {
    expect(fs.existsSync(path.join(publicGroupDir, "page.tsx"))).toBe(true);
    expect(PUBLIC_ROOT_PATH).toBe("/");
  });
});

describe("proxy — content pages redirect to /spielplan", () => {
  const redirectCases: Array<[string, string]> = [
    ["/", "/spielplan"],
    ["/en", "/en/spielplan"],
    ["/schedule", "/spielplan"],
    ["/standings", "/spielplan"],
    ["/teams", "/spielplan"],
    ["/team/45", "/spielplan"],
    ["/game/123", "/spielplan"],
    ["/h2h/67", "/spielplan"],
    ["/en/schedule", "/en/spielplan"],
    ["/en/game/123", "/en/spielplan"],
  ];

  it.each(redirectCases)("temporarily redirects %s to %s", (pathname, destination) => {
    const request = new NextRequest(`http://localhost:3000${pathname}`);
    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost:3000${destination}`);
  });

  it("does not redirect /spielplan itself", () => {
    const request = new NextRequest("http://localhost:3000/spielplan");
    const response = proxy(request);

    expect(response.status).toBe(200);
  });
});

describe("proxy — anonymous access to public pages", () => {
  const publicPaths = [
    "/spielplan",
    "/en/spielplan",
    "/live",
    "/overlay",
    "/auth/sign-in",
  ];

  it.each(publicPaths)("does not redirect an anonymous request to %s", (pathname) => {
    const request = new NextRequest(`http://localhost:3000${pathname}`);
    const response = proxy(request);

    expect(isRedirectToSignIn(response)).toBe(false);
    expect(response.status).toBe(200);
  });
});

describe("proxy — non-public routes and authenticated access", () => {
  it("still redirects an anonymous request to a protected route", () => {
    const request = new NextRequest("http://localhost:3000/admin/matches");
    const response = proxy(request);

    expect(isRedirectToSignIn(response)).toBe(true);
    const redirectTarget = new URL(response.headers.get("location")!);
    expect(redirectTarget.searchParams.get("redirectTo")).toBe("/admin/matches");
  });

  it("lets an authenticated request through to a protected route", () => {
    const request = new NextRequest("http://localhost:3000/admin/matches", {
      headers: { cookie: "dragons.session_token=some-session-value" },
    });
    const response = proxy(request);

    expect(isRedirectToSignIn(response)).toBe(false);
    expect(response.status).toBe(200);
  });

  it("accepts the __Secure- prefixed session cookie", () => {
    const request = new NextRequest("http://localhost:3000/admin/matches", {
      headers: { cookie: "__Secure-dragons.session_token=some-session-value" },
    });
    const response = proxy(request);

    expect(isRedirectToSignIn(response)).toBe(false);
    expect(response.status).toBe(200);
  });
});
