# ATools · 纯粹工具站

> 一个「100% 纯前端本地运行」的工具集合站：PWA 可安装、支持 Next.js 静态导出、内置统一 SEO 系统。  
> 目标用户：开发者 / 办公场景（偏“流量优先”的高频工具）。

本目录为 `site/` 子项目（Next.js App Router 应用）。你可以将它单独开源/部署，或作为 monorepo 的前端部分使用。

---

## 特性

- **纯前端**：所有文件处理默认在浏览器本地完成（不上传服务器），适合隐私敏感场景。
- **90+ 工具**：覆盖文本/编码/JSON/图片/音视频/PDF/办公格式等高频需求（见 `src/app/tools`）。
- **PWA 可安装**：每个工具都有独立 `manifest`，支持“添加到主屏幕”与离线缓存策略。
- **静态导出**：`next.config.ts` 使用 `output: "export"`，产物在 `out/`，可部署到任意静态托管/CDN。
- **统一 SEO 系统**：按工具的 `tool.json` 自动生成 Metadata + OpenGraph + JSON-LD（Schema.org WebApplication）。
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
- `pdf-stamp` — PDF电子盖章
- `pdf-trim` — PDF页面剪切
- `ppt-compressor` — PPT压缩
- `protractor` — 数字量角器
- `qr-decoder` — 二维码解析器
- `qr-generator` — 二维码生成
- `qr-scanner` — 二维码扫描器
- `random-number-generator` — 随机数生成器
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

## 常用命令

- `yarn dev`：本地开发（Next Dev）
- `yarn build`：生产构建（CI 使用 `next build --webpack`）
- `yarn build:turbo`：生产构建（`next build`，用于对比/调试）
- `yarn lint`：ESLint
- `yarn generate:manifests`：生成 `public/tools/<slug>/manifest.webmanifest` 与导航数据
- `yarn generate:sw`：生成 `public/sw.js`

---

## 项目结构（核心约定）

- `src/app/tools/<slug>/`：每个工具一个目录（路由：`/<locale>/tools/<slug>`）
  - `tool.json`：工具配置（名称/描述/关键词/SEO 文本等）
  - `page.tsx`：App Router 页面，导出 `dynamic = "force-static"` 与 `metadata`
  - `*Client.tsx`：客户端组件，使用统一布局 `ToolPageLayout`
- `src/lib/`：工具配置、SEO 生成等通用逻辑
- `src/components/ToolPageLayout.tsx`：统一工具页布局（含 SEO/结构化数据/隐藏 SEO 文本）
- `scripts/`：
  - `generate-tool-manifests.mjs`：扫描 `tool.json`，生成工具 manifests、导航数据、tool registry
  - `generate-sw.mjs`：生成 `public/sw.js`
  - `push-search.mjs`：可选的搜索引擎主动提交（构建后执行）
  - `copy-ffmpeg-core.mjs`：复制 `@ffmpeg/core` 到 `public/vendor/ffmpeg/core/`

---

## 新增工具（最小流程）

1. 新建目录：`src/app/tools/my-tool/`
2. 添加 `tool.json`（至少包含 `name` / `description` / `keywords` / `seoDescription`）
3. 添加 `page.tsx`：

```tsx
import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MyToolClient from "./MyToolClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("my-tool");

export default function Page() {
  return <MyToolClient />;
}
```

4. 添加客户端组件并套用统一布局：

```tsx
"use client";
import ToolPageLayout from "../../../components/ToolPageLayout";

export default function MyToolClient() {
  return <ToolPageLayout toolSlug="my-tool">{/* UI */}</ToolPageLayout>;
}
```

5. 运行 `yarn dev` 或 `yarn generate:manifests`，脚本会自动生成：
   - `src/app/tools/tools-meta*.json`（工具导航数据）
   - `src/app/tools/tool-registry.ts`（工具 registry，用于 sitemap/导航）
   - `public/tools/<slug>/*`（tool.json + manifest）

---

## 部署

### 1) 任意静态托管（推荐）

```bash
yarn build
```

部署 `out/` 目录即可。

### 2) Docker（Nginx 静态站点）

```bash
yarn build
docker build -t atools:latest .
docker run --rm -p 8080:80 atools:latest
```

---

## 环境变量

- `NEXT_PUBLIC_SITE_URL`：站点公开域名（用于 `sitemap.xml` / `robots.txt` 等）
- `SITE_URL`：站点公开域名（用于搜索引擎主动提交脚本）
- `ENABLE_SEARCH_PUSH`：`"true"` 时启用搜索引擎主动提交
- `BAIDU_PUSH_ENDPOINT`：百度站长推送接口（可选）

> 未设置 `ENABLE_SEARCH_PUSH="true"` 时，`scripts/push-search.mjs` 会自动跳过且不会使构建失败。

---

## 贡献指南

- 保持工具**纯前端**（尽量不引入后端依赖）；默认不上传用户文件。
- 新工具请遵循 `src/app/tools/<slug>/` 约定，并补齐 `tool.json` 的 SEO 字段。
- PR 尽量小而专注；UI/交互请优先保持一致的布局与可访问性。

更多细节见：

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`

---

## License

GNU AGPLv3. See `LICENSE`.
