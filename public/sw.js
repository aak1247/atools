const CACHE_NAME = "tools-pwa-v0.1.0";
const OFFLINE_URLS = [
  "/",
  "/zh-cn",
  "/en-us",
  "/zh-cn/tools/calculator",
  "/zh-cn/tools/image-compressor"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 只处理 http/https，同步跳过 chrome-extension 等不支持的协议
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, responseClone));
        return networkResponse;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cachedResponse) => cachedResponse || caches.match("/zh-cn")),
      ),
  );
});

