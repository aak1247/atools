/**
 * R2 资源 URL 管理工具
 *
 * 统一管理从 Cloudflare R2 加载的大文件资源（FFmpeg、RealCUGAN 等）
 *
 * 环境变量:
 * - NEXT_PUBLIC_R2_ASSETS_URL: R2 公共访问 URL
 *   - 开发环境: /vendor/ffmpeg/core (本地路径)
 *   - 生产环境: https://assets.atools.com (R2 自定义域名)
 */

/**
 * 获取 R2 资源基础 URL
 */
export function getR2AssetsBaseURL(): string {
  if (typeof window === "undefined") {
    // 服务端渲染时使用默认值
    return process.env.NEXT_PUBLIC_R2_ASSETS_URL || "/vendor";
  }

  // 客户端从环境变量读取
  return process.env.NEXT_PUBLIC_R2_ASSETS_URL || "/vendor";
}

/**
 * FFmpeg 资源 URL
 */
export function getFFmpegBaseURL(): string {
  const baseURL = getR2AssetsBaseURL();

  // 如果是 R2 URL，则指向 ffmpeg 目录
  if (baseURL.startsWith("http")) {
    return `${baseURL}/ffmpeg/`;
  }

  // 本地开发环境
  return "/vendor/ffmpeg/core/";
}

/**
 * RealCUGAN 资源 URL
 */
export function getRealCUGANBaseURL(): string {
  const baseURL = getR2AssetsBaseURL();

  // 如果是 R2 URL，则指向 realcugan 目录
  if (baseURL.startsWith("http")) {
    return `${baseURL}/realcugan/`;
  }

  // 本地开发环境
  return "/vendor/realcugan/";
}
