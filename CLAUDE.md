# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**atools · 纯粹工具站** - A Next.js 16 PWA static site containing a collection of browser-only tools. Each tool runs entirely client-side without server dependencies for maximum privacy.

## Development Commands

```bash
# Development
npm run dev              # Start development server with Turbopack
npm run predev          # Auto-generate PWA manifests (runs before dev)

# Build
npm run build            # Production build with static export
npm run build:webpack    # Build using webpack (required for CI/CD)
npm run start            # Start production server from build output

# Pre/Post Build Hooks
npm run generate:manifests  # Generate PWA manifests from tool.json files
npm run generate:sw      # Generate service worker
npm run push:search      # Submit sitemaps to search engines

# Code Quality
npm run lint            # Run ESLint
```

**Important:** Always use `npm run build:webpack` for CI/CD builds. Turbopack (`npm run build`) is for local development only.

## Architecture

### Core Framework
- **Next.js 16** with App Router and TypeScript
- **Static Export** configured via `output: "export"` in `next.config.ts`
- **Tailwind CSS v4** for styling
- **PWA Support** with individual tool manifests

### Directory Structure
```
src/
├── app/tools/[tool-name]/     # Individual tool directories
│   ├── page.tsx              # Page component using generateToolMetadata()
│   ├── [ToolName]Client.tsx  # Client component using ToolPageLayout
│   └── tool.json             # PWA + SEO configuration for the tool
├── app/tools/tools-meta.json # Auto-generated tool navigation data
├── lib/
│   ├── tool-config.ts        # Tool configuration reader
│   └── generate-tool-page.ts # Unified metadata generator
├── components/
│   └── ToolPageLayout.tsx    # Unified tool page layout with SEO
├── hooks/
│   └── useToolConfig.ts      # Client-side config hook
├── types/tools.ts            # ToolConfig TypeScript interface
└── scripts/                  # Build and utility scripts
```

### Tool Architecture Patterns

#### 1. Tool Structure
Each tool follows this pattern:
- **Directory:** `src/app/tools/[tool-name]/`
- **Main Component:** `page.tsx` (must export `dynamic = "force-static"`)
- **PWA Config:** `tool.json` with ToolConfig interface
- **Client-Side Only:** All processing happens in the browser

#### 2. PWA Manifest System
- Global manifest: `src/app/manifest.ts` → `/manifest.webmanifest`
- Tool-specific manifests: Auto-generated from `tool.json` files
- Generation script: `scripts/generate-tool-manifests.mjs`
- Output: `public/tools/[tool-name]/manifest.webmanifest`

#### 3. Static Site Generation
- All tools must declare `dynamic = "force-static"` in `page.tsx`
- No API routes or server-side functionality
- Build output: `out/` directory for static hosting
- Service worker: `public/sw.js`

### Key Technologies for Tools
- **Fabric.js**: Canvas manipulation for image processing tools
- **PDF-lib**: PDF manipulation for PDF tools
- **Canvas API**: Native browser image processing
- **File API**: Local file handling without uploads

## Adding New Tools

1. **Create Tool Directory:**
   ```bash
   mkdir src/app/tools/my-tool
   ```

2. **Create PWA Config (`tool.json`) with SEO fields:**
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

3. **Create Page Component (`page.tsx`) using unified SEO system:**
   ```tsx
   import { generateToolMetadata } from "../../../lib/generate-tool-page";
   import MyToolClient from "./MyToolClient";

   export const dynamic = "force-static";
   export const metadata = generateToolMetadata("my-tool");

   export default function MyToolPage() {
     return <MyToolClient />;
   }
   ```

4. **Create Client Component (`MyToolClient.tsx`) using ToolPageLayout:**
   ```tsx
   "use client";
   import ToolPageLayout from "../../../components/ToolPageLayout";

   export default function MyToolClient() {
     return (
       <ToolPageLayout toolSlug="my-tool">
         {/* Tool UI content here */}
         <div className="glass-card rounded-2xl p-5">
           {/* ... */}
         </div>
       </ToolPageLayout>
     );
   }
   ```

5. **Copy Config and Update Navigation:**
   - Run `npm run copy:tool-configs` to copy tool.json to public directory
   - Run `npm run generate:manifests` to update `tools-meta.json`
   - Add tool card to `src/app/page.tsx` homepage

6. **Update Sitemap:**
   - Add tool URL to `src/app/sitemap.ts`

## Testing and Quality Assurance

### Browser Testing Requirements
- **回归测试需要通过所有已有的测试用例**
- **当页面测试不通过时，总是通过 @chrome-devtools 检查页面的问题并确保问题被解决才算真正通过测试**

### Service Worker Testing
- Test PWA installation functionality
- Verify offline capability for tools
- Check manifest loading for individual tools

## CI/CD Pipeline

### GitHub Actions
- **Trigger:** Push to `main`/`master` or manual dispatch
- **Runner:** Self-hosted (configured in repository settings)
- **Build:** Uses `npm run build:webpack` (not Turbopack)
- **Artifacts:** Uploads `out/` directory as `static-site`

### Environment Variables (Secrets)
- `NEXT_PUBLIC_SITE_URL`: Production site URL
- `SITE_URL`: Same as above for scripts
- `ENABLE_SEARCH_PUSH`: Enable search engine submission
- `BAIDU_PUSH_ENDPOINT`: Baidu webmaster API endpoint
- `DEPLOY_COMMAND`: Custom deployment command for self-hosted runner

### SEO Integration
- **Sitemap:** Auto-generated via `src/app/sitemap.ts`
- **Robots:** Auto-generated via `src/app/robots.ts`
- **Search Submission:** `scripts/push-search.mjs` runs post-build

### SEO Optimization System
All tools use a unified SEO system for better search engine and LLM visibility:

1. **tool.json SEO fields:**
   - `name`: Full name with "免费在线" keywords
   - `seoDescription`: Detailed SEO text (200-300 chars) for search engines
   - `keywords`: Array of relevant keywords

2. **Auto-generated features:**
   - Page metadata via `generateToolMetadata()`
   - JSON-LD structured data (Schema.org WebApplication)
   - Hidden SEO text via `sr-only` class in `ToolPageLayout`

3. **Key files:**
   - `src/lib/generate-tool-page.ts` - Metadata generator
   - `src/components/ToolPageLayout.tsx` - Unified layout with SEO
   - `scripts/copy-tool-configs.mjs` - Copy configs to public directory

## Important Development Notes

### Port Management
- **不要自行更换服务的端口，当服务端口被占用时手动关闭占用端口的进程就好**

### Code Documentation
- **代码中的注释和非临时性文档应当考虑其实际代码上下文、文档上下文，而不是对当前的问题进行回答**

### Static Export Constraints
- No dynamic routes with params
- No API routes
- No server-side functions
- All tools must work client-side only

### Build Process
1. `prebuild`: Generate manifests and service worker
2. `build`: Create static export
3. `postbuild`: Submit to search engines (if enabled)

### Browser Compatibility
- Modern browsers with ES6+ support
- Canvas API support for image tools
- File API for local file handling
- Service Worker support for PWA features

## Deployment

The build outputs to `out/` directory which can be deployed to any static hosting service:
- Nginx
- OSS/CDN
- GitHub Pages
- Netlify/Vercel (with static export configuration)

The PWA functionality and all tools work entirely in the browser without requiring any backend services.