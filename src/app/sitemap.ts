import type { MetadataRoute } from "next";
import { SUPPORTED_LOCALES } from "../i18n/locales";
import { toolSlugs } from "./tools/tool-registry";

export const dynamic = "force-static";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ??
  "https://example.com") as string;

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "/", // index.html
    ...SUPPORTED_LOCALES.map((locale) => `/${locale}.html`), // zh-cn.html, en-us.html
    ...SUPPORTED_LOCALES.flatMap((locale) =>
      toolSlugs.map((slug) => `/${locale}/tools/${slug}.html`)
    ), // zh-cn/tools/aes256.html, en-us/tools/aes256.html
  ];

  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${baseUrl.replace(/\/+$/, "")}${route}`,
    lastModified,
    changeFrequency: "weekly",
    priority: route === "/" ? 1 : 0.8,
  }));
}
