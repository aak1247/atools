import type { Metadata } from "next";
import ImageResizerClient from "./ImageResizerClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "图片尺寸调整工具 | 纯粹工具站",
  description:
    "纯前端图片尺寸调整工具，支持查看原图分辨率并设置新的宽高，提供等比透明填充和强制拉伸两种模式，整个过程在浏览器本地完成，不上传服务器。",
  alternates: {
    canonical: "/tools/image-resizer",
  },
  openGraph: {
    title: "图片尺寸调整工具 - 纯粹工具站",
    description:
      "在线图片大小调整工具，支持设置目标分辨率并选择自动拉伸或透明背景等比填充两种模式，适合头像裁剪、物料规范化等场景，全程本地处理，保护隐私。",
    type: "website",
  },
  manifest: "/tools/image-resizer/manifest.webmanifest",
};

export default function ImageResizerPage() {
  return <ImageResizerClient />;
}

