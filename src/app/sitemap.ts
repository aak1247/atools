import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ??
  "https://example.com") as string;

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "/",
    "/tools/calculator",
    "/tools/image-compressor",
    "/tools/image-resizer",
    "/tools/image-converter",
    "/tools/seal-extractor",
    "/tools/pdf-merge",
    "/tools/pdf-stamp",
    "/tools/pdf-trim",
  ];

  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${baseUrl.replace(/\/+$/, "")}${route}`,
    lastModified,
    changeFrequency: "weekly",
    priority: route === "/" ? 1 : 0.8,
  }));
}
