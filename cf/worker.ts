type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

type Env = {
  ASSETS: Fetcher;
};

import responseHeaders from "./response-headers.json";
import { detectServerLocale } from "../src/i18n/detect-locale";

function hasFileExtension(pathname: string) {
  const lastSegment = pathname.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

function isNextRscTxtPath(pathname: string) {
  if (!pathname.endsWith(".txt")) return false;
  const last = pathname.split("/").pop() ?? "";
  if (last === "robots.txt") return false;
  if (last.startsWith("__next.")) return true;
  if (last === "_not-found.txt") return true;
  if (last === "index.txt") return true;
  if (last === "zh-cn.txt" || last === "en-us.txt") return true;
  if (pathname.startsWith("/zh-cn/tools/")) return true;
  if (pathname.startsWith("/en-us/tools/")) return true;
  return false;
}

async function fetchAsset(request: Request, env: Env) {
  return env.ASSETS.fetch(request);
}

function withCrossOriginIsolationHeaders(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");
  if (!isHtml) return response;

  const headers = new Headers(response.headers);
  const htmlHeaders = responseHeaders?.html ?? {};
  for (const [key, value] of Object.entries(htmlHeaders)) {
    if (typeof key === "string" && typeof value === "string" && key && value) {
      headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withNextRscHeaders(request: Request, response: Response) {
  if (response.status !== 200) return response;
  const pathname = new URL(request.url).pathname;
  if (!isNextRscTxtPath(pathname)) return response;

  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") || "";
  if (!contentType || contentType.includes("text/plain")) {
    headers.set("Content-Type", "text/x-component; charset=utf-8");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const getTargetLocale = () => {
      const country =
        (request as Request & { cf?: { country?: string } }).cf?.country ??
        request.headers.get("CF-IPCountry");
      return detectServerLocale({
        cookieHeader: request.headers.get("cookie"),
        acceptLanguageHeader: request.headers.get("accept-language"),
        country,
      });
    };

    if (url.pathname === "/" || url.pathname === "") {
      const targetLocale = getTargetLocale();
      url.pathname = `/${targetLocale}`;
      return Response.redirect(url.toString(), 307);
    }

    if (url.pathname === "/tools" || url.pathname === "/tools/") {
      const targetLocale = getTargetLocale();
      url.pathname = `/${targetLocale}`;
      return Response.redirect(url.toString(), 307);
    }
    if (url.pathname.startsWith("/tools/")) {
      const targetLocale = getTargetLocale();
      url.pathname = `/${targetLocale}${url.pathname}`;
      return Response.redirect(url.toString(), 307);
    }

    const originalResponse = await fetchAsset(request, env);
    if (originalResponse.status !== 404) {
      return withCrossOriginIsolationHeaders(withNextRscHeaders(request, originalResponse));
    }

    if (request.method !== "GET" && request.method !== "HEAD") return originalResponse;
    if (hasFileExtension(url.pathname)) return originalResponse;

    const pathname =
      url.pathname !== "/" && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;

    // Next.js static export usually writes either:
    // - /route/index.html (when trailingSlash is enabled)
    // - /route.html
    const tryIndexHtmlUrl = new URL(pathname.replace(/\/?$/, "/index.html"), url);
    const tryIndexHtml = await fetchAsset(new Request(tryIndexHtmlUrl, request), env);
    if (tryIndexHtml.status !== 404) {
      return withCrossOriginIsolationHeaders(withNextRscHeaders(request, tryIndexHtml));
    }

    if (pathname !== "/") {
      const tryHtmlUrl = new URL(`${pathname}.html`, url);
      const tryHtml = await fetchAsset(new Request(tryHtmlUrl, request), env);
      if (tryHtml.status !== 404) {
        return withCrossOriginIsolationHeaders(withNextRscHeaders(request, tryHtml));
      }
    }

    return originalResponse;
  },
};

export default worker;
