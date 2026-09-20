import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { detectServerLocale } from "./src/i18n/detect-locale";
import { isLocale } from "./src/i18n/locales";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const targetLocale = detectServerLocale({
    cookieHeader: request.headers.get("cookie"),
    acceptLanguageHeader: request.headers.get("accept-language"),
    country:
      (request as unknown as { geo?: { country?: string } }).geo?.country ??
      request.headers.get("x-vercel-ip-country") ??
      request.headers.get("cf-ipcountry"),
  });

  if (pathname === "/tools" || pathname === "/tools/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${targetLocale}`;
    return NextResponse.redirect(url, 307);
  }

  if (pathname.startsWith("/tools/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/${targetLocale}${pathname}`;
    return NextResponse.redirect(url, 307);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    pathname === "/service-worker.js" ||
    pathname === "/offline.html" ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/images/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0]!)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${targetLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/:path*"],
};
