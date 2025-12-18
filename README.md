# ATools · 纯粹工具站

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-16+-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PWA](https://img.shields.io/badge/PWA-Ready-green?logo=pwa)](https://web.dev/progressive-web-apps/)
[![100% Client-Side](https://img.shields.io/badge/100%25-Client--Side-orange)](https://github.com/your-repo)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)

> 一个「100% 纯前端本地运行」的工具集合站：PWA 可安装、支持 Next.js 静态导出、内置统一 SEO 系统。


---

## 特性

- **纯前端**：所有文件处理默认在浏览器本地完成（不上传服务器），适合隐私敏感场景。
- **95+ 工具**：覆盖文本/编码/JSON/图片/音视频/PDF/办公格式等高频需求（见 `src/app/tools`）。
- **PWA 可安装**：每个工具都有独立 `manifest`，支持"添加到主屏幕"与离线缓存策略。
- **完整 i18n 支持**：所有工具支持中英双语，基于 `tool.en-us.json` 的 UI 字段实现优雅的多语言架构。
- **FFmpeg.wasm 本地资源**：音视频工具使用本地打包的 `@ffmpeg/core`（避免 CDN/CORS 问题）。

<details>
<summary>内置工具列表（按 slug 排序）</summary>

- `aes256` — AES256加解密
- `api-tester` — API接口测试
- `audio-encoder` — 音频编码转换
- `audio-merger` — 音频拼接合并
- `audio-trimmer` — 音频剪辑器
- `av-transcoder` — 音视频转码器
- `base-converter` — 进制转换器
- `base32-base58-converter` — Base32/Base58
- `base64` — Base64编解码
- `calculator` — 科学计算器
- `camera` — 网页相机
- `case-converter` — 大小写转换
- `color-converter` — 颜色格式转换
- `color-picker` — 图片取色器
- `compass` — 数字指南针
- `cron-expression-parser` — Cron解析器
- `csv-excel-converter` — CSV-Excel转换
- `csv-to-json` — CSV转JSON
- `csv-to-yaml` — CSV转YAML
- `curl-to-code` — cURL转码
- `des` — DES加解密
- `escape-tool` — 字符转义工具
- `excel-to-json` — Excel→JSON
- `gif-optimizer` — GIF优化
- `gif-to-video` — GIF转视频
- `gzip-deflate-tool` — Gzip解压
- `hash-tools` — 哈希校验工具
- `hmac-generator` — HMAC生成器
- `html-stripper` — HTML标签清理
- `http-header-parser` — Header解析
- `icns-generator` — ICNS图标生成器
- `ico-generator` — ICO 图标生成
- `image-compressor` — 图片压缩
- `image-converter` — 图片格式转换
- `image-cropper` — 图片裁剪器
- `image-resizer` — 图片尺寸调整
- `json-compare` — JSON对比
- `json-formatter` — JSON格式化
- `json-schema-validator` — Schema校验
- `json-to-csharp-class` — JSON→C#
- `json-to-csv` — JSON→CSV
- `json-to-excel` — JSON→Excel
- `json-to-go-struct` — JSON→Go
- `json-to-java-pojo` — JSON→Java
- `json-to-json-schema` — JSON→Schema
- `json-to-kotlin-data-class` — JSON→Kotlin
- `json-to-python-model` — JSON→Python
- `json-to-rust-serde` — JSON→Rust
- `json-to-typescript` — JSON→TS
- `json-yaml-converter` — JSON-YAML转换
- `jwt-generator` — JWT生成器
- `jwt-token-decoder` — JWT解码器
- `markdown-pdf-converter` — MD→PDF
- `music-player` — 网页音乐播放器
- `noise-meter` — 数字噪音计
- `p2p-file-transfer` — P2P文件传输
- `palette-generator` — 智能配色生成器
- `password-strength-checker` — 密码强度检测
- `pdf-compressor` — PDF压缩
- `pdf-merge` — PDF拼接合并
- `pdf-split` — PDF拆分
- `pdf-stamp` — PDF电子盖章
- `pdf-to-images` — PDF转图片
- `pdf-to-text` — PDF转文本
- `pdf-trim` — PDF页面剪切
- `pem-jwk-toolkit` — PEM/JWK工具包
- `ppt-compressor` — PPT压缩
- `protractor` — 数字量角器
- `qr-decoder` — 二维码解析器
- `qr-generator` — 二维码生成
- `qr-scanner` — 二维码扫描器
- `random-number-generator` — 随机数生成器
- `random-password-generator` — 随机密码生成器
- `regex-tester` — 正则表达式测试
- `rsa-key-generator` — RSA密钥生成器
- `salt-generator` — 随机盐值生成器
- `screen-ruler` — 屏幕标尺
- `seal-extractor` — 智能印章提取
- `sql-formatter` — SQL美化
- `svg-converter` — SVG转图片
- `text-diff` — 文本差异对比
- `timer` — 多功能计时器
- `timestamp-converter` — 时间戳转换
- `timezone-converter` — 时区转换
- `unit-converter` — 单位换算
- `url-encoder` — URL编解码
- `url-parser` — URL解析
- `uuid-generator` — UUID生成器
- `video-player` — 网页视频播放器
- `video-to-gif` — 视频转GIF
- `video-trimmer` — 视频剪辑器
- `websocket-tester` — WebSocket调试器
- `word-compressor` — Word压缩
- `word-counter` — 字数统计
- `xmind-viewer` — XMind查看器
- `xml-json-converter` — XML转JSON

</details>

---

## 快速开始

### 环境要求

- Node.js **20+**（CI 使用 Node 22）
- 推荐使用 **Yarn 1.x**（仓库提供 `yarn.lock`）

### 本地开发

```bash
yarn install --frozen-lockfile
yarn dev
```

打开 `http://localhost:3000`。

> 首次 `dev/build` 会自动生成工具导航数据与 PWA 资源（见 `scripts/`）。

---

## 开发与构建

### 常用命令

- `yarn dev`：本地开发（Next Dev）
- `yarn build`：生产构建（CI 使用 `next build --webpack`）
- `yarn build:turbo`：生产构建（`next build`，用于对比/调试）
- `yarn lint`：ESLint
- `yarn generate:manifests`：生成 `public/tools/<slug>/manifest.webmanifest` 与导航数据
- `yarn generate:sw`：生成 `public/sw.js`

### 开发调试

1. **渐进式开发**：先实现基础功能，再添加高级特性
2. **频繁测试**：每次修改后及时测试功能是否正常
3. **代码审查**：提交前检查代码质量和类型安全
4. **性能监控**：定期检查页面加载速度和资源使用
5. **多语言测试**：确保中英双语环境下功能正常

---

## 项目结构（核心约定）

- `src/app/tools/<slug>/`：每个工具一个目录（路由：`/<locale>/tools/<slug>`）
  - `tool.json`：工具配置（名称/描述/关键词/SEO 文本等）
  - `tool.en-us.json`：英文 UI 配置文件（含 `ui` 字段）
  - `page.tsx`：App Router 页面，导出 `dynamic = "force-static"` 与 `metadata`
  - `*Client.tsx`：客户端组件，使用统一布局 `ToolPageLayout`
- `src/lib/`：工具配置、SEO 生成等通用逻辑
- `src/components/ToolPageLayout.tsx`：统一工具页布局（含 SEO/结构化数据/隐藏 SEO 文本）
- `src/components/ToolConfigProvider.tsx`：工具配置上下文，支持多语言
- `scripts/`：
  - `generate-tool-manifests.mjs`：扫描 `tool.json`，生成工具 manifests、导航数据、tool registry
  - `generate-sw.mjs`：生成 `public/sw.js`

---

## 新增工具

### 1. 创建工具目录和基础文件

```bash
mkdir src/app/tools/my-tool
```

### 2. 添加工具配置文件

**`tool.json`**（SEO 和元数据）：
```json
{
  "name": "免费在线我的工具 - 纯粹工具站",
  "shortName": "我的工具",
  "description": "一句话描述这个工具做什么。",
  "seoDescription": "详细的SEO优化描述，包含关键词、工具优势、使用场景等，200-300字，针对搜索引擎和LLM优化...",
  "category": "工具分类",
  "lang": "zh-CN",
  "themeColor": "#0f172a",
  "backgroundColor": "#0f172a",
  "icon": "/icon.svg",
  "keywords": ["免费工具", "在线工具", "关键词"]
}
```

**`tool.en-us.json`**（英文 UI 配置）：
```json
{
  "name": "Free Online My Tool - ATools",
  "shortName": "My Tool",
  "description": "Brief description of what this tool does.",
  "seoDescription": "Detailed SEO-optimized description for search engines and LLM indexing, 200-300 characters...",
  "category": "Tool Category",
  "lang": "en-US",
  "ui": {
    "title": "My Tool",
    "inputLabel": "Input",
    "outputLabel": "Output",
    "processButton": "Process",
    "clearButton": "Clear",
    "inputPlaceholder": "Enter your input here...",
    "outputPlaceholder": "Results will appear here...",
    "errorMessage": "Error: {message}",
    "successMessage": "Processing completed successfully!"
  },
  "keywords": ["free online tool", "web tool", "keyword"]
}
```

### 3. 添加页面组件

**`page.tsx`**：
```tsx
import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MyToolClient from "./MyToolClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("my-tool");

export default function Page() {
  return <MyToolClient />;
}
```

### 4. 添加客户端组件

**`MyToolClient.tsx`**：
```tsx
"use client";

import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import ToolPageLayout from "../../../components/ToolPageLayout";

// 中文默认值
const DEFAULT_UI = {
  title: "我的工具",
  inputLabel: "输入",
  outputLabel: "输出",
  processButton: "处理",
  clearButton: "清空",
  inputPlaceholder: "请输入内容...",
  outputPlaceholder: "处理结果会显示在这里...",
  errorMessage: "错误：{message}",
  successMessage: "处理完成！"
} as const;

// 类型安全
type MyToolUi = typeof DEFAULT_UI;

export default function MyToolClient() {
  const config = useOptionalToolConfig("my-tool");
  // 配置合并，英文优先，中文回退
  const ui: MyToolUi = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<MyToolUi>)
  };

  return (
    <ToolPageLayout toolSlug="my-tool">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="text-sm font-semibold text-slate-900">{ui.title}</div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {ui.inputLabel}
            </label>
            <textarea
              placeholder={ui.inputPlaceholder}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div className="flex gap-2">
            <button className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
              {ui.processButton}
            </button>
            <button className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-200">
              {ui.clearButton}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              {ui.outputLabel}
            </label>
            <textarea
              placeholder={ui.outputPlaceholder}
              readOnly
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            />
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
```


---

## 贡献指南

### 核心原则

- **PR 规范**：PR 尽量小而专注，每个 PR 专注一个功能或修复
- **纯前端**：保持工具纯前端运行（不引入后端依赖）；不上传用户文件。
- **多语言支持**：所有工具必须实现完整的多语言支持（基于 `tool.en-us.json` 的 `ui` 字段）。
- **UI/UX 一致性**：优先保持一致的布局与可访问性


### 代码规范

- **类型安全**：所有 TypeScript 代码必须严格类型检查通过
- **测试验证**：确保多语言环境下功能正常工作
- **统一规范**：遵循 `src/app/tools/<slug>/` 目录约定和统一的代码模式。

更多细节见：

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`

---

## License

GNU AGPLv3. See `LICENSE`.