import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/**
 * Strip any locale prefix to get the logical pathname for auth checks — the
 * default locale included: with `localePrefix: "as-needed"` the locale
 * switcher still navigates to `/de/...` and lets the intl middleware strip
 * it, so the auth gate must classify that URL like its unprefixed form
 * instead of bouncing it to sign-in.
 */
function getLogicalPathname(pathname: string): string {
  for (const locale of routing.locales) {
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
 * `/overlay`, `/live`, `/spielplan` — none of which live in the `(public)`
 * group; `/spielplan` sits outside it because the coach table needs a wider
 * layout than the phone-first `(public)` shell allows).
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
  "/spielplan",
];

/**
 * Public *content* pages that are parked for now: only the coach spielplan is
 * in active use, so the homepage and the browse pages temporarily redirect
 * there (307 — deliberately not cacheable-permanent, they may come back after
 * the public refactor). Functional routes (`/auth`, `/live`, `/overlay`,
 * `/admin`, `/api/auth`) are untouched. The pages themselves still exist in
 * the route tree; remove an entry here to bring one back.
 */
export const SPIELPLAN_REDIRECT_PREFIXES = [
  "/schedule",
  "/standings",
  "/teams",
  "/team",
  "/game",
  "/h2h",
];

function redirectsToSpielplan(logicalPathname: string): boolean {
  return (
    logicalPathname === PUBLIC_ROOT_PATH ||
    SPIELPLAN_REDIRECT_PREFIXES.some((prefix) => logicalPathname.startsWith(prefix))
  );
}

function isPublicPath(logicalPathname: string): boolean {
  return (
    logicalPathname === PUBLIC_ROOT_PATH ||
    PUBLIC_PATH_PREFIXES.some((prefix) => logicalPathname.startsWith(prefix))
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const logicalPathname = getLogicalPathname(pathname);

  // Parked content pages — send to the spielplan, keeping the locale prefix
  // (`/en/teams` → `/en/spielplan`, `/teams` → `/spielplan`).
  if (redirectsToSpielplan(logicalPathname)) {
    // A bare locale root ("/en") maps to logical "/" without being suffixed
    // by it — there the whole pathname is the locale prefix.
    const rawPrefix = pathname.endsWith(logicalPathname)
      ? pathname.slice(0, pathname.length - logicalPathname.length)
      : pathname;
    // The default locale's canonical URLs are unprefixed ("as-needed") —
    // redirect "/de/schedule" straight to "/spielplan" instead of taking a
    // second hop through the intl middleware.
    const localePrefix = rawPrefix === `/${routing.defaultLocale}` ? "" : rawPrefix;
    return NextResponse.redirect(new URL(`${localePrefix}/spielplan`, request.url), 307);
  }

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
