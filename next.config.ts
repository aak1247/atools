import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      // 允许局域网 IP / 远端调试访问开发服务器
      allowedDevOrigins: [
        "172.168.3.70",
        "172.168.3.70:3100",
        "localhost",
        "localhost:3100",
        "127.0.0.1",
        "127.0.0.1:3100",
      ],
      async headers() {
        return [
          {
            source: "/:path*",
            headers: [
              { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
              { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
            ],
          },
        ];
      },
    };
  }

  return {
    // 启用静态导出，生成纯静态站点（out 目录）
    output: "export",
  };
};

export default nextConfig;
