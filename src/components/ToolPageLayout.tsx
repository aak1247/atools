"use client";

import { useToolConfig } from "../hooks/useToolConfig";
import { ReactNode } from "react";

interface ToolPageLayoutProps {
  toolSlug: string;
  children: ReactNode;
  customTitle?: string;
  customDescription?: string;
}

export default function ToolPageLayout({ 
  toolSlug, 
  children, 
  customTitle, 
  customDescription 
}: ToolPageLayoutProps) {
  const { config, loading, error } = useToolConfig(toolSlug);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
        <div className="text-center">
          <div className="h-8 bg-slate-200 rounded animate-pulse mb-4"></div>
          <div className="h-4 bg-slate-200 rounded animate-pulse"></div>
        </div>
        {children}
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {customTitle || "工具加载中..."}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {customDescription || "正在加载工具信息..."}
          </p>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-8">
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
              "name": config.name,
              "description": config.seoDescription || config.description,
              "url": `https://atools.cc/tools/${toolSlug}`,
              "applicationCategory": "UtilityApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "CNY"
              },
              "keywords": config.keywords?.join(", ") || ""
            })
          }}
        />
      </div>
      {children}
    </div>
  );
}