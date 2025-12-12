import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";

const ENABLE = process.env.ENABLE_SEARCH_PUSH === "true";

if (!ENABLE) {
  console.log("[search-push] 环境变量 ENABLE_SEARCH_PUSH != 'true'，跳过自动推送。");
  process.exit(0);
}

const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;

if (!siteUrl) {
  console.warn(
    "[search-push] 未设置 SITE_URL 或 NEXT_PUBLIC_SITE_URL，无法构造链接，跳过自动推送。",
  );
  process.exit(0);
}

const siteBase = siteUrl.replace(/\/+$/, "");
const OUT_DIR = path.join(process.cwd(), "out");

if (!fs.existsSync(OUT_DIR)) {
  console.warn("[search-push] out 目录不存在，可能尚未执行静态导出，跳过自动推送。");
  process.exit(0);
}

async function collectRoutes(dir, root) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const routes = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const childRoutes = await collectRoutes(fullPath, root);
      routes.push(...childRoutes);
    } else if (entry.isFile() && entry.name === "index.html") {
      const relative = path.relative(root, fullPath);
      let route = `/${relative
        .replace(/index\.html$/, "")
        .replace(/\\/g, "/")}`;

      if (route === "/") {
        routes.push("/");
        continue;
      }

      if (route.endsWith("/")) {
        route = route.slice(0, -1);
      }

      if (!route.startsWith("/_")) {
        routes.push(route);
      }
    }
  }

  return routes;
}

function request(targetUrl, method = "GET", body) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(targetUrl);
      const client = urlObj.protocol === "http:" ? http : https;

      const options = {
        method,
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "http:" ? 80 : 443),
        path: `${urlObj.pathname}${urlObj.search}`,
        headers: {},
      };

      const req = client.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0 });
        });
      });

      req.on("error", () => resolve({ statusCode: 0 }));

      if (body) {
        req.write(body);
      }
      req.end();
    } catch {
      resolve({ statusCode: 0 });
    }
  });
}

async function pingSitemap() {
  const sitemapUrl = `${siteBase}/sitemap.xml`;
  const encoded = encodeURIComponent(sitemapUrl);

  const endpoints = [
    {
      name: "Google",
      url: `https://www.google.com/ping?sitemap=${encoded}`,
    },
    {
      name: "Bing",
      url: `https://www.bing.com/ping?sitemap=${encoded}`,
    },
  ];

  console.log("[search-push] 开始向 Google/Bing 提交 sitemap：", sitemapUrl);

  for (const ep of endpoints) {
    const res = await request(ep.url);
    console.log(
      `[search-push] ${ep.name} 响应状态码: ${res.statusCode || "请求失败"}`,
    );
  }
}

async function pushBaidu(urls) {
  const endpoint = process.env.BAIDU_PUSH_ENDPOINT;
  if (!endpoint) {
    console.log(
      "[search-push] 未配置 BAIDU_PUSH_ENDPOINT，跳过百度主动推送（可在百度站长平台获取接口地址）。",
    );
    return;
  }

  if (!urls.length) {
    console.log("[search-push] 没有可推送的 URL，跳过百度主动推送。");
    return;
  }

  console.log(
    `[search-push] 向百度主动推送 ${urls.length} 条链接到: ${endpoint}`,
  );

  const body = urls.join("\n");
  const res = await request(endpoint, "POST", body);
  console.log(
    `[search-push] 百度推送响应状态码: ${res.statusCode || "请求失败"}`,
  );
}

async function main() {
  const routes = await collectRoutes(OUT_DIR, OUT_DIR);
  const urls = routes.map((route) => `${siteBase}${route}`);

  console.log("[search-push] 收集到的静态页面 URL：");
  urls.forEach((u) => console.log(`  - ${u}`));

  await pingSitemap();
  await pushBaidu(urls);

  console.log(
    "[search-push] 已完成 Google/Bing sitemap ping 与百度主动推送（如已配置）。夸克/搜狗会通过 robots.txt 和 sitemap 自动发现页面。",
  );
}

main().catch((err) => {
  console.error("[search-push] 执行异常：", err);
  process.exit(0);
});

