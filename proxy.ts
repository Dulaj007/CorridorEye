import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME, type SessionRole } from "@/lib/auth";

// The proxy runs before every matched request, before any page or API
// route code. It is the single place that decides whether a visitor is
// allowed onto /system or /vehicle, so individual pages do not each need
// to repeat that check. (This file was called "middleware.ts" in older
// Next.js versions; Next.js 16 renamed the convention to "proxy.ts".)
const ROLE_HOME: Record<SessionRole, string> = {
  system: "/system",
  vehicle: "/vehicle",
};

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  const { pathname } = request.nextUrl;

  const isSystemPath = pathname.startsWith("/system");
  const isVehiclePath = pathname.startsWith("/vehicle");

  // Not logged in and trying to reach a protected page: send to login.
  if ((isSystemPath || isVehiclePath) && !session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Logged in, but as the wrong role for this page: send to the page that
  // matches their actual role instead of the one they tried to open.
  if (session && isSystemPath && session.role !== "system") {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }
  if (session && isVehiclePath && session.role !== "vehicle") {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }

  // Already logged in and visiting the login page: skip straight to the
  // dashboard instead of showing the login form again.
  if (pathname === "/" && session) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/system/:path*", "/vehicle/:path*"],
};
