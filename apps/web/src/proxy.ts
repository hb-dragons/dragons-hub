import { NextRequest, NextResponse } from "next/server";
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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const logicalPathname = getLogicalPathname(pathname);

  // Public paths — skip auth, just handle locale
  if (
    logicalPathname === "/" ||
    logicalPathname.startsWith("/auth") ||
    logicalPathname.startsWith("/api/auth") ||
    logicalPathname.startsWith("/schedule") ||
    logicalPathname.startsWith("/standings") ||
    logicalPathname.startsWith("/teams") ||
    logicalPathname.startsWith("/overlay") ||
    logicalPathname.startsWith("/live")
  ) {
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
