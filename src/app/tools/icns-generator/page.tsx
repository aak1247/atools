import type { Metadata } from "next";
import IcnsGeneratorClient from "./IcnsGeneratorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "ICNS 图标生成工具 | 纯粹工具站",
  description:
    "在线 ICNS 图标生成工具，上传一张图片即可在浏览器本地生成包含多尺寸图标资源的苹果 ICNS 文件，可用于 macOS 应用与 Dock 图标，全程本地处理。",
  alternates: {
    canonical: "/tools/icns-generator",
  },
  openGraph: {
    title: "ICNS 图标生成工具 - 纯粹工具站",
    description:
      "将单张图片转换为苹果 ICNS 图标文件，自动生成 16–1024 像素多个尺寸，适用于 macOS 应用、安装包与 Dock 图标等场景，完全在浏览器中完成转换，不上传任何文件。",
    type: "website",
  },
  manifest: "/tools/icns-generator/manifest.webmanifest",
};

export default function IcnsGeneratorPage() {
  return <IcnsGeneratorClient />;
}

