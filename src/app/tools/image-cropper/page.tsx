import type { Metadata } from "next";
import ImageCropperClient from "./ImageCropperClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "图片裁剪工具 | 纯粹工具站",
  description: "纯前端图片裁剪工具，支持鼠标拖拽选择裁剪区域，输出 PNG 结果下载。",
  alternates: {
    canonical: "/tools/image-cropper",
  },
  openGraph: {
    title: "图片裁剪工具 - 纯粹工具站",
    description: "在线裁剪图片，拖拽选择裁剪框并导出 PNG，纯本地运行。",
    type: "website",
  },
  manifest: "/tools/image-cropper/manifest.webmanifest",
};

export default function ImageCropperPage() {
  return <ImageCropperClient />;
}

