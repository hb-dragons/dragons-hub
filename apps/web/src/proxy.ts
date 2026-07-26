import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/** Strip non-default locale prefix to get the logical pathname for auth checks. */
function getLogicalPathname(pathname: string): string {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(`/${locale}`.length);
    }
  }
  return pathname;
}

/**
 * Logical pathname that maps to the (public) route group's own `page.tsx`
 * (the homepage). Route groups don't add a URL segment, so this has to be
 * matched exactly rather than by prefix — every other path is caught by
 * `startsWith("/")`.
 */
export const PUBLIC_ROOT_PATH = "/";

/**
 * Path prefixes that skip the session-cookie gate.
 *
 * One entry per top-level directory under `app/[locale]/(public)/`, plus a
 * handful of routes that are public for other reasons (`/auth`, `/api/auth`,
 * `/overlay`, `/live` — none of which live in the `(public)` group).
 *
 * `apps/web/src/proxy.test.ts` walks the `(public)` route group directory at
 * test time and fails if any of its subdirectories is missing from this
 * list — that's the guardrail against a new public page silently landing
 * behind the auth gate again. Keep this array's `(public)`-derived entries
 * (currently: schedule, standings, teams, team, game, h2h) in sync with the
 * directories under `app/[locale]/(public)/`.
 */
export const PUBLIC_PATH_PREFIXES = [
  "/auth",
  "/api/auth",
  "/schedule",
  "/standings",
  "/teams",
  "/team",
  "/game",
  "/h2h",
  "/overlay",
  "/live",
];

function isPublicPath(logicalPathname: string): boolean {
  return (
    logicalPathname === PUBLIC_ROOT_PATH ||
    PUBLIC_PATH_PREFIXES.some((prefix) => logicalPathname.startsWith(prefix))
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const logicalPathname = getLogicalPathname(pathname);

  // Public paths — skip auth, just handle locale
  if (isPublicPath(logicalPathname)) {
    return intlMiddleware(request);
  }

  // Protected paths — check for Better Auth session cookie
  const sessionCookie =
    request.cookies.get("dragons.session_token") ??
    request.cookies.get("__Secure-dragons.session_token");

  if (!sessionCookie) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
