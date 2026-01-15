type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
};

type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

type Env = {
  ASSETS: Fetcher;
};

function hasFileExtension(pathname: string) {
  const lastSegment = pathname.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

async function fetchAsset(request: Request, env: Env) {
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const originalResponse = await fetchAsset(request, env);
    if (originalResponse.status !== 404) return originalResponse;

    if (request.method !== "GET" && request.method !== "HEAD") return originalResponse;
    if (hasFileExtension(url.pathname)) return originalResponse;

    // Next.js static export usually writes either:
    // - /route/index.html (when trailingSlash is enabled)
    // - /route.html
    const tryIndexHtmlUrl = new URL(url.pathname.replace(/\/?$/, "/index.html"), url);
    const tryIndexHtml = await fetchAsset(new Request(tryIndexHtmlUrl, request), env);
    if (tryIndexHtml.status !== 404) return tryIndexHtml;

    const tryHtmlUrl = new URL(`${url.pathname}.html`, url);
    const tryHtml = await fetchAsset(new Request(tryHtmlUrl, request), env);
    if (tryHtml.status !== 404) return tryHtml;

    return originalResponse;
  },
};

