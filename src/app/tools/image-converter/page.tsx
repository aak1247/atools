import type { Metadata } from "next";
import ImageConverterClient from "./ImageConverterClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "图片格式转换工具 | 纯粹工具站",
  description:
    "纯前端图片格式转换工具，支持在常见 JPG、PNG、BMP、WebP、ICO、GIF 等格式之间转换，整个过程在浏览器本地完成，不上传服务器。",
  alternates: {
    canonical: "/tools/image-converter",
  },
  openGraph: {
    title: "图片格式转换工具 - 纯粹工具站",
    description:
      "在线图片格式转换工具，上传一张图片即可在浏览器中转换为 JPG、PNG、WebP、GIF 等常见格式，部分格式取决于当前浏览器编码支持，全程本地处理。",
    type: "website",
  },
  manifest: "/tools/image-converter/manifest.webmanifest",
};

export default function ImageConverterPage() {
  return <ImageConverterClient />;
}
