import type { Metadata } from "next";
import ImageCompressorClient from "./ImageCompressorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "图片压缩工具 | 前端工具站",
  description:
    "纯前端图片压缩工具，支持调节压缩质量，整个过程在浏览器本地完成，不上传服务器，适合隐私敏感场景。",
  alternates: {
    canonical: "/tools/image-compressor",
  },
  openGraph: {
    title: "图片压缩工具 - 前端工具站",
    description:
      "在线图片压缩工具，使用浏览器本地 Canvas 对图片进行重新编码压缩，可查看压缩前后体积和预览效果。",
    type: "website",
  },
  manifest: "/tools/image-compressor/manifest.webmanifest",
};

export default function ImageCompressorPage() {
  return <ImageCompressorClient />;
}
