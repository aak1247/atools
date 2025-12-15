import type { Metadata } from "next";
import PdfMergeClient from "./PdfMergeClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "PDF 拼接工具 | 纯粹工具站",
  description:
    "纯前端 PDF 拼接工具，支持选择两个 PDF 文件按顺序合并成一个新的 PDF，整个过程在浏览器本地完成，不上传服务器。",
  alternates: {
    canonical: "/tools/pdf-merge",
  },
  openGraph: {
    title: "PDF 拼接工具 - 纯粹工具站",
    description:
      "在线 PDF 拼接工具，使用 pdf-lib 在浏览器中将两个 PDF 文件按顺序合并为一个新的 PDF，适合合同、多页资料整合等场景，全程本地处理。",
    type: "website",
  },
  manifest: "/tools/pdf-merge/manifest.webmanifest",
};

export default function PdfMergePage() {
  return <PdfMergeClient />;
}

