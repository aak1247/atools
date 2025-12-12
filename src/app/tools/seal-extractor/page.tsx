import type { Metadata } from "next";
import SealExtractorClient from "./SealExtractorClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "印章提取工具 | 纯粹工具站",
  description:
    "纯前端印章提取工具，从扫描件或拍照图片中自动识别并提取红色公章，生成透明背景电子章，整个过程在浏览器本地完成。",
  alternates: {
    canonical: "/tools/seal-extractor",
  },
  openGraph: {
    title: "印章提取工具 - 纯粹工具站",
    description:
      "在线印章提取工具，自动识别红色印章区域并去除背景，生成可直接用于电子合同、文档的透明 PNG 印章文件。",
    type: "website",
  },
  manifest: "/tools/seal-extractor/manifest.webmanifest",
};

export default function SealExtractorPage() {
  return <SealExtractorClient />;
}
