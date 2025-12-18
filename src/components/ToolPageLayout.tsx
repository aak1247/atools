"use client";

import { useToolConfig } from "../hooks/useToolConfig";
import type { ReactNode } from "react";
import { getMessages } from "../i18n/messages";
import { useOptionalI18n } from "../i18n/I18nProvider";
import type { ToolConfig } from "../types/tools";
import { ToolConfigProvider } from "./ToolConfigProvider";

interface ToolPageLayoutProps {
  toolSlug: string;
  children: ReactNode | ((ctx: { config: ToolConfig; locale: string }) => ReactNode);
  customTitle?: string;
  customDescription?: string;
  maxWidthClassName?: string;
}

export default function ToolPageLayout({ 
  toolSlug, 
  children, 
  customTitle, 
  customDescription,
  maxWidthClassName,
}: ToolPageLayoutProps) {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? "zh-cn";
  const messages = i18n?.messages ?? getMessages("zh-cn");
  const { config, loading, error } = useToolConfig(toolSlug, locale);

  const maxWidth = maxWidthClassName ?? "max-w-5xl";
  const isRenderProp = typeof children === "function";

  if (loading) {
    return (
      <div className={`mx-auto ${maxWidth} animate-fade-in-up space-y-8`}>
        <div className="text-center">
          <div className="h-8 bg-slate-200 rounded animate-pulse mb-4"></div>
          <div className="h-4 bg-slate-200 rounded animate-pulse"></div>
        </div>
        {!isRenderProp ? children : null}
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className={`mx-auto ${maxWidth} animate-fade-in-up space-y-8`}>
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {customTitle || messages.toolLoadingTitle}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {customDescription || messages.toolLoadingDescription}
          </p>
          {error && (
            <p className="mt-2 text-xs text-rose-600" aria-live="polite">
              {error}
            </p>
          )}
        </div>
        {!isRenderProp ? children : null}
      </div>
    );
  }

  return (
    <ToolConfigProvider toolSlug={toolSlug} locale={locale} config={config}>
      <div className={`mx-auto ${maxWidth} animate-fade-in-up space-y-8`}>
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {customTitle || config.name}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {customDescription || config.description}
          </p>

          {/* SEO优化的隐藏描述文本 - 仅供搜索引擎索引 */}
          {config.seoDescription && config.seoDescription !== config.description && (
            <div className="sr-only" aria-hidden="true">
              {config.seoDescription}
            </div>
          )}

          {/* 结构化数据 - 帮助搜索引擎理解页面内容 */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "WebApplication",
                name: config.name,
                description: config.seoDescription || config.description,
                url: `/${locale}/tools/${toolSlug}`,
                applicationCategory: "UtilityApplication",
                operatingSystem: "Web Browser",
                offers: {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "CNY",
                },
                keywords: config.keywords?.join(", ") || "",
              }),
            }}
          />
        </div>
        {isRenderProp ? children({ config, locale }) : children}
      </div>
    </ToolConfigProvider>
  );
}
