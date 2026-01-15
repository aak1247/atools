# Cloudflare R2 + Workers 部署指南

本项目使用 Cloudflare Workers 托管页面代码，使用 Cloudflare R2 存储大文件（FFmpeg、RealCUGAN 等），解决 Workers 25MB 文件大小限制。

## 📋 前置要求

1. **安装 wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

2. **登录 Cloudflare**
   ```bash
   wrangler login
   ```

## 🚀 快速开始

### 1. 创建 R2 Bucket

```bash
# 创建 R2 存储桶
npm run setup:r2

# 或手动创建
wrangler r2 bucket create atools-assets
```

### 2. 配置环境变量

编辑 `.env.local` 文件（生产环境使用 Cloudflare Workers 环境变量）：

```bash
# R2 公共访问 URL（生产环境）
NEXT_PUBLIC_R2_ASSETS_URL=https://assets.atools.com

# Cloudflare 账户配置（用于上传）
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_R2_BUCKET=atools-assets
```

### 3. 上传大文件到 R2

```bash
# 上传所有大文件（FFmpeg + RealCUGAN）
npm run upload:assets
```

上传的文件：
- FFmpeg (31MB):
  - `ffmpeg/ffmpeg-core.js`
  - `ffmpeg/ffmpeg-core.wasm`
- RealCUGAN (12MB):
  - `realcugan/realcugan-ncnn-webassembly-simd-threads.js`
  - `realcugan/realcugan-ncnn-webassembly-simd-threads.wasm`
  - `realcugan/realcugan-ncnn-webassembly-simd-threads.data`

### 4. 配置 R2 公共访问

#### 选项 A: 使用自定义域名（推荐）

1. 在 Cloudflare Dashboard 中为 R2 bucket 配置自定义域名
2. 设置 `assets.atools.com` 指向 R2 bucket
3. 更新环境变量：
   ```bash
   NEXT_PUBLIC_R2_ASSETS_URL=https://assets.atools.com
   ```

#### 选项 B: 使用 R2 公共 URL

1. 在 Cloudflare Dashboard 中为 R2 bucket 启用公共访问
2. 获取公共 URL（例如：`https://pub-xxxxx.r2.dev`）
3. 更新环境变量：
   ```bash
   NEXT_PUBLIC_R2_ASSETS_URL=https://pub-xxxxx.r2.dev
   ```

### 5. 构建和部署

```bash
# 一键部署（上传 assets + 部署 Workers）
npm run deploy:all

# 或分步执行
npm run upload:assets  # 上传大文件到 R2
npm run deploy:cf      # 部署 Workers
```

## 🔧 本地开发

本地开发时，大文件从 `public/vendor` 目录加载（使用相对路径）：

```bash
# 启动开发服务器
npm run dev
```

环境变量配置：
```bash
NEXT_PUBLIC_R2_ASSETS_URL=/vendor  # 本地路径
```

## 📊 R2 免费额度

Cloudflare R2 免费套餐（每月）：

| 资源 | 免费额度 | 本项目使用量 |
|------|---------|-------------|
| 存储空间 | 10 GB | ~43 MB (0.4%) |
| A类操作（上传） | 100万次 | ~5次 |
| B类操作（下载） | 1000万次 | 取决于用户数 |
| 出口流量 | **完全免费** | ✅ 无限制 |

**结论：** 对于小工具站，R2 免费额度完全够用，几乎不会产生费用。

## 🏗️ 架构说明

### 文件组织

```
┌─────────────────────────────────────┐
│  Cloudflare Workers (主站点)         │
│  - 托管 HTML/JS/CSS                 │
│  - 限制: 单文件 ≤ 25MB              │
│  - 域名: atools.com                │
└──────────┬──────────────────────────┘
           │ HTTP 请求
           ↓
┌─────────────────────────────────────┐
│  Cloudflare R2 (大文件存储)          │
│  - FFmpeg core: 31MB               │
│  - RealCUGAN: 12MB                 │
│  - 无大小限制                       │
│  - 域名: assets.atools.com         │
└─────────────────────────────────────┘
```

### 代码实现

**R2 URL 管理** (`src/lib/r2-assets.ts`):
```typescript
// 根据环境变量动态返回 URL
// - 开发环境: /vendor/ffmpeg/core
// - 生产环境: https://assets.atools.com/ffmpeg

export function getFFmpegBaseURL(): string {
  const baseURL = process.env.NEXT_PUBLIC_R2_ASSETS_URL;
  return baseURL?.startsWith("http")
    ? `${baseURL}/ffmpeg/`
    : "/vendor/ffmpeg/core/";
}
```

**工具使用**:
```typescript
import { getFFmpegBaseURL } from "../../../lib/r2-assets";

const CORE_BASE = getFFmpegBaseURL();

// 加载 FFmpeg
await ffmpeg.load({
  coreURL: `${CORE_BASE}ffmpeg-core.js`,
  wasmURL: `${CORE_BASE}ffmpeg-core.wasm`,
});
```

## 🔄 更新部署流程

当代码或大文件更新后：

```bash
# 1. 更新大文件（如有）
npm run upload:assets

# 2. 构建静态站点
npm run build

# 3. 部署 Workers
npm run deploy:cf
```

或使用一键部署：
```bash
npm run deploy:all
```

## ⚠️ 注意事项

### 1. CORS 配置

如果 R2 和 Workers 使用不同域名，需要在 R2 bucket 配置 CORS：

```json
{
  "AllowedOrigins": ["https://atools.com"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}
```

### 2. 环境变量

**生产环境**（在 Cloudflare Workers Dashboard 配置）：
```bash
NEXT_PUBLIC_R2_ASSETS_URL=https://assets.atools.com
```

**本地开发**（`.env.local`）：
```bash
NEXT_PUBLIC_R2_ASSETS_URL=/vendor
```

### 3. 缓存策略

- R2 文件会设置长期缓存（1年）
- 更新大文件后需要清除缓存或使用版本号

### 4. 费用监控

虽然 R2 有免费额度，但建议定期检查使用量：
```bash
wrangler r2 bucket list
wrangler r2 object list atools-assets
```

## 📚 相关文档

- [Cloudflare R2 文档](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)

## 🆘 常见问题

### Q: 为什么不直接把所有文件放在 Workers 中？
**A:** Workers 有单文件 25MB 大小限制，FFmpeg WASM 文件（31MB）超过此限制。

### Q: R2 和 Workers 分离会影响性能吗？
**A:** 影响很小。R2 和 Workers 都在 Cloudflare 边缘网络，延迟通常 < 50ms。

### Q: 本地开发时需要 R2 吗？
**A:** 不需要。本地开发从 `public/vendor` 目录加载文件。

### Q: 如何切换回单 Worker 部署？
**A:** 设置环境变量 `NEXT_PUBLIC_R2_ASSETS_URL=/vendor` 即可从本地加载。

---

**更新时间:** 2025-01-10
