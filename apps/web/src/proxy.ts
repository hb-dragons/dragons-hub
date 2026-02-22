import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/auth"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Check for Better Auth session cookie (prefixed with "dragons")
  const sessionCookie =
    request.cookies.get("dragons.session_token") ??
    request.cookies.get("__Secure-dragons.session_token");

  if (!sessionCookie) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
