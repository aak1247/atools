import type { MetadataRoute } from "next";
import { SUPPORTED_LOCALES } from "../i18n/locales";
import { toolSlugs } from "./tools/tool-registry";

export const dynamic = "force-static";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ??
  "https://example.com") as string;

// Extract the base domain for subdomain generation
// e.g., https://atools.live -> atools.live
function getBaseDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "atools.live";
  }
}

const baseDomain = getBaseDomain(baseUrl);

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "/", // index.html
    ...SUPPORTED_LOCALES.map((locale) => `/${locale}.html`), // zh-cn.html, en-us.html
    ...SUPPORTED_LOCALES.flatMap((locale) =>
      toolSlugs.map((slug) => `/${locale}/tools/${slug}.html`)
    ), // zh-cn/tools/aes256.html, en-us/tools/aes256.html
  ];

  // Generate subdomain URLs for each tool
  // e.g., screenshot-annotator.atools.live/zh-cn, screenshot-annotator.atools.live/en-us
  const subdomainRoutes = toolSlugs.flatMap((slug) =>
    SUPPORTED_LOCALES.map((locale) => ({
      url: `https://${slug}.${baseDomain}/${locale}`,
      subdomain: true,
      locale,
      slug,
    }))
  );

  const lastModified = new Date();

  // Main site sitemap entries
  const mainSitemap = routes.map((route) => ({
    url: `${baseUrl.replace(/\/+$/, "")}${route}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: route === "/" ? 1 : 0.8,
  }));

  // Subdomain sitemap entries for tools
  const subdomainSitemap = subdomainRoutes.map(({ url, locale, slug }) => ({
    url,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...mainSitemap, ...subdomainSitemap];
}
