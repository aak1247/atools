import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "前端工具站",
    short_name: "工具站",
    description: "一个纯前端工具集合站点。",
    start_url: "/",
    display: "standalone",
    lang: "zh-CN",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    shortcuts: [
      {
        name: "科学计算器",
        short_name: "计算器",
        url: "/tools/calculator",
      },
      {
        name: "图片压缩工具",
        short_name: "图片压缩",
        url: "/tools/image-compressor",
      },
    ],
  };
}
