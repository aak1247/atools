# 工具SEO优化指南

## 概述

我们已经为所有工具页面实现了统一的SEO优化系统，包括：

1. **统一的页面布局** - `ToolPageLayout` 组件
2. **自动化的metadata生成** - `generateToolMetadata` 函数
3. **SEO优化的描述文本** - 每个工具的 `seoDescription` 字段
4. **结构化数据** - JSON-LD 格式的搜索引擎优化

## 工具配置文件 (tool.json)

每个工具的 `tool.json` 文件现在包含以下字段：

```json
{
  "name": "免费在线ICO图标生成工具 - 纯粹工具站",
  "shortName": "ICO图标生成器",
  "description": "免费在线生成 Windows ICO 图标文件...",
  "seoDescription": "年度最佳开源在线ICO图标生成工具 - ATools - 完全免费的ICO图标制作神器！...",
  "category": "图标工具",
  "lang": "zh-CN",
  "themeColor": "#0f172a",
  "backgroundColor": "#0f172a",
  "icon": "/icon.svg",
  "keywords": ["免费ICO生成", "在线图标制作", "Windows图标"]
}
```

### 关键字段说明

- **name**: 完整的工具名称，包含"免费在线"等SEO关键词
- **description**: 简短的工具描述，用于页面显示
- **seoDescription**: 详细的SEO优化描述，包含大量关键词和卖点
- **keywords**: 关键词数组，用于SEO和搜索

## 页面结构

### 1. 页面文件 (page.tsx)

所有工具页面现在使用统一的结构：

```tsx
import { generateToolMetadata } from "../../../lib/generate-tool-page";
import IcoGeneratorClient from "./IcoGeneratorClient";

export const dynamic = "force-static";

export const metadata = generateToolMetadata("ico-generator");

export default function IcoGeneratorPage() {
  return <IcoGeneratorClient />;
}
```

### 2. 客户端组件

客户端组件使用 `ToolPageLayout` 包装：

```tsx
import ToolPageLayout from "../../../components/ToolPageLayout";

export default function IcoGeneratorClient() {
  return (
    <ToolPageLayout toolSlug="ico-generator">
      {/* 工具的具体内容 */}
      <div className="glass-card rounded-2xl p-5 space-y-6">
        {/* ... */}
      </div>
    </ToolPageLayout>
  );
}
```

## SEO优化特性

### 1. 自动化Metadata生成

- 标题、描述、关键词自动从 tool.json 读取
- OpenGraph 标签自动生成
- 规范链接 (canonical) 自动设置

### 2. 结构化数据

每个页面自动包含 JSON-LD 结构化数据：

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "免费在线ICO图标生成工具",
  "description": "年度最佳开源在线ICO图标生成工具...",
  "url": "https://atools.cc/tools/ico-generator",
  "applicationCategory": "UtilityApplication",
  "operatingSystem": "Web Browser",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "CNY"
  }
}
```

### 3. 隐藏的SEO文本

长篇的 `seoDescription` 通过 `sr-only` 类隐藏显示，但搜索引擎仍能索引：

```tsx
<div className="sr-only" aria-hidden="true">
  {config.seoDescription}
</div>
```

## 开发工作流

### 添加新工具

1. 创建工具目录：`src/app/tools/new-tool/`
2. 创建 `tool.json` 配置文件
3. 创建 `page.tsx` 使用 `generateToolMetadata`
4. 创建客户端组件使用 `ToolPageLayout`
5. 运行 `npm run copy:tool-configs` 复制配置到 public 目录


### 构建脚本

- `npm run generate:manifests` - 生成PWA清单文件

## 最佳实践

### SEO描述编写

1. **包含核心关键词**：免费、在线、工具名称
2. **突出优势**：速度快、安全、无需安装
3. **适当夸张**：最佳、神器、专业级
4. **包含使用场景**：适用人群、应用场景
5. **强调免费**：完全免费、无限制、无水印

### 关键词选择

1. **核心词**：工具名称 + "免费" + "在线"
2. **功能词**：具体功能描述
3. **格式词**：支持的文件格式
4. **用途词**：使用场景和目标用户

## 监控和优化

定期检查：

1. 搜索引擎收录情况
2. 关键词排名
3. 页面加载速度
4. 用户体验指标

通过这个统一的SEO优化系统，所有工具页面都能获得更好的搜索引擎可见性和用户体验。