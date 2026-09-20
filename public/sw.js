const CACHE_NAME = "tools-pwa-v0.1.0-13d31ba4e9cb";
const OFFLINE_URLS = [
  "/",
  "/zh-cn",
  "/en-us",
  "/zh-cn/tools/calculator",
  "/zh-cn/tools/image-compressor"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        OFFLINE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHtmlNavigation(request) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isLikelyNextRsc(pathname) {
  if (!pathname.endsWith(".txt")) return false;
  if (pathname === "/index.txt") return true;
  if (pathname === "/_not-found.txt") return true;
  if (pathname === "/zh-cn.txt" || pathname === "/en-us.txt") return true;
  if (pathname.includes("/__next.")) return true;
  if (pathname.startsWith("/zh-cn/tools/")) return true;
  if (pathname.startsWith("/en-us/tools/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 只处理 http/https，同步跳过 chrome-extension 等不支持的协议
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // Cache API 不支持缓存 206 Partial Content（常见于 Range 请求的音视频/大文件）
  const hasRange = request.headers.has("range");
  const isSameOrigin = url.origin === self.location.origin;
  const pathname = url.pathname;
  const isHtml = isHtmlNavigation(request);
  const isNextRsc = isLikelyNextRsc(pathname);

  // Avoid being stuck with long-lived HTTP caches on HTML/RSC after a deployment.
  const fetchRequest =
    isHtml || isNextRsc ? new Request(request, { cache: "reload" }) : request;

  event.respondWith(
    fetch(fetchRequest)
      .then((networkResponse) => {
        if (
          !hasRange &&
          isSameOrigin &&
          networkResponse &&
          networkResponse.status === 200 &&
          !isHtml &&
          !isNextRsc
        ) {
          const responseClone = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseClone))
            .catch(() => {});
        }
        return networkResponse;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (isHtml) return caches.match("/zh-cn");
            return null;
          })
          .then((fallback) => fallback || Response.error()),
      ),
  );
});

