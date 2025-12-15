"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // 仅在生产环境注册 Service Worker，避免开发调试时被旧缓存干扰
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((error) => {
            // 在开发环境静默失败即可
            if (process.env.NODE_ENV === "development") {
              console.error("Service worker registration failed:", error);
            }
          });
      });
    }
  }, []);

  return null;
}
