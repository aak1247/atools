import type { Metadata } from "next";
import WatermarkRemoverClient from "./WatermarkRemoverClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "图片去水印工具 | 纯粹工具站",
  description:
    "纯前端图片去水印工具，支持传统 OpenCV 算法和轻量深度图像先验两种模式，可从图片中移除文字水印与简单 Logo，整个过程在浏览器本地完成。",
  alternates: {
    canonical: "/tools/watermark-remover",
  },
  openGraph: {
    title: "图片去水印工具 - 纯粹工具站",
    description:
      "在线图片去水印工具，结合 OpenCV.js inpaint 与轻量深度学习修复算法，适合移除半透明文字水印和简单图标水印，无需上传服务器。",
    type: "website",
  },
  manifest: "/tools/watermark-remover/manifest.webmanifest",
};

export default function WatermarkRemoverPage() {
  return <WatermarkRemoverClient />;
}

