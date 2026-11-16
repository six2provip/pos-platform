import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Gate the Provider Super-Admin route (/provider-portal) and Control Plane proxy (/control/*)
 * behind ENABLE_SUPER_ADMIN=true.
 *
 * - Cloud / Dev: ENABLE_SUPER_ADMIN=true -> route is accessible (still requires Control Plane JWT login).
 * - Private Server: ENABLE_SUPER_ADMIN=false (or unset) -> returns 404 Not Found.
 */
export function middleware(request: NextRequest) {
  const enableSuperAdmin = process.env.ENABLE_SUPER_ADMIN === "true";
  const { pathname } = request.nextUrl;

  if (
    !enableSuperAdmin &&
    (pathname.startsWith("/provider-portal") || pathname.startsWith("/control"))
  ) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/provider-portal/:path*", "/control/:path*"],
};

