import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用静态导出，生成纯静态站点（out 目录）
  output: "export",
};

export default nextConfig;
