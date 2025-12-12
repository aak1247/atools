## atools · 纯粹工具站（PWA + 静态导出）

一个基于 Next.js App Router 的前端工具集合站点，每个工具都是独立路由，支持 PWA 安装和纯静态部署，并针对搜索引擎做了优化和自动链接提交。

当前示例工具：

- 科学计算器：`/tools/calculator`
- 图片压缩工具：`/tools/image-compressor`

> 仓库地址：https://github.com/aak1247/atools （本目录为 `site` 子项目）

---

## 技术栈与特性

- **Next.js 16 + App Router + TypeScript**
- **Tailwind CSS v4**（通过 `globals.css` 使用）
- **PWA 支持**
  - 全局 manifest：`src/app/manifest.ts` → `/manifest.webmanifest`
  - 独立工具 manifest（自动生成）：
    - 每个工具目录下维护 `tool.json` 描述文件
    - `scripts/generate-tool-manifests.mjs` 在构建前自动扫描 `src/app/tools/*/tool.json`，生成对应的 `public/tools/<slug>/manifest.webmanifest`
  - 自定义 service worker：`public/sw.js`
  - 在 `src/app/layout.tsx` 中通过 `ServiceWorkerRegister` 统一注册
- **纯前端工具**
  - 科学计算器：`src/app/tools/calculator`
  - 图片压缩工具（本地 Canvas 压缩，不上传服务器）：`src/app/tools/image-compressor`
- **静态导出 / SSG**
  - `next.config.ts` 使用 `output: "export"`
  - 工具页面显式声明 `dynamic = "force-static"`，构建为静态 HTML
  - `npm run build` 生成纯静态站点在 `out` 目录，可放到任意静态服务器
- **SEO / 搜索引擎集成**
  - `src/app/sitemap.ts` → `/sitemap.xml`
  - `src/app/robots.ts` → `/robots.txt`
  - 各工具有独立的 `metadata`（title/description/openGraph/canonical）
  - 构建后自动执行 `scripts/push-search.mjs`：
    - 扫描 `out` 中的所有页面 URL
    - 主动通知 Google/Bing（sitemap ping）
    - 可选主动推送到百度

---

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000` 查看工具导航页。

---

## 构建与静态导出

项目通过 Next.js 的 `output: "export"` 生成纯静态站点。

```bash
npm run build
```

执行后会得到：

- `.next`：内部构建产物
- `out`：最终纯静态输出目录（`index.html`、`tools/.../index.html`、静态资源、manifest、`sw.js` 等）

将 `out` 目录部署到任意静态托管（Nginx、OSS、CDN、GitHub Pages 等）即可，PWA 功能和工具页面都在前端运行，无需后端。

---

## 搜索引擎优化与自动链接提交

### 1. 被动发现（所有引擎通用）

- `sitemap.xml`：由 `src/app/sitemap.ts` 生成
- `robots.txt`：由 `src/app/robots.ts` 生成，指向 sitemap

需要在生产环境配置站点域名：

- `NEXT_PUBLIC_SITE_URL=https://your-domain.com`

然后在以下平台添加站点并提交 `sitemap.xml`：

- 百度搜索资源平台
- 夸克搜索站长平台
- 搜狗搜索站长平台
- Google Search Console
- Bing Webmaster Tools

### 2. 主动推送脚本（百度 + Google + Bing）

`scripts/push-search.mjs` 在构建后自动运行，用于主动通知搜索引擎：

- 对 Google / Bing：
  - 使用 sitemap ping 提交 `https://your-domain.com/sitemap.xml`
- 对百度（可选）：
  - 将所有静态页面 URL 通过百度站长接口主动推送

通过以下环境变量控制（建议在 CI / GitHub Actions Secrets 中配置）：

- `SITE_URL`：站点完整地址（如 `https://tools.example.com`）
- `NEXT_PUBLIC_SITE_URL`：同上（用于前端和 sitemap/robots）
- `ENABLE_SEARCH_PUSH`：设置为 `"true"` 时启用主动推送
- `BAIDU_PUSH_ENDPOINT`：百度站长平台生成的接口地址，例如：  
  `https://data.zz.baidu.com/urls?site=tools.example.com&token=XXXX`

如果未设置 `ENABLE_SEARCH_PUSH="true"`，脚本会直接跳过，构建过程不会失败。

---

## GitHub Actions 与私有 Runner 自动化部署

工作流文件：`.github/workflows/deploy.yml`

- 触发：
  - 推送到 `main` 或 `master`
  - 手动触发 `workflow_dispatch`
- 运行环境：
  - `runs-on: self-hosted`（需要你在 GitHub 仓库中注册私有 Runner）
- 流程：
  1. Checkout 仓库
  2. 使用 Node.js 22
  3. `npm ci` 安装依赖
  4. `npm run build`
     - 使用 Secrets 中的环境变量运行
     - 构建完成后自动执行 `postbuild` → `scripts/push-search.mjs`
  5. 上传 `out` 为 `static-site` artifact
  6. 预留部署步骤：
     - 读取 `DEPLOY_COMMAND`（从 Secrets 注入）
     - 当前工作流只是打印该值，你可以按自己的部署方式修改该步骤

建议在仓库 Secrets 中配置：

- `NEXT_PUBLIC_SITE_URL`
- `SITE_URL`
- `ENABLE_SEARCH_PUSH`
- `BAIDU_PUSH_ENDPOINT`
- `DEPLOY_COMMAND`（可选，用于在私有 runner 上执行真实部署命令）

---

## 新增工具的方式（简要）

1. 在 `src/app/tools` 下创建新目录，例如 `my-tool`：
   - `src/app/tools/my-tool/page.tsx`
   - 如需复杂交互，可拆为 `MyToolClient.tsx` + 服务器端 `page.tsx` 组合
2. 为新工具添加配置文件（用于自动生成该工具的 PWA manifest）：
   - 新建 `src/app/tools/my-tool/tool.json`，示例：
     ```jsonc
     {
      "name": "我的新工具 - 纯粹工具站",
       "shortName": "我的工具",
       "description": "一句话描述这个工具做什么。",
       "lang": "zh-CN",
       "themeColor": "#0f172a",
       "backgroundColor": "#0f172a",
       "icon": "/favicon.ico"
     }
     ```
   - 构建时（`npm run build`）会自动运行 `npm run generate:manifests`，根据 `tool.json` 生成：  
     `public/tools/my-tool/manifest.webmanifest`
   - 在 `page.tsx` 的 `metadata` 中指定：
     - `manifest: "/tools/my-tool/manifest.webmanifest"`
3. 在 `src/app/sitemap.ts` 中加入新路由，利于搜索引擎发现。
4. 在首页导航 `src/app/page.tsx` 中增加卡片，方便用户访问。

---

## 许可证

本项目计划以开源形式维护，许可证类型请在根仓库或上层文档中确认（例如 MIT / Apache-2.0 等）。
