import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, SUPPORTED_LOCALES } from "../../../../i18n/locales";
import { getToolConfig } from "../../../../lib/tool-config";
import { toolLoaders, toolSlugs, type ToolSlug } from "../../../tools/tool-registry";
import { ToolClientRendererWithConfig } from "./ToolClientRenderer";

export const dynamic = "force-static";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) => toolSlugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  if (!(slug in toolLoaders)) return {};

  const config = getToolConfig(slug, locale);
  const canonical = `/${locale}/tools/${slug}`;

  return {
    title: config.name,
    description: config.seoDescription || config.description,
    keywords: config.keywords?.join(",") || "",
    manifest: `/tools/${slug}/manifest.webmanifest`,
    openGraph: {
      title: config.name,
      description: config.seoDescription || config.description,
      type: "website",
      url: canonical,
    },
    alternates: {
      canonical,
      languages: {
        "zh-CN": `/zh-cn/tools/${slug}`,
        "en-US": `/en-us/tools/${slug}`,
      },
    },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  if (!(slug in toolLoaders)) notFound();

  const toolSlug = slug as ToolSlug;
  const config = getToolConfig(toolSlug, locale);
  return <ToolClientRendererWithConfig slug={toolSlug} locale={locale} config={config} />;
}
